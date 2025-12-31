"""
Basic computer vision utilities for the Yupoo scraping application.

This module relies solely on OpenCV (`cv2`) and NumPy to analyse
downloaded product cover images. It avoids heavyweight deep learning
frameworks (such as PyTorch or TensorFlow) in order to keep the
resource footprint low and maintain compatibility with environments
where those libraries may not be installed. The goal of this module
is to extract simple but informative tags from images, such as
dominant colours, brightness and aspect ratio. These tags are used to
categorise products and facilitate search in the web interface.

If you wish to perform more sophisticated recognition (e.g. object
classification or fine‑grained attribute extraction), you can extend
this module by integrating a pre‑trained neural network using
`cv2.dnn` or an external library. Placeholders are marked where
custom logic could be added.
"""

import cv2  # type: ignore
import numpy as np  # type: ignore
import requests
import sys
from collections import Counter
from io import BytesIO
from typing import Iterable, List, Tuple

from . import translator

# Try to import advanced models
try:
    from transformers import pipeline  # type: ignore
    HAS_TRANSFORMERS = True
except ImportError:
    HAS_TRANSFORMERS = False


def debug_print(message: str):
    """Print debug message with flush to ensure it appears in concurrent output."""
    try:
        # Write directly to stdout buffer with UTF-8 encoding to bypass Windows console encoding issues
        output = f"[VISION DEBUG] {message}\n"
        sys.stdout.buffer.write(output.encode('utf-8'))
        sys.stdout.buffer.flush()
    except Exception:
        # Fallback: replace problematic characters
        safe_msg = message.encode('utf-8', errors='replace').decode('utf-8', errors='replace')
        print(f"[VISION DEBUG] {safe_msg}", flush=True)


# Initialize models (lazy loading)
_image_classifier = None


def get_image_classifier():
    """Get or initialize image classification pipeline."""
    global _image_classifier
    if not HAS_TRANSFORMERS:
        debug_print("Transformers not available. Install with: pip install transformers torch pillow")
        return None
    
    if _image_classifier is None:
        debug_print("Loading image classification model (first time, this may take a moment)...")
        try:
            _image_classifier = pipeline("image-classification", model="google/vit-base-patch16-224")
            debug_print("Image classifier loaded successfully")
        except Exception as e:
            debug_print(f"Failed to load image classifier: {e}")
            return None
    
    return _image_classifier


