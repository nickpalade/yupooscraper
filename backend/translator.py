"""
Translation module for normalizing brand/company names using translate.json.
Handles obfuscated names and provides lookup functionality.
"""

import json
import os
from typing import Dict, List, Optional
from difflib import SequenceMatcher
import sys


def debug_print(message: str):
    """Print debug message with flush to ensure it appears in concurrent output."""
    try:
        output = f"[TRANSLATOR DEBUG] {message}\n"
        sys.stdout.buffer.write(output.encode('utf-8'))
        sys.stdout.buffer.flush()
    except Exception:
        safe_msg = message.encode('utf-8', errors='replace').decode('utf-8', errors='replace')
        print(f"[TRANSLATOR DEBUG] {safe_msg}", flush=True)


# Load translation database
_TRANSLATE_DB: Dict[str, Optional[str]] = {}


def _load_translations() -> Dict[str, Optional[str]]:
    """Load translations from translate.json file."""
    global _TRANSLATE_DB
    if _TRANSLATE_DB:
        return _TRANSLATE_DB
    
    try:
        json_path = os.path.join(os.path.dirname(__file__), "translate.json")
        with open(json_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            # Extract the brands dictionary if it exists, otherwise assume the file is just the dict
            if isinstance(data, dict) and 'brands' in data:
                _TRANSLATE_DB = data['brands']
            else:
                _TRANSLATE_DB = data
        debug_print(f"Loaded {len(_TRANSLATE_DB)} brand translations")
        return _TRANSLATE_DB
    except Exception as e:
        debug_print(f"Error loading translations: {e}")
        return {}


def translate_name(text: str) -> str:
    """
    Translate a brand name using the translation database.
    If exact match found, return translated name.
    Otherwise, return the input text.
    
    Args:
        text: The brand name to translate
        
    Returns:
        Translated name or original text if not found
    """
    db = _load_translations()
    if not text or not db:
        return text
    
    # Try exact match first
    if text in db:
        translated = db[text]
        return translated if translated else text
    
    # Try case-insensitive match
    text_lower = text.lower()
    for key, value in db.items():
        if key.lower() == text_lower:
            return value if value else text
    
    # Return original if no match
    return text


def extract_brands_from_text(text: str) -> List[str]:
    """
    Extract potential brand names from text using fuzzy matching against translate.json.
    
    Args:
        text: The text to extract brands from (e.g., album title)
        
    Returns:
        List of detected brand names (translated)
    """
    if not text:
        return []
    
    db = _load_translations()
    if not db:
        return []
    
    import re
    
    detected_brands = set()
    text_upper = text.upper()
    
    # Sort by length (longest first) to match longer brands before shorter ones
    sorted_brands = sorted(db.keys(), key=len, reverse=True)
    
    # Keep track of matched positions to avoid overlapping matches
    matched_positions = set()
    
    # Check for each known brand in the text
    for obfuscated_name in sorted_brands:
        obfuscated_upper = obfuscated_name.upper()
        translated = db[obfuscated_name]
        
        if not translated:  # Skip if no translation
            continue
        
        # Use word boundaries for matching to avoid matching 'LEE' in 'SLEEVED' or 'ON' in 'LONG'
        # But allow star emojis to be part of the pattern
        pattern = r'\b' + re.escape(obfuscated_upper) + r'\b'
        
        for match in re.finditer(pattern, text_upper):
            start, end = match.span()
            # Check if this position overlaps with already matched positions
            overlaps = any(s < end and e > start for s, e in matched_positions)
            if not overlaps:
                detected_brands.add(translated)
                matched_positions.add((start, end))
                debug_print(f"  Found brand '{obfuscated_name}' -> '{translated}'")
                break  # Only match each brand pattern once
    
    return sorted(list(detected_brands))
