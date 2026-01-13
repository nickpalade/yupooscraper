"""
FastAPI application for the Yupoo scraping and search service.

This module ties together the scraper, vision and database utilities to
expose a REST API. Clients can trigger a scraping operation on a
given Yupoo base URL, search for products by tags, and list all
stored products. CORS is configured to allow requests from any
origin by default, making it straightforward to consume the API from
a frontend running on a different port.
"""

from fastapi import FastAPI, HTTPException, Query, Request, Depends
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
from . import auth


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


class LoginRequest(BaseModel):
    username: str
    password: str


class RegisterRequest(BaseModel):
    username: str
    password: str
    email: Optional[str] = None


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    username: str
    is_admin: bool


class UserResponse(BaseModel):
    user_id: int
    username: str
    email: Optional[str]
    is_admin: bool


class CreateListRequest(BaseModel):
    list_name: str


class SaveProductRequest(BaseModel):
    list_id: int
    product_id: int
    notes: Optional[str] = None


class UpdateNotesRequest(BaseModel):
    notes: str


@app.get("/", summary="Health check")
def health_check():
    """Health check endpoint to verify the backend is running."""
    return {"status": "ok", "message": "Backend is running"}


@app.get("/api", summary="API health check")
def api_health_check():
    """API health check endpoint."""
    return {"status": "ok", "message": "API is running"}


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


# ========== Authentication Endpoints ==========

@app.post("/api/auth/register", response_model=UserResponse, summary="Register new user")
def register(payload: RegisterRequest):
    """Register a new user account.
    
    Args:
        payload: JSON body containing username, password, and optional email
        
    Returns:
        The created user's information
        
    Raises:
        HTTPException: If username/email already exists
    """
    debug_print(f"Registration attempt for user: {payload.username}")
    
    # Check if username already exists
    existing_user = database.get_user_by_username(payload.username)
    if existing_user:
        raise HTTPException(
            status_code=400,
            detail="Username already taken"
        )
    
    # Check if email already exists (if provided)
    if payload.email:
        existing_email = database.get_user_by_email(payload.email)
        if existing_email:
            raise HTTPException(
                status_code=400,
                detail="Email already registered"
            )
    
    # Hash password and create user
    hashed_password = auth.get_password_hash(payload.password)
    user_id = database.create_user(
        username=payload.username,
        hashed_password=hashed_password,
        email=payload.email,
        is_admin=False
    )
    
    debug_print(f"User registered successfully: {payload.username}")
    
    return UserResponse(
        user_id=user_id,
        username=payload.username,
        email=payload.email,
        is_admin=False
    )


@app.post("/api/auth/login", response_model=LoginResponse, summary="User login")
def login(payload: LoginRequest):
    """Authenticate a user and return a JWT token.
    
    Args:
        payload: JSON body containing username and password
        
    Returns:
        An access token for authenticated requests
        
    Raises:
        HTTPException: If credentials are invalid
    """
    debug_print(f"Login attempt for user: {payload.username}")
    
    # Get user from database
    user = database.get_user_by_username(payload.username)
    if user is None:
        debug_print(f"Login failed: User not found")
        raise HTTPException(
            status_code=401,
            detail="Incorrect username or password"
        )
    
    user_id, username, email, hashed_password, is_admin = user
    
    # Verify password
    if not auth.verify_password(payload.password, hashed_password):
        debug_print(f"Login failed: Invalid password")
        raise HTTPException(
            status_code=401,
            detail="Incorrect username or password"
        )
    
    # Create access token
    access_token = auth.create_access_token(data={"sub": username})
    debug_print(f"Login successful for user: {username} (admin: {is_admin})")
    
    return LoginResponse(
        access_token=access_token,
        username=username,
        is_admin=bool(is_admin)
    )


@app.get("/api/auth/verify", response_model=UserResponse, summary="Verify token")
def verify_token(current_user: dict = Depends(auth.get_current_user)):
    """Verify that the provided JWT token is valid.
    
    This endpoint can be used to check if a user is authenticated
    and to get their information.
    
    Args:
        current_user: The authenticated user (injected by dependency)
        
    Returns:
        The authenticated user's information
    """
    return UserResponse(
        user_id=current_user["user_id"],
        username=current_user["username"],
        email=current_user.get("email"),
        is_admin=current_user["is_admin"]
    )


# ========== User List Management Endpoints ==========

