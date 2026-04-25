"""
Shared utility functions for the event management system.
"""

import html
import re


def sanitize_html(value: str) -> str:
    """
    Strip HTML tags from a string and unescape any HTML entities.

    Uses Python's built-in `html` module — no third-party dependency required.
    The regex removes all HTML/XML tags; html.unescape then converts entities
    like &amp; back to their plain-text equivalents.
    """
    if not isinstance(value, str):
        return value
    # Remove all HTML tags
    stripped = re.sub(r"<[^>]+>", "", value)
    # Unescape HTML entities (e.g. &lt; → <, &amp; → &)
    return html.unescape(stripped)