def _detect_clothing_items(image: np.ndarray) -> List[Tuple[str, Tuple[int, int, int, int]]]:
    """
    Detect clothing items and their bounding boxes in an image.
    
    Args:
        image: BGR image array
        
    Returns:
        List of (item_name, bounding_box) tuples where bounding_box is (x1, y1, x2, y2)
    """
    model = get_yolo_model()
    if model is None:
        return []
    
    try:
        results = model(image, verbose=False)
        
        clothing_item_map = {
            'tie': 'tie',
            'backpack': 'backpack',
            'handbag': 'handbag',
            'shoe': 'shoes',
            'boots': 'boots',
            'hat': 'hat',
            'cap': 'cap',
            'jacket': 'jacket',
            'coat': 'coat',
            'sweater': 'sweater',
            'hoodie': 'hoodie',
            'pants': 'trousers',
            'jeans': 'jeans',
            'shorts': 'shorts',
            'skirt': 'skirt',
            'dress': 'dress',
            'shirt': 'shirt',
            't-shirt': 'tshirt',
            'tshirt': 'tshirt',
            'undershirt': 'undershirt',
            'sock': 'socks',
            'glove': 'gloves',
            'scarf': 'scarf',
            'belt': 'belt',
            'watch': 'watch',
            'glasses': 'glasses',
            'sunglasses': 'sunglasses',
            'vest': 'vest',
            'polo': 'polo',
            'sweatshirt': 'sweatshirt'
        }
        
        items = []
        if results and len(results) > 0:
            result = results[0]
            if hasattr(result, 'names') and hasattr(result, 'boxes'):
                # Blacklist items that shouldn't be tagged
                blacklist_items = {
                    'suitcase', 'umbrella', 'potted plant', 'toilet', 'cell phone',
                    'clock', 'frisbee', 'horse'
                }
                
                # Print raw YOLO detections
                raw_detections = []
                debug_print(f"[REALL RAW YOLO DETECTIONS] {results}")
                for box in result.boxes:
                    class_id = int(box.cls[0])
                    class_name = result.names[class_id].lower()
                    confidence = float(box.conf[0]) if hasattr(box, 'conf') else 0
                    raw_detections.append(f"{class_name}({confidence:.2f})")
                
                debug_print(f"[RAW YOLO DETECTIONS] {raw_detections}")
                debug_print(f"[CLOTHING_ITEM_MAP] Keys: {list(clothing_item_map.keys())}")
                debug_print(f"[BLACKLIST_ITEMS] {blacklist_items}")
                
                debug_print(f"  [TAGGING] Processing {len(result.boxes)} detected objects")
                
                for idx, box in enumerate(result.boxes):
                    class_id = int(box.cls[0])
                    class_name = result.names[class_id].lower()
                    confidence = float(box.conf[0]) if hasattr(box, 'conf') else 0
                    
                    debug_print(f"    [{idx+1}] Class: {class_name}")
                    
                    # Skip blacklisted non-clothing items
                    if class_name in blacklist_items:
                        debug_print(f"      -> BLACKLISTED (skipping)")
                        continue
                    
                    # Map to standardized clothing name
                    item_name = clothing_item_map.get(class_name, class_name)
                    debug_print(f"      -> Mapped to: {item_name}")
                    
                    # Get bounding box coordinates
                    xyxy = box.xyxy[0]
                    x1, y1, x2, y2 = int(xyxy[0]), int(xyxy[1]), int(xyxy[2]), int(xyxy[3])
                    
                    items.append((item_name, (x1, y1, x2, y2)))
                    debug_print(f"      -> ADDED to items list")
                
                debug_print(f"  [TAGGING RESULT] {len(items)} items will be processed for colors/attributes")
        else:
            debug_print(f"  [TAGGING] No results from YOLO")
        
        return items
    except Exception as e:
        debug_print(f"Error detecting clothing items: {e}")
        return []


def _get_item_colors(image: np.ndarray, bbox: Tuple[int, int, int, int], item_name: str) -> List[str]:
    """
    Extract dominant colors from a clothing item's bounding box.
    
    Args:
        image: BGR image array
        bbox: Bounding box (x1, y1, x2, y2)
        item_name: Name of the clothing item for logging
        
    Returns:
        List of color tags like ["color_blue", "color_white"]
    """
    x1, y1, x2, y2 = bbox
    
    # Ensure bounds are valid
    x1 = max(0, x1)
    y1 = max(0, y1)
    x2 = min(image.shape[1], x2)
    y2 = min(image.shape[0], y2)
    
    # Extract region of interest
    roi = image[y1:y2, x1:x2]
    
    if roi.size == 0:
        return []
    
    color_tags = []
    
    try:
        # Get dominant colors from the item
        dominant_colors = _dominant_colors(roi, k=2)
        
        for color_idx, color in enumerate(dominant_colors[:2]):
            color_name = _bgr_to_color_name(color)
            if color_idx == 0:
                # First (dominant) color gets higher priority
                tag = f"color_{color_name}_{item_name}"
            else:
                tag = f"color_{color_name}_{item_name}"
            
            color_tags.append(tag)
            debug_print(f"    Color {color_idx + 1}: {color_name} -> {tag}")
    
    except Exception as e:
        debug_print(f"  Error extracting colors for {item_name}: {e}")
    
    return color_tags