@app.post("/api/user/lists", summary="Create a new list")
def create_list(payload: CreateListRequest, current_user: dict = Depends(auth.get_current_user)):
    """Create a new product list for the authenticated user.
    
    Args:
        payload: JSON body containing list_name
        current_user: The authenticated user
        
    Returns:
        The created list information
    """
    try:
        list_id = database.create_user_list(current_user["user_id"], payload.list_name)
        return {"list_id": list_id, "list_name": payload.list_name}
    except Exception as e:
        if "UNIQUE constraint" in str(e):
            raise HTTPException(status_code=400, detail="List name already exists")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/user/lists", summary="Get user's lists")
def get_lists(current_user: dict = Depends(auth.get_current_user)):
    """Get all lists for the authenticated user.
    
    Args:
        current_user: The authenticated user
        
    Returns:
        List of user's lists
    """
    lists = database.get_user_lists(current_user["user_id"])
    return {"lists": [{"list_id": lid, "list_name": name} for lid, name in lists]}


@app.delete("/api/user/lists/{list_id}", summary="Delete a list")
def delete_list(list_id: int, current_user: dict = Depends(auth.get_current_user)):
    """Delete a list.
    
    Args:
        list_id: The list ID to delete
        current_user: The authenticated user
        
    Returns:
        Success message
    """
    deleted = database.delete_user_list(list_id, current_user["user_id"])
    if not deleted:
        raise HTTPException(status_code=404, detail="List not found")
    return {"message": "List deleted successfully"}


@app.put("/api/user/lists/{list_id}", summary="Rename a list")
def rename_list(list_id: int, payload: CreateListRequest, current_user: dict = Depends(auth.get_current_user)):
    """Rename a list.
    
    Args:
        list_id: The list ID to rename
        payload: JSON body containing new list_name
        current_user: The authenticated user
        
    Returns:
        Success message
    """
    updated = database.rename_user_list(list_id, current_user["user_id"], payload.list_name)
    if not updated:
        raise HTTPException(status_code=404, detail="List not found")
    return {"message": "List renamed successfully"}


# ========== Saved Products Endpoints ==========

@app.post("/api/user/saved-products", summary="Save a product to a list")
def save_product(payload: SaveProductRequest, current_user: dict = Depends(auth.get_current_user)):
    """Save a product to a list.
    
    Args:
        payload: JSON body containing list_id, product_id, and optional notes
        current_user: The authenticated user
        
    Returns:
        The saved product information
    """
    saved_id = database.save_product_to_list(
        current_user["user_id"],
        payload.list_id,
        payload.product_id,
        payload.notes
    )
    return {"saved_product_id": saved_id, "message": "Product saved successfully"}


@app.get("/api/user/lists/{list_id}/products", summary="Get products in a list")
def get_list_products(list_id: int, current_user: dict = Depends(auth.get_current_user)):
    """Get all products in a list.
    
    Args:
        list_id: The list ID
        current_user: The authenticated user
        
    Returns:
        List of saved products with full product details
    """
    saved_products = database.get_saved_products_in_list(list_id, current_user["user_id"])
    
    # Get full product details for each saved product
    result = []
    for saved_id, product_id, notes, saved_at in saved_products:
        # Get product details from products table
        conn = database.sqlite3.connect(database.DB_NAME)
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, image_url, image_path, album_title, tags_json, album_url, colors_json FROM products WHERE id = ?;",
            (product_id,)
        )
        product_row = cursor.fetchone()
        conn.close()
        
        if product_row:
            pid, image_url, image_path, album_title, tags_json, album_url, colors_json = product_row
            tags = json.loads(tags_json)
            colors = json.loads(colors_json) if colors_json else {}
            
            result.append({
                "saved_product_id": saved_id,
                "product": {
                    "id": pid,
                    "image_url": image_url,
                    "image_path": image_path,
                    "album_title": album_title,
                    "translated_title": translator.translate_name(album_title),
                    "tags": tags,
                    "album_url": album_url,
                    "colors": colors
                },
                "notes": notes,
                "saved_at": saved_at
            })
    
    return {"products": result}


@app.put("/api/user/saved-products/{saved_product_id}/notes", summary="Update product notes")
def update_notes(saved_product_id: int, payload: UpdateNotesRequest, current_user: dict = Depends(auth.get_current_user)):
    """Update notes for a saved product.
    
    Args:
        saved_product_id: The saved product ID
        payload: JSON body containing notes
        current_user: The authenticated user
        
    Returns:
        Success message
    """
    updated = database.update_product_notes(saved_product_id, current_user["user_id"], payload.notes)
    if not updated:
        raise HTTPException(status_code=404, detail="Saved product not found")
    return {"message": "Notes updated successfully"}


