use tiny_http::{Server, Response, Header, Method};
use std::sync::{Arc, RwLock};
use url::Url;
use crate::inverted_index::InvertedIndex;

pub struct ApiServer {
    index: Arc<RwLock<InvertedIndex>>,
    docs_path: String,
    pagerank_path: String,
    port: u16,
}

impl ApiServer {
    pub fn new(
        index: Arc<RwLock<InvertedIndex>>,
        docs_path: String,
        pagerank_path: String,
        port: u16,
    ) -> Self {
        Self {
            index,
            docs_path,
            pagerank_path,
            port,
        }
    }

    pub fn start(&self) -> Result<(), Box<dyn std::error::Error>> {
        let addr = format!("0.0.0.0:{}", self.port);
        let server = Server::http(&addr).map_err(|e| format!("Failed to bind to {}: {}", addr, e))?;
        println!("🦀 [Rust Index Engine] Listening on http://{}", addr);

        let cors_header = Header::from_bytes(&b"Access-Control-Allow-Origin"[..], &b"*"[..]).unwrap();
        let content_type = Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..]).unwrap();

        for request in server.incoming_requests() {
            let url_str = format!("http://localhost{}", request.url());
            let parsed_url = match Url::parse(&url_str) {
                Ok(u) => u,
                Err(_) => {
                    let resp = Response::from_string("{\"error\":\"Invalid URL\"}")
                        .with_header(content_type.clone())
                        .with_status_code(400);
                    let _ = request.respond(resp);
                    continue;
                }
            };

            let path = parsed_url.path();

            match (request.method(), path) {
                (&Method::Get, "/search") => {
                    let mut query = String::new();
                    let mut page = 1;
                    let mut limit = 10;

                    for (k, v) in parsed_url.query_pairs() {
                        if k == "q" {
                            query = v.to_string();
                        } else if k == "page" {
                            page = v.parse::<usize>().unwrap_or(1);
                        } else if k == "limit" {
                            limit = v.parse::<usize>().unwrap_or(10);
                        }
                    }

                    let search_res = self.index.read().unwrap().search(&query, page, limit);
                    let json_body = serde_json::to_string(&search_res).unwrap_or_else(|_| "{}".to_string());

                    let resp = Response::from_string(json_body)
                        .with_header(cors_header.clone())
                        .with_header(content_type.clone())
                        .with_status_code(200);
                    let _ = request.respond(resp);
                }

                (&Method::Get, "/suggest") => {
                    let mut query = String::new();
                    for (k, v) in parsed_url.query_pairs() {
                        if k == "q" {
                            query = v.to_string();
                        }
                    }

                    let suggestions = self.index.read().unwrap().suggest(&query, 8);
                    let resp_obj = serde_json::json!({
                        "query": query,
                        "suggestions": suggestions
                    });

                    let resp = Response::from_string(resp_obj.to_string())
                        .with_header(cors_header.clone())
                        .with_header(content_type.clone())
                        .with_status_code(200);
                    let _ = request.respond(resp);
                }

                (&Method::Get, "/stats") => {
                    let idx = self.index.read().unwrap();
                    let stats = serde_json::json!({
                        "total_documents": idx.doc_count,
                        "total_terms": idx.lexicon.len(),
                        "avg_doc_length": (idx.avg_doc_len * 100.0).round() / 100.0,
                        "index_status": "ONLINE",
                        "engine": "Rust Inverted Index (BM25 + PageRank)"
                    });

                    let resp = Response::from_string(stats.to_string())
                        .with_header(cors_header.clone())
                        .with_header(content_type.clone())
                        .with_status_code(200);
                    let _ = request.respond(resp);
                }

                (&Method::Get, "/reload") | (&Method::Post, "/reload") => {
                    println!("🦀 [Rust Index Engine] Reloading index from {}...", self.docs_path);
                    match InvertedIndex::build_from_files(&self.docs_path, &self.pagerank_path) {
                        Ok(new_index) => {
                            let doc_count = new_index.doc_count;
                            let term_count = new_index.lexicon.len();
                            {
                                let mut write_guard = self.index.write().unwrap();
                                *write_guard = new_index;
                            }
                            println!("🦀 [Rust Index Engine] Successfully reloaded! Docs: {}, Terms: {}", doc_count, term_count);
                            let resp_obj = serde_json::json!({
                                "status": "ok",
                                "reloaded": true,
                                "total_documents": doc_count,
                                "total_terms": term_count
                            });
                            let resp = Response::from_string(resp_obj.to_string())
                                .with_header(cors_header.clone())
                                .with_header(content_type.clone())
                                .with_status_code(200);
                            let _ = request.respond(resp);
                        }
                        Err(e) => {
                            eprintln!("[-] Error reloading index: {}", e);
                            let resp_obj = serde_json::json!({
                                "status": "error",
                                "message": format!("Reload failed: {}", e)
                            });
                            let resp = Response::from_string(resp_obj.to_string())
                                .with_header(cors_header.clone())
                                .with_header(content_type.clone())
                                .with_status_code(500);
                            let _ = request.respond(resp);
                        }
                    }
                }

                _ => {
                    let resp = Response::from_string("{\"error\":\"Not Found\"}")
                        .with_header(cors_header.clone())
                        .with_header(content_type.clone())
                        .with_status_code(404);
                    let _ = request.respond(resp);
                }
            }
        }

        Ok(())
    }
}

