"""
FastAPI application for the Yupoo scraping and search service.

This module ties together the scraper, vision and database utilities to
expose a REST API. Clients can trigger a scraping operation on a
given Yupoo base URL, search for products by tags, and list all
stored products. CORS is configured to allow requests from any
origin by default, making it straightforward to consume the API from
a frontend running on a different port.
"""

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import List, Optional
import sys
import json
import os
import requests
import hashlib
from PIL import Image
from io import BytesIO

from . import database
from . import scraper
from . import vision
from . import translator


def debug_print(message: str):
    """Print debug message with flush to ensure it appears in concurrent output."""
    try:
        # Write directly to stdout buffer with UTF-8 encoding to bypass Windows console encoding issues
        output = f"[MAIN DEBUG] {message}\n"
        sys.stdout.buffer.write(output.encode('utf-8'))
        sys.stdout.buffer.flush()
    except Exception:
        # Fallback: replace problematic characters
        safe_msg = message.encode('utf-8', errors='replace').decode('utf-8', errors='replace')
        print(f"[MAIN DEBUG] {safe_msg}", flush=True)


# Initialise the database when the module is imported
database.init_db()

app = FastAPI(title="Yupoo Product Scraper", version="1.0.0")

@app.middleware("http")
async def add_private_network_header(request: Request, call_next):
    response = await call_next(request)
    response.headers["Access-Control-Allow-Private-Network"] = "true"
    return response

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve images from storage directory
storage_dir = database.IMAGES_DIR
app.mount("/api/images", StaticFiles(directory=storage_dir), name="images")


class ScrapeRequest(BaseModel):
    base_url: str
    max_albums: Optional[int] = 50


class ProductResponse(BaseModel):
    id: int
    image_url: str
    image_path: str
    album_title: str
    translated_title: str
    tags: List[str]
    album_url: str
    colors: dict = {}  # Color percentages for sorting


def save_image_locally(image_url: str) -> Optional[str]:
    """Download and save an image locally.
    
    Args:
        image_url: URL of the image to download
        
    Returns:
        Local path to the saved image, or None if failed
    """
    try:
        headers = scraper.get_headers()
        response = requests.get(image_url, timeout=10, headers=headers)
        response.raise_for_status()
        
        # Create filename from URL hash
        url_hash = hashlib.md5(image_url.encode()).hexdigest()
        filename = f"{url_hash}.jpg"
        filepath = os.path.join(database.IMAGES_DIR, filename)
        
        # Save the image
        with open(filepath, 'wb') as f:
            f.write(response.content)
        
        debug_print(f"Saved image to: {filepath}")
        return f"/api/images/{filename}"
    except Exception as e:
        debug_print(f"Failed to save image from {image_url}: {e}")
        return None