@app.delete("/api/user/lists/{list_id}/products/{product_id}", summary="Remove product from list")
def remove_product(list_id: int, product_id: int, current_user: dict = Depends(auth.get_current_user)):
    """Remove a product from a list.
    
    Args:
        list_id: The list ID
        product_id: The product ID
        current_user: The authenticated user
        
    Returns:
        Success message
    """
    deleted = database.remove_product_from_list(list_id, product_id, current_user["user_id"])
    if not deleted:
        raise HTTPException(status_code=404, detail="Product not found in list")
    return {"message": "Product removed from list"}


@app.get("/api/user/products/{product_id}/saved-status", summary="Check if product is saved")
def check_saved_status(product_id: int, current_user: Optional[dict] = Depends(auth.get_current_user_optional)):
    """Check which lists contain a product.
    
    Args:
        product_id: The product ID
        current_user: The authenticated user (optional)
        
    Returns:
        List names that contain this product
    """
    if not current_user:
        return {"lists": []}
    
    lists = database.is_product_saved(current_user["user_id"], product_id)
    return {"lists": lists}


# ========== Scraper Endpoints (Admin Protected) ==========

@app.post("/api/scrape", summary="Scrape albums and extract tags")
def scrape_endpoint(payload: ScrapeRequest, current_user: dict = Depends(auth.get_current_admin)):
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


@app.get("/api/products/similar-by-color/{product_id}", response_model=List[ProductResponse], summary="Find similar products by color")
def find_similar_by_color(product_id: int, limit: int = Query(default=50, ge=1, le=200), same_brand: bool = Query(default=False)):
    """Find products with similar colors to the specified product.
    
    This endpoint uses percentage-based color similarity calculation
    and filters results to only include products of the same clothing type.
    Optionally filters by same brand.
    Results are sorted from most similar to least similar.
    
    Args:
        product_id: The ID of the product to find similar items for
        limit: Maximum number of results to return (default 50, max 200)
        same_brand: If True, only return products from the same brand
        
    Returns:
        A list of similar products sorted by color similarity
    """
    debug_print(f"=== FIND SIMILAR BY COLOR REQUEST ===")
    debug_print(f"Product ID: {product_id}")
    debug_print(f"Limit: {limit}")
    debug_print(f"Same Brand: {same_brand}")
    
    rows = database.find_similar_products_by_color(product_id, limit, same_brand)
    
    if not rows:
        debug_print("No similar products found")
        return []
    
    debug_print(f"Found {len(rows)} similar products")
    
    # Convert to ProductResponse objects (excluding similarity score from response)
    return [ProductResponse(
        id=id_,
        image_url=image_url,
        image_path=image_path,
        album_title=album_title,
        translated_title=translator.translate_name(album_title),
        tags=tags_,
        album_url=album_url,
        colors=colors_data
    ) for id_, image_url, image_path, album_title, tags_, album_url, colors_data, similarity_score in rows]


@app.get("/", summary="Service root")
def root():
    """Root endpoint that provides a friendly greeting and hints about using the API."""
    return {
        "message": "Welcome to the Yupoo product scraper API!",
        "endpoints": {
            "POST /api/scrape": "Scrape a Yupoo site and index products.",
            "GET /api/products": "Search for products by tags.",
            "GET /api/products/all": "List all stored products.",
            "GET /api/products/similar-by-color/{product_id}": "Find similar products by color.",
            "DELETE /api/database/clear": "Clear all products from database (for testing).",
        },
    }


@app.delete("/api/database/clear", summary="Clear database (testing only)")
def clear_database_endpoint(current_user: dict = Depends(auth.get_current_admin)):
    """Clear all products from the database.

    WARNING: This endpoint deletes all stored products. Use with caution.
    Intended for testing purposes only. Requires admin authentication.

    Returns:
        A dict with the number of products deleted.
    """
    debug_print(f"=== CLEAR DATABASE REQUEST by {current_user['username']} ===")
    deleted = database.clear_database()
    debug_print(f"Deleted {deleted} products")
    return {
        "status": "success",
        "message": f"Database cleared. {deleted} products deleted.",
        "deleted_count": deleted
    }


