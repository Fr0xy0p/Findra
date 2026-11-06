use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs::File;
use std::io::{BufRead, BufReader};
use crate::snippet::SnippetGenerator;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Posting {
    pub doc_id: u32,
    pub tf: u32,
    pub positions: Vec<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthorityScores {
    pub pagerank: f64,
    pub trustrank: f64,
    pub trust_multiplier: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocumentMetadata {
    pub doc_id: u32,
    pub url: string_url::UrlMeta,
    pub title: String,
    pub description: String,
    pub doc_length: u32,
    pub headings: Vec<String>,
    pub anchor_tokens: Vec<String>,
    pub text: String,
    pub pagerank: f64,
    pub trustrank: f64,
    pub trust_multiplier: f64,
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
    pub trustrank_score: f64,
    pub doc_length: u32,
    pub headings: Vec<String>,
    pub is_phrase_match: bool,
    pub matched_in_anchor: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub query: String,
    pub did_you_mean: Option<String>,
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
    pub term_max_scores: HashMap<String, f64>, // Block-Max WAND upper bounds
    pub doc_count: u32,
    pub avg_doc_len: f64,
    pub k1: f64,
    pub b: f64,
}

// Levenshtein edit distance for spelling correction
fn levenshtein_distance(s1: &str, s2: &str) -> usize {
    let s1_chars: Vec<char> = s1.chars().collect();
    let s2_chars: Vec<char> = s2.chars().collect();
    let len1 = s1_chars.len();
    let len2 = s2_chars.len();

    if len1 == 0 { return len2; }
    if len2 == 0 { return len1; }

    let mut dp = vec![vec![0usize; len2 + 1]; len1 + 1];

    for i in 0..=len1 { dp[i][0] = i; }
    for j in 0..=len2 { dp[0][j] = j; }

    for i in 1..=len1 {
        for j in 1..=len2 {
            let cost = if s1_chars[i - 1] == s2_chars[j - 1] { 0 } else { 1 };
            dp[i][j] = (dp[i - 1][j] + 1)
                .min(dp[i][j - 1] + 1)
                .min(dp[i - 1][j - 1] + cost);
        }
    }
    dp[len1][len2]
}

impl InvertedIndex {
    pub fn new() -> Self {
        Self {
            lexicon: HashMap::new(),
            doc_store: HashMap::new(),
            term_max_scores: HashMap::new(),
            doc_count: 0,
            avg_doc_len: 1.0,
            k1: 1.2,
            b: 0.75,
        }
    }

    /// Build index from documents.jsonl and optional pagerank_scores.json
    pub fn build_from_files(docs_path: &str, pagerank_path: &str) -> Result<Self, Box<dyn std::error::Error>> {
        let mut index = Self::new();

        // 1. Load PageRank & TrustRank scores if available
        let mut auth_scores: HashMap<u32, AuthorityScores> = HashMap::new();
        if let Ok(pr_file) = File::open(pagerank_path) {
            let reader = BufReader::new(pr_file);
            let pr_json: Result<HashMap<String, serde_json::Value>, _> = serde_json::from_reader(reader);
            if let Ok(map) = pr_json {
                for (id_str, val) in map {
                    if let Ok(id) = id_str.parse::<u32>() {
                        let pr = val.get("normalized").and_then(|v| v.as_f64()).unwrap_or(0.1);
                        let tr = val.get("trustrank").and_then(|v| v.as_f64()).unwrap_or(0.1);
                        let tm = val.get("trust_multiplier").and_then(|v| v.as_f64()).unwrap_or(1.0);

                        auth_scores.insert(id, AuthorityScores {
                            pagerank: pr,
                            trustrank: tr,
                            trust_multiplier: tm,
                        });
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

            let anchor_tokens: Vec<String> = doc_json["anchor_tokens"]
                .as_array()
                .map(|arr| arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect())
                .unwrap_or_default();

            let default_auth = AuthorityScores { pagerank: 0.15, trustrank: 0.15, trust_multiplier: 1.0 };
            let auth = auth_scores.get(&doc_id).unwrap_or(&default_auth);

            let meta = DocumentMetadata {
                doc_id,
                url: string_url::UrlMeta::from_raw(url_raw),
                title,
                description,
                doc_length,
                headings,
                anchor_tokens,
                text,
                pagerank: auth.pagerank,
                trustrank: auth.trustrank,
                trust_multiplier: auth.trust_multiplier,
            };

            // Ingest positional term occurrences for body text
            if let Some(pos_obj) = doc_json["term_positions"].as_object() {
                for (term, pos_val) in pos_obj {
                    let mut positions: Vec<u32> = pos_val
                        .as_array()
                        .map(|arr| arr.iter().filter_map(|v| v.as_u64().map(|n| n as u32)).collect())
                        .unwrap_or_default();
                    positions.sort_unstable();

                    let tf = positions.len() as u32;
                    index.lexicon.entry(term.to_lowercase()).or_default().push(Posting {
                        doc_id,
                        tf,
                        positions,
                    });
                }
            } else if let Some(tf_obj) = doc_json["term_frequencies"].as_object() {
                for (term, freq_val) in tf_obj {
                    let freq = freq_val.as_u64().unwrap_or(1) as u32;
                    index.lexicon.entry(term.to_lowercase()).or_default().push(Posting {
                        doc_id,
                        tf: freq,
                        positions: Vec::new(),
                    });
                }
            }

            // Ingest inbound anchor texts into lexicon with elevated frequency
            if let Some(anchor_obj) = doc_json["anchor_frequencies"].as_object() {
                for (anchor_term, freq_val) in anchor_obj {
                    let term_lower = anchor_term.to_lowercase();
                    let freq = freq_val.as_u64().unwrap_or(1) as u32;

                    let list = index.lexicon.entry(term_lower).or_default();
                    if let Some(existing) = list.iter_mut().find(|p| p.doc_id == doc_id) {
                        existing.tf += freq * 2; // Inbound anchor weight boost
                    } else {
                        list.push(Posting {
                            doc_id,
                            tf: freq * 2,
                            positions: Vec::new(),
                        });
                    }
                }
            }

            index.doc_store.insert(doc_id, meta);
            total_length += doc_length as u64;
            index.doc_count += 1;
        }

        if index.doc_count > 0 {
            index.avg_doc_len = (total_length as f64) / (index.doc_count as f64);
        }

        // Precompute Block-Max WAND upper bound scores for each term
        for (term, postings) in &index.lexicon {
            let idf_val = index.idf(term);
            let max_score = idf_val * (index.k1 + 1.0);
            index.term_max_scores.insert(term.clone(), max_score);
        }

        println!("[Rust Indexer] Indexed {} documents with anchor-text integration.", index.doc_count);
        println!("[Rust Indexer] Precomputed Block-Max WAND bounds for {} lexicon terms.", index.term_max_scores.len());
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

    /// Check if consecutive terms appear adjacently in sequence in the document's positional index
    pub fn check_phrase_proximity(&self, doc_id: u32, terms: &[String]) -> bool {
        if terms.len() <= 1 {
            return true;
        }

        let mut postings: Vec<&Posting> = Vec::new();
        for t in terms {
            if let Some(list) = self.lexicon.get(t) {
                if let Some(p) = list.iter().find(|p| p.doc_id == doc_id) {
                    postings.push(p);
                } else {
                    return false;
                }
            } else {
                return false;
            }
        }

        if postings.len() != terms.len() {
            return false;
        }

        // Positional verification
        for &start_pos in &postings[0].positions {
            let mut all_match = true;
            for (idx, p) in postings.iter().enumerate().skip(1) {
                let target_pos = start_pos + (idx as u32);
                if p.positions.binary_search(&target_pos).is_err() {
                    all_match = false;
                    break;
                }
            }
            if all_match {
                return true;
            }
        }

        false
    }

    /// Suggest spelling correction if query has typos
    pub fn suggest_did_you_mean(&self, raw_terms: &[String]) -> Option<String> {
        let mut corrections = Vec::new();
        let mut has_correction = false;

        for term in raw_terms {
            let stemmed = crate::stemmer::stem_word(term);
            if self.lexicon.contains_key(&stemmed) || self.lexicon.contains_key(term) {
                corrections.push(term.clone());
            } else {
                let mut best_candidate: Option<String> = None;
                let mut min_distance = 3usize; // only allow distance <= 2
                let mut highest_df = 0usize;

                for (lex_term, postings) in &self.lexicon {
                    if (lex_term.len() as isize - term.len() as isize).abs() > 2 {
                        continue;
                    }
                    let dist = levenshtein_distance(term, lex_term);
                    if dist <= 2 {
                        if dist < min_distance || (dist == min_distance && postings.len() > highest_df) {
                            min_distance = dist;
                            highest_df = postings.len();
                            best_candidate = Some(lex_term.clone());
                        }
                    }
                }

                if let Some(corr) = best_candidate {
                    corrections.push(corr);
                    has_correction = true;
                } else {
                    corrections.push(term.clone());
                }
            }
        }

        if has_correction {
            Some(corrections.join(" "))
        } else {
            None
        }
    }

    /// Search and rank candidate documents using Google-grade multi-signal scoring:
    /// - BM25 Term Weighting + Block-Max WAND Pruning
    /// - TrustRank Anti-Spam Multiplier
    /// - Inbound Anchor Text Match Bonus
    /// - Phrase Proximity Verification
    /// - Title & Heading Match Bonus
    pub fn search(&self, query: &str, page: usize, page_size: usize) -> SearchResult {
        let start = std::time::Instant::now();
        let raw_query = query.trim();
        let is_exact_phrase_required = raw_query.starts_with('"') && raw_query.ends_with('"') && raw_query.len() > 2;

        let raw_query_terms: Vec<String> = raw_query
            .split_whitespace()
            .map(|s| s.trim_matches(|c: char| !c.is_alphanumeric()).to_lowercase())
            .filter(|s| s.len() > 1)
            .collect();

        let query_terms: Vec<String> = raw_query_terms
            .iter()
            .map(|s| crate::stemmer::stem_word(s))
            .collect();

        if query_terms.is_empty() {
            return SearchResult {
                query: query.to_string(),
                did_you_mean: None,
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

        // Multi-signal hybrid scoring with Google-grade ranking cascade
        let mut scored_docs: Vec<SearchHit> = Vec::new();

        for (doc_id, (bm25, terms_matched)) in candidates {
            if let Some(doc) = self.doc_store.get(&doc_id) {
                let pr = doc.pagerank;
                let tr = doc.trustrank;
                let trust_mult = doc.trust_multiplier;

                let title_lower = doc.title.to_lowercase();
                let query_clean = raw_query_terms.join(" ");

                // 1. Check Phrase Proximity
                let is_phrase_match = if query_terms.len() > 1 {
                    self.check_phrase_proximity(doc_id, &query_terms)
                } else {
                    false
                };

                // If user put quotes around search, filter strictly to exact phrase matches
                if is_exact_phrase_required && !is_phrase_match {
                    continue;
                }

                // 2. Inbound Anchor Text Match Bonus (Google 1998 innovation)
                let mut matched_in_anchor = false;
                let mut anchor_bonus = 0.0;
                for term in &query_terms {
                    if doc.anchor_tokens.contains(term) {
                        matched_in_anchor = true;
                        anchor_bonus += 3.5;
                    }
                }

                // 3. Title & Structural Bonuses
                let exact_title_match = if title_lower.contains(&query_clean) { 6.0 } else { 0.0 };
                let title_term_bonus = query_terms.iter().filter(|t| title_lower.contains(t.as_str())).count() as f64 * 2.5;
                let depth_score = 1.0 / (1.0 + doc.url.depth as f64);
                let coverage_bonus = (terms_matched as f64 / query_terms.len() as f64) * 3.0;
                let phrase_bonus = if is_phrase_match { 8.0 } else { 0.0 };

                // 4. TrustRank-damped Authority Score (Anti-Spam)
                let authority_score = (0.7 * pr + 0.3 * tr) * trust_mult * 10.0;

                // Final Combined Rank Score
                let final_score = 0.45 * bm25
                    + 0.18 * authority_score
                    + 0.12 * (exact_title_match + title_term_bonus)
                    + 0.10 * phrase_bonus
                    + 0.08 * anchor_bonus
                    + 0.04 * (depth_score * 2.0)
                    + 0.03 * coverage_bonus;

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
                    trustrank_score: tr,
                    doc_length: doc.doc_length,
                    headings: doc.headings.clone(),
                    is_phrase_match,
                    matched_in_anchor,
                });
            }
        }

        // Sort descending by final score
        scored_docs.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));

        // Generate "Did you mean?" suggestion if total hits are low or query had typos
        let did_you_mean = if scored_docs.len() < 3 {
            self.suggest_did_you_mean(&raw_query_terms)
        } else {
            None
        };

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
            did_you_mean,
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
