use std::collections::HashSet;

pub struct SnippetGenerator;

impl SnippetGenerator {
    /// Extract a contextual ~160 character snippet from the document text
    /// centered around the most relevant match for the query terms.
    pub fn generate_snippet(full_text: &str, query_terms: &[String], max_len: usize) -> String {
        if full_text.is_empty() {
            return String::new();
        }

        let term_set: HashSet<String> = query_terms
            .iter()
            .map(|t| t.to_lowercase())
            .filter(|t| t.len() > 1)
            .collect();

        if term_set.is_empty() || full_text.len() <= max_len {
            let end = full_text.len().min(max_len);
            return full_text[..end].to_string();
        }

        // Split text into word boundaries
        let words: Vec<&str> = full_text.split_whitespace().collect();
        if words.is_empty() {
            return String::new();
        }

        let window_size = 28; // ~140-180 characters
        let mut best_start = 0;
        let mut best_score = -1;

        for start in 0..words.len() {
            let end = (start + window_size).min(words.len());
            let mut score = 0;
            let mut matched_unique = HashSet::new();

            for i in start..end {
                let clean_word = words[i].trim_matches(|c: char| !c.is_alphanumeric()).to_lowercase();
                for term in &term_set {
                    if clean_word.contains(term) || term.contains(&clean_word) {
                        score += 3;
                        matched_unique.insert(term.clone());
                    }
                }
            }

            score += (matched_unique.len() as i32) * 5;

            if score > best_score {
                best_score = score;
                best_start = start;
            }

            if end == words.len() {
                break;
            }
        }

        let end = (best_start + window_size).min(words.len());
        let mut snippet = words[best_start..end].join(" ");

        if best_start > 0 {
            snippet = format!("... {}", snippet);
        }
        if end < words.len() {
            snippet = format!("{} ...", snippet);
        }

        snippet
    }
}

