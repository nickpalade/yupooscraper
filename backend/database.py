"""
Database utilities for the Yupoo scraping application.

This module provides helper functions for creating and interacting
with a simple SQLite database. The database stores a record for each
scraped product containing the product's cover image URL, a JSON
encoded list of generated tags describing the product, and the URL to
the original Yupoo album.

Using the built‑in `sqlite3` module keeps dependencies to a minimum and
avoids the need for installing an ORM. Should you wish to switch to
SQLAlchemy or another database library in the future, you can
refactor these functions accordingly.
"""

import json
import os
import sqlite3
import sys
from typing import Iterable, List, Optional, Tuple, Any


def debug_print(message: str):
    """Print debug message with flush to ensure it appears in concurrent output."""
    try:
        # Write directly to stdout buffer with UTF-8 encoding to bypass Windows console encoding issues
        output = f"[DATABASE DEBUG] {message}\n"
        sys.stdout.buffer.write(output.encode('utf-8'))
        sys.stdout.buffer.flush()
    except Exception:
        # Fallback: replace problematic characters
        safe_msg = message.encode('utf-8', errors='replace').decode('utf-8', errors='replace')
        print(f"[DATABASE DEBUG] {safe_msg}", flush=True)


DB_NAME = os.path.join(os.path.dirname(__file__), "yupoo.db")
IMAGES_DIR = os.path.join(os.path.dirname(__file__), "storage", "images")


def ensure_storage_dir() -> None:
    """Ensure the image storage directory exists."""
    os.makedirs(IMAGES_DIR, exist_ok=True)
    debug_print(f"Image storage directory: {IMAGES_DIR}")


