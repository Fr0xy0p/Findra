"""
Data Extraction & Preprocessing Pipeline Runner.
Transforms raw crawled documents into clean tokenized indices, forward stores, and link graphs.
"""

import sys
import os
import json
import argparse
from typing import Dict, List, Any
from parse_and_extract import extract_html_content
from text_processor import process_text, process_with_positions, compute_term_frequencies


def run_pipeline(input_path: str, output_dir: str):
    os.makedirs(output_dir, exist_ok=True)
    raw_docs: List[Dict[str, Any]] = []

    print(f"[*] Reading raw crawled documents from: {input_path}")
    if os.path.isfile(input_path):
        with open(input_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        raw_docs.append(json.loads(line))
                    except json.JSONDecodeError:
                        continue
    elif os.path.isdir(input_path):
        for fname in os.listdir(input_path):
            if fname.endswith(".json") or fname.endswith(".jsonl"):
                fpath = os.path.join(input_path, fname)
                with open(fpath, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if line:
                            try:
                                raw_docs.append(json.loads(line))
                            except json.JSONDecodeError:
                                continue

    print(f"[*] Loaded {len(raw_docs)} raw documents.")

    url_to_id: Dict[str, int] = {}
    id_to_url: Dict[int, str] = {}
    parsed_docs: List[Dict[str, Any]] = []

    # First pass: assign numeric doc IDs to all discovered URLs
    doc_id = 0
    for doc in raw_docs:
        url = doc.get("url")
        if url and url not in url_to_id:
            url_to_id[url] = doc_id
            id_to_url[doc_id] = url
            doc_id += 1

    # Second pass: Parse HTML and process text
    print("[*] Parsing HTML, extracting structural metadata, and tokenizing...")
    link_edges: List[Dict[str, Any]] = []

    documents_out_path = os.path.join(output_dir, "documents.jsonl")
    with open(documents_out_path, "w", encoding="utf-8") as doc_f:
        for raw in raw_docs:
            url = raw.get("url")
            raw_html = raw.get("html", "")
            if not url or not raw_html:
                continue

            current_id = url_to_id[url]
            extracted = extract_html_content(raw_html, url)

            # Process full body text
            body_tokens_with_pos = process_with_positions(extracted["text"])
            tokens = [t for t, _ in body_tokens_with_pos]
            tf = compute_term_frequencies(tokens)

            # Build positional index map for exact phrase queries
            term_positions: Dict[str, List[int]] = {}
            for term, pos in body_tokens_with_pos:
                if term not in term_positions:
                    term_positions[term] = []
                term_positions[term].append(pos)

            # Process title tokens (for title matching boost)
            title_tokens = process_text(extracted["title"], stem=True, remove_stops=True)

            # Process heading tokens
            headings_text = " ".join(extracted["headings"])
            heading_tokens = process_text(headings_text, stem=True, remove_stops=True)

            parsed_record = {
                "doc_id": current_id,
                "url": url,
                "title": extracted["title"],
                "description": extracted["description"],
                "headings": extracted["headings"],
                "text_snippet": extracted["text"][:300],
                "char_count": extracted["char_count"],
                "doc_length": len(tokens),
                "tokens": tokens,
                "title_tokens": title_tokens,
                "heading_tokens": heading_tokens,
                "term_frequencies": tf,
                "term_positions": term_positions,
                "crawled_at": raw.get("crawled_at", "")
            }

            doc_f.write(json.dumps(parsed_record) + "\n")
            parsed_docs.append(parsed_record)

            # Build link edges
            for out_link in extracted["outgoing_links"]:
                target_url = out_link["target_url"]
                # Give target URL an ID if not yet seen
                if target_url not in url_to_id:
                    url_to_id[target_url] = doc_id
                    id_to_url[doc_id] = target_url
                    doc_id += 1

                link_edges.append({
                    "src_id": current_id,
                    "target_id": url_to_id[target_url],
                    "src_url": url,
                    "target_url": target_url,
                    "anchor_text": out_link["anchor_text"]
                })

    # Save URL mapping
    with open(os.path.join(output_dir, "url_to_id.json"), "w", encoding="utf-8") as f:
        json.dump(url_to_id, f, indent=2)

    with open(os.path.join(output_dir, "id_to_url.json"), "w", encoding="utf-8") as f:
        json.dump(id_to_url, f, indent=2)

    # Save link graph for PageRank engine
    graph_data = {
        "num_nodes": len(url_to_id),
        "num_edges": len(link_edges),
        "edges": [[e["src_id"], e["target_id"]] for e in link_edges]
    }
    with open(os.path.join(output_dir, "link_graph.json"), "w", encoding="utf-8") as f:
        json.dump(graph_data, f, indent=2)

    print(f"[✓] Parsing complete! Successfully processed {len(parsed_docs)} documents.")
    print(f"[✓] Link graph has {graph_data['num_nodes']} nodes and {graph_data['num_edges']} edges.")
    print(f"[✓] Saved results to {output_dir}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="HTML Extraction & NLP Preprocessor")
    parser.add_argument("--input", default="data/raw_crawled/crawl_output.jsonl", help="Input raw crawl jsonl path")
    parser.add_argument("--output", default="data/parsed", help="Output directory for processed documents")
    args = parser.parse_args()

    run_pipeline(args.input, args.output)

