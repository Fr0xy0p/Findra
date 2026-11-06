mod compressor;
mod inverted_index;
mod snippet;
mod stemmer;
mod api;

use std::sync::Arc;
use inverted_index::InvertedIndex;
use api::ApiServer;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut docs_path = "data/parsed/documents.jsonl".to_string();
    let mut pagerank_path = "data/parsed/pagerank_scores.json".to_string();
    let mut port = 8081;

    let args: Vec<String> = std::env::args().collect();
    let mut i = 1;
    while i < args.len() {
        match args[i].as_str() {
            "--docs" => {
                if i + 1 < args.len() {
                    docs_path = args[i + 1].clone();
                    i += 1;
                }
            }
            "--pagerank" => {
                if i + 1 < args.len() {
                    pagerank_path = args[i + 1].clone();
                    i += 1;
                }
            }
            "--port" => {
                if i + 1 < args.len() {
                    port = args[i + 1].parse::<u16>().unwrap_or(8081);
                    i += 1;
                }
            }
            _ => {}
        }
        i += 1;
    }

    println!("==================================================");
    println!("🦀 NEXUS HIGH-PERFORMANCE INVERTED INDEX ENGINE (Rust)");
    println!("   Docs: {}", docs_path);
    println!("   PageRank: {}", pagerank_path);
    println!("   Port: {}", port);
    println!("==================================================");

    // Build or load index
    let index = match InvertedIndex::build_from_files(&docs_path, &pagerank_path) {
        Ok(idx) => idx,
        Err(e) => {
            eprintln!("[-] Note: Could not load index files yet ({}). Starting in empty standby mode.", e);
            InvertedIndex::new()
        }
    };

    let server = ApiServer::new(Arc::new(index), port);
    server.start()?;

    Ok(())
}

