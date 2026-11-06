import React, { useState, useEffect } from 'react';
import { SearchBar } from './components/SearchBar';
import { SearchResultItem } from './components/SearchResultItem';
import { KnowledgeCard } from './components/KnowledgeCard';
import { InstantAnswerCard } from './components/InstantAnswerCard';
import { Pagination } from './components/Pagination';
import { CrawlModal } from './components/CrawlModal';
import { EmbeddedBrowser } from './components/EmbeddedBrowser';
import { SearchResponse, EngineStats } from './types';
import {
  Search,
  Moon,
  Sun,
  ShieldCheck,
  Bot,
  Zap,
  Cpu,
  Layers,
  Sparkles,
  ExternalLink,
  SlidersHorizontal,
  Compass,
  Code2,
  ArrowLeft,
  Globe
} from 'lucide-react';

const getInitialUrlState = () => {
  if (typeof window === 'undefined') return { q: '', page: 1, tab: 'all' as const };
  const params = new URLSearchParams(window.location.search);
  const q = params.get('q') || '';
  const page = parseInt(params.get('page') || '1', 10);
  const rawTab = params.get('tab');
  const tab = (rawTab === 'tech' || rawTab === 'docs' || rawTab === 'news' ? rawTab : 'all') as 'all' | 'tech' | 'docs' | 'news';
  return { q, page, tab };
};