def _get_clothing_attributes(image: np.ndarray, items: List[Tuple[str, Tuple[int, int, int, int]]]) -> List[str]:
    """
    Generate clothing attribute tags using Vision Transformer.
    
    Args:
        image: BGR image array
        items: List of detected clothing items
        
    Returns:
        List of attribute tags like ["fit_slim", "material_cotton", "style_casual"]
    """
    attribute_tags = []
    
    classifier = get_image_classifier()
    if classifier is None:
        debug_print("  Image classifier unavailable, skipping attribute detection")
        return attribute_tags
    
    try:
        # Convert BGR to RGB
        rgb_image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        
        # Resize for more consistent results
        rgb_image_resized = cv2.resize(rgb_image, (224, 224))
        
        # Get predictions
        predictions = classifier(rgb_image_resized, top_k=10)
        
        if predictions:
            debug_print(f"  Top clothing attributes:")
            
            # Map common ImageNet classes to clothing attributes
            attribute_keywords = {
                'casual': ['casual', 'relaxed', 'informal'],
                'formal': ['formal', 'dress', 'business', 'tuxedo', 'suit'],
                'sporty': ['sporty', 'athletic', 'gym', 'sport', 'activewear'],
                'vintage': ['vintage', 'retro', 'old', 'aged'],
                'modern': ['modern', 'contemporary', 'sleek', 'minimalist'],
                'elegant': ['elegant', 'sophisticated', 'luxury', 'classy'],
                'trendy': ['trendy', 'fashionable', 'stylish', 'chic'],
                'oversized': ['oversized', 'loose', 'baggy'],
                'slim': ['slim', 'fitted', 'tight'],
                'layered': ['layered', 'stacked']
            }
            
            for pred in predictions[:5]:
                label = pred['label'].lower()
                score = pred['score']
                
                if score > 0.1:
                    for attr_name, keywords in attribute_keywords.items():
                        if any(keyword in label for keyword in keywords):
                            tag = f"style_{attr_name}"
                            if tag not in attribute_tags:
                                attribute_tags.append(tag)
                                debug_print(f"    Added: {tag} (confidence: {score:.2f})")
                            break
    
    except Exception as e:
        debug_print(f"  Error in attribute detection: {e}")
    
    return attribute_tags


def detect_clothing_in_image(image_url: str) -> Tuple[bool, str]:
    """
    Accept all images for tagging (no rejection).
    Returns True for all images to allow downstream filtering/tagging.
    
    Args:
        image_url: URL of the image to analyse
        
    Returns:
        Tuple of (True, description) - always accepts
    """
    debug_print(f"\n[IMAGE ACCEPTANCE] Accepting image for tagging")
    return True, "image_accepted"


def _fetch_image_array(url: str) -> np.ndarray:
    """Download an image from `url` and return it as a BGR NumPy array.

    Args:
        url: The URL of the image to download.

    Returns:
        The decoded image in BGR colour space.

    Raises:
        RuntimeError: If the image cannot be downloaded or decoded.
    """
    debug_print(f"Fetching image from URL: {url}")
    
    # Add proper headers to avoid being blocked by the server
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/1295.145.223.226 Safari/537.36',
        'Referer': 'https://www.yupoo.com/',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
    }
    
    try:
        resp = requests.get(url, timeout=10, headers=headers)
        resp.raise_for_status()
        debug_print(f"Image downloaded, size: {len(resp.content)} bytes")
    except Exception as e:
        debug_print(f"ERROR fetching image: {e}")
        raise
    
    img_data = np.frombuffer(resp.content, np.uint8)
    image = cv2.imdecode(img_data, cv2.IMREAD_COLOR)
    if image is None:
        debug_print(f"ERROR: Failed to decode image from {url}")
        raise RuntimeError(f"Failed to decode image from {url}")
    
    debug_print(f"Image decoded successfully, shape: {image.shape}")
    return image


