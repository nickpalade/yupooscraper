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
    
    # Create users table (replaces admin_users)
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            email TEXT UNIQUE,
            hashed_password TEXT NOT NULL,
            is_admin BOOLEAN DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """
    )
    debug_print("Created/verified users table")
    
    # Create user lists table
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS user_lists (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            list_name TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
            UNIQUE(user_id, list_name)
        );
        """
    )
    debug_print("Created/verified user_lists table")
    
    # Create saved products table
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS saved_products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            list_id INTEGER NOT NULL,
            product_id INTEGER NOT NULL,
            notes TEXT,
            saved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
            FOREIGN KEY (list_id) REFERENCES user_lists (id) ON DELETE CASCADE,
            FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE,
            UNIQUE(list_id, product_id)
        );
        """
    )
    debug_print("Created/verified saved_products table")
    
    # Migrate old admin_users data if exists
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='admin_users';")
    if cursor.fetchone():
        debug_print("Migrating admin_users to users table...")
        cursor.execute(
            """
            INSERT OR IGNORE INTO users (id, username, hashed_password, is_admin, created_at)
            SELECT id, username, hashed_password, 1, created_at FROM admin_users;
            """
        )
        debug_print("Migration complete")
    
    conn.commit()
    conn.close()
    debug_print("Database initialization complete")
    
    # Create default admin user if it doesn't exist
    _create_default_admin(db_path)


def _create_default_admin(db_path: str = DB_NAME) -> None:
    """Create a default admin user if one doesn't exist.
    
    This is called automatically during database initialization.
    Default credentials are username: 'admin', password: 'password123'
    
    Args:
        db_path: Path to the SQLite database file.
    """
    try:
        # Import auth here to avoid circular imports
        from backend import auth
        
        username = "admin"
        password = "password123"
        
        # Check if admin user already exists
        existing_user = get_user_by_username(username, db_path)
        if existing_user:
            debug_print(f"Admin user '{username}' already exists. Skipping creation.")
            return
        
        # Hash the password
        hashed_password = auth.get_password_hash(password)
        
        # Create the admin user
        user_id = create_user(
            username=username,
            hashed_password=hashed_password,
            email=None,
            is_admin=True,
            db_path=db_path
        )
        debug_print(f"Successfully created default admin user with ID: {user_id}")
        debug_print(f"Default admin credentials - Username: {username}, Password: {password}")
        
    except Exception as e:
        debug_print(f"Error creating default admin user: {e}")
        # Don't raise - this should not block database initialization


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

    # Sort by color percentage relevance if specified
    if sort_by_colors and len(sort_by_colors) > 0 and results:
        debug_print(f"Sorting by color relevance for: {sort_by_colors}")
        
        # Calculate relevance score for each product
        # Score = sum of percentages for all selected colors
        scored_results = []
        for product_tuple in results:
            colors_data = product_tuple[6]  # Index 6 is colors_data
            
            # Calculate total percentage of selected colors
            relevance_score = sum(colors_data.get(color.lower(), 0.0) for color in sort_by_colors)
            
            scored_results.append((product_tuple, relevance_score))
        
        # Sort by relevance score (highest percentage first)
        scored_results.sort(key=lambda x: x[1], reverse=True)
        
        # Extract just the product tuples (without scores)
        results = [product_tuple for product_tuple, score in scored_results]
        
        debug_print(f"Top 5 scores: {[score for _, score in scored_results[:5]]}")
    
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
        tags = json.loads(tags_json)
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


def adjust_color_percentages(db_path: str = DB_NAME, colors_to_adjust: Optional[List[str]] = None) -> dict:
    """
    Adjusts specified color percentages across all products in the database.

    This function calculates the average percentage for each color in `colors_to_adjust`
    from all products. Then, for each product, it sets the specified color's percentage
    to its calculated average and re-normalizes the percentages of all other colors
    proportionally so that the total sum of color percentages remains 100.

    Args:
        db_path: Path to the SQLite database file.
        colors_to_adjust: A list of color names (e.g., ["grey", "white"]) to adjust.
                          Defaults to ["grey", "white"] if None.

    Returns:
        A dictionary containing statistics about the adjustment, including average
        percentages for each adjusted color and the number of products updated.
    """
    if colors_to_adjust is None:
        colors_to_adjust = ["grey", "white"]

    debug_print(f"Starting color percentage adjustment for: {colors_to_adjust}...")
    all_products = list_all_products(db_path)
    debug_print(f"Found {len(all_products)} products in the database.")

    # Initialize dictionaries for totals and counts for each color to adjust
    total_percentages = {color: 0.0 for color in colors_to_adjust}
    product_counts_with_color = {color: 0 for color in colors_to_adjust}
    updated_product_count = 0

    # First pass: Calculate average percentage for each color to adjust
    for product_id, _, _, _, _, _, colors_data in all_products:
        for target_color in colors_to_adjust:
            found_key = None
            if target_color in colors_data:
                found_key = target_color
            elif target_color == 'grey' and 'gray' in colors_data:
                found_key = 'gray'
            
            if found_key and colors_data[found_key] is not None:
                total_percentages[target_color] += colors_data[found_key]
                product_counts_with_color[target_color] += 1
    
    average_percentages = {}
    for target_color in colors_to_adjust:
        if product_counts_with_color[target_color] > 0:
            average_percentages[target_color] = total_percentages[target_color] / product_counts_with_color[target_color]
            debug_print(f"Calculated average {target_color} percentage: {average_percentages[target_color]:.2f}% from {product_counts_with_color[target_color]} products.")
        else:
            average_percentages[target_color] = 0.0
            debug_print(f"No products with {target_color} found. Average set to 0.0%.")

    if all(avg == 0.0 for avg in average_percentages.values()):
        debug_print("No specified colors found in any products. No adjustment needed.")
        return {"average_percentages": average_percentages, "products_updated": 0, "message": "No specified colors found in any product."}

    # Second pass: Adjust specified color percentages and re-normalize other colors
    for product_id, _, _, _, tags_list_original, album_url, colors_data_original in all_products:
        original_colors = colors_data_original.copy()
        
        product_changed = False
        new_colors_data = {} # Starts empty with only colors_to_adjust added first

        tags_modified = False # Flag to track if tags_json needs updating
        current_tags_list = tags_list_original.copy() # Work on a copy of the list
        
        # Collect all keys that will be adjusted (e.g., 'grey', 'gray', 'white')
        keys_to_adjust_in_this_product = []
        for target_color_name in colors_to_adjust:
            # Check for primary key and its variations
            color_keys_in_product = []
            if target_color_name in original_colors:
                color_keys_in_product.append(target_color_name)
            if target_color_name == 'grey' and 'gray' in original_colors and 'gray' not in color_keys_in_product:
                color_keys_in_product.append('gray')

            for key in color_keys_in_product:
                old_value = original_colors.get(key, 0.0)
                average_value = average_percentages.get(target_color_name, 0.0) # Use the average for the conceptual color
                
                if abs(old_value - average_value) < 0.01: # Avoid unnecessary updates if very close
                    new_colors_data[key] = old_value # Keep original value if not changing much
                    debug_print(f"Product {product_id}: {key} percentage already close to average ({old_value:.2f}%). Skipping update for this color.")
                    continue
                
                product_changed = True # Mark product for update
                adjusted_value = old_value - average_value
                
                EPSILON = 1e-9 # Define a small epsilon for floating point comparisons
                if adjusted_value > EPSILON:
                    new_colors_data[key] = adjusted_value
                    debug_print(f"  Product {product_id}: Adjusted {key} from {old_value:.2f}% to {adjusted_value:.2f}% (Avg {target_color_name} Subtracted: {average_value:.2f}%). New value: {adjusted_value:.2f}%")
                else:
                    debug_print(f"  Product {product_id}: {key} percentage {old_value:.2f}% is <= average ({average_value:.2f}%). Adjusted value ({adjusted_value:.2f}%) is <= EPSILON. Removing {key} from colors_json AND tags_json.")
                    # The key is implicitly removed from new_colors_data as it's not added if <= EPSILON.

                    # --- LOGIC FOR tags_json removal ---
                    tag_to_remove = f"color_{key}"
                    if tag_to_remove in current_tags_list:
                        current_tags_list.remove(tag_to_remove)
                        tags_modified = True
                    # --- END LOGIC ---
                
                keys_to_adjust_in_this_product.append(key)
        
        if not product_changed:
            debug_print(f"Product {product_id}: No specified colors found or values not significantly different. Skipping adjustment.")
            continue
        
        new_tags_json_to_save = json.dumps(current_tags_list) if tags_modified else json.dumps(tags_list_original)

        # Calculate total percentage of other colors before adjustment
        total_other_colors_original = sum(v for k, v in original_colors.items() if k not in keys_to_adjust_in_this_product)

        # Determine the target sum for other colors after adjustment
        current_adjusted_sum_of_special_colors = sum(new_colors_data.values())
        target_sum_other_colors = 100.0 - current_adjusted_sum_of_special_colors
        
        # Ensure target_sum_other_colors is not negative
        if target_sum_other_colors < 0:
            target_sum_other_colors = 0

        if total_other_colors_original > 0:
            # Calculate scaling factor for other colors
            scaling_factor = target_sum_other_colors / total_other_colors_original
            
            # Apply scaling factor to other colors
            for color, percentage in original_colors.items():
                if color not in keys_to_adjust_in_this_product:
                    new_colors_data[color] = percentage * scaling_factor
        else:
            # If there were no other colors, or they summed to zero,
            # then all other colors should now be 0.
            for color, percentage in original_colors.items():
                if color not in keys_to_adjust_in_this_product:
                    new_colors_data[color] = 0.0 # Explicitly set others to 0

        # Ensure sum is 100 (due to potential float precision issues)
        current_sum = sum(new_colors_data.values())
        if abs(current_sum - 100.0) > 0.01:
            debug_print(f"  Warning: Sum of percentages for product {product_id} is {current_sum:.2f} after adjustment. Renormalizing slightly.")
            re_scaling_factor = 100.0 / current_sum
            for color in new_colors_data:
                new_colors_data[color] *= re_scaling_factor

        # Update the database
        debug_print(f"  Adjusting color percentages: Calling update_product_colors for product ID: {product_id}. new_colors_data (type={type(new_colors_data)}): {new_colors_data}")
        update_product_colors(product_id, new_colors_data, db_path)
        if tags_modified:
            debug_print(f"  Adjusting color percentages: Calling update_product_tags for product ID: {product_id}. new_tags_json_to_save (type={type(new_tags_json_to_save)}): {new_tags_json_to_save}")
            update_product_tags(product_id, new_tags_json_to_save, db_path) # Updates tags_json
        updated_product_count += 1

    debug_print(f"Finished color percentage adjustment. Updated {updated_product_count} products.")
    return {
        "average_percentages": average_percentages,
        "products_updated": updated_product_count,
        "message": f"Color percentages adjusted for {updated_product_count} products."
    }


# ========== User Management Functions ==========

def create_user(username: str, hashed_password: str, email: Optional[str] = None, is_admin: bool = False, db_path: str = DB_NAME) -> int:
    """Create a new user in the database.
    
    Args:
        username: The username for the account
        hashed_password: The bcrypt-hashed password
        email: Optional email address
        is_admin: Whether this user has admin privileges
        db_path: Path to the SQLite database file
        
    Returns:
        The ID of the created user
        
    Raises:
        sqlite3.IntegrityError: If username or email already exists
    """
    user_type = "admin" if is_admin else "regular"
    debug_print(f"Creating {user_type} user: {username}")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    try:
        cursor.execute(
            """
            INSERT INTO users (username, email, hashed_password, is_admin)
            VALUES (?, ?, ?, ?);
            """,
            (username, email, hashed_password, 1 if is_admin else 0),
        )
        conn.commit()
        user_id = cursor.lastrowid
        debug_print(f"Successfully created {user_type} user with ID: {user_id}")
        return user_id
    except sqlite3.IntegrityError as e:
        debug_print(f"ERROR creating user (username/email already exists): {e}")
        raise
    finally:
        conn.close()


def get_user_by_username(username: str, db_path: str = DB_NAME) -> Optional[Tuple[int, str, str, str, bool]]:
    """Get a user by username.
    
    Args:
        username: The username to look up
        db_path: Path to the SQLite database file
        
    Returns:
        A tuple (id, username, email, hashed_password, is_admin) if found, None otherwise
    """
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, username, email, hashed_password, is_admin FROM users WHERE username = ?;",
        (username,),
    )
    row = cursor.fetchone()
    conn.close()
    return row


def get_user_by_email(email: str, db_path: str = DB_NAME) -> Optional[Tuple[int, str, str, str, bool]]:
    """Get a user by email.
    
    Args:
        email: The email to look up
        db_path: Path to the SQLite database file
        
    Returns:
        A tuple (id, username, email, hashed_password, is_admin) if found, None otherwise
    """
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, username, email, hashed_password, is_admin FROM users WHERE email = ?;",
        (email,),
    )
    row = cursor.fetchone()
    conn.close()
    return row


def get_user_by_id(user_id: int, db_path: str = DB_NAME) -> Optional[Tuple[int, str, str, bool]]:
    """Get a user by ID.
    
    Args:
        user_id: The user ID to look up
        db_path: Path to the SQLite database file
        
    Returns:
        A tuple (id, username, email, is_admin) if found, None otherwise
    """
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, username, email, is_admin FROM users WHERE id = ?;",
        (user_id,),
    )
    row = cursor.fetchone()
    conn.close()
    return row


# ========== User List Management Functions ==========

def create_user_list(user_id: int, list_name: str, db_path: str = DB_NAME) -> int:
    """Create a new list for a user.
    
    Args:
        user_id: The user's ID
        list_name: Name of the list
        db_path: Path to the SQLite database file
        
    Returns:
        The ID of the created list
    """
    debug_print(f"Creating list '{list_name}' for user {user_id}")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    try:
        cursor.execute(
            "INSERT INTO user_lists (user_id, list_name) VALUES (?, ?);",
            (user_id, list_name),
        )
        conn.commit()
        list_id = cursor.lastrowid
        debug_print(f"Successfully created list with ID: {list_id}")
        return list_id
    finally:
        conn.close()


def get_user_lists(user_id: int, db_path: str = DB_NAME) -> List[Tuple[int, str]]:
    """Get all lists for a user.
    
    Args:
        user_id: The user's ID
        db_path: Path to the SQLite database file
        
    Returns:
        A list of tuples (list_id, list_name)
    """
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, list_name FROM user_lists WHERE user_id = ? ORDER BY created_at DESC;",
        (user_id,),
    )
    rows = cursor.fetchall()
    conn.close()
    return rows


def delete_user_list(list_id: int, user_id: int, db_path: str = DB_NAME) -> bool:
    """Delete a list (only if it belongs to the user).
    
    Args:
        list_id: The list ID to delete
        user_id: The user's ID (for verification)
        db_path: Path to the SQLite database file
        
    Returns:
        True if deleted, False otherwise
    """
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute(
        "DELETE FROM user_lists WHERE id = ? AND user_id = ?;",
        (list_id, user_id),
    )
    conn.commit()
    deleted = cursor.rowcount > 0
    conn.close()
    return deleted


def rename_user_list(list_id: int, user_id: int, new_name: str, db_path: str = DB_NAME) -> bool:
    """Rename a list.
    
    Args:
        list_id: The list ID to rename
        user_id: The user's ID (for verification)
        new_name: New name for the list
        db_path: Path to the SQLite database file
        
    Returns:
        True if renamed, False otherwise
    """
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE user_lists SET list_name = ? WHERE id = ? AND user_id = ?;",
        (new_name, list_id, user_id),
    )
    conn.commit()
    updated = cursor.rowcount > 0
    conn.close()
    return updated


# ========== Saved Products Management Functions ==========

def save_product_to_list(user_id: int, list_id: int, product_id: int, notes: Optional[str] = None, db_path: str = DB_NAME) -> int:
    """Save a product to a user's list.
    
    Args:
        user_id: The user's ID
        list_id: The list ID
        product_id: The product ID
        notes: Optional notes about the product
        db_path: Path to the SQLite database file
        
    Returns:
        The ID of the saved product entry
    """
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    try:
        cursor.execute(
            "INSERT OR REPLACE INTO saved_products (user_id, list_id, product_id, notes) VALUES (?, ?, ?, ?);",
            (user_id, list_id, product_id, notes),
        )
        conn.commit()
        saved_id = cursor.lastrowid
        return saved_id
    finally:
        conn.close()


def get_saved_products_in_list(list_id: int, user_id: int, db_path: str = DB_NAME) -> List[Tuple[int, int, str, str]]:
    """Get all saved products in a list.
    
    Args:
        list_id: The list ID
        user_id: The user's ID (for verification)
        db_path: Path to the SQLite database file
        
    Returns:
        A list of tuples (saved_product_id, product_id, notes, saved_at)
    """
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT sp.id, sp.product_id, sp.notes, sp.saved_at
        FROM saved_products sp
        JOIN user_lists ul ON sp.list_id = ul.id
        WHERE sp.list_id = ? AND ul.user_id = ?
        ORDER BY sp.saved_at DESC;
        """,
        (list_id, user_id),
    )
    rows = cursor.fetchall()
    conn.close()
    return rows