@app.delete("/api/products/clean-untagged", summary="Remove products without company or type tags")
def clean_untagged_products(current_user: dict = Depends(auth.get_current_admin)):
    """Remove products that don't have any company tags or type tags.

    This endpoint deletes products that lack both company (brand) tags and
    clothing type tags, helping to clean up the database of improperly
    tagged items. Requires admin authentication.

    Returns:
        A dict with the number of products deleted.
    """
    debug_print(f"=== CLEAN UNTAGGED PRODUCTS REQUEST by {current_user['username']} ===")
    
    try:
        conn = database.sqlite3.connect(database.DB_NAME)
        cursor = conn.cursor()
        
        # Find products that don't have any company_ or type_ tags
        cursor.execute("""
            SELECT id, tags_json FROM products
        """)
        
        products_to_delete = []
        for row in cursor.fetchall():
            product_id = row[0]
            tags_json = row[1]
            tags = json.loads(tags_json) if tags_json else []
            
            # Check if product has at least one company tag or one type tag
            has_company_tag = any(tag.startswith('company_') for tag in tags)
            has_type_tag = any(tag.startswith('type_') for tag in tags)
            
            # If it has neither, mark for deletion
            if not has_company_tag and not has_type_tag:
                products_to_delete.append(product_id)
        
        # Delete the products
        deleted_count = 0
        for product_id in products_to_delete:
            cursor.execute("DELETE FROM products WHERE id = ?", (product_id,))
            deleted_count += 1
        
        conn.commit()
        conn.close()
        
        debug_print(f"Deleted {deleted_count} products without company or type tags")
        
        return {
            "status": "success",
            "message": f"Removed {deleted_count} products without company or type tags",
            "deleted": deleted_count
        }
    
    except Exception as e:
        debug_print(f"Error cleaning untagged products: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# TEMPORARY: Run grey percentage adjustment on startup for testing
# debug_print("--- TEMPORARY: Running grey percentage adjustment on startup ---")
# try:
#     adjustment_result = database.adjust_color_percentages(colors_to_adjust=["grey", "white"])
#     debug_print(f"--- TEMPORARY: Grey adjustment result: {adjustment_result} ---")
# except Exception as e:
#     debug_print(f"--- TEMPORARY: Error during grey adjustment on startup: {e} ---")
# debug_print("--- TEMPORARY: Finished grey percentage adjustment on startup ---")

@app.post("/api/colors/adjust", summary="Adjust special color percentages (e.g., grey, white)")
def adjust_special_color_percentages_endpoint(current_user: dict = Depends(auth.get_current_admin)):
    """
    Adjusts the percentages of specified "special" colors (e.g., 'grey', 'white')
    across all products in the database. Requires admin authentication.
    This process calculates the average percentage for each special color and then
    normalizes each product's color data based on this average, re-normalizing
    the percentages of all other colors proportionally.

    Returns:
        A dictionary containing statistics about the adjustment.
    """
    debug_print(f"=== ADJUST SPECIAL COLOR PERCENTAGES REQUEST by {current_user['username']} ===")
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


@app.post("/api/colors/retag", summary="Retag all products with color detection")
def retag_all_products_endpoint(current_user: dict = Depends(auth.get_current_admin)):
    """
    Rerun the color tagging process for all products in the database.
    Downloads the image for each product, extracts dominant colors and color tags,
    and updates the database with the new tags and color data.
    Requires admin authentication.

    Returns:
        A dictionary containing statistics about the retagging process.
    """
    debug_print(f"=== RETAG ALL PRODUCTS REQUEST by {current_user['username']} ===")
    try:
        # Get all products
        products = database.get_all_product_images()
        debug_print(f"Starting retagging for {len(products)} products")
        
        processed = 0
        failed = 0
        updated = 0
        
        for product_id, image_url, album_title, existing_tags in products:
            try:
                # Generate new color and company tags from vision analysis
                new_tags, colors_data = vision.generate_tags_for_image(image_url, album_title or "")
                
                # Preserve existing type_ tags and other non-color/company tags
                preserved_tags = [tag for tag in existing_tags if tag.startswith('type_')]
                
                # Combine preserved tags with new color/company tags
                final_tags = preserved_tags + new_tags
                
                # Remove duplicates while preserving order
                final_tags = list(dict.fromkeys(final_tags))
                
                # Update the product in the database
                database.update_product_tags_and_colors(product_id, final_tags, colors_data)
                updated += 1
                processed += 1
                
            except Exception as e:
                debug_print(f"Error retagging product {product_id}: {e}")
                failed += 1
                processed += 1
            
            # Log progress every 10 products
            if processed % 10 == 0:
                debug_print(f"Progress: {processed}/{len(products)} products processed")
        
        debug_print(f"Retagging complete: {updated} updated, {failed} failed")
        return {
            "status": "success",
            "message": "Retagging complete",
            "total": len(products),
            "updated": updated,
            "failed": failed
        }
    except Exception as e:
        debug_print(f"ERROR during retagging: {e}")
        raise HTTPException(status_code=500, detail=f"An error occurred during retagging: {str(e)}")