def _dominant_colors(image: np.ndarray, k: int = 3) -> List[Tuple[int, int, int]]:
    """Compute the dominant colours in an image using k‑means clustering.

    Args:
        image: BGR image.
        k: Number of clusters to find.

    Returns:
        A list of cluster centres (BGR tuples) sorted by frequency (most
        common first).
    """
    # Apply preprocessing to reduce compression artifacts
    # Use bilateral filter to smooth while preserving edges
    img = cv2.bilateralFilter(image, 9, 75, 75)
    
    # Apply mild Gaussian blur to further reduce JPEG compression noise
    img = cv2.GaussianBlur(img, (3, 3), 0)
    
    # Resize to speed up clustering
    img = cv2.resize(img, (64, 64), interpolation=cv2.INTER_LINEAR)
    # Reshape to a list of pixels
    data = img.reshape((-1, 3)).astype(np.float32)
    # Define criteria and apply kmeans
    criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 20, 1.0)
    _, labels, centers = cv2.kmeans(data, k, None, criteria, 3, cv2.KMEANS_PP_CENTERS)
    # Convert centres back to integer BGR and count the labels
    centers = centers.astype(int)
    counts = Counter(labels.flatten())
    # Sort cluster centres by frequency descending
    ordered = sorted(zip(counts.values(), centers), key=lambda x: x[0], reverse=True)
    dominant = [tuple(map(int, center)) for _, center in ordered]
    return dominant


def _get_color_percentages(image: np.ndarray, k: int = 8) -> List[Tuple[str, float]]:
    """Calculate the percentage of each dominant color in an image.

    Args:
        image: BGR image.
        k: Number of dominant colors to extract.

    Returns:
        A list of tuples (color_name, percentage) sorted by percentage descending.
    """
    # Apply preprocessing to reduce compression artifacts
    # Use bilateral filter to smooth while preserving edges
    img = cv2.bilateralFilter(image, 9, 75, 75)
    
    # Apply mild Gaussian blur to further reduce JPEG compression noise
    img = cv2.GaussianBlur(img, (3, 3), 0)
    
    # Resize to speed up clustering
    img = cv2.resize(img, (64, 64), interpolation=cv2.INTER_LINEAR)
    # Reshape to a list of pixels
    data = img.reshape((-1, 3)).astype(np.float32)
    # Define criteria and apply kmeans
    criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 20, 1.0)
    _, labels, centers = cv2.kmeans(data, k, None, criteria, 3, cv2.KMEANS_PP_CENTERS)
    # Convert centres back to integer BGR and count the labels
    centers = centers.astype(int)
    counts = Counter(labels.flatten())
    total_pixels = labels.size
    
    # Calculate percentages and map to color names
    color_data = []
    for center_idx, (count, center) in enumerate(sorted(zip(counts.values(), centers), key=lambda x: x[0], reverse=True)):
        percentage = (count / total_pixels) * 100
        color_name = _bgr_to_color_name(tuple(map(int, center)))
        color_data.append((color_name, percentage))
    
    return color_data


