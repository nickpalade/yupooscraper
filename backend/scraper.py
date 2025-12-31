"""
Web scraper for Yupoo albums.

This module contains helper functions for extracting album URLs and
their corresponding cover images from a Yupoo site. The HTML
structure of Yupoo pages can vary and may change over time, so the
scraper uses heuristics to locate links and images. You may need to
adapt these functions if Yupoo's layout changes significantly.
"""

import re
import json
import os
from typing import List, Tuple, Optional
from urllib.parse import urljoin
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests
from bs4 import BeautifulSoup  # type: ignore


def debug_print(message: str):
    """Print debug message with flush to ensure it appears in concurrent output."""
    try:
        # Write directly to stdout buffer with UTF-8 encoding to bypass Windows console encoding issues
        output = f"[SCRAPER DEBUG] {message}\n"
        sys.stdout.buffer.write(output.encode('utf-8'))
        sys.stdout.buffer.flush()
    except Exception:
        # Fallback: replace problematic characters
        safe_msg = message.encode('utf-8', errors='replace').decode('utf-8', errors='replace')
        print(f"[SCRAPER DEBUG] {safe_msg}", flush=True)


def load_clothing_tags() -> List[str]:
    """Load clothing tags from clothing_tags.json file.
    
    Returns:
        A list of clothing type tags.
    """
    tags_file = os.path.join(os.path.dirname(__file__), "clothing_tags.json")
    try:
        with open(tags_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
            tags = data.get("clothing_types", [])
            debug_print(f"Loaded {len(tags)} clothing tags")
            return tags
    except Exception as e:
        debug_print(f"Error loading clothing tags: {e}")
        return []


def extract_clothing_tags_from_title(album_title: str, clothing_tags: List[str]) -> List[str]:
    """Extract clothing tags from album title by matching tag keywords.
    
    Args:
        album_title: The title of the album to search for clothing tags
        clothing_tags: List of available clothing tag keywords
        
    Returns:
        A list of matched clothing tags found in the album title, prefixed with 'type_'
    """
    found_tags = []
    
    if not album_title:
        return found_tags
    
    # Normalize title for matching (uppercase, remove special characters)
    normalized_title = album_title.upper()
    
    # Sort tags by length (longest first) to match longer tags before shorter ones
    # This prevents "SHIRT" from matching when "T-SHIRT" is the intended match
    sorted_tags = sorted(clothing_tags, key=len, reverse=True)
    
    # Keep track of matched regions to avoid overlapping matches
    matched_regions = set()
    
    for tag in sorted_tags:
        normalized_tag = tag.upper()
        # Check if tag appears in title (case-insensitive, whole word match)
        # Use word boundaries to match whole tags
        pattern = r'\b' + re.escape(normalized_tag) + r'\b'
        for match in re.finditer(pattern, normalized_title):
            start, end = match.span()
            # Check if this region overlaps with already matched regions
            overlaps = any(s < end and e > start for s, e in matched_regions)
            if not overlaps:
                # Add type_ prefix and convert to lowercase
                prefixed_tag = f"type_{tag.lower()}"
                found_tags.append(prefixed_tag)
                matched_regions.add((start, end))
                debug_print(f"  Found clothing tag in title: {prefixed_tag}")
                break  # Only match each tag once
    
    return found_tags


def get_headers() -> dict:
    """Return browser headers to avoid being blocked by servers."""
    return {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/1295.145.223.226 Safari/537.36',
        'Referer': 'https://www.yupoo.com/',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
    }


def fetch_page_for_count(base_url: str, page_number: int) -> Tuple[int, int]:
    """Fetch a single page and count albums (for parallel scanning).
    
    Args:
        base_url: The base URL
        page_number: The page number to fetch
        
    Returns:
        Tuple of (page_number, album_count) or (page_number, 0) if failed
    """
    try:
        if '?' in base_url:
            page_url = f"{base_url}&page={page_number}"
        else:
            page_url = f"{base_url}?page={page_number}"
        
        debug_print(f"[Count Thread] Fetching page {page_number}")
        resp = requests.get(page_url, timeout=15, headers=get_headers())
        resp.raise_for_status()
        
        soup = BeautifulSoup(resp.text, "html.parser")
        album_anchors = soup.find_all("a", class_="album_main")
        
        if not album_anchors:
            album_anchors = soup.find_all("a", href=re.compile(r"/albums/\d+"))
        
        albums_on_page = len(album_anchors)
        debug_print(f"[Count Thread] Page {page_number}: {albums_on_page} albums")
        return (page_number, albums_on_page)
    except Exception as exc:
        debug_print(f"[Count Thread] Error on page {page_number}: {exc}")
        return (page_number, 0)


def count_total_albums(base_url: str, max_albums: int = 2000):
    """Generator that scans pages in parallel to count total albums available.

    Args:
        base_url: The root URL of the Yupoo site
        max_albums: Maximum albums to look for (stops early if found)

    Yields:
        Progress updates as dicts with 'type', 'page', 'albums_on_page', and 'total_so_far'
        Final update with 'type': 'count_complete' and 'total'
    """
    debug_print(f"Scanning total albums at: {base_url} (will stop at {max_albums})")
    total_count = 0
    current_batch = 1
    batch_size = 20  # Fetch 20 pages in parallel per batch
    last_page_had_albums = True
    
    while last_page_had_albums and total_count < max_albums:
        # Determine pages to fetch in this batch
        pages_to_fetch = list(range(
            (current_batch - 1) * batch_size + 1,
            current_batch * batch_size + 1
        ))
        
        debug_print(f"Fetching pages {pages_to_fetch[0]}-{pages_to_fetch[-1]} in parallel")
        
        # Fetch multiple pages in parallel
        with ThreadPoolExecutor(max_workers=20) as executor:
            future_to_page = {
                executor.submit(fetch_page_for_count, base_url, page_num): page_num
                for page_num in pages_to_fetch
            }
            
            # Process results in order
            batch_results = []
            for future in as_completed(future_to_page):
                page_num = future_to_page[future]
                try:
                    page_number, albums_on_page = future.result()
                    batch_results.append((page_number, albums_on_page))
                except Exception as e:
                    debug_print(f"Exception fetching page {page_num}: {e}")
                    batch_results.append((page_num, 0))
            
            # Sort results by page number to process in order
            batch_results.sort(key=lambda x: x[0])
            
            # Process each page result
            for page_number, albums_on_page in batch_results:
                debug_print(f"Counting page {page_number}: {albums_on_page} albums")
                
                yield {
                    "type": "page_scanned",
                    "page": page_number,
                    "albums_on_page": albums_on_page,
                    "total_so_far": total_count + albums_on_page
                }
                
                if albums_on_page == 0:
                    debug_print(f"No albums on page {page_number}, stopping scan")
                    last_page_had_albums = False
                    break
                
                total_count += albums_on_page
                
                # Early stop if we've found enough albums
                if total_count >= max_albums:
                    debug_print(f"Found {total_count} albums, reached max_albums limit")
                    last_page_had_albums = False
                    break
        
        if last_page_had_albums:
            current_batch += 1
    
    debug_print(f"Total albums available: {total_count}")
    yield {
        "type": "count_complete",
        "total": total_count
    }


def fetch_album_details(album_url: str, album_number: int, clothing_tags: List[str]) -> Optional[Tuple[int, str, str, str, List[str]]]:
    """Fetch details for a single album (to be used with ThreadPoolExecutor).
    
    Args:
        album_url: URL of the album
        album_number: Album number for tracking
        clothing_tags: List of clothing tags to search
        
    Returns:
        Tuple of (album_number, album_url, album_title, img_url, tags) or None if failed
    """
    try:
        debug_print(f"[Thread] Fetching album {album_number}: {album_url}")
        album_resp = requests.get(album_url, timeout=15, headers=get_headers())
        album_resp.raise_for_status()
    except Exception as e:
        debug_print(f"[Thread] ERROR fetching album {album_number}: {e}")
        return None
    
    # Parse the album page to find the cover image and title
    album_soup = BeautifulSoup(album_resp.text, "html.parser")
    
    # Extract album title
    album_title = ""
    title_tag = album_soup.find("span", class_="showalbumheader__gallerytitle")
    if title_tag:
        album_title = title_tag.get_text(strip=True)
    
    # Look for the cover image
    gallery_cover = album_soup.find("div", class_="showalbumheader__gallerycover")
    if not gallery_cover:
        debug_print(f"[Thread] Album {album_number}: No gallery cover found")
        return None
    
    # Find the autocover image
    img = gallery_cover.find("img", class_="autocover")
    if not img or not img.get("src"):
        debug_print(f"[Thread] Album {album_number}: No cover image found")
        return None
    
    img_url = img["src"]
    
    # Handle protocol-relative URLs
    if img_url.startswith("//"):
        img_url = "https:" + img_url
    else:
        img_url = urljoin(album_url, img_url)
    
    # Extract clothing tags
    tags = extract_clothing_tags_from_title(album_title, clothing_tags)
    debug_print(f"[Thread] Album {album_number}: Success - {album_title}")
    
    return (album_number, album_url, album_title, img_url, tags)


def get_album_links_and_covers(base_url: str, max_albums: int = 50):
    """Generator that retrieves album links and their cover image URLs, supporting pagination.

    Args:
        base_url: The root URL of the Yupoo site (e.g. "https://deateath.x.yupoo.com").
        max_albums: Maximum number of albums to fetch (to prevent excessively
            long scraping sessions).

    Yields:
        Progress updates as dicts, and final result list of tuples
        Final yield: {'type': 'scrape_complete', 'albums': [...]}
    """
    # Scan total albums first
    debug_print(f"\n=== SCRAPING START ===")
    debug_print(f"Base URL: {base_url}")
    debug_print(f"Max albums to fetch: {max_albums}")
    
    total_albums = 0
    yield {"type": "scanning_pages", "message": f"Scanning pages to count total albums..."}
    
    # Count albums and yield page scan updates (pass max_albums to stop early)
    for scan_update in count_total_albums(base_url, max_albums=max_albums):
        if scan_update["type"] == "page_scanned":
            debug_print(f"Page {scan_update['page']}: {scan_update['albums_on_page']} albums (total so far: {scan_update['total_so_far']})")
            yield {
                "type": "page_scanned",
                "page": scan_update["page"],
                "albums_found": scan_update["total_so_far"]
            }
        elif scan_update["type"] == "count_complete":
            total_albums = scan_update["total"]
            debug_print(f"Total albums available: {total_albums}")
            yield {
                "type": "scan_complete",
                "total_albums": total_albums,
                "will_fetch": min(total_albums, max_albums)
            }
    
    # Load clothing tags
    clothing_tags = load_clothing_tags()
    
    results: List[Tuple[str, str, str, List[str]]] = []
    current_page = 1
    album_counter = 0  # Global counter for album numbers
    
    yield {"type": "scrape_start", "message": f"Starting to scrape {min(total_albums, max_albums)} albums from {total_albums} available..."}

    
    while len(results) < max_albums:
        # Build pagination URL
        if '?' in base_url:
            page_url = f"{base_url}&page={current_page}"
        elif base_url.endswith('/'):
            if 'albums' in base_url:
                page_url = f"{base_url}?page={current_page}"
            else:
                page_url = f"{base_url}?page={current_page}"
        else:
            page_url = f"{base_url}?page={current_page}"
        
        debug_print(f"\n--- Fetching page {current_page}: {page_url} ---")
        yield {
            "type": "fetching_page",
            "page": current_page,
            "url": page_url
        }
        
        try:
            debug_print(f"Fetching page URL: {page_url}")
            resp = requests.get(page_url, timeout=15, headers=get_headers())
            resp.raise_for_status()
            debug_print(f"Successfully fetched page. Status: {resp.status_code}")
        except Exception as exc:
            debug_print(f"ERROR fetching page {current_page}: {exc}")
            yield {
                "type": "page_error",
                "page": current_page,
                "error": str(exc)
            }
            break
        
        debug_print("Parsing HTML with BeautifulSoup")
        soup = BeautifulSoup(resp.text, "html.parser")
        
        # Get all album links from this page
        debug_print("Looking for album links...")
        album_anchors = soup.find_all("a", class_="album_main")
        debug_print(f"Found {len(album_anchors)} album_main links on page {current_page}")
        
        if not album_anchors:
            debug_print("No album_main links found, trying fallback /albums/ pattern...")
            album_anchors = soup.find_all("a", href=re.compile(r"/albums/\d+"))
            debug_print(f"Found {len(album_anchors)} /albums/ links on page {current_page}")
        
        # If no albums found on this page, we've reached the end
        if not album_anchors:
            debug_print(f"No albums found on page {current_page}, pagination complete")
            yield {
                "type": "page_empty",
                "page": current_page
            }
            break
        
        yield {
            "type": "page_albums_found",
            "page": current_page,
            "albums_on_page": len(album_anchors)
        }
        
        # Extract album URLs from this page
        album_urls_to_fetch = []
        for a in album_anchors:
            if len(results) + len(album_urls_to_fetch) >= max_albums:
                break
            
            href = a.get("href")
            if href:
                album_url = urljoin(base_url, href)
                album_counter += 1
                album_urls_to_fetch.append((album_counter, album_url))
        
        debug_print(f"Will fetch {len(album_urls_to_fetch)} albums from page {current_page} in parallel")
        
        # Fetch albums in parallel using ThreadPoolExecutor with 5 workers
        with ThreadPoolExecutor(max_workers=5) as executor:
            # Submit all album fetch tasks
            future_to_album = {
                executor.submit(fetch_album_details, album_url, album_num, clothing_tags): (album_num, album_url)
                for album_num, album_url in album_urls_to_fetch
            }
            
            # Process results as they complete
            for future in as_completed(future_to_album):
                album_num, album_url = future_to_album[future]
                try:
                    result = future.result()
                    if result:
                        album_number, fetched_url, album_title, img_url, tags = result
                        debug_print(f"Album {album_number} completed successfully")
                        yield {
                            "type": "album_success",
                            "album_number": album_number,
                            "album_title": album_title,
                            "album_url": fetched_url,
                            "clothing_tags": tags
                        }
                        results.append((fetched_url, img_url, album_title, tags))
                    else:
                        debug_print(f"Album {album_num} failed to fetch")
                        yield {
                            "type": "album_fetch_error",
                            "album_number": album_num,
                            "album_url": album_url,
                            "error": "Failed to extract album details"
                        }
                except Exception as e:
                    debug_print(f"Album {album_num} exception: {e}")
                    yield {
                        "type": "album_fetch_error",
                        "album_number": album_num,
                        "album_url": album_url,
                        "error": str(e)
                    }
        
        # If we're still under the limit and found albums on this page, continue to next page
        if len(results) < max_albums and len(album_urls_to_fetch) > 0:
            current_page += 1
        else:
            # Either reached max_albums or no albums found on this page
            break
    
    debug_print(f"\n=== SCRAPING COMPLETE ===")
    debug_print(f"Total pages scanned: {current_page}")
    debug_print(f"Total albums found and processed: {len(results)}")
    
    yield {
        "type": "scrape_complete",
        "albums": results,
        "total_albums": len(results)
    }


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


def get_external_link_from_album(album_url: str) -> Optional[str]:
    """
    Fetches a Yupoo album page and extracts the external product link
    (e.g., Weidian, Taobao) from the description.
    """
    try:
        debug_print(f"Fetching album for external link: {album_url}")
        resp = requests.get(album_url, timeout=15, headers=get_headers())
        resp.raise_for_status()
    except Exception as e:
        debug_print(f"ERROR fetching album page {album_url}: {e}")
        return None

    soup = BeautifulSoup(resp.text, "html.parser")

    # Find the container for the subtitle/description
    subtitle_div = soup.find("div", class_="showalbumheader__gallerysubtitle")
    if not subtitle_div:
        debug_print(f"Could not find subtitle div in {album_url}")
        return None

    # Find the first 'a' tag within that div
    link_tag = subtitle_div.find("a")
    if not link_tag:
        debug_print(f"Could not find link tag in subtitle div for {album_url}")
        return None

    # The link is often the text content of the tag.
    link = link_tag.get_text(strip=True)

    # Validate if the text is a URL
    if link and (link.startswith("http://") or link.startswith("https://")):
        debug_print(f"Found external link in text: {link}")
        return link

    # Fallback to href attribute if text is not a valid link
    href = link_tag.get("href")
    if href:
        if "x.yupoo.com/external?url=" in href:
            # It's a redirect link, we need to parse it
            from urllib.parse import urlparse, parse_qs, unquote
            parsed_url = urlparse(href)
            query_params = parse_qs(parsed_url.query)
            if 'url' in query_params:
                # The URL is often double-encoded
                decoded_url = unquote(unquote(query_params['url'][0]))
                debug_print(f"Found and decoded external link from href: {decoded_url}")
                return decoded_url
        elif href.startswith("http"):
            debug_print(f"Found external link in href: {href}")
            return href

    debug_print(f"No valid external link found in {album_url}")
    return None