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
from collections import Counter
from io import BytesIO
from typing import Iterable, List, Tuple


def _fetch_image_array(url: str) -> np.ndarray:
    """Download an image from `url` and return it as a BGR NumPy array.

    Args:
        url: The URL of the image to download.

    Returns:
        The decoded image in BGR colour space.

    Raises:
        RuntimeError: If the image cannot be downloaded or decoded.
    """
    resp = requests.get(url, timeout=10)
    resp.raise_for_status()
    img_data = np.frombuffer(resp.content, np.uint8)
    image = cv2.imdecode(img_data, cv2.IMREAD_COLOR)
    if image is None:
        raise RuntimeError(f"Failed to decode image from {url}")
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
    # Resize to speed up clustering
    img = cv2.resize(image, (64, 64), interpolation=cv2.INTER_LINEAR)
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


def _bgr_to_color_name(bgr: Tuple[int, int, int]) -> str:
    """Map a BGR colour to a human friendly colour name.

    This function computes the Euclidean distance between the input
    colour and a set of predefined colours. The name of the closest
    predefined colour is returned. The predefined palette is a
    coarse approximation; feel free to extend or refine it.

    Args:
        bgr: A 3‑tuple of (blue, green, red) values.

    Returns:
        The name of the closest colour.
    """
    # Define a simple palette (BGR values)
    palette = {
        "black": (0, 0, 0),
        "white": (255, 255, 255),
        "red": (0, 0, 255),
        "green": (0, 255, 0),
        "blue": (255, 0, 0),
        "yellow": (0, 255, 255),
        "cyan": (255, 255, 0),
        "magenta": (255, 0, 255),
        "grey": (128, 128, 128),
        "orange": (0, 165, 255),
        "brown": (42, 42, 165),
        "purple": (128, 0, 128),
        "pink": (180, 105, 255),
        "navy": (128, 0, 0),
    }
    b, g, r = bgr
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


def generate_tags_for_image(url: str) -> List[str]:
    """Generate a list of descriptive tags for an image at `url`.

    This function downloads the image, computes its dominant colours,
    brightness and aspect ratio, and returns tags that summarise these
    properties. The dominant colours are mapped to human readable
    names and prefixed with `"color_"`.

    Args:
        url: URL of the image to analyse.

    Returns:
        A list of tags.
    """
    image = _fetch_image_array(url)
    tags: List[str] = []
    # Dominant colours
    for colour in _dominant_colors(image, k=3):
        name = _bgr_to_color_name(colour)
        tags.append(f"color_{name}")
    # Brightness
    tags.append(f"brightness_{_brightness_tag(image)}")
    # Aspect ratio
    tags.append(f"aspect_{_aspect_ratio_tag(image)}")
    # TODO: Insert advanced vision logic here (e.g., object detection)
    return list(dict.fromkeys(tags))  # deduplicate while preserving order