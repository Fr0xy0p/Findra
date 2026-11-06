export interface SearchResultItem {
  doc_id: number;
  url: string;
  domain: string;
  title: string;
  snippet: string;
  score: number;
  bm25_score: number;
  pagerank_score: number;
  trustrank_score?: number;
  doc_length: number;
  crawled_at?: string;
  headings?: string[];
  is_phrase_match?: boolean;
  matched_in_anchor?: boolean;
}

export interface InstantAnswer {
  type: string;
  title: string;
  subtitle?: string;
  description?: string;
  badge?: string;
  source_url?: string;
  source_title?: string;
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
  instant_answer?: InstantAnswer;
  is_live_discovered?: boolean;
  source_notice?: string;
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