export const App: React.FC = () => {
  const initialUrlState = getInitialUrlState();
  const isSearchPath = typeof window !== 'undefined' && window.location.pathname.startsWith('/search') && Boolean(initialUrlState.q);

  const [query, setQuery] = useState(initialUrlState.q);
  const [searchResponse, setSearchResponse] = useState<SearchResponse | null>(null);
  const [stats, setStats] = useState<EngineStats | null>(null);
  const [loading, setLoading] = useState(isSearchPath);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isCrawlModalOpen, setIsCrawlModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'tech' | 'docs' | 'news'>(initialUrlState.tab);

  // In-App Browser State
  const [inAppBrowserUrl, setInAppBrowserUrl] = useState<string | null>(null);
  const [inAppBrowserTitle, setInAppBrowserTitle] = useState<string | null>(null);
  const [inAppBrowserEnabled, setInAppBrowserEnabled] = useState(true);
  const [isSplitView, setIsSplitView] = useState(false);

  const openInBrowser = (url: string, title?: string) => {
    setInAppBrowserUrl(url);
    setInAppBrowserTitle(title || url);
  };

  const closeBrowser = () => {
    setInAppBrowserUrl(null);
    setInAppBrowserTitle(null);
  };

  const toggleSplitView = () => {
    setIsSplitView((prev) => !prev);
  };

  // Sync dark mode class with HTML element
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  // Fetch engine stats on initial load
  const fetchStats = async () => {
    try {
      const res = await fetch('/api/stats');
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (e) {
      // stats optional
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  // Handle Search Execution
  const executeSearch = async (
    searchQuery: string,
    page: number = 1,
    tab: 'all' | 'tech' | 'docs' | 'news' = activeTab,
    updateUrl: boolean = true
  ) => {
    const trimmed = searchQuery.trim();
    if (!trimmed) return;
    setLoading(true);
    setQuery(trimmed);
    document.title = `${trimmed} - Findra Search`;

    if (updateUrl) {
      const tabParam = tab !== 'all' ? `&tab=${tab}` : '';
      const newUrl = `/search?q=${encodeURIComponent(trimmed)}&page=${page}${tabParam}`;
      if (window.location.pathname + window.location.search !== newUrl) {
        window.history.pushState({ q: trimmed, page, tab }, '', newUrl);
      }
    }

    try {
      const res = await fetch(
        `/api/search?q=${encodeURIComponent(trimmed)}&page=${page}&limit=10&tab=${tab}`
      );
      if (res.ok) {
        const data: SearchResponse = await res.json();
        setSearchResponse(data);
      } else {
        setSearchResponse(null);
      }
    } catch (err) {
      console.error('Search failed', err);
    } finally {
      setLoading(false);
    }
  };

  // Navigate back to Home and update URL to "/"
  const navigateToHome = () => {
    setSearchResponse(null);
    setQuery('');
    setLoading(false);
    document.title = 'Findra Search - Fast, Private, Polite Web Index';
    if (window.location.pathname !== '/' || window.location.search) {
      window.history.pushState({}, '', '/');
    }
  };

  // Listen to browser Back and Forward button navigation (popstate)
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const urlQ = params.get('q');
      const urlPage = parseInt(params.get('page') || '1', 10);
      const urlTab = (params.get('tab') as 'all' | 'tech' | 'docs' | 'news') || 'all';

      if (urlQ && window.location.pathname.startsWith('/search')) {
        setQuery(urlQ);
        setActiveTab(urlTab);
        document.title = `${urlQ} - Findra Search`;
        executeSearch(urlQ, urlPage, urlTab, false);
      } else {
        setSearchResponse(null);
        setQuery('');
        setLoading(false);
        document.title = 'Findra Search - Fast, Private, Polite Web Index';
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Initial load check: if URL already has /search?q=..., load it on page load/refresh
  useEffect(() => {
    if (initialUrlState.q && window.location.pathname.startsWith('/search')) {
      executeSearch(initialUrlState.q, initialUrlState.page, initialUrlState.tab, false);
    }
  }, []);

  const handlePageChange = (newPage: number) => {
    executeSearch(query, newPage, activeTab, true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleTabChange = (newTab: 'all' | 'tech' | 'docs' | 'news') => {
    setActiveTab(newTab);
    if (query) {
      executeSearch(query, 1, newTab, true);
    }
  };

  const isHome = !searchResponse && !loading && (!window.location.pathname.startsWith('/search') || !query);

  return (
    <div className="min-h-screen flex flex-col justify-between transition-colors duration-200">
      {/* ----------------- HOME VIEW ----------------- */}
      {isHome ? (
        <div className="flex-1 flex flex-col justify-between p-4 sm:p-6">
          {/* Top Header Bar */}
          <header className="flex justify-between items-center w-full max-w-6xl mx-auto">
            <div className="flex items-center space-x-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="flex items-center text-emerald-600 dark:text-emerald-400 font-medium">
                <ShieldCheck className="w-4 h-4 mr-1" />
                No Tracking • Zero Profiling
              </span>
            </div>

            <div className="flex items-center space-x-3">
              <button
                onClick={() => setIsCrawlModalOpen(true)}
                className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-900 hover:bg-orange-100 transition-colors"
              >
                <Bot className="w-3.5 h-3.5" />
                <span>Crawl New Web</span>
              </button>

              <button
                onClick={() => setIsDarkMode(!isDarkMode)}
                className="p-2 rounded-full text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                title="Toggle Theme"
              >
                {isDarkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
              </button>
            </div>
          </header>

          {/* Central Logo & Omnibar */}
          <main className="flex flex-col items-center justify-center my-auto w-full max-w-3xl mx-auto text-center px-4">
            {/* Logo */}
            <div className="mb-8 select-none">
              <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-500 to-amber-500 text-white shadow-lg mb-4">
                <Sparkles className="w-8 h-8" />
              </div>
              <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight">
                <span className="text-[#4285F4]">F</span>
                <span className="text-[#EA4335]">i</span>
                <span className="text-[#FBBC05]">n</span>
                <span className="text-[#4285F4]">d</span>
                <span className="text-[#34A853]">r</span>
                <span className="text-[#EA4335]">a</span>
                <span className="text-slate-800 dark:text-slate-200 ml-2">Search</span>
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 font-mono">
                BM25 • PageRank • Rust Inverted Index • Polite Go Crawler
              </p>
            </div>

            {/* Omnibar */}
            <SearchBar onSearch={(q) => executeSearch(q, 1)} autoFocus={true} size="large" />

            {/* Quick Action Buttons */}
            <div className="flex items-center space-x-3 mt-7">
              <button
                onClick={() => executeSearch('search engine', 1)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-[#202124] border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 shadow-sm transition-all"
              >
                Search Engine Architecture
              </button>
              <button
                onClick={() => executeSearch('pagerank algorithm', 1)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-[#202124] border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 shadow-sm transition-all"
              >
                PageRank
              </button>
              <button
                onClick={() => executeSearch('inverted index rust', 1)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-[#202124] border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 shadow-sm transition-all"
              >
                Rust Indexing
              </button>
            </div>
          </main>

          {/* Footer Stats Bar */}
          <footer className="w-full max-w-5xl mx-auto py-4 border-t border-slate-200 dark:border-slate-800/80 text-xs text-slate-500 dark:text-slate-400 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center space-x-4">
              <span className="flex items-center">
                <Cpu className="w-3.5 h-3.5 mr-1 text-blue-500" />
                Indexed Docs: {stats?.total_documents ?? 0}
              </span>
              <span className="flex items-center">
                <Layers className="w-3.5 h-3.5 mr-1 text-emerald-500" />
                Terms in Lexicon: {stats?.total_terms ?? 0}
              </span>
            </div>
            <div className="flex items-center space-x-4 font-mono text-[11px]">
              <span>Latency: &lt; 2ms</span>
              <span>•</span>
              <span>Memory Safe (Rust + Go)</span>
            </div>
          </footer>
        </div>
      ) : (
        /* ----------------- SEARCH RESULTS VIEW ----------------- */
        <div className="flex-1 flex flex-col">
          {/* Top Sticky Header */}
          <header className="sticky top-0 z-40 bg-white/90 dark:bg-[#121214]/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 sm:px-8 py-3.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 max-w-7xl mx-auto">
              <div className="flex items-center space-x-5 flex-1">
                {/* Back to Home Button & Logo */}
                <div className="flex items-center space-x-3">
                  <button
                    onClick={navigateToHome}
                    title="Go back to Home"
                    className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 transition-colors cursor-pointer text-xs font-medium"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Home</span>
                  </button>

                  <div
                    onClick={navigateToHome}
                    className="cursor-pointer select-none text-2xl font-bold tracking-tight hover:opacity-90 transition-opacity"
                    title="Findra Home"
                  >
                    <span className="text-[#4285F4]">F</span>
                    <span className="text-[#EA4335]">i</span>
                    <span className="text-[#FBBC05]">n</span>
                    <span className="text-[#4285F4]">d</span>
                    <span className="text-[#34A853]">r</span>
                    <span className="text-[#EA4335]">a</span>
                  </div>
                </div>

                {/* Compact SearchBar */}
                <div className="flex-1 max-w-2xl">
                  <SearchBar
                    initialQuery={query}
                    onSearch={(q) => executeSearch(q, 1)}
                    size="compact"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center space-x-2.5 self-end sm:self-auto">
                <button
                  onClick={() => setInAppBrowserEnabled(!inAppBrowserEnabled)}
                  title={
                    inAppBrowserEnabled
                      ? 'In-App Browser is ON: sites open directly inside Findra'
                      : 'In-App Browser is OFF: sites open in external browser tabs'
                  }
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors cursor-pointer ${
                    inAppBrowserEnabled
                      ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
                      : 'bg-slate-100 dark:bg-slate-800/80 text-slate-500 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <Globe className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  <span className="hidden md:inline">In-App Browser:</span>
                  <span className="font-bold">{inAppBrowserEnabled ? 'ON' : 'OFF'}</span>
                </button>

                <button
                  onClick={() => setIsCrawlModalOpen(true)}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-900 hover:bg-orange-100 transition-colors cursor-pointer"
                >
                  <Bot className="w-3.5 h-3.5" />
                  <span>Crawl</span>
                </button>

                <button
                  onClick={() => setIsDarkMode(!isDarkMode)}
                  className="p-2 rounded-full text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  {isDarkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Filter Tabs (All, Tech, Docs) */}
            <div className="flex items-center space-x-6 max-w-7xl mx-auto mt-3 pl-2 sm:pl-24 text-xs font-medium text-slate-500 dark:text-slate-400">
              <button
                onClick={() => handleTabChange('all')}
                className={`pb-2 border-b-2 transition-colors flex items-center space-x-1 cursor-pointer ${
                  activeTab === 'all'
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400 font-semibold'
                    : 'border-transparent hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <Search className="w-3.5 h-3.5" />
                <span>All</span>
              </button>
              <button
                onClick={() => handleTabChange('tech')}
                className={`pb-2 border-b-2 transition-colors flex items-center space-x-1 cursor-pointer ${
                  activeTab === 'tech'
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400 font-semibold'
                    : 'border-transparent hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <Code2 className="w-3.5 h-3.5" />
                <span>Tech</span>
              </button>
              <button
                onClick={() => handleTabChange('docs')}
                className={`pb-2 border-b-2 transition-colors flex items-center space-x-1 cursor-pointer ${
                  activeTab === 'docs'
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400 font-semibold'
                    : 'border-transparent hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <Compass className="w-3.5 h-3.5" />
                <span>Docs</span>
              </button>
            </div>
          </header>

          {/* Results Main Section */}
          <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-8 py-5">
            {/* Performance Stats Banner & Did You Mean */}
            {searchResponse && (
              <div className="text-xs text-slate-500 dark:text-slate-400 mb-4 pl-2 sm:pl-24">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span>
                    About {searchResponse.total_hits.toLocaleString()} results (
                    {(searchResponse.took_ms / 1000).toFixed(4)} seconds)
                  </span>
                  {searchResponse.is_live_discovered && (
                    <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                      <Globe className="w-3 h-3 mr-1 animate-pulse" />
                      <span>{searchResponse.source_notice || "Worldwide Web Live Retrieval • Auto-Indexed"}</span>
                    </span>
                  )}
                </div>
                {searchResponse.did_you_mean && (
                  <div className="mt-2 text-sm text-slate-800 dark:text-slate-200">
                    <span className="text-red-500 font-medium">Did you mean: </span>
                    <button
                      onClick={() => executeSearch(searchResponse.did_you_mean!, 1)}
                      className="text-blue-600 dark:text-blue-400 font-semibold italic hover:underline cursor-pointer"
                    >
                      {searchResponse.did_you_mean}
                    </button>
                  </div>
                )}
              </div>
            )}

            {loading ? (
              /* Loading Skeleton */
              <div className="space-y-6 max-w-2xl pl-2 sm:pl-24">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="animate-pulse space-y-2">
                    <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-1/4" />
                    <div className="h-5 bg-slate-200 dark:bg-slate-800 rounded w-3/4" />
                    <div className="h-12 bg-slate-200 dark:bg-slate-800 rounded w-full" />
                  </div>
                ))}
              </div>
            ) : searchResponse && (searchResponse.results.length > 0 || searchResponse.instant_answer) ? (
              /* Result Cards + Right Knowledge Panel OR Split In-App Browser */
              <div className={`flex items-start gap-8 ${isSplitView && inAppBrowserUrl ? 'pl-2' : 'pl-2 sm:pl-24'}`}>
                <div className={`flex-1 transition-all ${isSplitView && inAppBrowserUrl ? 'max-w-xl' : 'max-w-2xl'}`}>
                  {searchResponse.instant_answer && (
                    <InstantAnswerCard
                      answer={searchResponse.instant_answer}
                      onOpenInBrowser={openInBrowser}
                    />
                  )}

                  {searchResponse.results.map((item) => (
                    <SearchResultItem
                      key={item.doc_id}
                      result={item}
                      query={query}
                      onOpenInBrowser={openInBrowser}
                      inAppBrowserEnabled={inAppBrowserEnabled}
                    />
                  ))}

                  <Pagination
                    currentPage={searchResponse.page}
                    totalPages={searchResponse.total_pages}
                    onPageChange={handlePageChange}
                  />
                </div>

                {/* If Split Browser is Open: render In-App Browser side-by-side */}
                {isSplitView && inAppBrowserUrl ? (
                  <EmbeddedBrowser
                    initialUrl={inAppBrowserUrl}
                    initialTitle={inAppBrowserTitle || undefined}
                    onClose={closeBrowser}
                    isSplitView={true}
                    onToggleSplitView={toggleSplitView}
                  />
                ) : (
                  /* Right Knowledge Panel */
                  <KnowledgeCard
                    topResult={searchResponse.results[0]}
                    query={query}
                  />
                )}
              </div>
            ) : (
              /* No results */
              <div className="pl-2 sm:pl-24 max-w-xl text-left py-12">
                <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-2">
                  No matching results found for "{query}".
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                  Suggestions:
                </p>
                <ul className="list-disc pl-5 text-xs text-slate-500 dark:text-slate-400 space-y-1">
                  <li>Make sure that all words are spelled correctly.</li>
                  <li>Try different keywords or more general terms.</li>
                  <li>Click "Crawl" above to fetch and index new domains into the engine.</li>
                </ul>
              </div>
            )}
          </main>
        </div>
      )}

      {/* Fullscreen Embedded In-App Browser */}
      {inAppBrowserUrl && !isSplitView && (
        <EmbeddedBrowser
          initialUrl={inAppBrowserUrl}
          initialTitle={inAppBrowserTitle || undefined}
          onClose={closeBrowser}
          isSplitView={false}
          onToggleSplitView={toggleSplitView}
        />
      )}

      {/* Crawl Modal */}
      <CrawlModal
        isOpen={isCrawlModalOpen}
        onClose={() => setIsCrawlModalOpen(false)}
        onCrawlSuccess={() => {
          fetchStats();
          if (query) executeSearch(query, 1);
        }}
      />
    </div>
  );
};

