"""
HTML Parsing and Metadata/Link Extraction Module.
Extracts clean readable text, structural headings, metadata, and outgoing links for PageRank.
"""

import re
from urllib.parse import urljoin, urlparse, urldefrag
from typing import Dict, List, Any, Optional
from bs4 import BeautifulSoup


def is_valid_url(url: str) -> bool:
    """Check if URL is a valid HTTP/HTTPS web link."""
    try:
        parsed = urlparse(url)
        return parsed.scheme in ("http", "https") and bool(parsed.netloc)
    except Exception:
        return False


def canonicalize_url(base_url: str, raw_href: str) -> Optional[str]:
    """Resolve relative URLs, remove fragment anchors, and normalize."""
    if not raw_href or raw_href.startswith("javascript:") or raw_href.startswith("mailto:") or raw_href.startswith("tel:"):
        return None
    try:
        joined = urljoin(base_url, raw_href.strip())
        defragged, _ = urldefrag(joined)
        parsed = urlparse(defragged)
        if parsed.scheme not in ("http", "https"):
            return None
        # Normalize hostname to lowercase
        netloc = parsed.netloc.lower()
        if not netloc:
            return None
        path = parsed.path
        if not path:
            path = "/"
        # Reconstruct canonical url
        canonical = f"{parsed.scheme}://{netloc}{path}"
        if parsed.query:
            canonical += f"?{parsed.query}"
        return canonical
    except Exception:
        return None


def extract_html_content(raw_html: str, source_url: str) -> Dict[str, Any]:
    """
    Parse HTML string, strip noisy scripts/styles, extract clean text,
    title, meta description, headings, and all outgoing links with anchor text.
    """
    soup = BeautifulSoup(raw_html, "html.parser")

    # Remove unwanted tags (scripts, styles, noscript, svg, header/footer/nav if cluttered)
    for tag in soup(["script", "style", "noscript", "iframe", "svg"]):
        tag.decompose()

    # Extract Title
    title = ""
    if soup.title and soup.title.string:
        title = soup.title.string.strip()
    if not title:
        og_title = soup.find("meta", property="og:title")
        if og_title and og_title.get("content"):
            title = og_title["content"].strip()
    if not title:
        h1 = soup.find("h1")
        if h1:
            title = h1.get_text(strip=True)

    # Extract Meta Description
    description = ""
    meta_desc = soup.find("meta", attrs={"name": re.compile(r"^description$", re.I)})
    if meta_desc and meta_desc.get("content"):
        description = meta_desc["content"].strip()
    if not description:
        og_desc = soup.find("meta", property="og:description")
        if og_desc and og_desc.get("content"):
            description = og_desc["content"].strip()

    # Extract Headings (h1, h2, h3)
    headings = []
    for h in soup.find_all(["h1", "h2", "h3"]):
        h_text = h.get_text(strip=True)
        if h_text and len(h_text) > 2:
            headings.append(h_text)

    # Extract Hyperlinks for Link Graph (PageRank)
    outgoing_links: List[Dict[str, str]] = []
    seen_links = set()

    for a_tag in soup.find_all("a", href=True):
        href = a_tag["href"]
        canonical_target = canonicalize_url(source_url, href)
        if not canonical_target:
            continue
        # Avoid self-loops
        if canonical_target == source_url:
            continue
        if canonical_target not in seen_links:
            seen_links.add(canonical_target)
            anchor_text = a_tag.get_text(separator=" ", strip=True)
            outgoing_links.append({
                "target_url": canonical_target,
                "anchor_text": anchor_text[:120]  # truncate anchor text if excessively long
            })

    # Extract Clean Main Text
    # Give priority to <article> or <main> if present, otherwise whole body
    main_container = soup.find("article") or soup.find("main") or soup.body or soup
    # Extract visible text with whitespace normalization
    text = main_container.get_text(separator=" ", strip=True)
    # Collapse multiple whitespaces
    text = re.sub(r"\s+", " ", text).strip()

    # If description was missing, use the first 200 characters of clean text as preview
    if not description and len(text) > 0:
        preview = text[:200]
        last_space = preview.rfind(" ")
        if last_space > 100:
            description = preview[:last_space] + "..."
        else:
            description = preview + "..."

    return {
        "url": source_url,
        "title": title or "Untitled Document",
        "description": description,
        "headings": headings,
        "text": text,
        "outgoing_links": outgoing_links,
        "char_count": len(text),
        "link_count": len(outgoing_links)
    }

