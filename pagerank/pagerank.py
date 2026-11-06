"""
PageRank in Python with NumPy / SciPy.
Cross-validation and feature scoring integration for Phase 6 & Phase 7.
"""

import json
import sys
import numpy as np
from typing import Dict, Any


def compute_pagerank(graph_file: str, damping: float = 0.85, epsilon: float = 1e-7, max_iter: int = 100) -> Dict[int, float]:
    with open(graph_file, "r", encoding="utf-8") as f:
        data = json.load(f)

    num_nodes = data["num_nodes"]
    edges = data["edges"]

    if num_nodes == 0:
        return {}

    # Build adjacency and out-degrees
    out_degree = np.zeros(num_nodes, dtype=np.int32)
    for src, _ in edges:
        if 0 <= src < num_nodes:
            out_degree[src] += 1

    dangling_nodes = np.where(out_degree == 0)[0]

    # Inverted adjacency: list of sources for each target
    in_links = [[] for _ in range(num_nodes)]
    for src, tgt in edges:
        if 0 <= src < num_nodes and 0 <= tgt < num_nodes:
            in_links[tgt].append(src)

    pr = np.full(num_nodes, 1.0 / num_nodes, dtype=np.float64)

    for it in range(1, max_iter + 1):
        dangling_sum = np.sum(pr[dangling_nodes])
        base_val = (1.0 - damping) / num_nodes + (damping * dangling_sum) / num_nodes

        pr_next = np.full(num_nodes, base_val, dtype=np.float64)
        for i in range(num_nodes):
            if in_links[i]:
                s = sum(pr[src] / out_degree[src] for src in in_links[i])
                pr_next[i] += damping * s

        diff = np.sum(np.abs(pr_next - pr))
        pr = pr_next
        if diff < epsilon:
            print(f"[Python PageRank] Converged in {it} iterations (residual: {diff:.2e})")
            break

    return {i: float(pr[i]) for i in range(num_nodes)}


if __name__ == "__main__":
    infile = sys.argv[1] if len(sys.argv) > 1 else "data/parsed/link_graph.json"
    outfile = sys.argv[2] if len(sys.argv) > 2 else "data/parsed/pagerank_scores_py.json"
    scores = compute_pagerank(infile)
    with open(outfile, "w", encoding="utf-8") as f:
        json.dump(scores, f, indent=2)
    print(f"[✓] Python PageRank written to {outfile}")

