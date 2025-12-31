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
    tags_json = json.dumps(tags_list)
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


def search_products_by_tags(tag_list: List[str], db_path: str = DB_NAME, sort_by_color: Optional[str] = None) -> List[Tuple[int, str, str, str, List[str], str, dict]]:
    """Search for products using category-based OR/AND logic with optional color sorting.
    
    Logic:
    - Tags in the SAME category are OR'd together (e.g., red OR blue)
    - Tags from DIFFERENT categories are AND'd together (e.g., (red OR blue) AND nike)
    - If sort_by_color is specified, results are sorted by that color's percentage

    Args:
        tag_list: A list of tags to filter by.
        db_path: Path to the SQLite database file.
        sort_by_color: Optional color name to sort results by (e.g., "black", "red")

    Returns:
        A list of tuples representing matching products. Each tuple
        contains `(id, image_url, image_path, album_title, tags, album_url, colors_data)`.
    """
    if not tag_list:
        return []
    
    # Group tags by their category prefix
    tag_categories = {}
    for tag in tag_list:
        # Extract category (everything before the last underscore)
        parts = tag.split('_')
        if len(parts) >= 2:
            category = '_'.join(parts[:-1])  # e.g., "color" from "color_red"
        else:
            category = tag
        
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
        or_clauses = [f"tags_json LIKE ?" for _ in tags]
        where_clauses.append(f"({' OR '.join(or_clauses)})")
        all_params.extend([f'%"{tag}"%' for tag in tags])
    
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
    
    # Sort by color percentage if specified
    if sort_by_color and results:
        results.sort(
            key=lambda x: x[6].get(sort_by_color, 0),
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