def _bgr_to_color_name(bgr: Tuple[int, int, int]) -> str:
    """Map a BGR colour to a human friendly colour name with lenient tolerance.

    Uses range-based detection with generous tolerances to catch color variations.
    Order matters - more specific colors are checked first.

    Args:
        bgr: A 3‑tuple of (blue, green, red) values.

    Returns:
        The name of the closest colour.
    """
    b, g, r = bgr
    
    # Define color ranges (BGR format). Order matters!
    # Check more specific colors first, then general ones.
    color_checks = [
        # === NEUTRALS (most general, check first) ===
        ("white", lambda b, g, r: r > 235 and g > 235 and b > 235),
        ("lightgrey", lambda b, g, r: r > 200 and g > 200 and b > 200 and r < 235 and abs(r - g) < 30 and abs(g - b) < 30),
        ("grey", lambda b, g, r: r > 110 and g > 110 and b > 110 and r < 200 and abs(r - g) < 50 and abs(g - b) < 50),
        ("darkgrey", lambda b, g, r: r > 50 and g > 50 and b > 50 and r < 110 and abs(r - g) < 50 and abs(g - b) < 50),
        ("black", lambda b, g, r: r < 50 and g < 50 and b < 50),
        
        # === BLACKS (dark colors) ===
        ("maroon", lambda b, g, r: r > 80 and r < 160 and g < 90 and b < 90),
        ("navy", lambda b, g, r: b > 100 and b < 160 and g < 80 and r < 80),
        
        # === PURE COLORS (bright, saturated) ===
        ("red", lambda b, g, r: r > 220 and g < 100 and b < 100),
        ("green", lambda b, g, r: g > 200 and r < 140 and b < 140),
        ("blue", lambda b, g, r: b > 200 and r < 140 and g < 140),
        ("yellow", lambda b, g, r: g > 220 and r > 220 and b < 100),
        ("cyan", lambda b, g, r: b > 220 and g > 220 and r < 100),
        ("magenta", lambda b, g, r: b > 220 and r > 220 and g < 100),
        
        # === DARK SATURATED COLORS ===
        ("darkred", lambda b, g, r: r > 120 and r < 200 and g < 80 and b < 80),
        ("darkgreen", lambda b, g, r: g > 100 and g < 180 and r < 100 and b < 100),
        ("darkblue", lambda b, g, r: b > 120 and b < 200 and r < 100 and g < 100),
        
        # === ORANGES (R and G high, B low) ===
        ("orange", lambda b, g, r: r > 200 and g > 140 and b < 100 and r > g),
        ("darkorange", lambda b, g, r: r > 160 and r < 200 and g > 100 and g < 160 and b < 100),
        ("orangered", lambda b, g, r: r > 180 and g > 80 and g < 140 and b < 100),
        
        # === YELLOWY TONES ===
        ("gold", lambda b, g, r: g > 180 and r > 180 and b < 100 and abs(r - g) < 80),
        ("khaki", lambda b, g, r: r > 190 and g > 200 and b > 140 and b < 180),
        ("tan", lambda b, g, r: r > 150 and g > 130 and b > 100 and r > g and g > b),
        
        # === BROWNISH ===
        ("brown", lambda b, g, r: r > 80 and r < 180 and g > 50 and g < 130 and b > 40 and b < 120),
        ("chocolate", lambda b, g, r: r > 140 and r < 200 and g > 70 and g < 140 and b > 30 and b < 100),
        ("saddlebrown", lambda b, g, r: r > 70 and r < 140 and g > 40 and g < 100 and b > 30 and b < 90),
        ("peru", lambda b, g, r: r > 160 and g > 120 and g < 180 and b > 60 and b < 130),
        ("beige", lambda b, g, r: r > 200 and g > 200 and b > 180 and r < 240),
        ("ivory", lambda b, g, r: r > 240 and g > 240 and b > 230),
        
        # === GREENS (various) ===
        ("lime", lambda b, g, r: g > 200 and r < 120 and b < 120),
        ("forestgreen", lambda b, g, r: g > 100 and g < 170 and r > 40 and r < 130 and b > 40 and b < 130),
        ("teal", lambda b, g, r: b > 120 and g > 120 and r < 100),
        ("olive", lambda b, g, r: g > 100 and r > 80 and r < 150 and b < 100),
        
        # === BLUES (various shades) ===
        ("navy", lambda b, g, r: b > 100 and b < 160 and g < 80 and r < 80),
        ("royalblue", lambda b, g, r: b > 180 and g > 80 and g < 150 and r > 50 and r < 130),
        ("cornflowerblue", lambda b, g, r: b > 190 and g > 110 and g < 170 and r > 80 and r < 160),
        ("skyblue", lambda b, g, r: b > 210 and g > 190 and r > 160 and r < 220),
        ("lightblue", lambda b, g, r: b > 210 and g > 190 and r > 140 and r < 200),
        ("turquoise", lambda b, g, r: b > 160 and g > 160 and r < 140),
        
        # === PURPLES AND VIOLETS (high B and R, low G) ===
        ("darkviolet", lambda b, g, r: b > 160 and r > 160 and g < 100),
        ("purple", lambda b, g, r: b > 140 and r > 140 and abs(b - r) < 70 and g < 130),
        ("indigo", lambda b, g, r: b > 130 and g < 110 and r > 70 and r < 140),
        ("violet", lambda b, g, r: b > 190 and r > 190 and g > 100 and g < 190),
        
        # === PINKS (high R and B, moderate G) ===
        ("hotpink", lambda b, g, r: b > 160 and r > 230 and g > 100 and g < 170),
        ("pink", lambda b, g, r: b > 160 and r > 220 and g > 130 and g < 210),
        ("lightpink", lambda b, g, r: b > 220 and r > 240 and g > 190),
        ("salmon", lambda b, g, r: b > 160 and r > 220 and g > 150 and g < 200),
        ("lightsalmon", lambda b, g, r: b > 210 and r > 240 and g > 190),
        
        # === REDS (special shades) ===
        ("crimson", lambda b, g, r: r > 180 and g < 110 and b < 100 and r - g > 60),
        ("silver", lambda b, g, r: r > 190 and g > 190 and b > 190 and r < 240),
    ]
    
    # Check each color range in order
    for color_name, check_func in color_checks:
        if check_func(b, g, r):
            return color_name
    
    # Fallback: use palette-based distance method
    palette = {
        "red": (0, 0, 255),
        "green": (0, 255, 0),
        "blue": (255, 0, 0),
        "yellow": (0, 255, 255),
        "cyan": (255, 255, 0),
        "magenta": (255, 0, 255),
        "white": (255, 255, 255),
        "black": (0, 0, 0),
        "grey": (128, 128, 128),
    }
    
    min_dist = float("inf")
    best_name = "unknown"
    for name, (pb, pg, pr) in palette.items():
        dist = (b - pb) ** 2 + (g - pg) ** 2 + (r - pr) ** 2
        if dist < min_dist:
            min_dist = dist
            best_name = name
    return best_name