@app.post("/api/scrape", summary="Scrape albums and extract tags")
def scrape_endpoint(payload: ScrapeRequest):
    """Scrape the specified Yupoo base URL and store products in the database.

    Args:
        payload: A JSON body containing the base URL and optional max_albums.

    Returns:
        A streaming response with progress updates and final result.
    """
    base_url = payload.base_url
    max_albums = payload.max_albums or 50
    
    debug_print(f"=== SCRAPE REQUEST START ===")
    debug_print(f"Base URL: {base_url}")
    debug_print(f"Max Albums: {max_albums}")
    
    # Get album list and cover images with generator for progress
    def scrape_generator():
        debug_print("Calling scraper.get_album_links_and_covers...")
        
        # Collect all progress updates from scraper generator
        scraper_gen = scraper.get_album_links_and_covers(base_url, max_albums=max_albums)
        pairs = None
        
        for scraper_update in scraper_gen:
            # Relay scraper progress updates to client
            if scraper_update["type"] == "scanning_pages":
                yield f"data: {json.dumps({'type': 'info', 'message': scraper_update['message']})}\n\n"
            elif scraper_update["type"] == "page_scanned":
                yield f"data: {json.dumps({'type': 'page_scanned', 'page': scraper_update['page'], 'albums_found': scraper_update['albums_found']})}\n\n"
            elif scraper_update["type"] == "scan_complete":
                yield f"data: {json.dumps({'type': 'scan_complete', 'total_albums': scraper_update['total_albums'], 'will_fetch': scraper_update['will_fetch']})}\n\n"
            elif scraper_update["type"] == "scrape_start":
                yield f"data: {json.dumps({'type': 'info', 'message': scraper_update['message']})}\n\n"
            elif scraper_update["type"] == "fetching_page":
                yield f"data: {json.dumps({'type': 'fetching_page', 'page': scraper_update['page']})}\n\n"
            elif scraper_update["type"] == "page_albums_found":
                msg = f"Found {scraper_update['albums_on_page']} albums on page {scraper_update['page']}"
                yield f"data: {json.dumps({'type': 'info', 'message': msg})}\n\n"
            elif scraper_update["type"] == "album_scanning":
                yield f"data: {json.dumps({'type': 'album_scanning', 'album_number': scraper_update['album_number'], 'max': scraper_update['max_albums'], 'url': scraper_update['album_url']})}\n\n"
            elif scraper_update["type"] == "album_success":
                yield f"data: {json.dumps({'type': 'album_found', 'album_number': scraper_update['album_number'], 'title': scraper_update['album_title'], 'tags': scraper_update['clothing_tags']})}\n\n"
            elif scraper_update["type"] == "scrape_complete":
                pairs = scraper_update["albums"]
                debug_print(f"Scraper returned {len(pairs)} album pairs")
                yield f"data: {json.dumps({'type': 'info', 'message': f'Found {len(pairs)} albums to process'})}\n\n"
        
        if pairs is None:
            pairs = []
        
        inserted = 0
        failed = 0
        
        for idx, (album_url, img_url, album_title, clothing_tags) in enumerate(pairs, 1):
            debug_print(f"\nProcessing album {idx}/{len(pairs)}")
            debug_print(f"  Title: {album_title}")
            debug_print(f"  Clothing tags detected: {clothing_tags}")
            
            # Yield progress update
            progress_data = {
                "type": "progress",
                "current": idx,
                "total": len(pairs),
                "album_url": album_url,
                "message": f"Processing album {idx}/{len(pairs)}"
            }
            yield f"data: {json.dumps(progress_data)}\n\n"
            
            # Save image locally
            try:
                debug_print(f"  Saving image locally...")
                local_image_path = save_image_locally(img_url)
                if not local_image_path:
                    debug_print(f"  Failed to save image")
                    failed += 1
                    yield f"data: {json.dumps({'type': 'error', 'message': f'Failed to save image from {album_url}'})}\n\n"
                    continue
                debug_print(f"  Image saved to: {local_image_path}")
            except Exception as exc:
                debug_print(f"  ERROR saving image: {exc}")
                failed += 1
                continue
            
            # Generate tags for the cover image (including color and company tags)
            try:
                debug_print(f"  Generating tags for image...")
                vision_tags, color_data = vision.generate_tags_for_image(img_url, album_title=album_title)
                debug_print(f"  Vision tags generated: {vision_tags}")
                debug_print(f"  Color data: {color_data}")
                
                # Merge clothing tags with vision tags
                all_tags = list(set(clothing_tags + vision_tags))  # Remove duplicates
                debug_print(f"  All tags (clothing + vision): {all_tags}")
            except Exception as exc:
                # Skip problematic images
                debug_print(f"  ERROR generating tags for {img_url}: {exc}")
                failed += 1
                yield f"data: {json.dumps({'type': 'error', 'message': f'Failed to generate tags for {album_url}'})}\n\n"
                continue
            
            # Insert into database with image path and album title
            try:
                debug_print(f"  Inserting into database...")
                database.insert_product(img_url, all_tags, album_url, image_path=local_image_path, album_title=album_title, colors_data=color_data)
                inserted += 1
                debug_print(f"  Successfully inserted!")
                yield f"data: {json.dumps({'type': 'success', 'message': f'Inserted product from {album_url}'})}\n\n"
            except Exception as exc:
                debug_print(f"  ERROR inserting into database: {exc}")
                failed += 1
                yield f"data: {json.dumps({'type': 'error', 'message': f'Failed to insert product from {album_url}'})}\n\n"
        
        debug_print(f"\n=== SCRAPE REQUEST COMPLETE ===")
        debug_print(f"Albums processed: {len(pairs)}")
        debug_print(f"Products inserted: {inserted}")
        debug_print(f"Failed: {failed}")
        
        # Yield final result
        yield f"data: {json.dumps({'type': 'complete', 'albums_processed': len(pairs), 'products_inserted': inserted, 'failed': failed})}\n\n"
    
    return StreamingResponse(scrape_generator(), media_type="text/event-stream")


@app.get("/api/tags", summary="Get all available tags")
def get_tags():
    """Return all unique tags from the database.
    
    Returns:
        A list of all unique tags available.
    """
    debug_print("Fetching all unique tags...")
    tags = database.get_all_unique_tags()
    debug_print(f"Returning {len(tags)} unique tags")
    return {"tags": tags}


@app.get("/api/external-link", summary="Get external product link from a Yupoo album")
def get_external_link(url: str = Query(..., description="The Yupoo album URL")):
    """
    Scrapes a single Yupoo album page to find the external product link
    (e.g., Weidian or Taobao) typically found in the description.
    """
    if not url:
        raise HTTPException(status_code=400, detail="URL parameter is required.")
    
    try:
        external_link = scraper.get_external_link_from_album(url)
        if not external_link:
            raise HTTPException(status_code=404, detail="No external link found on the page.")
        return {"external_link": external_link}
    except Exception as e:
        # Broad exception to catch request errors, parsing errors, etc.
        debug_print(f"Error getting external link for {url}: {e}")
        raise HTTPException(status_code=500, detail=f"An error occurred: {str(e)}")




