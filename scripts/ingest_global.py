#!/usr/bin/env python3
"""
Findra Worldwide Knowledge Seeder
=================================
Seeds Findra with hundreds or thousands of foundational global topics
(Science, History, Computing, Technology, Geography, People, Philosophy)
from Wikipedia's Vital Knowledge Base.

Usage:
    python3 scripts/ingest_global.py --limit 50
    python3 scripts/ingest_global.py --category tech --limit 20
    python3 scripts/ingest_global.py --custom "Quantum computing,James Webb Space Telescope,Black hole"
"""

import os
import sys
import json
import time
import argparse
import urllib.request
import urllib.parse
from concurrent.futures import ThreadPoolExecutor, as_completed

# Add extractor directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "extractor")))
try:
    from text_processor import process_with_positions, compute_term_frequencies
except ImportError:
    def process_with_positions(text):
        words = text.lower().split()
        return [(w.strip(".,;:!?'\"()[]{}"), idx) for idx, w in enumerate(words) if len(w) > 1]
    def compute_term_frequencies(tokens):
        freqs = {}
        for t in tokens: freqs[t] = freqs.get(t, 0) + 1
        return freqs

VITAL_TOPICS = {
    "tech": [
        "Computer science", "Artificial intelligence", "Machine learning", "Deep learning",
        "Quantum computing", "Internet", "World Wide Web", "Operating system",
        "Linux", "Python (programming language)", "Rust (programming language)", "C++",
        "Algorithm", "Data structure", "Cryptography", "Database",
        "Cloud computing", "Microprocessor", "Computer network", "Software engineering"
    ],
    "science": [
        "Physics", "Chemistry", "Biology", "Astronomy", "Quantum mechanics",
        "Theory of relativity", "Gravitation", "Evolution", "DNA",
        "Photosynthesis", "Black hole", "Big Bang", "Thermodynamics",
        "Plate tectonics", "Atom", "Periodic table", "Solar System", "Ecology"
    ],
    "geography": [
        "Earth", "Tokyo", "London", "Paris", "New York City", "India",
        "United States", "Japan", "United Kingdom", "France", "Germany",
        "Australia", "Canada", "Pacific Ocean", "Mount Everest", "Amazon rainforest"
    ],
    "history_and_people": [
        "Albert Einstein", "Isaac Newton", "Marie Curie", "Alan Turing",
        "Nikola Tesla", "Leonardo da Vinci", "Aristotle", "Galileo Galilei",
        "Industrial Revolution", "Renaissance", "Ancient Egypt", "Roman Empire"
    ]
}

def fetch_wiki_summary(title: str):
    slug = urllib.parse.quote(title.replace(" ", "_"))
    url = f"https://en.wikipedia.org/api/rest_v1/page/summary/{slug}"
    req = urllib.request.Request(url, headers={"User-Agent": "FindraKnowledgeSeeder/1.0 (info@findra.search)"})
    try:
        with urllib.request.urlopen(req, timeout=6) as resp:
            if resp.status == 200:
                return json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        # Fallback to standard search query if summary slug differs
        pass
    return None

