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
from typing import Iterable, List, Optional, Tuple, Any


DB_NAME = os.path.join(os.path.dirname(__file__), "yupoo.db")


def init_db(db_path: str = DB_NAME) -> None:
    """Initialise the SQLite database.

    This function creates a `products` table if it does not already
    exist. Each row in the table has an auto‑incrementing primary key
    (`id`), the URL of the cover image (`image_url`), a JSON array of
    tags (`tags_json`), and the URL of the album (`album_url`).

    Args:
        db_path: Path to the SQLite database file.
    """
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            image_url TEXT NOT NULL,
            tags_json TEXT NOT NULL,
            album_url TEXT NOT NULL,
            UNIQUE(album_url)
        );
        """
    )
    conn.commit()
    conn.close()


def insert_product(image_url: str, tags: Iterable[str], album_url: str, db_path: str = DB_NAME) -> None:
    """Insert a new product record into the database.

    Args:
        image_url: The URL of the product's cover image.
        tags: An iterable of tag strings generated for the product.
        album_url: The URL of the original Yupoo album.
        db_path: Path to the SQLite database file.
    """
    tags_json = json.dumps(list(tags))
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    try:
        cursor.execute(
            """
            INSERT OR IGNORE INTO products (image_url, tags_json, album_url)
            VALUES (?, ?, ?);
            """,
            (image_url, tags_json, album_url),
        )
        conn.commit()
    finally:
        conn.close()


def search_products_by_tags(tag_list: List[str], db_path: str = DB_NAME) -> List[Tuple[int, str, List[str], str]]:
    """Search for products that contain all tags in `tag_list`.

    Args:
        tag_list: A list of tags that the returned products must contain.
        db_path: Path to the SQLite database file.

    Returns:
        A list of tuples representing matching products. Each tuple
        contains `(id, image_url, tags, album_url)` where `tags` is a
        Python list of strings.
    """
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    # Build a SQL query that selects rows where all tags exist in the
    # JSON array. SQLite's JSON functions are available in modern
    # versions; we use simple LIKE matches to avoid requiring JSON1.
    placeholders = " AND ".join(["tags_json LIKE ?"] * len(tag_list))
    query = f"SELECT id, image_url, tags_json, album_url FROM products WHERE {placeholders};"
    params = [f'%"{tag}"%' for tag in tag_list]
    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()
    results = []
    for row in rows:
        product_id, image_url, tags_json, album_url = row
        tags = json.loads(tags_json)
        results.append((product_id, image_url, tags, album_url))
    return results


def list_all_products(db_path: str = DB_NAME) -> List[Tuple[int, str, List[str], str]]:
    """Return all products stored in the database.

    Useful for debugging or verifying the contents of the database.

    Args:
        db_path: Path to the SQLite database file.

    Returns:
        A list of tuples `(id, image_url, tags, album_url)`.
    """
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT id, image_url, tags_json, album_url FROM products;")
    rows = cursor.fetchall()
    conn.close()
    result: List[Tuple[int, str, List[str], str]] = []
    for row in rows:
        product_id, image_url, tags_json, album_url = row
        tags = json.loads(tags_json)
        result.append((product_id, image_url, tags, album_url))
    return result