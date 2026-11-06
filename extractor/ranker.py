"""
Ranking & Feature Scoring Module (Phase 7 & Phase 8).
Implements BM25, multi-feature extraction, hybrid linear scoring, and Learning-to-Rank (LTR) framework.
"""

import math
from typing import List, Dict, Any, Tuple
from urllib.parse import urlparse
from text_processor import process_text


class BM25Ranker:
    """
    Okapi BM25 ranking model with Robertson-Sparck Jones IDF.
    Parameters:
      k1: term frequency saturation factor (default 1.2)
      b: document length normalization penalty (default 0.75)
    """

    def __init__(self, k1: float = 1.2, b: float = 0.75):
        self.k1 = k1
        self.b = b
        self.doc_count = 0
        self.avg_doc_len = 0.0
        self.doc_lens: Dict[int, int] = {}
        self.doc_freqs: Dict[str, int] = {}  # term -> number of docs containing it
        self.term_freqs: Dict[int, Dict[str, int]] = {}  # doc_id -> {term: freq}

    def fit(self, documents: List[Dict[str, Any]]):
        """Fit corpus statistics for BM25 calculation."""
        self.doc_count = len(documents)
        total_len = 0
        self.doc_freqs.clear()
        self.doc_lens.clear()
        self.term_freqs.clear()

        for doc in documents:
            doc_id = doc["doc_id"]
            tf = doc.get("term_frequencies", {})
            length = doc.get("doc_length", sum(tf.values()))

            self.doc_lens[doc_id] = length
            self.term_freqs[doc_id] = tf
            total_len += length

            for term in tf.keys():
                self.doc_freqs[term] = self.doc_freqs.get(term, 0) + 1

        self.avg_doc_len = (total_len / self.doc_count) if self.doc_count > 0 else 1.0

    def idf(self, term: str) -> float:
        """Calculate Robertson-Sparck Jones IDF."""
        df = self.doc_freqs.get(term, 0)
        # Smooth RSJ IDF: ln(1 + (N - df + 0.5) / (df + 0.5))
        return math.log(1.0 + (self.doc_count - df + 0.5) / (df + 0.5))

    def score(self, doc_id: int, query_terms: List[str]) -> float:
        """Compute BM25 score for a specific document against query terms."""
        if doc_id not in self.term_freqs:
            return 0.0

        tf_dict = self.term_freqs[doc_id]
        doc_len = self.doc_lens.get(doc_id, self.avg_doc_len)
        score = 0.0

        for term in query_terms:
            tf = tf_dict.get(term, 0)
            if tf <= 0:
                continue
            idf_val = self.idf(term)
            numerator = tf * (self.k1 + 1.0)
            denominator = tf + self.k1 * (1.0 - self.b + self.b * (doc_len / self.avg_doc_len))
            score += idf_val * (numerator / denominator)

        return score


class FeatureExtractor:
    """
    Extracts multi-signal ranking features for candidate documents (Learning-to-Rank ready).
    Features:
      - bm25_body
      - bm25_title
      - bm25_headings
      - pagerank_normalized
      - url_depth
      - doc_length
      - title_exact_match
    """

    def __init__(self, bm25_ranker: BM25Ranker, pagerank_scores: Dict[int, Dict[str, float]]):
        self.bm25 = bm25_ranker
        self.pagerank = pagerank_scores

    def extract_features(self, doc: Dict[str, Any], query: str, query_terms: List[str]) -> Dict[str, float]:
        doc_id = doc["doc_id"]
        bm25_body = self.bm25.score(doc_id, query_terms)

        # Title match
        title_text = doc.get("title", "").lower()
        title_terms = doc.get("title_tokens", [])
        title_match_count = sum(1 for q in query_terms if q in title_terms)

        # Exact query match in title
        query_raw = query.strip().lower()
        exact_title_match = 1.0 if query_raw in title_text else 0.0

        # PageRank
        pr_info = self.pagerank.get(doc_id, self.pagerank.get(str(doc_id), {"normalized": 0.1}))
        pr_score = pr_info.get("normalized", 0.1) if isinstance(pr_info, dict) else float(pr_info)

        # URL Depth
        url = doc.get("url", "")
        parsed = urlparse(url)
        path_segments = [p for p in parsed.path.split("/") if p]
        url_depth = len(path_segments)
        depth_score = 1.0 / (1.0 + url_depth)

        return {
            "bm25_body": bm25_body,
            "title_match_count": float(title_match_count),
            "exact_title_match": exact_title_match,
            "pagerank": pr_score,
            "depth_score": depth_score,
            "doc_length": float(doc.get("doc_length", 0))
        }


class HybridRanker:
    """
    Combines text relevance (BM25) with graph authority (PageRank) and metadata signals.
    """

    def __init__(
        self, 
        w_bm25: float = 0.65, 
        w_pagerank: float = 0.20, 
        w_title: float = 0.10, 
        w_depth: float = 0.05
    ):
        self.w_bm25 = w_bm25
        self.w_pagerank = w_pagerank
        self.w_title = w_title
        self.w_depth = w_depth

    def score_document(self, features: Dict[str, float]) -> float:
        score = (
            self.w_bm25 * features["bm25_body"] +
            self.w_pagerank * (features["pagerank"] * 10.0) +
            self.w_title * (features["exact_title_match"] * 5.0 + features["title_match_count"] * 2.0) +
            self.w_depth * (features["depth_score"] * 2.0)
        )
        return score

