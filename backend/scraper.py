"""
Web scraper for Yupoo albums.

This module contains helper functions for extracting album URLs and
their corresponding cover images from a Yupoo site. The HTML
structure of Yupoo pages can vary and may change over time, so the
scraper uses heuristics to locate links and images. You may need to
adapt these functions if Yupoo's layout changes significantly.
"""

import re
from typing import List, Tuple
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup  # type: ignore


def get_album_links_and_covers(base_url: str, max_albums: int = 50) -> List[Tuple[str, str]]:
    """Retrieve album links and their cover image URLs from the base page.

    Args:
        base_url: The root URL of the Yupoo site (e.g. "https://deateath.x.yupoo.com").
        max_albums: Maximum number of albums to fetch (to prevent excessively
            long scraping sessions).

    Returns:
        A list of tuples `(album_url, cover_image_url)`. If a cover image
        cannot be determined for an album, that album is skipped.
    """
    try:
        resp = requests.get(base_url, timeout=15)
        resp.raise_for_status()
    except Exception as exc:
        print(f"Error fetching base URL {base_url}: {exc}")
        return []
    soup = BeautifulSoup(resp.text, "html.parser")
    results: List[Tuple[str, str]] = []
    # Find all <a> tags that link to album pages and have an <img> child
    anchors = soup.find_all("a", href=True)
    for a in anchors:
        href = a.get("href")
        if not href:
            continue
        # Heuristic: album URLs often contain "albums" or end with digits
        if "album" in href or re.search(r"/\d+", href):
            img = a.find("img")
            if img and img.get("src"):
                album_url = urljoin(base_url, href)
                img_url = urljoin(base_url, img["src"])
                results.append((album_url, img_url))
                if len(results) >= max_albums:
                    break
    return results


def get_cover_from_album(album_url: str) -> str:
    """Attempt to extract the cover image URL from an individual album page.

    If the cover cannot be reliably found, the function returns an
    empty string.

    Args:
        album_url: URL of the album page.

    Returns:
        The URL of the cover image or an empty string.
    """
    try:
        resp = requests.get(album_url, timeout=15)
        resp.raise_for_status()
    except Exception as exc:
        print(f"Error fetching album page {album_url}: {exc}")
        return ""
    soup = BeautifulSoup(resp.text, "html.parser")
    # Try to locate an <img> with a 'cover' class or id
    img = soup.find("img", {"class": re.compile("cover", re.I)}) or soup.find(
        "img", {"id": re.compile("cover", re.I)}
    )
    if not img:
        # Fallback: pick the first image on the page
        img = soup.find("img")
    if img and img.get("src"):
        return urljoin(album_url, img["src"])
    return ""