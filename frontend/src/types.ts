export interface SearchResultItem {
  doc_id: number;
  url: string;
  domain: string;
  title: string;
  snippet: string;
  score: number;
  bm25_score: number;
  pagerank_score: number;
  doc_length: number;
  crawled_at?: string;
  headings?: string[];
}

export interface SearchResponse {
  query: string;
  total_hits: number;
  took_ms: number;
  page: number;
  page_size: number;
  total_pages: number;
  results: SearchResultItem[];
  did_you_mean?: string;
}

export interface EngineStats {
  total_documents: number;
  total_terms: number;
  avg_doc_length: number;
  index_status: string;
  uptime_seconds: number;
  cache_hit_rate: number;
}

export interface SuggestResponse {
  query: string;
  suggestions: string[];
}

