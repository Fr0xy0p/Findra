import React, { useState, useEffect } from 'react';
import { SearchBar } from './components/SearchBar';
import { SearchResultItem } from './components/SearchResultItem';
import { KnowledgeCard } from './components/KnowledgeCard';
import { InstantAnswerCard } from './components/InstantAnswerCard';
import { Pagination } from './components/Pagination';
import { CrawlModal } from './components/CrawlModal';
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
  Compass,
  Code2,
  ArrowLeft,
  Globe,
  MessageSquare,
  Trophy,
  Newspaper,
  ShieldAlert,
  Flame,
  CheckCircle2,
  Lock
} from 'lucide-react';

export type SearchTabType = 'all' | 'tech' | 'sports' | 'news' | 'discussions' | 'docs';

const getInitialUrlState = () => {
  if (typeof window === 'undefined') return { q: '', page: 1, tab: 'all' as SearchTabType };
  const params = new URLSearchParams(window.location.search);
  const q = params.get('q') || '';
  const page = parseInt(params.get('page') || '1', 10);
  const rawTab = params.get('tab');
  const validTabs: SearchTabType[] = ['all', 'tech', 'sports', 'news', 'discussions', 'docs'];
  const tab = validTabs.includes(rawTab as SearchTabType) ? (rawTab as SearchTabType) : 'all';
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
  const [activeTab, setActiveTab] = useState<SearchTabType>(initialUrlState.tab);

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
    tab: SearchTabType = activeTab,
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
      // Forward tab filter parameter
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

  // Listen to browser Back and Forward navigation
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const urlQ = params.get('q');
      const urlPage = parseInt(params.get('page') || '1', 10);
      const rawTab = params.get('tab') as SearchTabType;
      const urlTab: SearchTabType = ['all', 'tech', 'sports', 'news', 'discussions', 'docs'].includes(rawTab)
        ? rawTab
        : 'all';

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

  // Initial load check
  useEffect(() => {
    if (initialUrlState.q && window.location.pathname.startsWith('/search')) {
      executeSearch(initialUrlState.q, initialUrlState.page, initialUrlState.tab, false);
    }
  }, []);

  const handlePageChange = (newPage: number) => {
    executeSearch(query, newPage, activeTab, true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleTabChange = (newTab: SearchTabType) => {
    setActiveTab(newTab);
    if (query) {
      executeSearch(query, 1, newTab, true);
    }
  };

  const isHome = !searchResponse && !loading && (!window.location.pathname.startsWith('/search') || !query);

  // Filter discussion results for Brave Discussions box
  const discussionItems = searchResponse?.results.filter((item) => {
    const url = item.url.toLowerCase();
    const title = item.title.toLowerCase();
    return (
      url.includes('reddit.com') ||
      url.includes('github.com') ||
      url.includes('news.ycombinator.com') ||
      url.includes('stackoverflow.com') ||
      url.includes('forum') ||
      url.includes('community') ||
      title.includes('discussion')
    );
  }) || [];

  return (
    <div className="min-h-screen flex flex-col justify-between transition-colors duration-200 bg-white dark:bg-[#191b26] text-slate-900 dark:text-[#f0f2f5]">
      {/* ----------------- BRAVE SEARCH HOME VIEW ----------------- */}
      {isHome ? (
        <div className="flex-1 flex flex-col justify-between p-4 sm:p-6">
          {/* Top Privacy & Tooling Bar */}
          <header className="flex justify-between items-center w-full max-w-6xl mx-auto">
            <div className="flex items-center space-x-2 text-xs">
              <span className="flex items-center text-emerald-600 dark:text-emerald-400 font-medium bg-emerald-50 dark:bg-emerald-950/40 px-3 py-1 rounded-full border border-emerald-200 dark:border-emerald-800/60">
                <ShieldCheck className="w-3.5 h-3.5 mr-1.5" />
                <span>Zero Profiling • 100% Ad-Free Guarantee</span>
              </span>
            </div>

            <div className="flex items-center space-x-3">
              <button
                onClick={() => setIsCrawlModalOpen(true)}
                className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold text-[#fb542b] bg-orange-50 dark:bg-[#fb542b]/15 border border-orange-200 dark:border-[#fb542b]/30 hover:bg-orange-100 dark:hover:bg-[#fb542b]/25 transition-colors cursor-pointer"
              >
                <Bot className="w-3.5 h-3.5" />
                <span>Crawl Web</span>
              </button>

              <button
                onClick={() => setIsDarkMode(!isDarkMode)}
                className="p-2 rounded-full text-slate-500 hover:bg-slate-100 dark:hover:bg-[#212330] transition-colors cursor-pointer"
                title="Toggle Theme"
              >
                {isDarkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
              </button>
            </div>
          </header>

          {/* Central Brave Lion Emblem & Omnibar */}
          <main className="flex flex-col items-center justify-center my-auto w-full max-w-3xl mx-auto text-center px-4">
            {/* Brave Style Emblem Logo */}
            <div className="mb-8 select-none flex flex-col items-center">
              <div className="inline-flex items-center justify-center p-3.5 rounded-2xl bg-gradient-to-tr from-[#fb542b] via-[#ff6a3d] to-[#e02800] text-white shadow-lg shadow-[#fb542b]/20 mb-3 hover:scale-105 transition-transform duration-200">
                {/* Brave Shield Emblem SVG */}
                <svg className="w-10 h-10 fill-current" viewBox="0 0 24 24">
                  <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 2.18l7 3.12v4.7c0 4.67-3.13 9.03-7 10.18-3.87-1.15-7-5.51-7-10.18V6.3l7-3.12zm-1 5.82v6h2v-6h-2zm0 8v2h2v-2h-2z" />
                </svg>
              </div>

              <div className="flex items-center justify-center space-x-2">
                <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-slate-900 dark:text-white">
                  Findra
                </h1>
                <span className="text-sm font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-[#fb542b] text-white">
                  Search
                </span>
              </div>

              <p className="text-sm text-slate-500 dark:text-[#9ea4b6] mt-2 font-medium">
                The private, independent, and ad-free web engine.
              </p>
            </div>

            {/* Brave Omnibar */}
            <SearchBar onSearch={(q) => executeSearch(q, 1)} autoFocus={true} size="large" />

            {/* Brave Category Quick Chips */}
            <div className="flex items-center flex-wrap justify-center gap-2.5 mt-7">
              <button
                onClick={() => executeSearch('artificial intelligence deep learning', 1, 'tech')}
                className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-[#f0f2f5] bg-slate-100 dark:bg-[#212330] hover:bg-slate-200 dark:hover:bg-[#2c3042] border border-slate-200 dark:border-[#2e3245] transition-all cursor-pointer flex items-center space-x-1.5"
              >
                <Code2 className="w-3.5 h-3.5 text-[#fb542b]" />
                <span>AI & Tech</span>
              </button>

              <button
                onClick={() => executeSearch('cs2 esports champions tour valorant', 1, 'sports')}
                className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-[#f0f2f5] bg-slate-100 dark:bg-[#212330] hover:bg-slate-200 dark:hover:bg-[#2c3042] border border-slate-200 dark:border-[#2e3245] transition-all cursor-pointer flex items-center space-x-1.5"
              >
                <Trophy className="w-3.5 h-3.5 text-amber-500" />
                <span>Esports & Gaming</span>
              </button>

              <button
                onClick={() => executeSearch('world cup champions league football', 1, 'sports')}
                className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-[#f0f2f5] bg-slate-100 dark:bg-[#212330] hover:bg-slate-200 dark:hover:bg-[#2c3042] border border-slate-200 dark:border-[#2e3245] transition-all cursor-pointer flex items-center space-x-1.5"
              >
                <Zap className="w-3.5 h-3.5 text-emerald-500" />
                <span>Global Sports</span>
              </button>

              <button
                onClick={() => executeSearch('reddit discussion search engine architecture', 1, 'discussions')}
                className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-[#f0f2f5] bg-slate-100 dark:bg-[#212330] hover:bg-slate-200 dark:hover:bg-[#2c3042] border border-slate-200 dark:border-[#2e3245] transition-all cursor-pointer flex items-center space-x-1.5"
              >
                <MessageSquare className="w-3.5 h-3.5 text-blue-500" />
                <span>Discussions</span>
              </button>
            </div>
          </main>

          {/* Brave Privacy Guarantee Footer */}
          <footer className="w-full max-w-5xl mx-auto py-4 border-t border-slate-200 dark:border-[#2e3245] text-xs text-slate-500 dark:text-[#9ea4b6] flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center space-x-4">
              <span className="flex items-center font-medium">
                <Cpu className="w-3.5 h-3.5 mr-1.5 text-[#fb542b]" />
                Indexed Web Pages: <span className="ml-1 font-bold text-slate-800 dark:text-white">{stats?.total_documents ?? 0}</span>
              </span>
              <span className="flex items-center font-medium">
                <Layers className="w-3.5 h-3.5 mr-1.5 text-emerald-500" />
                Lexicon Terms: <span className="ml-1 font-bold text-slate-800 dark:text-white">{stats?.total_terms ?? 0}</span>
              </span>
            </div>
            <div className="flex items-center space-x-3 text-[11px] font-mono">
              <span className="flex items-center text-emerald-600 dark:text-emerald-400">
                <Lock className="w-3 h-3 mr-1" />
                Ghostery & EasyList AdBlock Active
              </span>
              <span>•</span>
              <span>Sub-millisecond Rust Query Server</span>
            </div>
          </footer>
        </div>
      ) : (
        /* ----------------- BRAVE SEARCH RESULTS VIEW ----------------- */
        <div className="flex-1 flex flex-col">
          {/* Top Sticky Header */}
          <header className="sticky top-0 z-40 bg-white/95 dark:bg-[#191b26]/95 backdrop-blur-md border-b border-slate-200 dark:border-[#2e3245] px-4 sm:px-8 py-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 max-w-7xl mx-auto">
              <div className="flex items-center space-x-4 flex-1">
                {/* Back to Home Button & Brave Logo */}
                <div className="flex items-center space-x-3 flex-shrink-0">
                  <button
                    onClick={navigateToHome}
                    title="Go back to Home"
                    className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-slate-600 dark:text-[#9ea4b6] hover:bg-slate-100 dark:hover:bg-[#212330] border border-slate-200 dark:border-[#2e3245] transition-colors cursor-pointer text-xs font-semibold"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Home</span>
                  </button>

                  <div
                    onClick={navigateToHome}
                    className="cursor-pointer select-none flex items-center space-x-1.5 hover:opacity-90 transition-opacity"
                    title="Findra Home"
                  >
                    <div className="p-1.5 rounded-xl bg-gradient-to-tr from-[#fb542b] to-[#e02800] text-white shadow-sm">
                      <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                        <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
                      </svg>
                    </div>
                    <span className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
                      Findra
                    </span>
                  </div>
                </div>

                {/* Compact Brave Omnibar */}
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
                {/* Shield Badge */}
                <div className="hidden md:flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Shield Active</span>
                </div>

                <button
                  onClick={() => setIsCrawlModalOpen(true)}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-[#fb542b] bg-orange-50 dark:bg-[#fb542b]/15 border border-orange-200 dark:border-[#fb542b]/30 hover:bg-orange-100 dark:hover:bg-[#fb542b]/25 transition-colors cursor-pointer"
                >
                  <Bot className="w-3.5 h-3.5" />
                  <span>Crawl</span>
                </button>

                <button
                  onClick={() => setIsDarkMode(!isDarkMode)}
                  className="p-2 rounded-full text-slate-500 hover:bg-slate-100 dark:hover:bg-[#212330] transition-colors cursor-pointer"
                >
                  {isDarkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Brave Filter Tabs Navigation Bar */}
            <div className="flex items-center space-x-6 max-w-7xl mx-auto mt-2.5 pl-2 sm:pl-28 text-xs font-semibold text-slate-500 dark:text-[#9ea4b6] overflow-x-auto scrollbar-none">
              <button
                onClick={() => handleTabChange('all')}
                className={`pb-2 border-b-2 transition-colors flex items-center space-x-1.5 cursor-pointer whitespace-nowrap ${
                  activeTab === 'all'
                    ? 'border-[#fb542b] text-[#fb542b]'
                    : 'border-transparent hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Search className="w-3.5 h-3.5" />
                <span>All</span>
              </button>

              <button
                onClick={() => handleTabChange('news')}
                className={`pb-2 border-b-2 transition-colors flex items-center space-x-1.5 cursor-pointer whitespace-nowrap ${
                  activeTab === 'news'
                    ? 'border-[#fb542b] text-[#fb542b]'
                    : 'border-transparent hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Newspaper className="w-3.5 h-3.5" />
                <span>News</span>
              </button>

              <button
                onClick={() => handleTabChange('tech')}
                className={`pb-2 border-b-2 transition-colors flex items-center space-x-1.5 cursor-pointer whitespace-nowrap ${
                  activeTab === 'tech'
                    ? 'border-[#fb542b] text-[#fb542b]'
                    : 'border-transparent hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Code2 className="w-3.5 h-3.5" />
                <span>Tech</span>
              </button>

              <button
                onClick={() => handleTabChange('sports')}
                className={`pb-2 border-b-2 transition-colors flex items-center space-x-1.5 cursor-pointer whitespace-nowrap ${
                  activeTab === 'sports'
                    ? 'border-[#fb542b] text-[#fb542b]'
                    : 'border-transparent hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Trophy className="w-3.5 h-3.5" />
                <span>Sports & Esports</span>
              </button>

              <button
                onClick={() => handleTabChange('discussions')}
                className={`pb-2 border-b-2 transition-colors flex items-center space-x-1.5 cursor-pointer whitespace-nowrap ${
                  activeTab === 'discussions'
                    ? 'border-[#fb542b] text-[#fb542b]'
                    : 'border-transparent hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Discussions</span>
              </button>

              <button
                onClick={() => handleTabChange('docs')}
                className={`pb-2 border-b-2 transition-colors flex items-center space-x-1.5 cursor-pointer whitespace-nowrap ${
                  activeTab === 'docs'
                    ? 'border-[#fb542b] text-[#fb542b]'
                    : 'border-transparent hover:text-slate-900 dark:hover:text-white'
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
              <div className="text-xs text-slate-500 dark:text-[#9ea4b6] mb-4 pl-2 sm:pl-28">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span>
                    About {searchResponse.total_hits.toLocaleString()} results (
                    {(searchResponse.took_ms / 1000).toFixed(4)} seconds)
                  </span>
                  {searchResponse.is_live_discovered && (
                    <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60">
                      <Globe className="w-3 h-3 mr-1 animate-pulse" />
                      <span>{searchResponse.source_notice || "Worldwide Web Live Retrieval • Auto-Indexed"}</span>
                    </span>
                  )}
                </div>

                {searchResponse.did_you_mean && (
                  <div className="mt-2 text-sm text-slate-800 dark:text-[#f0f2f5]">
                    <span className="text-[#fb542b] font-semibold">Did you mean: </span>
                    <button
                      onClick={() => executeSearch(searchResponse.did_you_mean!, 1)}
                      className="text-[#7c9bf8] font-semibold italic hover:underline cursor-pointer"
                    >
                      {searchResponse.did_you_mean}
                    </button>
                  </div>
                )}
              </div>
            )}

            {loading ? (
              /* Loading Skeleton */
              <div className="space-y-6 max-w-2xl pl-2 sm:pl-28">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="animate-pulse space-y-2.5 p-4 rounded-2xl bg-slate-50 dark:bg-[#212330]/50 border border-slate-200/50 dark:border-[#2e3245]/50">
                    <div className="h-3 bg-slate-200 dark:bg-[#2e3245] rounded w-1/4" />
                    <div className="h-5 bg-slate-200 dark:bg-[#2e3245] rounded w-3/4" />
                    <div className="h-12 bg-slate-200 dark:bg-[#2e3245] rounded w-full" />
                  </div>
                ))}
              </div>
            ) : searchResponse && (searchResponse.results.length > 0 || searchResponse.instant_answer) ? (
              /* Result Cards + Right Knowledge Panel */
              <div className="flex items-start gap-8 pl-2 sm:pl-28">
                <div className="flex-1 transition-all max-w-2xl">
                  {/* Brave Leo AI Overview */}
                  {searchResponse.instant_answer && (
                    <InstantAnswerCard
                      answer={searchResponse.instant_answer}
                    />
                  )}

                  {/* Brave Discussions Box (if community discussions found) */}
                  {discussionItems.length > 0 && activeTab !== 'discussions' && (
                    <div className="mb-6 p-4 sm:p-5 rounded-2xl bg-slate-50 dark:bg-[#212330] border border-slate-200 dark:border-[#2e3245] text-left">
                      <div className="flex items-center space-x-2 mb-3">
                        <MessageSquare className="w-4 h-4 text-[#fb542b]" />
                        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-[#f0f2f5]">
                          Discussions & Community
                        </h3>
                      </div>
                      <div className="space-y-2.5">
                        {discussionItems.slice(0, 3).map((disc) => (
                          <div key={disc.doc_id} className="text-xs">
                            <a
                              href={disc.url}
                              target="_blank"
                              rel="noreferrer"
                              className="font-medium text-[#7c9bf8] hover:underline block truncate"
                            >
                              {disc.title}
                            </a>
                            <span className="text-[11px] text-slate-400 dark:text-[#71788e]">
                              {disc.domain} • {disc.doc_length} words
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Organic Search Results */}
                  {searchResponse.results.map((item) => (
                    <SearchResultItem
                      key={item.doc_id}
                      result={item}
                      query={query}
                    />
                  ))}

                  <Pagination
                    currentPage={searchResponse.page}
                    totalPages={searchResponse.total_pages}
                    onPageChange={handlePageChange}
                  />
                </div>

                {/* Right Knowledge Panel */}
                <KnowledgeCard
                  panel={searchResponse.knowledge_panel}
                  topResult={searchResponse.results[0]}
                  query={query}
                />
              </div>
            ) : (
              /* No results */
              <div className="pl-2 sm:pl-28 max-w-xl text-left py-12">
                <h3 className="text-lg font-bold text-slate-800 dark:text-[#f0f2f5] mb-2">
                  No matching results found for "{query}".
                </h3>
                <p className="text-sm text-slate-500 dark:text-[#9ea4b6] mb-4">
                  Suggestions:
                </p>
                <ul className="list-disc pl-5 text-xs text-slate-500 dark:text-[#9ea4b6] space-y-1">
                  <li>Make sure that all words are spelled correctly.</li>
                  <li>Try different keywords or more general terms.</li>
                  <li>Click "Crawl" above to fetch and index new domains into the engine.</li>
                </ul>
              </div>
            )}
          </main>
        </div>
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