@app.get(
    "/api/products",
    response_model=List[ProductResponse],
    summary="Search products by tags",
)
def search_products(
    tags: str = Query(..., description="Comma separated list of tags to search for"),
    sort_by_color: Optional[str] = Query(None, description="DEPRECATED: Use sort_by_colors. Optional color name to sort results by (e.g., 'black', 'red')"),
    sort_by_colors: Optional[str] = Query(None, description="Comma separated list of color names to sort results by (e.g., 'black,red')"),
    exclusive_type_search: Optional[bool] = Query(None, description="If true, filters results to include only products with the specified type tags and no other type tags.")
):
    """Search for products that contain all of the specified tags.

    Args:
        tags: Comma separated tags (e.g., "color_red,brightness_dark").
        sort_by_color: DEPRECATED. Optional color name to sort results by percentage (highest first).
        sort_by_colors: Optional comma separated list of color names to sort results by (highest combined percentage first).
        exclusive_type_search: If true, filters results to include only products with the specified type tags and no other type tags.

    Returns:
        A list of matching products, optionally sorted by color intensity.
    """
    tag_list = [t.strip() for t in tags.split(",") if t.strip()]
    if not tag_list:
        raise HTTPException(status_code=400, detail="At least one tag must be provided.")
    
    sort_colors_list = []
    if sort_by_colors:
        sort_colors_list = [c.strip() for c in sort_by_colors.split(",") if c.strip()]
    elif sort_by_color: # Fallback to deprecated single sort_by_color
        sort_colors_list = [sort_by_color.strip()]

    results = database.search_products_by_tags(tag_list, sort_by_colors=sort_colors_list, exclusive_type_search=exclusive_type_search)
    # Convert to response models with translated titles
    return [ProductResponse(
        id=id_,
        image_url=image_url,
        image_path=image_path,
        album_title=album_title,
        translated_title=translator.translate_name(album_title),
        tags=tags_,
        album_url=album_url,
        colors=colors_data
    ) for id_, image_url, image_path, album_title, tags_, album_url, colors_data in results]


@app.get(
    "/api/products/all",
    response_model=List[ProductResponse],
    summary="List all products",
)
def list_all_products():
    """Return all products stored in the database.

    Useful for debugging or exploring the dataset.
    """
    rows = database.list_all_products()
    return [ProductResponse(
        id=id_,
        image_url=image_url,
        image_path=image_path,
        album_title=album_title,
        translated_title=translator.translate_name(album_title),
        tags=tags_,
        album_url=album_url,
        colors=colors_data
    ) for id_, image_url, image_path, album_title, tags_, album_url, colors_data in rows]


@app.get("/", summary="Service root")
def root():
    """Root endpoint that provides a friendly greeting and hints about using the API."""
    return {
        "message": "Welcome to the Yupoo product scraper API!",
        "endpoints": {
            "POST /api/scrape": "Scrape a Yupoo site and index products.",
            "GET /api/products": "Search for products by tags.",
            "GET /api/products/all": "List all stored products.",
            "DELETE /api/database/clear": "Clear all products from database (for testing).",
        },
    }


@app.delete("/api/database/clear", summary="Clear database (testing only)")
def clear_database_endpoint():
    """Clear all products from the database.

    WARNING: This endpoint deletes all stored products. Use with caution.
    Intended for testing purposes only.

    Returns:
        A dict with the number of products deleted.
    """
    debug_print("=== CLEAR DATABASE REQUEST ===")
    deleted = database.clear_database()
    debug_print(f"Deleted {deleted} products")
    return {
        "status": "success",
        "message": f"Database cleared. {deleted} products deleted.",
        "deleted_count": deleted
    }

# TEMPORARY: Run grey percentage adjustment on startup for testing
# debug_print("--- TEMPORARY: Running grey percentage adjustment on startup ---")
# try:
#     adjustment_result = database.adjust_color_percentages(colors_to_adjust=["grey", "white"])
#     debug_print(f"--- TEMPORARY: Grey adjustment result: {adjustment_result} ---")
# except Exception as e:
#     debug_print(f"--- TEMPORARY: Error during grey adjustment on startup: {e} ---")
# debug_print("--- TEMPORARY: Finished grey percentage adjustment on startup ---")

@app.post("/api/colors/adjust", summary="Adjust special color percentages (e.g., grey, white)")
def adjust_special_color_percentages_endpoint():
    """
    Adjusts the percentages of specified "special" colors (e.g., 'grey', 'white')
    across all products in the database.
    This process calculates the average percentage for each special color and then
    normalizes each product's color data based on this average, re-normalizing
    the percentages of all other colors proportionally.

    Returns:
        A dictionary containing statistics about the adjustment.
    """
    debug_print("=== ADJUST SPECIAL COLOR PERCENTAGES REQUEST ===")
    try:
        adjustment_summary = database.adjust_color_percentages(colors_to_adjust=["grey", "white"])
        debug_print(f"Special color percentage adjustment complete: {adjustment_summary}")
        return {
            "status": "success",
            "message": "Special color percentages adjusted successfully.",
            "summary": adjustment_summary
        }
    except Exception as e:
        debug_print(f"ERROR adjusting special color percentages: {e}")
        raise HTTPException(status_code=500, detail=f"An error occurred during special color percentage adjustment: {str(e)}")