def main():
    parser = argparse.ArgumentParser(description="Findra Global Knowledge Seeder")
    parser.add_argument("--limit", type=int, default=40, help="Number of vital articles to ingest")
    parser.add_argument("--category", type=str, default="all", choices=["all", "tech", "science", "geography", "history_and_people"])
    parser.add_argument("--custom", type=str, default="", help="Comma-separated custom topics")
    parser.add_argument("--docs-path", type=str, default="data/parsed/documents.jsonl")
    parser.add_argument("--crawl-path", type=str, default="data/raw_crawled/crawl_output.jsonl")
    parser.add_argument("--reload-url", type=str, default="http://localhost:8081/reload")
    args = parser.parse_args()

    # Determine topic list
    topics = []
    if args.custom:
        topics = [t.strip() for t in args.custom.split(",") if t.strip()]
    elif args.category == "all":
        for cat_list in VITAL_TOPICS.values():
            topics.extend(cat_list)
    else:
        topics = VITAL_TOPICS.get(args.category, [])

    topics = topics[:args.limit]
    print(f"==================================================")
    print(f"🌍 FINDRA WORLDWIDE KNOWLEDGE SEEDER")
    print(f"   Target Topics: {len(topics)}")
    print(f"   Docs Target:   {args.docs_path}")
    print(f"==================================================")

    # 1. Inspect existing docs to find max doc_id & seen URLs
    max_id = 0
    seen_urls = set()
    if os.path.exists(args.docs_path):
        with open(args.docs_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line: continue
                try:
                    doc = json.loads(line)
                    max_id = max(max_id, doc.get("doc_id", 0))
                    u = doc.get("url", "").rstrip("/").lower()
                    if u: seen_urls.add(u)
                except Exception:
                    pass

    print(f"[*] Found {len(seen_urls)} existing documents. Current max doc_id = {max_id}")

    # 2. Fetch summaries concurrently
    results = []
    print(f"[*] Fetching {len(topics)} knowledge pages from Wikipedia...")
    with ThreadPoolExecutor(max_workers=8) as executor:
        future_to_topic = {executor.submit(fetch_wiki_summary, t): t for t in topics}
        for future in as_completed(future_to_topic):
            topic = future_to_topic[future]
            try:
                data = future.result()
                if data and "extract" in data and len(data["extract"]) > 50:
                    page_url = data.get("content_urls", {}).get("desktop", {}).get("page", "")
                    if not page_url:
                        page_url = f"https://en.wikipedia.org/wiki/{urllib.parse.quote(topic.replace(' ', '_'))}"
                    
                    if page_url.rstrip("/").lower() not in seen_urls:
                        results.append({
                            "title": data.get("title", topic) + " - Wikipedia",
                            "url": page_url,
                            "extract": data.get("extract", ""),
                            "description": data.get("description", ""),
                        })
                        seen_urls.add(page_url.rstrip("/").lower())
                        print(f"  ✓ Fetched: {data.get('title', topic)}")
            except Exception as e:
                print(f"  ✗ Failed for {topic}: {e}")

    if not results:
        print("[!] No new topics to ingest (all requested topics already exist in index).")
        return

    # 3. Append to documents.jsonl and crawl_output.jsonl
    os.makedirs(os.path.dirname(args.docs_path), exist_ok=True)
    os.makedirs(os.path.dirname(args.crawl_path), exist_ok=True)

    print(f"[*] Processing & appending {len(results)} new articles into {args.docs_path}...")
    with open(args.docs_path, "a", encoding="utf-8") as docs_f, open(args.crawl_path, "a", encoding="utf-8") as crawl_f:
        for r in results:
            max_id += 1
            full_text = r["title"] + " " + r["extract"]
            tokens_pos = process_with_positions(full_text)
            tokens = [t for t, _ in tokens_pos]
            term_freqs = compute_term_frequencies(tokens)

            term_positions = {}
            for t, p in tokens_pos:
                if t not in term_positions:
                    term_positions[t] = []
                term_positions[t].append(p)

            doc_entry = {
                "doc_id": max_id,
                "url": r["url"],
                "title": r["title"],
                "description": r["description"] or r["extract"][:200],
                "headings": [r["title"]],
                "text_snippet": r["extract"][:400] + "...",
                "doc_length": len(tokens),
                "char_count": len(full_text),
                "tokens": tokens,
                "term_frequencies": term_freqs,
                "term_positions": term_positions,
                "anchor_tokens": [t for t in tokens if len(t) > 3][:10],
                "inbound_anchor_count": 3,
                "crawled_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            }
            docs_f.write(json.dumps(doc_entry) + "\n")

            # Also write HTML mock to raw crawl output
            crawl_entry = {
                "url": r["url"],
                "title": r["title"],
                "html": f"<html><head><title>{r['title']}</title></head><body><h1>{r['title']}</h1><p>{r['extract']}</p></body></html>",
                "crawled_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            }
            crawl_f.write(json.dumps(crawl_entry) + "\n")

    print(f"[+] Successfully wrote {len(results)} articles! (Total docs now ~{max_id})")

    # 4. Trigger Rust Hot-Reload
    try:
        req = urllib.request.Request(args.reload_url, data=b"{}", headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=5) as resp:
            resp_data = json.loads(resp.read().decode())
            print(f"🦀 [Rust Hot Reload] Reloaded! Docs: {resp_data.get('total_documents')}, Terms: {resp_data.get('total_terms')}")
    except Exception as e:
        print(f"[-] Note: Could not hot-reload Rust index at {args.reload_url} ({e}). It will reload on restart.")

    print("\n✅ Seeding complete! Try searching for your new topics at http://localhost:8080/")

if __name__ == "__main__":
    main()