def _brightness_tag(image: np.ndarray) -> str:
    """Compute a brightness tag for an image.

    The function converts the image to grayscale and computes the
    average pixel intensity. Depending on the value, it returns one
    of three tags: `"bright"`, `"normal"`, or `"dark"`.

    Args:
        image: BGR image.

    Returns:
        A brightness tag string.
    """
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    avg_intensity = np.mean(gray)
    if avg_intensity > 180:
        return "bright"
    if avg_intensity < 70:
        return "dark"
    return "normal"


def _aspect_ratio_tag(image: np.ndarray) -> str:
    """Categorise an image based on its aspect ratio.

    Args:
        image: BGR image.

    Returns:
        One of `"wide"`, `"tall"`, or `"square"`.
    """
    h, w = image.shape[:2]
    ratio = w / h if h != 0 else 0
    if ratio > 1.2:
        return "wide"
    if ratio < 0.8:
        return "tall"
    return "square"




def _get_item_colors(image: np.ndarray, bbox: Tuple[int, int, int, int], item_name: str) -> List[str]:
    """Extract dominant colors from a clothing item's bounding box."""
    x1, y1, x2, y2 = bbox
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(image.shape[1], x2), min(image.shape[0], y2)
    roi = image[y1:y2, x1:x2]
    
    if roi.size == 0:
        return []
    
    color_tags = []
    try:
        dominant_colors = _dominant_colors(roi, k=2)
        for color_idx, color in enumerate(dominant_colors[:2]):
            color_name = _bgr_to_color_name(color)
            tag = f"color_{color_name}_{item_name}"
            color_tags.append(tag)
            debug_print(f"    {color_name} -> {tag}")
    except Exception as e:
        debug_print(f"  Color extraction error: {e}")
    
    return color_tags