def init_db(db_path: str = DB_NAME) -> None:
    """Initialise the SQLite database.

    Creates a `products` table with columns for:
    - id: auto-incrementing primary key
    - image_url: original URL of the cover image
    - image_path: local storage path of the saved image
    - album_title: title of the album
    - tags_json: JSON array of tags
    - colors_json: JSON object with color names and percentages
    - album_url: URL of the original Yupoo album

    Args:
        db_path: Path to the SQLite database file.
    """
    ensure_storage_dir()
    debug_print(f"Initializing database at: {db_path}")
    debug_print(f"Database exists: {os.path.exists(db_path)}")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    debug_print("Connected to SQLite database")
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            image_url TEXT NOT NULL,
            image_path TEXT,
            album_title TEXT,
            tags_json TEXT NOT NULL,
            colors_json TEXT DEFAULT '{}',
            album_url TEXT NOT NULL,
            UNIQUE(album_url)
        );
        """
    )
    debug_print("Created/verified products table with new schema")
    
    # Check if colors_json column exists, add if not
    cursor.execute("PRAGMA table_info(products)")
    columns = [column[1] for column in cursor.fetchall()]
    if 'colors_json' not in columns:
        debug_print("Adding colors_json column to existing table")
        try:
            cursor.execute("ALTER TABLE products ADD COLUMN colors_json TEXT DEFAULT '{}'")
        except sqlite3.OperationalError as e:
            debug_print(f"Note: {e}")
    
    conn.commit()
    conn.close()
    debug_print("Database initialization complete")


def insert_product(image_url: str, tags: Iterable[str], album_url: str, image_path: Optional[str] = None, album_title: Optional[str] = None, colors_data: Optional[dict] = None, db_path: str = DB_NAME) -> None:
    """Insert a new product record into the database.

    Args:
        image_url: The URL of the product's cover image.
        tags: An iterable of tag strings generated for the product.
        album_url: The URL of the original Yupoo album.
        image_path: Local path where the image is stored.
        album_title: Title of the album.
        colors_data: Dictionary with color names and percentages.
        db_path: Path to the SQLite database file.
    """
    tags_list = list(tags)
    debug_print(f"  tags_list (type={type(tags_list)}): {tags_list}")
    tags_json = json.dumps(tags_list)
    debug_print(f"  colors_data (type={type(colors_data)}): {colors_data}")
    colors_json = json.dumps(colors_data or {})
    debug_print(f"Inserting product: {album_url}")
    debug_print(f"  Image URL: {image_url}")
    debug_print(f"  Image Path: {image_path}")
    debug_print(f"  Album Title: {album_title}")
    debug_print(f"  Tags: {tags_list}")
    debug_print(f"  Colors: {colors_data}")
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    try:
        cursor.execute(
            """
            INSERT OR IGNORE INTO products (image_url, image_path, album_title, tags_json, colors_json, album_url)
            VALUES (?, ?, ?, ?, ?, ?);
            """,
            (image_url, image_path, album_title, tags_json, colors_json, album_url),
        )
        if cursor.rowcount > 0:
            debug_print(f"  Successfully inserted product (rowcount: {cursor.rowcount})")
        else:
            debug_print(f"  Product already exists or INSERT failed")
        conn.commit()
    except Exception as e:
        debug_print(f"  ERROR inserting product: {e}")
        raise
    finally:
        conn.close()


def search_products_by_tags(tag_list: List[str], db_path: str = DB_NAME, sort_by_colors: Optional[List[str]] = None, exclusive_type_search: Optional[bool] = False) -> List[Tuple[int, str, str, str, List[str], str, dict]]:
    """Search for products using category-based OR/AND logic with optional multi-color sorting and exclusive type search.
    
    Logic:
    - Tags in the SAME category are OR'd together (e.g., red OR blue)
    - Tags from DIFFERENT categories are AND'd together (e.g., (red OR blue) AND nike)
    - If sort_by_colors is specified, results are sorted by the combined percentage of those colors (highest first).
    - If exclusive_type_search is True, products will only be returned if they have *only* the specified type tags and no others.

    Args:
        tag_list: A list of tags to filter by.
        db_path: Path to the SQLite database file.
        sort_by_colors: Optional list of color names to sort results by (e.g., ["black", "red"]).
        exclusive_type_search: If true, filters results to include only products with the specified type tags and no other type tags.

    Returns:
        A list of tuples representing matching products. Each tuple
        contains `(id, image_url, image_path, album_title, tags, album_url, colors_data)`.
    """
    if not tag_list:
        return []
    
    # Group tags by their category prefix
    tag_categories = {}
    for tag in tag_list:
        # Extract category (everything before the first underscore for clarity in tagging)
        parts = tag.split('_')
        if len(parts) > 1: # e.g., "color_red" -> "color"
            category = parts[0] 
        else: # plain tag without prefix
            category = "misc" # or some default category
        
        if category not in tag_categories:
            tag_categories[category] = []
        tag_categories[category].append(tag)
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Build WHERE clause with OR within categories and AND between categories
    where_clauses = []
    all_params = []
    
    for category, tags in tag_categories.items():
        # For each category, create an OR clause
        # Ensure we match the full tag to avoid partial matches (e.g., "red" matching "dark_red")
        # Use JSON_EXTRACT to check if the tag exists in the tags_json array
        or_clauses = []
        for tag in tags:
            or_clauses.append(f"INSTR(tags_json, ?) > 0")
            all_params.append(f'"{tag}"')
            
        where_clauses.append(f"({' OR '.join(or_clauses)})")
    
    # Join all category groups with AND
    where_clause = " AND ".join(where_clauses)
    query = f"SELECT id, image_url, image_path, album_title, tags_json, album_url, colors_json FROM products WHERE {where_clause};"
    
    cursor.execute(query, all_params)
    rows = cursor.fetchall()
    conn.close()
    
    results = []
    for row in rows:
        product_id, image_url, image_path, album_title, tags_json, album_url, colors_json = row
        tags = json.loads(tags_json)
        colors_data = json.loads(colors_json) if colors_json else {}
        results.append((product_id, image_url, image_path, album_title, tags, album_url, colors_data))
    
    # Post-query filtering for exclusive type search
    if exclusive_type_search and "type" in tag_categories:
        debug_print("Applying exclusive type search filter.")
        requested_type_tags = [t for t in tag_categories["type"] if t.startswith("type_")]
        
        filtered_results = []
        for product_tuple in results:
            product_tags = product_tuple[4] # Index 4 is the tags list
            product_type_tags = [t for t in product_tags if t.startswith("type_")]
            
            # Check if all product_type_tags are in requested_type_tags AND
            # if the number of product_type_tags matches the number of requested_type_tags
            # (i.e., no extra type tags present)
            if all(t in requested_type_tags for t in product_type_tags) and \
               len(product_type_tags) == len(requested_type_tags):
                filtered_results.append(product_tuple)
        results = filtered_results
        debug_print(f"Exclusive type search reduced results to {len(results)} products.")

    # Sort by combined color percentage if specified
    if sort_by_colors and len(sort_by_colors) > 0 and results:
        debug_print(f"Sorting by colors: {sort_by_colors}")
        results.sort(
            key=lambda x: sum(x[6].get(color.lower(), 0) for color in sort_by_colors),
            reverse=True
        )
    
    return results


def list_all_products(db_path: str = DB_NAME) -> List[Tuple[int, str, str, str, List[str], str, dict]]:
    """Return all products stored in the database.

    Useful for debugging or verifying the contents of the database.

    Args:
        db_path: Path to the SQLite database file.

    Returns:
        A list of tuples `(id, image_url, image_path, album_title, tags, album_url, colors_data)`.
    """
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT id, image_url, image_path, album_title, tags_json, album_url, colors_json FROM products;")
    rows = cursor.fetchall()
    conn.close()
    result: List[Tuple[int, str, str, str, List[str], str, dict]] = []
    for row in rows:
        product_id, image_url, image_path, album_title, tags_json, album_url, colors_json = row
        debug_print(f"  list_all_products: Processing product_id={product_id}")
        debug_print(f"    tags_json (type={type(tags_json)}): {tags_json[:100]}...") # Print first 100 chars
        tags = json.loads(tags_json)
        debug_print(f"    colors_json (type={type(colors_json)}): {colors_json[:100]}...") # Print first 100 chars
        colors_data = json.loads(colors_json) if colors_json else {}
        result.append((product_id, image_url, image_path, album_title, tags, album_url, colors_data))
    return result


def get_all_unique_tags(db_path: str = DB_NAME) -> List[str]:
    """Get all unique tags from all products in the database.

    Args:
        db_path: Path to the SQLite database file.

    Returns:
        A sorted list of all unique tags.
    """
    debug_print("Fetching all unique tags from database...")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT tags_json FROM products;")
    rows = cursor.fetchall()
    conn.close()
    
    all_tags = set()
    for row in rows:
        tags_json = row[0]
        tags = json.loads(tags_json)
        all_tags.update(tags)
    
    sorted_tags = sorted(list(all_tags))
    debug_print(f"Found {len(sorted_tags)} unique tags")
    return sorted_tags


def clear_database(db_path: str = DB_NAME) -> int:
    """Clear all products from the database and recreate with fresh schema.

    This function deletes the entire database file and recreates it,
    ensuring a fresh schema. Useful for testing and resetting the database state.

    Args:
        db_path: Path to the SQLite database file.

    Returns:
        The number of rows that were deleted (before recreation).
    """
    debug_print("Clearing database...")
    
    # Count rows before deletion
    deleted_rows = 0
    try:
        if os.path.exists(db_path):
            conn = sqlite3.connect(db_path)
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM products;")
            deleted_rows = cursor.fetchone()[0]
            conn.close()
            debug_print(f"  Products before deletion: {deleted_rows}")
    except Exception as e:
        debug_print(f"  Note: Could not count products: {e}")
    
    # Delete the database file completely
    try:
        if os.path.exists(db_path):
            os.remove(db_path)
            debug_print(f"  Deleted database file: {db_path}")
    except Exception as e:
        debug_print(f"  ERROR deleting database file: {e}")
        raise
    
    # Recreate with fresh schema
    init_db(db_path)
    debug_print("Database cleared and recreated successfully")
    return deleted_rows


def update_product_colors(product_id: int, new_colors_data: dict, db_path: str = DB_NAME) -> None:
    """Update the colors_json for a specific product.

    Args:
        product_id: The ID of the product to update.
        new_colors_data: A dictionary with the new color names and percentages.
        db_path: Path to the SQLite database file.
    """
    debug_print(f"Updating colors for product ID: {product_id}")
    colors_json = json.dumps(new_colors_data)
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    try:
        cursor.execute(
            """
            UPDATE products
            SET colors_json = ?
            WHERE id = ?;
            """,
            (colors_json, product_id),
        )
        conn.commit()
        debug_print(f"Successfully updated colors for product ID: {product_id}")
    except Exception as e:
        debug_print(f"ERROR updating colors for product ID {product_id}: {e}")
        raise
    finally:
        conn.close()


def update_product_tags(product_id: int, new_tags_json: str, db_path: str = DB_NAME) -> None:
    """Update the tags_json for a specific product.

    Args:
        product_id: The ID of the product to update.
        new_tags_json: A JSON string with the new tags.
        db_path: Path to the SQLite database file.
    """
    debug_print(f"Updating tags for product ID: {product_id}")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    try:
        cursor.execute(
            """
            UPDATE products
            SET tags_json = ?
            WHERE id = ?;
            """,
            (new_tags_json, product_id),
        )
        conn.commit()
        debug_print(f"Successfully updated tags for product ID: {product_id}")
    except Exception as e:
        debug_print(f"ERROR updating tags for product ID {product_id}: {e}")
        raise
    finally:
        conn.close()


def adjust_grey_percentages(db_path: str = DB_NAME) -> dict:
    """
    Adjusts the 'grey' or 'gray' color percentages across all products in the database.

    This function calculates the average 'grey'/'gray' percentage from all products.
    Then, for each product, it sets its 'grey'/'gray' percentage to this calculated average
    and re-normalizes the percentages of all other colors proportionally so that
    the total sum of color percentages remains 100.

    Args:
        db_path: Path to the SQLite database file.

    Returns:
        A dictionary containing statistics about the adjustment, including the average
        grey percentage and the number of products updated.
    """
    debug_print("Starting grey percentage adjustment...")
    all_products = list_all_products(db_path)
    debug_print(f"Found {len(all_products)} products in the database.")

    total_grey_percentage = 0.0
    product_count_with_grey = 0
    updated_product_count = 0

    # First pass: Calculate average grey percentage
    for product_id, _, _, _, _, _, colors_data in all_products:
        grey_key = None
        if 'grey' in colors_data:
            grey_key = 'grey'
        elif 'gray' in colors_data:
            grey_key = 'gray'

        if grey_key and colors_data[grey_key] is not None:
            total_grey_percentage += colors_data[grey_key]
            product_count_with_grey += 1

    average_grey_percentage = 0.0
    if product_count_with_grey > 0:
        average_grey_percentage = total_grey_percentage / product_count_with_grey
        debug_print(f"Calculated average grey percentage: {average_grey_percentage:.2f}% from {product_count_with_grey} products.")
    else:
        debug_print("No products with grey/gray color found. No adjustment needed.")
        return {"average_grey_percentage": 0.0, "products_updated": 0, "message": "No grey/gray color found in any product."}

    # Second pass: Adjust grey percentage and re-normalize other colors
    for product_id, _, _, _, tags_list_original, album_url, colors_data_original in all_products:
        original_colors = colors_data_original.copy()
        grey_key = None
        if 'grey' in original_colors:
            grey_key = 'grey'
        elif 'gray' in original_colors:
            grey_key = 'gray'

        if grey_key:
            old_grey_value = original_colors.get(grey_key, 0.0)
            
            if abs(old_grey_value - average_grey_percentage) < 0.01: # Avoid unnecessary updates if very close
                debug_print(f"Product {product_id}: Grey percentage already close to average ({old_grey_value:.2f}%). Skipping update.")
                continue

            # Calculate the new grey percentage based on the user's request
            adjusted_grey_value = old_grey_value - average_grey_percentage
            
            new_colors_data = {} # Starts empty
            tags_modified = False # Flag to track if tags_json needs updating
            new_tags_json_to_save = json.dumps(tags_list_original) # Start with original tags as a JSON string

            EPSILON = 1e-9 # Define a small epsilon for floating point comparisons
            if adjusted_grey_value > EPSILON:
                new_colors_data[grey_key] = adjusted_grey_value
                debug_print(f"  Product {product_id}: Adjusted grey from {old_grey_value:.2f}% to {adjusted_grey_value:.2f}% (Avg Grey Subtracted: {average_grey_percentage:.2f}%). New value: {adjusted_grey_value:.2f}%")
            else:
                debug_print(f"  Product {product_id}: Grey percentage {old_grey_value:.2f}% is <= average ({average_grey_percentage:.2f}%). Adjusted value ({adjusted_grey_value:.2f}%) is <= EPSILON. Removing grey tag from colors_json AND tags_json.")
                # The grey_key is implicitly removed from new_colors_data as it's not added.

                # --- NEW LOGIC FOR tags_json ---
                current_tags_list = tags_list_original
                tag_to_remove_color_grey = "color_grey"
                tag_to_remove_color_gray = "color_gray"
                
                # Check and remove both variants
                if tag_to_remove_color_grey in current_tags_list:
                    current_tags_list.remove(tag_to_remove_color_grey)
                    tags_modified = True
                if tag_to_remove_color_gray in current_tags_list:
                    current_tags_list.remove(tag_to_remove_color_gray)
                    tags_modified = True
                
                if tags_modified:
                    new_tags_json_to_save = json.dumps(current_tags_list)
                # --- END NEW LOGIC ---
            
            # Calculate total percentage of other colors before adjustment
            total_other_colors_original = sum(v for k, v in original_colors.items() if k != grey_key)

            # Determine the target sum for other colors after grey adjustment
            current_grey_in_new_data = new_colors_data.get(grey_key, 0.0)
            target_sum_other_colors = 100.0 - current_grey_in_new_data
            
            # Ensure target_sum_other_colors is not negative
            if target_sum_other_colors < 0:
                target_sum_other_colors = 0

            if total_other_colors_original > 0:
                # Calculate scaling factor for other colors
                scaling_factor = target_sum_other_colors / total_other_colors_original
                
                # Apply scaling factor to other colors
                for color, percentage in original_colors.items():
                    if color != grey_key:
                        new_colors_data[color] = percentage * scaling_factor
            else:
                # If there were no other colors, or they summed to zero,
                # then all other colors should now be 0 if grey is not 100%
                # or all other colors should remain 0 if grey is 100%.
                # No scaling needed as new_colors_data already contains only grey.
                for color, percentage in original_colors.items():
                    if color != grey_key:
                        new_colors_data[color] = 0.0 # Explicitly set others to 0

            # Ensure sum is 100 (due to potential float precision issues)
            current_sum = sum(new_colors_data.values())
            if abs(current_sum - 100.0) > 0.01:
                debug_print(f"  Warning: Sum of percentages for product {product_id} is {current_sum:.2f} after adjustment. Renormalizing slightly.")
                re_scaling_factor = 100.0 / current_sum
                for color in new_colors_data:
                    new_colors_data[color] *= re_scaling_factor

            # Update the database
            debug_print(f"  Adjusting grey percentages: Calling update_product_colors for product ID: {product_id}. new_colors_data (type={type(new_colors_data)}): {new_colors_data}")
            update_product_colors(product_id, new_colors_data, db_path)
            if tags_modified:
                debug_print(f"  Adjusting grey percentages: Calling update_product_tags for product ID: {product_id}. new_tags_json_to_save (type={type(new_tags_json_to_save)}): {new_tags_json_to_save}")
                update_product_tags(product_id, new_tags_json_to_save, db_path) # Updates tags_json
            updated_product_count += 1
        else:
            debug_print(f"Product {product_id}: No grey/gray color found. Skipping adjustment.")

    debug_print(f"Finished grey percentage adjustment. Updated {updated_product_count} products.")
    return {
        "average_grey_percentage": average_grey_percentage,
        "products_updated": updated_product_count,
        "message": f"Grey percentages adjusted for {updated_product_count} products."
    }
