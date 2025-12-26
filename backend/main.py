"""
FastAPI application for the Yupoo scraping and search service.

This module ties together the scraper, vision and database utilities to
expose a REST API. Clients can trigger a scraping operation on a
given Yupoo base URL, search for products by tags, and list all
stored products. CORS is configured to allow requests from any
origin by default, making it straightforward to consume the API from
a frontend running on a different port.
"""

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional

from . import database
from . import scraper
from . import vision


# Initialise the database when the module is imported
database.init_db()

app = FastAPI(title="Yupoo Product Scraper", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ScrapeRequest(BaseModel):
    base_url: str
    max_albums: Optional[int] = 50


class ProductResponse(BaseModel):
    id: int
    image_url: str
    tags: List[str]
    album_url: str


@app.post("/api/scrape", summary="Scrape albums and extract tags")
def scrape_endpoint(payload: ScrapeRequest):
    """Scrape the specified Yupoo base URL and store products in the database.

    Args:
        payload: A JSON body containing the base URL and optional max_albums.

    Returns:
        A dict with the number of albums processed and the number of
        products successfully inserted.
    """
    base_url = payload.base_url
    max_albums = payload.max_albums or 50
    # Get album list and cover images
    pairs = scraper.get_album_links_and_covers(base_url, max_albums=max_albums)
    inserted = 0
    for album_url, img_url in pairs:
        # Generate tags for the cover image
        try:
            tags = vision.generate_tags_for_image(img_url)
        except Exception as exc:
            # Skip problematic images
            print(f"Error generating tags for {img_url}: {exc}")
            continue
        # Insert into database
        database.insert_product(img_url, tags, album_url)
        inserted += 1
    return {"albums_processed": len(pairs), "products_inserted": inserted}


@app.get(
    "/api/products",
    response_model=List[ProductResponse],
    summary="Search products by tags",
)
def search_products(tags: str = Query(..., description="Comma separated list of tags to search for")):
    """Search for products that contain all of the specified tags.

    Args:
        tags: Comma separated tags (e.g., "color_red,brightness_dark").

    Returns:
        A list of matching products.
    """
    tag_list = [t.strip() for t in tags.split(",") if t.strip()]
    if not tag_list:
        raise HTTPException(status_code=400, detail="At least one tag must be provided.")
    results = database.search_products_by_tags(tag_list)
    # Convert to response models
    return [ProductResponse(id=id_, image_url=image_url, tags=tags_, album_url=album_url) for id_, image_url, tags_, album_url in results]


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
    return [ProductResponse(id=id_, image_url=image_url, tags=tags_, album_url=album_url) for id_, image_url, tags_, album_url in rows]


@app.get("/", summary="Service root")
def root():
    """Root endpoint that provides a friendly greeting and hints about using the API."""
    return {
        "message": "Welcome to the Yupoo product scraper API!",
        "endpoints": {
            "POST /api/scrape": "Scrape a Yupoo site and index products.",
            "GET /api/products": "Search for products by tags.",
            "GET /api/products/all": "List all stored products.",
        },
    }