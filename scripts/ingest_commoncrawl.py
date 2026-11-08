#!/usr/bin/env python3
"""
scripts/ingest_commoncrawl.py - Common Crawl Open Dataset Ingester for Findra

Common Crawl (https://commoncrawl.org/) produces petabyte-scale open web crawls.
This script streams WET (WARC Extracted Text) files or top worldwide domains
and ingests high-value pages directly into Findra's inverted index.

Usage:
    # Stream from Common Crawl sample or specific WET file:
    python3 scripts/ingest_commoncrawl.py --limit 100

    # Ingest from a custom WARC/WET URL or local file:
    python3 scripts/ingest_commoncrawl.py --wet-url "https://data.commoncrawl.org/..." --limit 500
"""

import os
import sys
import json
import time
import gzip
import argparse
import urllib.request
import urllib.parse
import re
from io import BytesIO

# Default sample WET file path from Common Crawl (CC-MAIN-2024-10)
DEFAULT_WET_URL = "https://data.commoncrawl.org/crawl-data/CC-MAIN-2024-10/segments/1709977840134.12/wet/CC-MAIN-20240311025547-20240311055547-00000.warc.wet.gz"

# Fallback top global domains for fast seed ingestion if Common Crawl network is slow
TOP_GLOBAL_DOMAINS = [
    ("https://en.wikipedia.org/wiki/Portal:Current_events", "Wikipedia Current Events Portal", "Global world news, international events, and historical updates."),
    ("https://www.reuters.com/", "Reuters Global News", "International breaking news and financial market analysis."),
    ("https://www.bbc.com/", "BBC International News", "Trusted world news, business, technology, culture, and science."),
    ("https://www.nature.com/", "Nature - International Science Journal", "Leading peer-reviewed journal publishing significant advances in science."),
    ("https://www.nasa.gov/", "NASA - National Aeronautics and Space Administration", "Exploring the secrets of the universe for the benefit of all."),
    ("https://www.who.int/", "World Health Organization", "Leading global health efforts and health responses worldwide."),
    ("https://www.un.org/", "United Nations", "Peace, dignity, and equality on a healthy planet."),
    ("https://arxiv.org/", "arXiv.org e-Print Archive", "Open access research repository in physics, mathematics, computer science, and AI."),
    ("https://news.ycombinator.com/", "Hacker News", "Social news website focusing on computer science, AI, and entrepreneurship."),
    ("https://github.com/trending", "GitHub Trending Repositories", "Today's trending open source software and repositories on GitHub."),
    ("https://stackoverflow.com/", "Stack Overflow", "The world's largest community for developers to learn and share knowledge."),
    ("https://www.reddit.com/r/technology/", "Reddit Technology News", "A dedicated community for all things technology and computing."),
    ("https://www.technologyreview.com/", "MIT Technology Review", "Authority on the future of technology, AI, computing, and biotechnology."),
    ("https://scientificamerican.com/", "Scientific American", "Research, science breakthroughs, and expert analysis since 1845."),
    ("https://www.wired.com/", "WIRED - Tomorrow Realized", "In-depth reporting on technology, science, culture, and business.")
]

def tokenize_and_pos(text):
    words = re.findall(r'[a-zA-Z0-9_\-\']+', text.lower())
    tokens = []
    positions = {}
    freqs = {}
    pos = 0
    for w in words:
        clean = w.strip("-_'")
        if len(clean) < 2:
            continue
        tokens.append(clean)
        freqs[clean] = freqs.get(clean, 0) + 1
        if clean not in positions:
            positions[clean] = []
        positions[clean].append(pos)
        pos += 1
    return tokens, freqs, positions

def parse_warc_records(stream, limit=100):
    """Parses WET records (WARC 1.0) from a line stream."""
    records = []
    current_url = None
    current_content_len = 0
    reading_content = False
    content_lines = []

    for raw_line in stream:
        try:
            line = raw_line.decode('utf-8', errors='replace').rstrip('\r\n')
        except Exception:
            continue

        if line.startswith("WARC-Target-URI:"):
            current_url = line.split(":", 1)[1].strip()
        elif line.startswith("Content-Length:"):
            try:
                current_content_len = int(line.split(":", 1)[1].strip())
            except ValueError:
                current_content_len = 0
        elif line == "":
            if current_url and not reading_content:
                reading_content = True
                content_lines = []
        elif reading_content:
            if line.startswith("WARC/1.0"):
                # End of record
                text = " ".join(content_lines).strip()
                if current_url and len(text) > 200:
                    title = current_url
                    if len(content_lines) > 0 and len(content_lines[0].strip()) > 3:
                        title = content_lines[0].strip()[:100]
                    records.append({
                        "url": current_url,
                        "title": title,
                        "text": text[:2000]
                    })
                    if len(records) >= limit:
                        break
                current_url = None
                reading_content = False
                content_lines = []
            else:
                content_lines.append(line)

    if current_url and content_lines and len(records) < limit:
        text = " ".join(content_lines).strip()
        if len(text) > 200:
            records.append({
                "url": current_url,
                "title": content_lines[0].strip()[:100] if content_lines else current_url,
                "text": text[:2000]
            })

    return records

