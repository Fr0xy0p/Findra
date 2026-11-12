import React from 'react';
import { ExternalLink, Globe, Sparkles } from 'lucide-react';
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

  // Rich Knowledge Panel
  if (panel) {
    return (
      <aside className="w-80 p-5 rounded-2xl border border-slate-200 dark:border-[#2e3245] bg-white dark:bg-[#212330] shadow-sm hidden lg:block text-left sticky top-24 self-start">
        {/* Header & Source Badge */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-[#2e3245] mb-3.5">
          <div className="flex items-center space-x-1.5">
            <Sparkles className="w-4 h-4 text-[#fb542b]" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-[#9ea4b6]">
              Knowledge Graph
            </span>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-orange-50 dark:bg-[#fb542b]/15 text-[#fb542b] border border-orange-200 dark:border-[#fb542b]/30">
            Verified Entity
          </span>
        </div>

        {/* Thumbnail Image if available */}
        {panel.image_url && (
          <div className="mb-4 rounded-xl overflow-hidden bg-slate-50 dark:bg-[#191b26] border border-slate-100 dark:border-[#2e3245] flex items-center justify-center p-2 max-h-48">
            <img
              src={panel.image_url}
              alt={panel.title}
              className="max-h-44 object-contain rounded-lg"
              loading="lazy"
            />
          </div>
        )}

        {/* Entity Title & Subtitle */}
        <h3 className="text-xl font-bold text-slate-900 dark:text-[#f0f2f5] leading-tight mb-0.5">
          {panel.title}
        </h3>
        {panel.type && (
          <p className="text-xs font-semibold text-[#fb542b] mb-3">
            {panel.type}
          </p>
        )}

        {/* Entity Description */}
        {panel.description && (
          <p className="text-xs text-slate-600 dark:text-[#9ea4b6] leading-relaxed mb-4 line-clamp-4">
            {panel.description}
          </p>
        )}

        {/* Attributes Grid (CEO, Founders, Founded, etc.) */}
        {panel.attributes && Object.keys(panel.attributes).length > 0 && (
          <div className="bg-slate-50 dark:bg-[#191b26] p-3 rounded-xl mb-4 space-y-2 text-xs border border-slate-100 dark:border-[#2e3245]">
            {Object.entries(panel.attributes).map(([key, val]) => (
              <div key={key} className="flex justify-between items-start gap-2">
                <span className="text-slate-400 dark:text-[#71788e] font-medium">{key}</span>
                <span className="text-slate-800 dark:text-[#f0f2f5] font-semibold text-right max-w-[170px] truncate">
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
                className="flex-1 flex items-center justify-center py-2 px-3 text-xs font-semibold text-white bg-[#fb542b] hover:bg-[#e03e17] rounded-xl transition-colors cursor-pointer shadow-sm"
              >
                <Globe className="w-3.5 h-3.5 mr-1.5" />
                <span>Visit Official Website</span>
              </a>
              {onOpenInBrowser && (
                <button
                  onClick={() => onOpenInBrowser(panel.website!, panel.title)}
                  title="Preview inside Findra"
                  className="px-2.5 py-2 text-xs font-medium text-slate-700 dark:text-[#f0f2f5] bg-slate-100 dark:bg-[#2c3042] hover:bg-slate-200 dark:hover:bg-[#34384d] rounded-xl transition-colors flex items-center justify-center border border-slate-200 dark:border-[#2e3245] flex-shrink-0 cursor-pointer"
                >
                  <span className="hidden sm:inline mr-1">Preview</span>
                  <Globe className="w-3.5 h-3.5 text-[#fb542b]" />
                </button>
              )}
            </div>
          )}

          {panel.wikipedia_url && (
            <a
              href={panel.wikipedia_url}
              onClick={(e) => {
                if (onOpenInBrowser && !e.metaKey && !e.ctrlKey) {
                  e.preventDefault();
                  onOpenInBrowser(panel.wikipedia_url!, `${panel.title} - Wikipedia`);
                }
              }}
              className="w-full flex items-center justify-center py-2 px-3 text-xs font-medium text-slate-700 dark:text-[#f0f2f5] bg-slate-100 dark:bg-[#2c3042] hover:bg-slate-200 dark:hover:bg-[#34384d] rounded-xl transition-colors cursor-pointer border border-slate-200 dark:border-[#2e3245]"
            >
              <span>Read more on Wikipedia</span>
              <ExternalLink className="w-3 h-3 ml-1.5" />
            </a>
          )}
        </div>
      </aside>
    );
  }

  // Fallback: Smart Entity Card from Top Result
  if (!topResult) return null;

  return (
    <aside className="w-80 p-5 rounded-2xl border border-slate-200 dark:border-[#2e3245] bg-white dark:bg-[#212330] shadow-sm hidden lg:block text-left sticky top-24 self-start">
      <div className="flex items-center space-x-1.5 pb-2.5 border-b border-slate-100 dark:border-[#2e3245] mb-3">
        <Sparkles className="w-4 h-4 text-[#fb542b]" />
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-[#9ea4b6]">
          About Query
        </span>
      </div>

      <h3 className="text-lg font-bold text-slate-900 dark:text-[#f0f2f5] mb-1 truncate">
        {topResult.title || query}
      </h3>
      <p className="text-xs text-slate-500 dark:text-[#9ea4b6] mb-3 truncate">
        {topResult.domain}
      </p>

      <p className="text-xs text-slate-600 dark:text-[#9ea4b6] leading-relaxed mb-4 line-clamp-5">
        {topResult.snippet}
      </p>

      <div className="space-y-2">
        <a
          href={topResult.url}
          className="w-full flex items-center justify-center py-2 px-3 text-xs font-semibold text-white bg-[#fb542b] hover:bg-[#e03e17] rounded-xl transition-colors cursor-pointer shadow-sm"
        >
          <Globe className="w-3.5 h-3.5 mr-1.5" />
          <span>Visit Top Source</span>
        </a>
      </div>
    </aside>
  );
};
