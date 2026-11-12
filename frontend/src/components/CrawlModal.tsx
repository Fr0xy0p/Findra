import React, { useState } from 'react';
import { X, Globe, Bot, Play, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCrawlSuccess: () => void;
}

export const CrawlModal: React.FC<Props> = ({ isOpen, onClose, onCrawlSuccess }) => {
  const [seeds, setSeeds] = useState('https://en.wikipedia.org/wiki/Search_engine\nhttps://developer.mozilla.org');
  const [maxPages, setMaxPages] = useState(25);
  const [politenessDelay, setPolitenessDelay] = useState(500);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleStartCrawl = async () => {
    setLoading(true);
    setError(null);
    setStatusMessage('Polite Go crawler dispatched with Goroutines & robots.txt verification...');

    const seedList = seeds
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    try {
      const res = await fetch('/api/crawl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seeds: seedList,
          max_pages: maxPages,
          politeness_delay_ms: politenessDelay
        })
      });

      if (!res.ok) {
        throw new Error(`Crawl request failed: ${res.statusText}`);
      }

      const data = await res.json();
      setStatusMessage(`Successfully crawled ${data.crawled_count || maxPages} pages! Index refreshed.`);
      setTimeout(() => {
        onCrawlSuccess();
        onClose();
      }, 1800);
    } catch (err: any) {
      setError(err.message || 'Crawl failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-[#212330] border border-slate-200 dark:border-[#2e3245] rounded-3xl max-w-lg w-full p-6 shadow-2xl relative text-left">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-1 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-[#f0f2f5] hover:bg-slate-100 dark:hover:bg-[#2e3245] transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center space-x-3 mb-5">
          <div className="p-2.5 rounded-2xl bg-orange-50 dark:bg-[#fb542b]/15 text-[#fb542b] border border-orange-200 dark:border-[#fb542b]/30">
            <Bot className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-[#f0f2f5]">
              Live Web Crawler & Indexer
            </h3>
            <p className="text-xs text-slate-500 dark:text-[#9ea4b6]">
              Goroutine-powered polite crawler with robots.txt adherence
            </p>
          </div>
        </div>

        <div className="space-y-4 text-sm">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-[#f0f2f5] mb-1.5">
              Seed URLs (one per line)
            </label>
            <textarea
              rows={4}
              value={seeds}
              onChange={(e) => setSeeds(e.target.value)}
              className="w-full p-3 rounded-xl border border-slate-200 dark:border-[#2e3245] bg-slate-50 dark:bg-[#191b26] text-slate-800 dark:text-[#f0f2f5] font-mono text-xs focus:ring-2 focus:ring-[#fb542b]/30 focus:border-[#fb542b] outline-none"
              placeholder="https://example.com"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-[#9ea4b6] mb-1">
                Max Pages to Fetch
              </label>
              <input
                type="number"
                value={maxPages}
                onChange={(e) => setMaxPages(Number(e.target.value))}
                min={1}
                max={500}
                className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-[#2e3245] bg-slate-50 dark:bg-[#191b26] text-xs outline-none focus:border-[#fb542b]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-[#9ea4b6] mb-1">
                Politeness Delay (ms)
              </label>
              <input
                type="number"
                value={politenessDelay}
                onChange={(e) => setPolitenessDelay(Number(e.target.value))}
                min={100}
                max={3000}
                className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-[#2e3245] bg-slate-50 dark:bg-[#191b26] text-xs outline-none focus:border-[#fb542b]"
              />
            </div>
          </div>

          {statusMessage && (
            <div className="p-3 rounded-xl bg-orange-50 dark:bg-[#fb542b]/15 text-[#fb542b] text-xs flex items-center border border-orange-200 dark:border-[#fb542b]/30">
              <RefreshCw className="w-4 h-4 mr-2 animate-spin flex-shrink-0" />
              <span>{statusMessage}</span>
            </div>
          )}

          {error && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-xs flex items-center border border-red-200 dark:border-red-900">
              <AlertCircle className="w-4 h-4 mr-2 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-[#9ea4b6] hover:bg-slate-100 dark:hover:bg-[#2e3245] transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleStartCrawl}
            disabled={loading}
            className="px-5 py-2.5 rounded-xl text-xs font-semibold text-white bg-[#fb542b] hover:bg-[#e03e17] active:bg-[#c9330e] disabled:opacity-50 flex items-center space-x-1.5 transition-colors shadow-sm cursor-pointer"
          >
            {loading ? (
              <RefreshCw className="w-4 h-4 animate-spin mr-1" />
            ) : (
              <Play className="w-3.5 h-3.5 mr-1" />
            )}
            <span>{loading ? 'Crawling...' : 'Launch Crawler'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

