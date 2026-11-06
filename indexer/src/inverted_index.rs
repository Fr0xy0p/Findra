use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs::File;
use std::io::{BufRead, BufReader};
use crate::snippet::SnippetGenerator;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Posting {
    pub doc_id: u32,
    pub tf: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocumentMetadata {
    pub doc_id: u32,
    pub url: string_url::UrlMeta,
    pub title: String,
    pub description: String,
    pub doc_length: u32,
    pub headings: Vec<String>,
    pub text: String,
    pub pagerank: f64,
}

pub mod string_url {
    use serde::{Deserialize, Serialize};
    use url::Url;

    #[derive(Debug, Clone, Serialize, Deserialize)]
    pub struct UrlMeta {
        pub raw: String,
        pub domain: String,
        pub path: String,
        pub depth: u32,
    }

    impl UrlMeta {
        pub fn from_raw(raw: &str) -> Self {
            let mut domain = String::new();
            let mut path = String::new();
            let mut depth = 0;

            if let Ok(parsed) = Url::parse(raw) {
                domain = parsed.host_str().unwrap_or("").to_string();
                path = parsed.path().to_string();
                depth = path.split('/').filter(|s| !s.is_empty()).count() as u32;
            }

            Self {
                raw: raw.to_string(),
                domain,
                path,
                depth,
            }
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchHit {
    pub doc_id: u32,
    pub url: String,
    pub domain: String,
    pub title: String,
    pub snippet: String,
    pub score: f64,
    pub bm25_score: f64,
    pub pagerank_score: f64,
    pub doc_length: u32,
    pub headings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub query: String,
    pub total_hits: usize,
    pub took_ms: f64,
    pub page: usize,
    pub page_size: usize,
    pub total_pages: usize,
    pub results: Vec<SearchHit>,
}

pub struct InvertedIndex {
    pub lexicon: HashMap<String, Vec<Posting>>, // term -> postings
    pub doc_store: HashMap<u32, DocumentMetadata>,
    pub doc_count: u32,
    pub avg_doc_len: f64,
    pub k1: f64,
    pub b: f64,
}

impl InvertedIndex {
    pub fn new() -> Self {
        Self {
            lexicon: HashMap::new(),
            doc_store: HashMap::new(),
            doc_count: 0,
            avg_doc_len: 1.0,
            k1: 1.2,
            b: 0.75,
        }
    }

    /// Build index from documents.jsonl and optional pagerank_scores.json
    pub fn build_from_files(docs_path: &str, pagerank_path: &str) -> Result<Self, Box<dyn std::error::Error>> {
        let mut index = Self::new();

        // 1. Load PageRank scores if available
        let mut pr_scores: HashMap<u32, f64> = HashMap::new();
        if let Ok(pr_file) = File::open(pagerank_path) {
            let reader = BufReader::new(pr_file);
            let pr_json: Result<HashMap<String, serde_json::Value>, _> = serde_json::from_reader(reader);
            if let Ok(map) = pr_json {
                for (id_str, val) in map {
                    if let Ok(id) = id_str.parse::<u32>() {
                        let score = if let Some(norm) = val.get("normalized").and_then(|v| v.as_f64()) {
                            norm
                        } else if let Some(raw) = val.as_f64() {
                            raw
                        } else {
                            0.1
                        };
                        pr_scores.insert(id, score);
                    }
                }
            }
        }

        // 2. Read documents.jsonl
        let docs_file = File::open(docs_path)?;
        let reader = BufReader::new(docs_file);

        let mut total_length: u64 = 0;

        for line in reader.lines() {
            let line = line?;
            if line.trim().is_empty() {
                continue;
            }

            let doc_json: serde_json::Value = serde_json::from_str(&line)?;
            let doc_id = doc_json["doc_id"].as_u64().unwrap_or(0) as u32;
            let url_raw = doc_json["url"].as_str().unwrap_or("");
            let title = doc_json["title"].as_str().unwrap_or("Untitled").to_string();
            let description = doc_json["description"].as_str().unwrap_or("").to_string();
            let text = doc_json["text_snippet"].as_str().unwrap_or("").to_string();
            let doc_length = doc_json["doc_length"].as_u64().unwrap_or(1) as u32;

            let headings: Vec<String> = doc_json["headings"]
                .as_array()
                .map(|arr| arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect())
                .unwrap_or_default();

            let pr_val = *pr_scores.get(&doc_id).unwrap_or(&0.15);

            let meta = DocumentMetadata {
                doc_id,
                url: string_url::UrlMeta::from_raw(url_raw),
                title,
                description,
                doc_length,
                headings,
                text,
                pagerank: pr_val,
            };

            // Ingest term frequencies into posting lists
            if let Some(tf_obj) = doc_json["term_frequencies"].as_object() {
                for (term, freq_val) in tf_obj {
                    let freq = freq_val.as_u64().unwrap_or(1) as u32;
                    index.lexicon.entry(term.to_lowercase()).or_default().push(Posting {
                        doc_id,
                        tf: freq,
                    });
                }
            }

            index.doc_store.insert(doc_id, meta);
            total_length += doc_length as u64;
            index.doc_count += 1;
        }

        if index.doc_count > 0 {
            index.avg_doc_len = (total_length as f64) / (index.doc_count as f64);
        }

        println!("[Rust Indexer] Indexed {} documents across {} unique lexicon terms.", index.doc_count, index.lexicon.len());
        println!("[Rust Indexer] Corpus avg document length: {:.2} tokens.", index.avg_doc_len);

        Ok(index)
    }

    /// Calculate Okapi Robertson-Sparck Jones IDF
    pub fn idf(&self, term: &str) -> f64 {
        let df = self.lexicon.get(term).map(|p| p.len()).unwrap_or(0) as f64;
        let n = self.doc_count as f64;
        // ln(1 + (N - df + 0.5) / (df + 0.5))
        ((n - df + 0.5) / (df + 0.5) + 1.0).ln().max(0.1)
    }

    /// Search and rank candidate documents using BM25 + PageRank + Metadata boost
    pub fn search(&self, query: &str, page: usize, page_size: usize) -> SearchResult {
        let start = std::time::Instant::now();
        let query_terms: Vec<String> = query
            .split_whitespace()
            .map(|s| s.trim_matches(|c: char| !c.is_alphanumeric()).to_lowercase())
            .filter(|s| s.len() > 1)
            .collect();

        if query_terms.is_empty() {
            return SearchResult {
                query: query.to_string(),
                total_hits: 0,
                took_ms: start.elapsed().as_secs_f64() * 1000.0,
                page: 1,
                page_size,
                total_pages: 0,
                results: Vec::new(),
            };
        }

        // Candidate accumulator: doc_id -> (bm25_score, terms_matched)
        let mut candidates: HashMap<u32, (f64, usize)> = HashMap::new();

        for term in &query_terms {
            if let Some(postings) = self.lexicon.get(term) {
                let idf = self.idf(term);
                for p in postings {
                    let entry = candidates.entry(p.doc_id).or_insert((0.0, 0));
                    let doc_len = self.doc_store.get(&p.doc_id).map(|d| d.doc_length).unwrap_or(1) as f64;

                    let tf = p.tf as f64;
                    let num = tf * (self.k1 + 1.0);
                    let den = tf + self.k1 * (1.0 - self.b + self.b * (doc_len / self.avg_doc_len));
                    let term_bm25 = idf * (num / den);

                    entry.0 += term_bm25;
                    entry.1 += 1;
                }
            }
        }

        // Hybrid multi-signal scoring
        let mut scored_docs: Vec<SearchHit> = Vec::new();

        for (doc_id, (bm25, terms_matched)) in candidates {
            if let Some(doc) = self.doc_store.get(&doc_id) {
                let pr = doc.pagerank;
                let title_lower = doc.title.to_lowercase();
                let query_lower = query.to_lowercase();

                let exact_title_match = if title_lower.contains(&query_lower) { 5.0 } else { 0.0 };
                let title_term_bonus = query_terms.iter().filter(|t| title_lower.contains(t.as_str())).count() as f64 * 2.0;
                let depth_score = 1.0 / (1.0 + doc.url.depth as f64);
                let coverage_bonus = (terms_matched as f64 / query_terms.len() as f64) * 3.0;

                // Weighted Hybrid Formula
                let final_score = 0.55 * bm25
                    + 0.20 * (pr * 10.0)
                    + 0.15 * (exact_title_match + title_term_bonus)
                    + 0.05 * (depth_score * 2.0)
                    + 0.05 * coverage_bonus;

                let snippet = if !doc.description.is_empty() {
                    doc.description.clone()
                } else {
                    SnippetGenerator::generate_snippet(&doc.text, &query_terms, 180)
                };

                scored_docs.push(SearchHit {
                    doc_id,
                    url: doc.url.raw.clone(),
                    domain: doc.url.domain.clone(),
                    title: doc.title.clone(),
                    snippet,
                    score: final_score,
                    bm25_score: bm25,
                    pagerank_score: pr,
                    doc_length: doc.doc_length,
                    headings: doc.headings.clone(),
                });
            }
        }

        // Sort descending by final score
        scored_docs.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));

        let total_hits = scored_docs.len();
        let total_pages = (total_hits + page_size - 1) / page_size;

        let start_idx = (page.saturating_sub(1)) * page_size;
        let end_idx = (start_idx + page_size).min(total_hits);

        let results = if start_idx < total_hits {
            scored_docs[start_idx..end_idx].to_vec()
        } else {
            Vec::new()
        };

        SearchResult {
            query: query.to_string(),
            total_hits,
            took_ms: start.elapsed().as_secs_f64() * 1000.0,
            page,
            page_size,
            total_pages,
            results,
        }
    }

    /// Autocomplete suggestions for prefix search
    pub fn suggest(&self, prefix: &str, limit: usize) -> Vec<String> {
        let prefix_clean = prefix.trim().to_lowercase();
        if prefix_clean.is_empty() {
            return Vec::new();
        }

        let mut matches = Vec::new();

        // Check document titles first (higher relevance)
        for doc in self.doc_store.values() {
            if doc.title.to_lowercase().starts_with(&prefix_clean) {
                matches.push(doc.title.clone());
                if matches.len() >= limit {
                    return matches;
                }
            }
        }

        // Check lexicon terms
        for term in self.lexicon.keys() {
            if term.starts_with(&prefix_clean) && !matches.contains(term) {
                matches.push(term.clone());
                if matches.len() >= limit {
                    break;
                }
            }
        }

        matches
    }
}