def stream_common_crawl(wet_url, limit=100):
    print(f"[*] Connecting to Common Crawl: {wet_url}...")
    headers = {"User-Agent": "FindraGlobalIngester/1.0 (+https://findra-q4pt.onrender.com/)"}
    req = urllib.request.Request(wet_url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            with gzip.GzipFile(fileobj=resp) as gz:
                return parse_warc_records(gz, limit=limit)
    except Exception as e:
        print(f"[-] Could not stream from Common Crawl ({e}). Using curated worldwide seed domains instead.")
        return []

def main():
    parser = argparse.ArgumentParser(description="Findra Common Crawl Ingestion Tool")
    parser.add_argument("--limit", type=int, default=50, help="Max records to ingest")
    parser.add_argument("--wet-url", type=str, default=DEFAULT_WET_URL, help="Custom Common Crawl WET URL")
    parser.add_argument("--docs-path", type=str, default="data/parsed/documents.jsonl")
    parser.add_argument("--pagerank-path", type=str, default="data/parsed/pagerank_scores.json")
    parser.add_argument("--reload-url", type=str, default="http://localhost:8081/reload")
    args = parser.parse_args()

    print("=" * 60)
    print("🌐 FINDRA COMMON CRAWL INGESTION ENGINE")
    print(f"   Target limit: {args.limit}")
    print(f"   Docs target:  {args.docs_path}")
    print("=" * 60)

    # 1. Inspect existing docs
    max_id = 0
    seen_urls = set()
    if os.path.exists(args.docs_path):
        with open(args.docs_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    d = json.loads(line)
                    max_id = max(max_id, d.get("doc_id", 0))
                    seen_urls.add(d.get("url", "").rstrip("/").lower())
                except Exception:
                    pass

    print(f"[*] Found {len(seen_urls)} existing documents. Current max doc_id = {max_id}")

    # 2. Try streaming from Common Crawl, fallback to top global domains
    records = stream_common_crawl(args.wet_url, limit=args.limit)
    if not records:
        print("[*] Falling back to Top Global Authority seeds...")
        for url, title, snippet in TOP_GLOBAL_DOMAINS:
            if url.rstrip("/").lower() not in seen_urls:
                records.append({
                    "url": url,
                    "title": title,
                    "text": snippet + " " + title
                })

    # Filter out duplicates
    unique_records = []
    for r in records:
        u = r["url"].rstrip("/").lower()
        if u not in seen_urls:
            unique_records.append(r)
            seen_urls.add(u)

    if not unique_records:
        print("[!] No new unique records to add.")
        return

    print(f"[*] Ingesting {len(unique_records)} new documents...")
    original_max_id = max_id
    with open(args.docs_path, "a", encoding="utf-8") as f:
        for r in unique_records:
            max_id += 1
            full_text = r["title"] + " " + r["text"]
            tokens, term_freqs, term_positions = tokenize_and_pos(full_text)
            doc_entry = {
                "doc_id": max_id,
                "url": r["url"],
                "title": r["title"],
                "description": r["text"][:200],
                "headings": [r["title"]],
                "text_snippet": r["text"][:400] + "...",
                "doc_length": len(tokens),
                "char_count": len(full_text),
                "tokens": tokens,
                "term_frequencies": term_freqs,
                "term_positions": term_positions,
                "anchor_tokens": [t for t in tokens if len(t) > 3][:10],
                "inbound_anchor_count": 3,
                "crawled_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            }
            f.write(json.dumps(doc_entry) + "\n")

    print(f"[+] Appended {len(unique_records)} documents! New max doc_id: {max_id}")

    # 3. Update PageRank scores
    if os.path.exists(args.pagerank_path):
        try:
            with open(args.pagerank_path, "r", encoding="utf-8") as pr_f:
                pr_data = json.load(pr_f)
            for doc_id in range(original_max_id + 1, max_id + 1):
                pr_data[str(doc_id)] = {
                    "raw": 0.0001,
                    "normalized": 0.88,
                    "trustrank": 0.95,
                    "trust_multiplier": 1
                }
            with open(args.pagerank_path, "w", encoding="utf-8") as pr_f:
                json.dump(pr_data, pr_f)
            print(f"[+] Updated PageRank scores in {args.pagerank_path}")
        except Exception as e:
            print(f"[-] Could not update PageRank file: {e}")

    # 4. Trigger reload
    try:
        req = urllib.request.Request(args.reload_url, data=b"{}", headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=5) as resp:
            print("[+] Triggered Rust index hot-reload successfully!")
    except Exception:
        print("[-] Note: Index reload will take effect on next server restart.")

if __name__ == "__main__":
    main()

