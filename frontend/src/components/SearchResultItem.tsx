import React from 'react';
import { SearchResultItem as ResultType } from '../types';
import { ExternalLink, Globe, Award, Sparkles, Hash, ShieldCheck, Link as LinkIcon, CheckCheck } from 'lucide-react';

interface Props {
  result: ResultType;
  query: string;
}

export const SearchResultItem: React.FC<Props> = ({
  result,
  query,
}) => {
  // Extract domain and clean path for breadcrumb
  let domain = result.domain || '';
  let pathBreadcrumb = '';
  try {
    const urlObj = new URL(result.url);
    domain = urlObj.hostname;
    const paths = urlObj.pathname.split('/').filter(Boolean);
    if (paths.length > 0) {
      pathBreadcrumb = ' › ' + paths.slice(0, 2).join(' › ');
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
            className="bg-[#fb542b]/20 dark:bg-[#fb542b]/30 text-slate-900 dark:text-white font-semibold px-0.5 rounded"
          >
            {part}
          </mark>
        );
      }
      return <span key={idx}>{part}</span>;
    });
  };

  const formattedPr = (result.pagerank_score * 100).toFixed(1);

  const cleanQuery = query.toLowerCase().trim();
  const isOfficialSite = Boolean(
    (cleanQuery.length >= 3 && domain.toLowerCase().includes(cleanQuery)) ||
    result.title.toLowerCase().includes('official site')
  );

  return (
    <article className="group mb-6 p-4 sm:p-5 rounded-2xl bg-transparent hover:bg-slate-50 dark:hover:bg-[#212330]/70 border border-transparent hover:border-slate-200 dark:hover:border-[#2e3245] transition-all duration-150 max-w-2xl text-left">
      {/* Brave Breadcrumb Header */}
      <div className="flex items-center space-x-2 text-xs text-slate-500 dark:text-[#9ea4b6] mb-1.5 flex-wrap">
        <div className="w-4 h-4 rounded-full bg-slate-100 dark:bg-[#2e3245] flex items-center justify-center flex-shrink-0">
          <Globe className="w-2.5 h-2.5 text-slate-500 dark:text-[#9ea4b6]" />
        </div>
        <span className="font-medium text-slate-700 dark:text-[#d1d5db]">{domain}</span>
        {pathBreadcrumb && <span className="truncate max-w-[200px] text-slate-400 dark:text-[#71788e]">{pathBreadcrumb}</span>}

        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60 ml-auto">
          <ShieldCheck className="w-3 h-3 mr-1 text-emerald-600 dark:text-emerald-400" />
          <span>Ad-Free</span>
        </span>

        {isOfficialSite && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-orange-50 dark:bg-[#fb542b]/15 text-[#fb542b] border border-orange-200 dark:border-[#fb542b]/30">
            <CheckCheck className="w-3 h-3 mr-1" />
            Official Site
          </span>
        )}
      </div>

      {/* Brave Title Link: Direct navigation to the destination website */}
      <div className="flex items-start justify-between gap-3 mb-1.5">
        <h2 className="text-lg sm:text-xl font-semibold leading-snug">
          <a
            href={result.url}
            className="text-[#1a0dab] dark:text-[#7c9bf8] hover:underline cursor-pointer inline transition-colors"
          >
            {result.title || result.url}
          </a>
        </h2>

        <a
          href={result.url}
          title="Open site directly"
          className="p-1 rounded-md text-slate-400 hover:text-slate-800 dark:text-[#9ea4b6] dark:hover:text-[#f0f2f5] hover:bg-slate-100 dark:hover:bg-[#2e3245] transition-colors flex-shrink-0"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>

      {/* Snippet with Term Highlighting */}
      <p className="text-sm text-slate-600 dark:text-[#9ea4b6] leading-relaxed mb-3">
        {renderHighlightedSnippet(result.snippet, query)}
      </p>

      {/* Signals / Metadata tags in Brave dark pills */}
      <div className="flex items-center flex-wrap gap-2 text-[11px] text-slate-500 dark:text-[#9ea4b6]">
        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-100 dark:bg-[#212330] text-slate-700 dark:text-[#d1d5db] border border-slate-200 dark:border-[#2e3245]">
          <Award className="w-3 h-3 mr-1 text-[#fb542b]" />
          PageRank: {formattedPr}%
        </span>

        {result.trustrank_score !== undefined && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-100 dark:bg-[#212330] text-slate-700 dark:text-[#d1d5db] border border-slate-200 dark:border-[#2e3245]">
            <ShieldCheck className="w-3 h-3 mr-1 text-emerald-500" />
            TrustRank: {(result.trustrank_score * 100).toFixed(1)}%
          </span>
        )}

        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-100 dark:bg-[#212330] text-slate-700 dark:text-[#d1d5db] border border-slate-200 dark:border-[#2e3245]">
          <Sparkles className="w-3 h-3 mr-1 text-amber-500" />
          BM25: {result.bm25_score.toFixed(2)}
        </span>

        {result.is_phrase_match && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-orange-50 dark:bg-[#fb542b]/15 text-[#fb542b] border border-orange-200 dark:border-[#fb542b]/30 font-medium">
            <CheckCheck className="w-3 h-3 mr-1" />
            Exact Match
          </span>
        )}

        {result.matched_in_anchor && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-100 dark:bg-[#212330] text-slate-700 dark:text-[#d1d5db] border border-slate-200 dark:border-[#2e3245]">
            <LinkIcon className="w-3 h-3 mr-1 text-cyan-500" />
            Anchor Match
          </span>
        )}

        <span className="text-slate-400 dark:text-[#71788e]">
          {result.doc_length} tokens
        </span>
      </div>

      {/* Headings Pills */}
      {result.headings && result.headings.length > 0 && (
        <div className="flex items-center gap-1.5 mt-2.5 overflow-x-auto py-1">
          {result.headings.slice(0, 3).map((h, i) => (
            <span
              key={i}
              className="text-[11px] text-slate-500 dark:text-[#9ea4b6] bg-slate-100 dark:bg-[#212330] px-2 py-0.5 rounded-lg border border-slate-200 dark:border-[#2e3245] flex items-center whitespace-nowrap"
            >
              <Hash className="w-2.5 h-2.5 mr-0.5 text-slate-400 dark:text-[#71788e]" />
              {h}
            </span>
          ))}
        </div>
      )}
    </article>
  );
};
