import React from 'react';
import { SearchResultItem as ResultType } from '../types';
import { ExternalLink, Globe, Award, Sparkles, Hash } from 'lucide-react';

interface Props {
  result: ResultType;
  query: string;
}

export const SearchResultItem: React.FC<Props> = ({ result, query }) => {
  // Extract domain and clean path for breadcrumb
  let domain = result.domain || '';
  let pathBreadcrumb = '';
  try {
    const urlObj = new URL(result.url);
    domain = urlObj.hostname;
    const paths = urlObj.pathname.split('/').filter(Boolean);
    if (paths.length > 0) {
      pathBreadcrumb = ' > ' + paths.slice(0, 2).join(' > ');
    }
  } catch (e) {
    domain = result.url;
  }

  // Highlight snippet terms that match the query
  const renderHighlightedSnippet = (snippet: string, searchQuery: string) => {
    if (!searchQuery) return snippet;
    const terms = searchQuery
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 1)
      .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

    if (terms.length === 0) return snippet;

    const regex = new RegExp(`(${terms.join('|')})`, 'gi');
    const parts = snippet.split(regex);

    return parts.map((part, idx) => {
      const isMatch = terms.some((t) => t.toLowerCase() === part.toLowerCase());
      if (isMatch) {
        return (
          <mark
            key={idx}
            className="bg-amber-100 dark:bg-amber-900/40 text-amber-950 dark:text-amber-200 font-semibold px-0.5 rounded"
          >
            {part}
          </mark>
        );
      }
      return <span key={idx}>{part}</span>;
    });
  };

  const formattedPr = (result.pagerank_score * 100).toFixed(1);

  return (
    <article className="group mb-7 max-w-2xl text-left">
      {/* URL Breadcrumb & Favicon */}
      <div className="flex items-center space-x-2 text-xs text-slate-500 dark:text-slate-400 mb-1">
        <div className="w-4 h-4 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
          <Globe className="w-2.5 h-2.5 text-slate-600 dark:text-slate-300" />
        </div>
        <span className="font-medium text-slate-700 dark:text-slate-300">{domain}</span>
        {pathBreadcrumb && <span className="truncate">{pathBreadcrumb}</span>}
      </div>

      {/* Clickable Title */}
      <h2 className="text-xl font-normal leading-normal mb-1">
        <a
          href={result.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#1a0dab] dark:text-[#8ab4f8] hover:underline visited:text-[#681da8] dark:visited:text-[#c58af9] flex items-center inline"
        >
          {result.title || result.url}
        </a>
      </h2>

      {/* Snippet with Term Highlighting */}
      <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-2">
        {renderHighlightedSnippet(result.snippet, query)}
      </p>

      {/* Signals / Metadata tags: PageRank, BM25, Length */}
      <div className="flex items-center flex-wrap gap-2 text-[11px] text-slate-500 dark:text-slate-400">
        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900">
          <Award className="w-3 h-3 mr-1 text-blue-600" />
          PageRank: {formattedPr}%
        </span>
        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900">
          <Sparkles className="w-3 h-3 mr-1 text-emerald-600" />
          BM25: {result.bm25_score.toFixed(2)}
        </span>
        <span className="text-slate-400 dark:text-slate-500">
          {result.doc_length} tokens
        </span>
      </div>

      {/* Headings Pills if available */}
      {result.headings && result.headings.length > 0 && (
        <div className="flex items-center gap-1.5 mt-2 overflow-x-auto py-1">
          {result.headings.slice(0, 3).map((h, i) => (
            <span
              key={i}
              className="text-[11px] text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/80 px-2 py-0.5 rounded flex items-center whitespace-nowrap"
            >
              <Hash className="w-2.5 h-2.5 mr-0.5 text-slate-400" />
              {h}
            </span>
          ))}
        </div>
      )}
    </article>
  );
};

