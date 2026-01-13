# Yupoo Product Scraper

This project consists of a full‑stack web application that scrapes cover 
images from Yupoo sites, generates descriptive tags using computer vision 
techniques, stores the results in a database and exposes an API for searching 
the indexed products by tag. The frontend is built with React, TypeScript and 
Tailwind CSS, while the backend uses FastAPI with JWT authentication.

## Technology Stack

### Backend
- **Framework**: FastAPI (Python web framework)
- **Server**: Uvicorn (ASGI server)
- **Database**: SQLite3 (built-in Python module, no external DB required)
- **Authentication**: JWT (JSON Web Tokens) with python-jose and bcrypt password hashing
- **Computer Vision**: OpenCV and NumPy for image analysis and k-means clustering
- **Image Processing**: Pillow (PIL) for image manipulation
- **Web Scraping**: BeautifulSoup4 and Requests for HTML parsing
- **Data Validation**: Pydantic for request/response models
- **Concurrent Processing**: ThreadPoolExecutor for parallel scraping

### Frontend
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite (fast development server and bundler)
- **Styling**: Tailwind CSS (utility-first CSS framework)
- **Routing**: React Router v7 for client-side navigation
- **HTTP Client**: Axios for API communication
- **Icons**: Lucide React icon library
- **State Management**: React Context API for settings

### Database Schema
The SQLite database stores:
- **Products**: Cover images, URLs, tags (JSON), color data (JSON), timestamps
- **Users**: Username, hashed passwords, admin status
- **Lists**: User-created product collections
- **List Items**: Many-to-many relationship between lists and products

## Components

```
yupoo_app/
├── backend/      # FastAPI application and helper modules
│   ├── database.py
│   ├── scraper.py
│   ├── vision.py
│   ├── main.py    # FastAPI entry point
│   └── ...
├── frontend/     # React application (Vite + Tailwind CSS)
│   ├── src/
│   │   ├── App.tsx
│   │   ├── index.css
│   │   └── main.tsx
│   ├── index.html
│   └── ...
└── README.md
```

## Running the backend

1. Ensure you have Python 3.8 or newer installed.
2. Install the dependencies listed in `yupoo_app/requirements.txt`:

   ```bash
   pip install -r requirements.txt
   ```

   The backend relies on the following packages:
   - `fastapi` - Web framework
   - `uvicorn` - ASGI server
   - `requests` - HTTP library for web scraping
   - `beautifulsoup4` - HTML parsing
   - `pydantic` - Data validation
   - `numpy` - Numerical computing for computer vision
   - `opencv-python` - Computer vision and image processing
   - `pillow` - Image manipulation
   - `python-jose[cryptography]` - JWT token handling
   - `bcrypt` - Password hashing
   - `python-multipart` - Form data parsing

3. Start the FastAPI server:

   ```bash
   uvicorn yupoo_app.backend.main:app --reload
   ```

   The API will be available at `http://localhost:8000`. You can visit
   `http://localhost:8000/docs` to explore the automatically generated
   Swagger UI.

### Endpoints

- `POST /api/scrape` – Scrape a Yupoo site. Example request body:

  ```json with percentages and brand names extracted 
  from album titles) and stores them in an SQLite database (`yupoo.db`). 
  It returns the number of albums processed and the number of products 
  successfully inserted. Requires authentication
    "max_albums": 50
  }
  ```

  This endpoint visits the provided site, extracts up to `max_albums`
  album links and their cover images, generates tags for each cover
  image (dominant colours, brightness and aspect ratio) and stores
  them in an SQLite database (`yupoo.db`). It returns the number of
  albums processed and the number of products successfully inserted.

