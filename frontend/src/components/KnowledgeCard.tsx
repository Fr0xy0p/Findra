import React from 'react';
import { BookOpen, ExternalLink, Globe, CheckCircle2, Sparkles } from 'lucide-react';
import { KnowledgePanel, SearchResultItem } from '../types';

interface Props {
  panel?: KnowledgePanel;
  topResult?: SearchResultItem;
  query: string;
  onOpenInBrowser?: (url: string, title?: string) => void;
}

export const KnowledgeCard: React.FC<Props> = ({
  panel,
  topResult,
  query,
  onOpenInBrowser,
}) => {
  if (!panel && !topResult) return null;

  // If a rich Google/Whoogle Knowledge Panel is present
  if (panel) {
    return (
      <aside className="w-80 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1a1a1e] shadow-sm hidden lg:block text-left sticky top-24 self-start">
        {/* Header & Source Badge */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800/80 mb-3.5">
          <div className="flex items-center space-x-1.5">
            <Sparkles className="w-4 h-4 text-violet-600 dark:text-violet-400" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Knowledge Graph
            </span>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800">
            Verified Entity
          </span>
        </div>

        {/* Thumbnail Image if available */}
        {panel.image_url && (
          <div className="mb-4 rounded-xl overflow-hidden bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 flex items-center justify-center p-2 max-h-48">
            <img
              src={panel.image_url}
              alt={panel.title}
              className="max-h-44 object-contain rounded-lg"
              loading="lazy"
            />
          </div>
        )}

        {/* Entity Title & Subtitle */}
        <h3 className="text-xl font-extrabold text-slate-900 dark:text-slate-100 leading-tight mb-0.5">
          {panel.title}
        </h3>
        {panel.type && (
          <p className="text-xs font-semibold text-violet-700 dark:text-violet-400 mb-3">
            {panel.type}
          </p>
        )}

        {/* Entity Description */}
        {panel.description && (
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed mb-4 line-clamp-4">
            {panel.description}
          </p>
        )}

        {/* Attributes Grid (CEO, Founders, Founded, etc.) */}
        {panel.attributes && Object.keys(panel.attributes).length > 0 && (
          <div className="bg-slate-50 dark:bg-[#222228] p-3 rounded-xl mb-4 space-y-2 text-xs border border-slate-100 dark:border-slate-800/60">
            {Object.entries(panel.attributes).map(([key, val]) => (
              <div key={key} className="flex justify-between items-start gap-2">
                <span className="text-slate-400 dark:text-slate-500 font-medium">{key}</span>
                <span className="text-slate-800 dark:text-slate-200 font-semibold text-right max-w-[170px] truncate">
                  {val}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Action Buttons */}
        <div className="space-y-2">
          {panel.website && (
            <div className="flex items-center gap-1.5 w-full">
              <a
                href={panel.website}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center py-2 px-3 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors cursor-pointer shadow-sm"
              >
                <Globe className="w-3.5 h-3.5 mr-1.5" />
                <span>Visit Official Website ↗</span>
              </a>
              {onOpenInBrowser && (
                <button
                  onClick={() => onOpenInBrowser(panel.website!, panel.title)}
                  title="Preview inside Findra"
                  className="px-2.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors flex items-center justify-center border border-slate-200 dark:border-slate-700 flex-shrink-0 cursor-pointer"
                >
                  <span className="hidden sm:inline mr-1">Preview</span>
                  <Globe className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                </button>
              )}
            </div>
          )}

          {panel.wikipedia_url && (
            <div className="flex items-center gap-1.5 w-full">
              <a
                href={panel.wikipedia_url}
                onClick={(e) => {
                  if (onOpenInBrowser && !e.metaKey && !e.ctrlKey) {
                    e.preventDefault();
                    onOpenInBrowser(panel.wikipedia_url!, panel.title + ' (Wikipedia)');
                  }
                }}
                className="flex-1 flex items-center justify-center py-1.5 px-3 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors cursor-pointer"
              >
                <BookOpen className="w-3.5 h-3.5 mr-1.5" />
                <span>Read on Wikipedia</span>
              </a>
              <a
                href={panel.wikipedia_url}
                target="_blank"
                rel="noopener noreferrer"
                title="Open Wikipedia in external browser tab"
                className="p-1.5 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors flex items-center justify-center"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          )}
        </div>
      </aside>
    );
  }

  // Fallback to top result authority signals
  if (!topResult) return null;

  return (
    <aside className="w-80 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1a1a1d] shadow-sm hidden lg:block text-left sticky top-24 self-start">
      <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 mb-4">
        <div className="flex items-center space-x-2">
          <BookOpen className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Knowledge Overview
          </span>
        </div>
        <span className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center font-medium">
          <CheckCircle2 className="w-3 h-3 mr-1" />
          Verified Index
        </span>
      </div>

      <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-2">
        {topResult.title}
      </h3>

      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed mb-4 line-clamp-6">
        {topResult.snippet}
      </p>

      <div className="bg-slate-50 dark:bg-[#222226] p-3 rounded-xl mb-4 space-y-1.5 text-xs">
        <div className="flex justify-between">
          <span className="text-slate-400">Authority Rank</span>
          <span className="font-semibold text-blue-600 dark:text-blue-400">
            {(topResult.pagerank_score * 100).toFixed(1)}%
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">Relevance (BM25)</span>
          <span className="font-semibold text-slate-700 dark:text-slate-200">
            {topResult.bm25_score.toFixed(2)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">Source Domain</span>
          <span className="font-medium text-slate-600 dark:text-slate-300 truncate max-w-[140px]">
            {topResult.domain}
          </span>
        </div>
      </div>

      <a
        href={topResult.url}
        onClick={(e) => {
          if (onOpenInBrowser && !e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            onOpenInBrowser(topResult.url, topResult.title);
          }
        }}
        className="w-full flex items-center justify-center py-2 px-3 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors cursor-pointer"
      >
        <span>Open in Findra</span>
        <ExternalLink className="w-3 h-3 ml-1.5" />
      </a>
    </aside>
  );
};
