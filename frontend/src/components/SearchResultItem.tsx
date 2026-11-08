import React from 'react';
import { SearchResultItem as ResultType } from '../types';
import { ExternalLink, Globe, Award, Sparkles, Hash, ShieldCheck, Link, CheckCheck } from 'lucide-react';

interface Props {
  result: ResultType;
  query: string;
  onOpenInBrowser?: (url: string, title?: string) => void;
  inAppBrowserEnabled?: boolean;
}

export const SearchResultItem: React.FC<Props> = ({
  result,
  query,
  onOpenInBrowser,
  inAppBrowserEnabled = true,
}) => {
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

  const cleanQuery = query.toLowerCase().trim();
  const isOfficialSite = Boolean(
    (cleanQuery.length >= 3 && domain.toLowerCase().includes(cleanQuery)) ||
    result.title.toLowerCase().includes('official site')
  );

  const isEmbedRestricted = (urlStr: string): boolean => {
    try {
      const host = new URL(urlStr).hostname.toLowerCase();
      const restricted = [
        'youtube.com',
        'youtu.be',
        'google.com',
        'facebook.com',
        'twitter.com',
        'x.com',
        'instagram.com',
        'linkedin.com',
        'netflix.com',
        'accounts.google.com',
      ];
      return restricted.some((d) => host === d || host.endsWith('.' + d));
    } catch (e) {
      return false;
    }
  };

  const shouldOpenInNewTab = isEmbedRestricted(result.url) || !inAppBrowserEnabled;

  return (
    <article className="group mb-7 max-w-2xl text-left">
      {/* URL Breadcrumb & Favicon */}
      <div className="flex items-center space-x-2 text-xs text-slate-500 dark:text-slate-400 mb-1">
        <div className="w-4 h-4 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
          <Globe className="w-2.5 h-2.5 text-slate-600 dark:text-slate-300" />
        </div>
        <span className="font-medium text-slate-700 dark:text-slate-300">{domain}</span>
        {pathBreadcrumb && <span className="truncate">{pathBreadcrumb}</span>}
        {isOfficialSite && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
            <CheckCheck className="w-3 h-3 mr-1 text-blue-600 dark:text-blue-400" />
            Official Site
          </span>
        )}
      </div>

      {/* Clickable Title & Actions */}
      <div className="flex items-start justify-between gap-3 mb-1">
        <h2 className="text-xl font-normal leading-normal">
          <a
            href={result.url}
            target={shouldOpenInNewTab ? '_blank' : undefined}
            rel={shouldOpenInNewTab ? 'noopener noreferrer' : undefined}
            onClick={(e) => {
              if (shouldOpenInNewTab) {
                // Let browser open native tab directly
                return;
              }
              if (inAppBrowserEnabled && onOpenInBrowser && !e.metaKey && !e.ctrlKey) {
                e.preventDefault();
                onOpenInBrowser(result.url, result.title);
              }
            }}
            className="text-[#1a0dab] dark:text-[#8ab4f8] hover:underline visited:text-[#681da8] dark:visited:text-[#c58af9] cursor-pointer inline"
          >
            {result.title || result.url}
          </a>
        </h2>

        {/* Quick Action Buttons */}
        <div className="flex items-center space-x-1.5 flex-shrink-0 pt-1">
          {onOpenInBrowser && (
            <button
              onClick={() => onOpenInBrowser(result.url, result.title)}
              title="Open inside Findra Browser"
              className="px-2 py-0.5 rounded-md text-[11px] font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/60 border border-blue-200 dark:border-blue-800 transition-colors flex items-center space-x-1 cursor-pointer"
            >
              <Globe className="w-3 h-3" />
              <span className="hidden sm:inline">Open in Findra</span>
            </button>
          )}
          <a
            href={result.url}
            target="_blank"
            rel="noopener noreferrer"
            title="Open directly in external browser tab"
            className="px-2 py-0.5 rounded-md text-[11px] font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition-colors flex items-center space-x-1"
          >
            <ExternalLink className="w-3 h-3" />
            <span className="hidden sm:inline">Open in Tab</span>
          </a>
        </div>
      </div>

      {/* Snippet with Term Highlighting */}
      <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-2">
        {renderHighlightedSnippet(result.snippet, query)}
      </p>

      {/* Signals / Metadata tags: PageRank, TrustRank, BM25, Anchor Text, Phrase */}
      <div className="flex items-center flex-wrap gap-2 text-[11px] text-slate-500 dark:text-slate-400">
        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900">
          <Award className="w-3 h-3 mr-1 text-blue-600" />
          PageRank: {formattedPr}%
        </span>

        {result.trustrank_score !== undefined && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-900">
            <ShieldCheck className="w-3 h-3 mr-1 text-violet-600" />
            TrustRank: {(result.trustrank_score * 100).toFixed(1)}%
          </span>
        )}

        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900">
          <Sparkles className="w-3 h-3 mr-1 text-emerald-600" />
          BM25: {result.bm25_score.toFixed(2)}
        </span>

        {result.is_phrase_match && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900 font-medium">
            <CheckCheck className="w-3 h-3 mr-1 text-amber-600" />
            Exact Phrase
          </span>
        )}

        {result.matched_in_anchor && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-900 font-medium">
            <Link className="w-3 h-3 mr-1 text-cyan-600" />
            Backlink Anchor Match
          </span>
        )}

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

