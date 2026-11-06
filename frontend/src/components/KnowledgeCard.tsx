import React from 'react';
import { BookOpen, ExternalLink, Info, CheckCircle2 } from 'lucide-react';
import { SearchResultItem } from '../types';

interface Props {
  topResult?: SearchResultItem;
  query: string;
}

export const KnowledgeCard: React.FC<Props> = ({ topResult, query }) => {
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
        target="_blank"
        rel="noopener noreferrer"
        className="w-full flex items-center justify-center py-2 px-3 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
      >
        <span>Read full source</span>
        <ExternalLink className="w-3 h-3 ml-1.5" />
      </a>
    </aside>
  );
};