- `GET /api/products?tags=tag1,tag2` – Search for products whose tags
  include all provided comma‑separated tags. Tags are case sensitive
  and follow thecolor_blue`, `company_nike`). Supports pagination and 
  color-based sorting. Returns product objects with identifier, cover 
  image URL, tags, colors, and album link.

- `GET /api/products/all` – Return all stored products with pagination support.

- `POST /api/auth/register` - Register a new user account (first user is admin).

- `POST /api/auth/login` - Login and receive JWT token.

- `GET /api/products/{id}/similar` - Find visually similar products using color analysis.

- `POST /api/lists` - Create a new product list (requires authentication).

- `GET /api/lists` - Get user's product lists (requires authentication).

- `POST /api/lists/{list_id}/items/{product_id}` - Add product to list (requires authentication).

- `GET /api/translate/{text}` - Translate Chinese brand names to Englishll` – Return all stored products (useful for
  development/testing).

## Running the frontend

The frontend is a Vite‑powered React application that communicates
with the FastAPI backend. It provides a simple interface to search
products by tags and display the corresponding covers and links.

1. Ensure you have Node.js (v16 or newer) and npm installed.
2. Navigate to the `frontend` directory and install dependencies:

   ```bash
   cd frontend
   npm install
   ```

3. Start the development server:

   ```bash
   npm run dev
   ```

   This will start Vite on `http://localhost:5173`. The app assumes
   that the API is reachable at `http://localhost:8000`. If your API
   runs on a different host/port you can specify a custom base URL via
   an environment variable when launching Vite:

   ```bash
   VITE_API_BASE_URL="http://your-api-host:port" npm run dev
   ```

4. Open the app in your browser, enter one or more tags separated by
   commas (e.g. `color_blue,brightness_bright`) and click
   **Search**. Matching products will be displayed with their cover
   image, tags and a link back to the original Yupoo album.

## URL Routing and Link Sharing

The application now supports URL-based state management, allowing users to share links that preserve the application state. The following features are supported:

### Shareable States

- **Page Number**: `?page=2` - Opens the app to a specific page of results
- **Tab Navigation**: `?tab=lists` or `?tab=scraper` - Opens directly to My Lists or Scraper tab (home is default)
- **Selected Tags**: `?tags=color_red,type_shoes` - Pre-selects tags for searching
- **Preview Mode**: `?preview=123` - Opens the fullscreen preview for product ID 123
- **Login Modal**: `?login=true` - Opens the login modal automatically
- **Signup Modal**: `?signup=true` - Opens the signup modal automatically
- **Settings Modal**: `?settings=true` - Opens the settings modal

### Example URLs

```
# Search for red shoes on page 3
http://localhost:5173/?tags=color_red,type_shoes&page=3

# Open specific product preview
http://localhost:5173/?preview=456

# Direct link to My Lists page
http://localhost:5173/?tab=lists

# Open login modal
http://localhost:5173/?login=true
```

### Combining Parameters

All URL parameters can be combined for complex state sharing:

```
# Red shoes on page 2 with preview open
http://localhost:5173/?tags=color_red,type_shoes&page=2&preview=789
```

The URL automatically updates as you navigate the application, making it easy to share specific views with others. Simply copy the URL from your browser's address bar and send it to share your current view.

## Extending the vision module

The current implementation of `vision.py` extracts properties from each image:
dominant colours (with percentages) using OpenCV's k-means clustering, and brand
names extracted from album titles. The vision module uses only OpenCV and NumPy
for lightweight computer vision processing.

To further enhance the product catalogue, consider:

* **Object detection** – Integrate a pre-trained model (e.g., YOLO, Faster R-CNN) to
  detect and classify clothing items, accessories, or other objects in images.
* **Deep learning classification** – Add a neural network classifier (using PyTorch or
  TensorFlow) to categorize products or extract attributes like style, material, or fit.
* **Text extraction** – If product images contain labels or brand names, apply an OCR
  engine like Tesseract to extract text and add it as additional tags.
* **Advanced color analysis** – Implement pattern detection, texture analysis, or
  color harmony calculations for more sophisticated tagging.

Modify the `generate_tags_for_image` function in `vision.py` with your custom logic
and return any number of descriptive tags as strings.