def _get_clothing_attributes(image: np.ndarray, items: List[Tuple[str, Tuple[int, int, int, int]]]) -> List[str]:
    """Generate clothing attribute tags using Vision Transformer."""
    attribute_tags = []
    classifier = get_image_classifier()
    if classifier is None:
        return attribute_tags
    
    try:
        rgb_image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        rgb_image_resized = cv2.resize(rgb_image, (224, 224))
        predictions = classifier(rgb_image_resized, top_k=10)
        
        if predictions:
            attribute_keywords = {
                'casual': ['casual', 'relaxed', 'informal'],
                'formal': ['formal', 'dress', 'business', 'tuxedo', 'suit'],
                'sporty': ['sporty', 'athletic', 'gym', 'sport', 'activewear'],
                'vintage': ['vintage', 'retro', 'old', 'aged'],
                'modern': ['modern', 'contemporary', 'sleek', 'minimalist'],
                'elegant': ['elegant', 'sophisticated', 'luxury', 'classy'],
                'trendy': ['trendy', 'fashionable', 'stylish', 'chic'],
                'oversized': ['oversized', 'loose', 'baggy'],
                'slim': ['slim', 'fitted', 'tight'],
            }
            
            for pred in predictions[:5]:
                label = pred['label'].lower()
                score = pred['score']
                if score > 0.1:
                    for attr_name, keywords in attribute_keywords.items():
                        if any(keyword in label for keyword in keywords):
                            tag = f"style_{attr_name}"
                            if tag not in attribute_tags:
                                attribute_tags.append(tag)
                                debug_print(f"    {tag} ({score:.2f})") 
                            break
    except Exception as e:
        debug_print(f"  Attribute error: {e}")
    
    return attribute_tags


def generate_tags_for_image(url: str, album_title: str = "") -> Tuple[List[str], dict]:
    """Generate color tags from the image and company tags from album title.
    
    Returns:
        A tuple of (tags_list, color_data_dict) where color_data_dict contains
        color percentages for sorting.
    """
    debug_print(f"\n{'='*70}")
    debug_print(f"[TAG GENERATION START]")
    try:
        image = _fetch_image_array(url)
        tags: List[str] = []
        color_data: dict = {}  # Store color percentages for database
        
        # === DOMINANT IMAGE COLORS WITH PERCENTAGES ===
        debug_print(f"\n[ANALYZING] Extracting dominant colors from image")
        color_percentages = _get_color_percentages(image, k=8)
        
        for idx, (color_name, percentage) in enumerate(color_percentages):
            tag = f"color_{color_name}"
            if tag not in tags:
                tags.append(tag)
                color_data[color_name] = round(percentage, 2)
                debug_print(f"  [{idx+1}] {tag} ({percentage:.1f}%)")
        
        debug_print(f"[RESULT] Found {len(tags)} unique colors")
        
        # === EXTRACT COMPANY NAMES FROM ALBUM TITLE ===
        if album_title:
            debug_print(f"\n[ANALYZING] Extracting brand names from title: {album_title}")
            brands = translator.extract_brands_from_text(album_title)
            if brands:
                for brand in brands:
                    tag = f"company_{brand.lower().replace(' ', '_')}"
                    if tag not in tags:
                        tags.append(tag)
                        debug_print(f"  [BRAND] {tag}")
                debug_print(f"[RESULT] Found {len(brands)} brands")
            else:
                debug_print(f"[RESULT] No brands detected in title")
        
        final_tags = list(dict.fromkeys(tags))
        debug_print(f"\n[TAG GENERATION COMPLETE]")
        debug_print(f"  Total tags: {len(final_tags)}")
        debug_print(f"  Tags: {final_tags}")
        debug_print(f"  Color percentages: {color_data}")
        debug_print(f"{'='*70}\n")
        return final_tags, color_data
    except Exception as e:
        debug_print(f"[ERROR] {e}")
        raise