def update_product_notes(saved_product_id: int, user_id: int, notes: str, db_path: str = DB_NAME) -> bool:
    """Update notes for a saved product.
    
    Args:
        saved_product_id: The saved product ID
        user_id: The user's ID (for verification)
        notes: New notes
        db_path: Path to the SQLite database file
        
    Returns:
        True if updated, False otherwise
    """
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE saved_products SET notes = ? WHERE id = ? AND user_id = ?;",
        (notes, saved_product_id, user_id),
    )
    conn.commit()
    updated = cursor.rowcount > 0
    conn.close()
    return updated


def remove_product_from_list(list_id: int, product_id: int, user_id: int, db_path: str = DB_NAME) -> bool:
    """Remove a product from a list.
    
    Args:
        list_id: The list ID
        product_id: The product ID
        user_id: The user's ID (for verification)
        db_path: Path to the SQLite database file
        
    Returns:
        True if removed, False otherwise
    """
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute(
        """
        DELETE FROM saved_products
        WHERE list_id = ? AND product_id = ? AND user_id = ?;
        """,
        (list_id, product_id, user_id),
    )
    conn.commit()
    deleted = cursor.rowcount > 0
    conn.close()
    return deleted


def is_product_saved(user_id: int, product_id: int, db_path: str = DB_NAME) -> List[str]:
    """Check which lists contain a product for a user.
    
    Args:
        user_id: The user's ID
        product_id: The product ID
        db_path: Path to the SQLite database file
        
    Returns:
        List of list names that contain this product
    """
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT ul.list_name
        FROM saved_products sp
        JOIN user_lists ul ON sp.list_id = ul.id
        WHERE sp.user_id = ? AND sp.product_id = ?;
        """,
        (user_id, product_id),
    )
    rows = cursor.fetchall()
    conn.close()
    return [row[0] for row in rows]


def get_all_product_images(db_path: str = DB_NAME) -> List[Tuple[int, str, str, List[str]]]:
    """Get all product IDs, their image URLs, and existing tags for retagging.
    
    Args:
        db_path: Path to the SQLite database file
        
    Returns:
        List of tuples (product_id, image_url, album_title, existing_tags)
    """
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, image_url, album_title, tags_json FROM products;"
    )
    rows = cursor.fetchall()
    conn.close()
    # Parse tags_json for each row
    result = []
    for row in rows:
        product_id, image_url, album_title, tags_json = row
        existing_tags = json.loads(tags_json) if tags_json else []
        result.append((product_id, image_url, album_title, existing_tags))
    return result


def update_product_tags_and_colors(product_id: int, tags: Iterable[str], colors_data: Optional[dict] = None, db_path: str = DB_NAME) -> None:
    """Update the tags and colors for an existing product.
    
    Args:
        product_id: The product ID to update
        tags: New tags for the product
        colors_data: Dictionary with color names and percentages
        db_path: Path to the SQLite database file
    """
    tags_list = list(tags)
    tags_json = json.dumps(tags_list)
    colors_json = json.dumps(colors_data or {})
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    try:
        cursor.execute(
            """
            UPDATE products
            SET tags_json = ?, colors_json = ?
            WHERE id = ?;
            """,
            (tags_json, colors_json, product_id),
        )
        if cursor.rowcount > 0:
            debug_print(f"Updated product {product_id} with new tags and colors")
        conn.commit()
    except Exception as e:
        debug_print(f"ERROR updating product {product_id}: {e}")
        raise
    finally:
        conn.close()


def rgb_to_lab(rgb: Tuple[float, float, float]) -> Tuple[float, float, float]:
    """Convert RGB to LAB color space for better perceptual color distance calculations.
    
    Args:
        rgb: Tuple of (r, g, b) values in range [0, 1]
        
    Returns:
        Tuple of (L, a, b) values in LAB color space
    """
    # Convert RGB to XYZ
    r, g, b = rgb
    
    # Apply sRGB gamma correction
    def gamma_correct(c):
        if c > 0.04045:
            return ((c + 0.055) / 1.055) ** 2.4
        return c / 12.92
    
    r = gamma_correct(r)
    g = gamma_correct(g)
    b = gamma_correct(b)
    
    # Convert to XYZ using sRGB matrix
    x = r * 0.4124564 + g * 0.3575761 + b * 0.1804375
    y = r * 0.2126729 + g * 0.7151522 + b * 0.0721750
    z = r * 0.0193339 + g * 0.1191920 + b * 0.9503041
    
    # Normalize to D65 illuminant
    x = x / 0.95047
    y = y / 1.00000
    z = z / 1.08883
    
    # Convert XYZ to LAB
    def f(t):
        delta = 6.0 / 29.0
        if t > delta ** 3:
            return t ** (1.0 / 3.0)
        return t / (3.0 * delta ** 2) + 4.0 / 29.0
    
    fx = f(x)
    fy = f(y)
    fz = f(z)
    
    L = 116.0 * fy - 16.0
    a = 500.0 * (fx - fy)
    b_val = 200.0 * (fy - fz)
    
    return (L, a, b_val)


def color_name_to_rgb(color_name: str) -> Tuple[float, float, float]:
    """Convert a color name to approximate RGB values.
    
    Args:
        color_name: Name of the color
        
    Returns:
        Tuple of (r, g, b) values in range [0, 1]
    """
    # Expanded color mappings with more accurate RGB values
    color_map = {
        'black': (0.0, 0.0, 0.0),
        'white': (1.0, 1.0, 1.0),
        'grey': (0.5, 0.5, 0.5),
        'gray': (0.5, 0.5, 0.5),
        'red': (1.0, 0.0, 0.0),
        'blue': (0.0, 0.0, 1.0),
        'green': (0.0, 0.5, 0.0),
        'yellow': (1.0, 1.0, 0.0),
        'orange': (1.0, 0.5, 0.0),
        'purple': (0.5, 0.0, 0.5),
        'pink': (1.0, 0.75, 0.8),
        'brown': (0.6, 0.3, 0.0),
        'beige': (0.96, 0.96, 0.86),
        'navy': (0.0, 0.0, 0.5),
        'teal': (0.0, 0.5, 0.5),
        'lime': (0.75, 1.0, 0.0),
        'cyan': (0.0, 1.0, 1.0),
        'magenta': (1.0, 0.0, 1.0),
        'maroon': (0.5, 0.0, 0.0),
        'olive': (0.5, 0.5, 0.0),
        'silver': (0.75, 0.75, 0.75),
        'gold': (1.0, 0.84, 0.0),
    }
    
    return color_map.get(color_name.lower(), (0.5, 0.5, 0.5))  # Default to grey


def calculate_color_similarity(colors1: dict, colors2: dict) -> float:
    """Calculate color similarity between two products based on percentage differences.
    
    Simple and effective: sum the absolute differences in percentages for each color.
    Lower values indicate more similar colors.
    
    Args:
        colors1: Dictionary of {color_name: percentage} for first product
        colors2: Dictionary of {color_name: percentage} for second product
        
    Returns:
        Similarity score (lower is more similar, 0-100 scale)
    """
    if not colors1 or not colors2:
        return 100.0  # Maximum dissimilarity if either has no color data
    
    # Get all unique color names from both products
    all_colors = set(colors1.keys()) | set(colors2.keys())
    
    # Calculate sum of absolute percentage differences
    total_difference = 0.0
    for color in all_colors:
        percentage1 = colors1.get(color, 0.0)
        percentage2 = colors2.get(color, 0.0)
        total_difference += abs(percentage1 - percentage2)
    
    # The total difference can range from 0 (identical) to 200 (completely different colors)
    # Normalize to 0-100 scale
    normalized_score = total_difference / 2.0
    
    return normalized_score


def find_similar_products_by_color(product_id: int, limit: int = 50, same_brand: bool = False, db_path: str = DB_NAME) -> List[Tuple[int, str, str, str, List[str], str, dict, float]]:
    """Find products with similar colors to the given product, filtered by same clothing type.
    
    Args:
        product_id: The ID of the product to find similar items for
        limit: Maximum number of results to return
        same_brand: If True, only return products from the same brand
        db_path: Path to the SQLite database file
        
    Returns:
        List of tuples (id, image_url, image_path, album_title, tags, album_url, colors_data, similarity_score)
        sorted by similarity (most similar first)
    """
    # Get the reference product
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, image_url, image_path, album_title, tags_json, album_url, colors_json FROM products WHERE id = ?;",
        (product_id,)
    )
    reference_row = cursor.fetchone()
    
    if not reference_row:
        conn.close()
        return []
    
    ref_id, ref_image_url, ref_image_path, ref_album_title, ref_tags_json, ref_album_url, ref_colors_json = reference_row
    ref_tags = json.loads(ref_tags_json)
    ref_colors = json.loads(ref_colors_json) if ref_colors_json else {}
    
    # Extract type tags and brand tags from reference product
    ref_type_tags = [tag for tag in ref_tags if tag.startswith('type_')]
    ref_brand_tags = [tag for tag in ref_tags if tag.startswith('company_')]
    
    debug_print(f"Finding similar products for product {product_id}")
    debug_print(f"  Reference colors: {ref_colors}")
    debug_print(f"  Reference type tags: {ref_type_tags}")
    debug_print(f"  Reference brand tags: {ref_brand_tags}")
    debug_print(f"  Same brand filter: {same_brand}")
    
    if not ref_type_tags:
        debug_print("  Warning: Reference product has no type tags, returning empty results")
        conn.close()
        return []
    
    # Get all products with at least one matching type tag
    # Build query to find products with matching type tags
    type_tag_conditions = []
    params = []
    for type_tag in ref_type_tags:
        type_tag_conditions.append("INSTR(tags_json, ?) > 0")
        params.append(f'"{type_tag}"')
    
    # Include the reference product itself to validate algorithm (should be first with score 0)
    
    type_tag_query = " OR ".join(type_tag_conditions)
    
    # Add brand filter if requested
    if same_brand and ref_brand_tags:
        brand_conditions = []
        for brand_tag in ref_brand_tags:
            brand_conditions.append("INSTR(tags_json, ?) > 0")
            params.append(f'"{brand_tag}"')
        brand_query = " OR ".join(brand_conditions)
        query = f"""
            SELECT id, image_url, image_path, album_title, tags_json, album_url, colors_json 
            FROM products 
            WHERE ({type_tag_query}) AND ({brand_query});
        """
    else:
        query = f"""
            SELECT id, image_url, image_path, album_title, tags_json, album_url, colors_json 
            FROM products 
            WHERE ({type_tag_query});
        """
    
    cursor.execute(query, params)
    candidate_rows = cursor.fetchall()
    conn.close()
    
    debug_print(f"  Found {len(candidate_rows)} candidate products with matching type tags")
    
    # Calculate similarity scores for each candidate
    results = []
    for row in candidate_rows:
        cand_id, cand_image_url, cand_image_path, cand_album_title, cand_tags_json, cand_album_url, cand_colors_json = row
        cand_tags = json.loads(cand_tags_json)
        cand_colors = json.loads(cand_colors_json) if cand_colors_json else {}
        
        # Calculate color similarity score
        similarity_score = calculate_color_similarity(ref_colors, cand_colors)
        
        results.append((
            cand_id,
            cand_image_url,
            cand_image_path,
            cand_album_title,
            cand_tags,
            cand_album_url,
            cand_colors,
            similarity_score
        ))
    
    # Sort by similarity score (lower is more similar)
    results.sort(key=lambda x: x[7])
    
    # Limit results
    results = results[:limit]
    
    debug_print(f"  Returning {len(results)} similar products")
    if results:
        debug_print(f"  Top 3 similarity scores: {[r[7] for r in results[:3]]}")
    
    return results

