"""
Data Extraction & Preprocessing Pipeline Runner.
Transforms raw crawled documents into clean tokenized indices, forward stores,
incoming anchor-text graph, and link graphs for PageRank and TrustRank.
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
    extracted_cache: Dict[str, Dict[str, Any]] = {}
    inbound_anchors_by_url: Dict[str, List[str]] = {}

    # Pass 1: Parse HTML, extract links, assign IDs, and accumulate inbound anchor text
    print("[*] Pass 1: Extracting HTML metadata, assigning IDs, and aggregating inbound anchor text...")
    doc_id = 0
    for raw in raw_docs:
        url = raw.get("url")
        raw_html = raw.get("html", "")
        if not url or not raw_html:
            continue

        if url not in url_to_id:
            url_to_id[url] = doc_id
            id_to_url[doc_id] = url
            doc_id += 1

        extracted = extract_html_content(raw_html, url)
        extracted_cache[url] = extracted

        # Collect outgoing links and inbound anchors
        for out in extracted["outgoing_links"]:
            target_url = out["target_url"]
            anchor = out.get("anchor_text", "").strip()
            if target_url not in url_to_id:
                url_to_id[target_url] = doc_id
                id_to_url[doc_id] = target_url
                doc_id += 1

            if anchor and len(anchor) > 1:
                if target_url not in inbound_anchors_by_url:
                    inbound_anchors_by_url[target_url] = []
                inbound_anchors_by_url[target_url].append(anchor)

    print(f"[*] Discovered {len(url_to_id)} total unique URLs and aggregated inbound anchors.")

    # Pass 2: Ingest body text, titles, headings, and inbound anchor text (Google-style)
    print("[*] Pass 2: Tokenizing, computing positional indices, and embedding anchor text...")
    link_edges: List[Dict[str, Any]] = []
    parsed_docs: List[Dict[str, Any]] = []

    documents_out_path = os.path.join(output_dir, "documents.jsonl")
    with open(documents_out_path, "w", encoding="utf-8") as doc_f:
        for raw in raw_docs:
            url = raw.get("url")
            if not url or url not in extracted_cache:
                continue

            current_id = url_to_id[url]
            extracted = extracted_cache[url]

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

            # Process inbound anchor texts (Google's anchor text propagation)
            anchors_list = inbound_anchors_by_url.get(url, [])
            combined_anchors = " ".join(anchors_list)
            anchor_tokens = process_text(combined_anchors, stem=True, remove_stops=True)
            anchor_tf = compute_term_frequencies(anchor_tokens)

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
                "anchor_tokens": anchor_tokens,
                "anchor_frequencies": anchor_tf,
                "term_frequencies": tf,
                "term_positions": term_positions,
                "inbound_anchor_count": len(anchors_list),
                "crawled_at": raw.get("crawled_at", "")
            }

            doc_f.write(json.dumps(parsed_record) + "\n")
            parsed_docs.append(parsed_record)

            # Build link edges
            for out_link in extracted["outgoing_links"]:
                target_url = out_link["target_url"]
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

    # Save link graph for PageRank & TrustRank engine
    graph_data = {
        "num_nodes": len(url_to_id),
        "num_edges": len(link_edges),
        "edges": [[e["src_id"], e["target_id"]] for e in link_edges]
    }
    with open(os.path.join(output_dir, "link_graph.json"), "w", encoding="utf-8") as f:
        json.dump(graph_data, f, indent=2)

    print(f"[✓] Parsing complete! Successfully processed {len(parsed_docs)} documents.")
    print(f"[✓] Link graph has {graph_data['num_nodes']} nodes and {graph_data['num_edges']} edges.")
    print(f"[✓] Saved results with anchor text signals to {output_dir}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="HTML Extraction & NLP Preprocessor")
    parser.add_argument("--input", default="data/raw_crawled/crawl_output.jsonl", help="Input raw crawl jsonl path")
    parser.add_argument("--output", default="data/parsed", help="Output directory for processed documents")
    args = parser.parse_args()

    run_pipeline(args.input, args.output)
