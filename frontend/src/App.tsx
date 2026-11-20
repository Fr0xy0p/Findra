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
  Lock,
  Settings,
  ArrowUp,
  Check,
  Plus
} from 'lucide-react';

export type SearchTabType = 'all' | 'tech' | 'sports' | 'news' | 'discussions' | 'docs';

interface TopSite {
  id: string;
  name: string;
  url: string;
  bgGradient: string;
  iconType: string;
}

const DEFAULT_TOP_SITES: TopSite[] = [
  { id: '1', name: 'DeepSeek', url: 'https://chat.deepseek.com', bgGradient: 'linear-gradient(135deg, #1e3a8a, #0284c7)', iconType: 'deepseek' },
  { id: '2', name: 'JioHotstar', url: 'https://www.hotstar.com', bgGradient: 'linear-gradient(135deg, #09132b, #1e293b)', iconType: 'hotstar' },
  { id: '3', name: 'Problems', url: 'https://leetcode.com/problemset', bgGradient: 'linear-gradient(135deg, #262626, #171717)', iconType: 'problems' },
  { id: '4', name: 'Vercel', url: 'https://vercel.com', bgGradient: '#000000', iconType: 'vercel' },
  { id: '5', name: 'Online Sh...', url: 'https://www.amazon.com', bgGradient: 'linear-gradient(135deg, #232f3e, #131921)', iconType: 'amazon' }
];

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
  const [homeInput, setHomeInput] = useState('');
  const [vpnActivated, setVpnActivated] = useState(false);
  const [isAddSiteOpen, setIsAddSiteOpen] = useState(false);
  const [newSiteName, setNewSiteName] = useState('');
  const [newSiteUrl, setNewSiteUrl] = useState('');
  const [topSites, setTopSites] = useState<TopSite[]>(DEFAULT_TOP_SITES);

  const handleHomeSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!homeInput.trim()) return;
    executeSearch(homeInput.trim(), 1);
  };

  const handleHomeAiSearch = () => {
    if (homeInput.trim()) {
      executeSearch(homeInput.trim() + ' --ai', 1);
    }
  };

  const handleAddTopSite = () => {
    const name = newSiteName.trim();
    let url = newSiteUrl.trim();
    if (!name || !url) return;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }
    const newSite: TopSite = {
      id: Date.now().toString(),
      name,
      url,
      bgGradient: 'linear-gradient(135deg, #1e293b, #0f172a)',
      iconType: 'custom'
    };
    setTopSites((prev) => [...prev, newSite]);
    setNewSiteName('');
    setNewSiteUrl('');
    setIsAddSiteOpen(false);
  };

  const renderSiteIcon = (type: string) => {
    switch (type) {
      case 'deepseek':
        return (
          <svg viewBox="0 0 24 24" className="w-7 h-7 fill-white">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 14.93V19a1 1 0 01-2 0v-2.07A6.002 6.002 0 016.07 13H4a1 1 0 010-2h2.07A6.002 6.002 0 0111 6.07V4a1 1 0 012 0v2.07A6.002 6.002 0 0117.93 11H20a1 1 0 010 2h-2.07A6.002 6.002 0 0113 16.93zM12 8a4 4 0 100 8 4 4 0 000-8z" />
          </svg>
        );
      case 'hotstar':
        return (
          <svg viewBox="0 0 24 24" className="w-7 h-7">
            <defs>
              <linearGradient id="hs-star-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#38bdf8" />
                <stop offset="50%" stopColor="#ec4899" />
                <stop offset="100%" stopColor="#f59e0b" />
              </linearGradient>
            </defs>
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" fill="url(#hs-star-grad)" />
          </svg>
        );
      case 'problems':
        return (
          <svg viewBox="0 0 24 24" className="w-6 h-6 stroke-[#f59e0b] stroke-[2.5] fill-none">
            <polyline points="16 18 22 12 16 6" />
            <polyline points="8 6 2 12 8 18" />
          </svg>
        );
      case 'vercel':
        return (
          <svg viewBox="0 0 24 24" className="w-6 h-6 fill-white">
            <polygon points="12 4 22 20 2 20" />
          </svg>
        );
      case 'amazon':
        return (
          <svg viewBox="0 0 24 24" className="w-7 h-7 fill-none">
            <path d="M4 15c4.5 3 11.5 3 16 0" stroke="#ff9900" strokeWidth="2.5" strokeLinecap="round" />
            <path d="M17 16l3-1-1 3" stroke="#ff9900" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        );
      default:
        return <Globe className="w-6 h-6 text-sky-400" />;
    }
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
    <div className="min-h-screen flex flex-col justify-between transition-colors duration-200 bg-[#08060f] text-slate-100">
      {/* ----------------- BRAVE DASHBOARD HOME VIEW ----------------- */}
      {isHome ? (
        <div className="relative w-full min-h-screen flex flex-col justify-between p-4 sm:p-6 overflow-hidden bg-[#08060f] text-slate-100 select-none">
          {/* Layer 0: Space Starfield */}
          <div
            className="absolute inset-0 pointer-events-none opacity-70 z-[1]"
            style={{
              backgroundImage: `
                radial-gradient(1px 1px at 15% 15%, #fff 100%, transparent),
                radial-gradient(1.5px 1.5px at 28% 42%, rgba(255,255,255,0.85) 100%, transparent),
                radial-gradient(1px 1px at 45% 20%, rgba(255,255,255,0.9) 100%, transparent),
                radial-gradient(1.5px 1.5px at 62% 12%, rgba(255,255,255,0.7) 100%, transparent),
                radial-gradient(1px 1px at 75% 35%, rgba(255,255,255,0.85) 100%, transparent),
                radial-gradient(1.5px 1.5px at 88% 22%, #fff 100%, transparent),
                radial-gradient(1px 1px at 92% 52%, rgba(255,255,255,0.6) 100%, transparent),
                radial-gradient(1px 1px at 8% 68%, rgba(255,255,255,0.75) 100%, transparent),
                radial-gradient(1px 1px at 22% 80%, rgba(255,255,255,0.75) 100%, transparent)
              `,
              backgroundSize: '500px 500px'
            }}
          />

          {/* Cosmic Background Layer 1: Nebula Glow */}
          <div
            className="absolute inset-0 pointer-events-none z-[1]"
            style={{
              background: `
                radial-gradient(circle at 18% 30%, rgba(147, 51, 234, 0.22) 0%, transparent 48%),
                radial-gradient(circle at 82% 25%, rgba(192, 38, 211, 0.20) 0%, transparent 45%),
                radial-gradient(circle at 50% 65%, rgba(249, 115, 22, 0.28) 0%, transparent 55%),
                radial-gradient(circle at 50% 90%, rgba(234, 88, 12, 0.35) 0%, transparent 60%),
                linear-gradient(180deg, #090614 0%, #0e071c 40%, #150927 75%, #0a0412 100%)
              `
            }}
          />

          {/* Layer 2: Radiant Solar Flare Rays */}
          <div
            className="absolute bottom-[-60px] left-1/2 -translate-x-1/2 w-[1400px] h-[750px] pointer-events-none filter blur-[24px] mix-blend-screen z-[2]"
            style={{
              background: `conic-gradient(from 225deg at 50% 100%, 
                transparent 0deg, 
                rgba(255, 180, 80, 0.12) 15deg, 
                transparent 30deg, 
                rgba(244, 63, 94, 0.14) 45deg, 
                transparent 60deg, 
                rgba(217, 70, 239, 0.18) 75deg, 
                transparent 90deg, 
                rgba(251, 146, 60, 0.14) 105deg, 
                transparent 120deg
              )`
            }}
          />

          {/* Layer 3: Planet Silhouette & Sunrise Arc on the Horizon */}
          <div
            className="absolute bottom-[-460px] left-1/2 -translate-x-1/2 w-[1450px] h-[780px] rounded-[50%] pointer-events-none z-[3]"
            style={{
              background: 'radial-gradient(circle at 50% 15%, #180929 0%, #0c0416 55%, #050209 100%)',
              boxShadow: `
                0 -4px 35px rgba(253, 186, 116, 0.6),
                0 -18px 80px rgba(249, 115, 22, 0.45),
                0 -35px 140px rgba(192, 38, 211, 0.3)
              `,
              borderTop: '1.5px solid rgba(254, 215, 170, 0.85)'
            }}
          />

          {/* Sunrise Burst */}
          <div
            className="absolute bottom-[275px] left-[36%] w-[420px] h-[240px] rounded-[50%] pointer-events-none filter blur-[36px] mix-blend-screen z-[4]"
            style={{
              background: 'radial-gradient(circle at 50% 50%, #ffffff 0%, rgba(254, 240, 138, 0.9) 20%, rgba(249, 115, 22, 0.6) 50%, transparent 85%)'
            }}
          />

          {/* Background Watermark Text */}
          <div className="absolute top-[40%] left-1/2 -translate-x-1/2 -translate-y-1/2 text-[100px] sm:text-[130px] font-black tracking-[12px] text-white/[0.045] uppercase pointer-events-none select-none z-[3] whitespace-nowrap">
            BLACK FRIDAY
          </div>

          {/* Top Header Bar */}
          <header className="relative z-10 flex items-center justify-between w-full max-w-7xl mx-auto">
            <div className="flex items-center space-x-2 text-xs">
              <span className="flex items-center text-orange-400 font-semibold bg-orange-950/40 px-3 py-1 rounded-full border border-orange-500/30 backdrop-blur-md">
                <ShieldCheck className="w-3.5 h-3.5 mr-1.5 text-[#fb542b]" />
                <span>Findra Privacy Engine • Zero Profiling</span>
              </span>
            </div>

            <div className="flex items-center space-x-2.5">
              <button
                onClick={() => setIsCrawlModalOpen(true)}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-[#fb542b] bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 transition-colors backdrop-blur-md cursor-pointer"
              >
                <Bot className="w-3.5 h-3.5" />
                <span>Crawl Web</span>
              </button>

              <button
                onClick={() => setIsDarkMode(!isDarkMode)}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-300 bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 transition-colors backdrop-blur-md cursor-pointer"
                title="Toggle Theme"
              >
                {isDarkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
              </button>

              <button
                className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-300 bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 transition-colors backdrop-blur-md cursor-pointer"
                title="Customize Dashboard"
              >
                <Settings className="w-4 h-4" />
              </button>
            </div>
          </header>

          {/* Center Section: Top Sites & Floating Omnisearch Capsule */}
          <main className="relative z-10 flex flex-col items-center justify-center w-full max-w-3xl mx-auto my-auto py-6">
            {/* Top Sites Carousel Row */}
            <div className="flex flex-col items-center mb-8">
              <div className="flex items-center justify-center gap-5 sm:gap-6 flex-wrap">
                {topSites.map((site) => (
                  <a
                    key={site.id}
                    href={site.url}
                    className="flex flex-col items-center gap-2 group transition-transform duration-200 hover:-translate-y-1"
                  >
                    <div
                      className="w-14 h-14 rounded-2xl flex items-center justify-center border border-white/15 shadow-lg shadow-black/40 group-hover:border-white/30 group-hover:shadow-black/60 transition-all overflow-hidden"
                      style={{ background: site.bgGradient }}
                    >
                      {renderSiteIcon(site.iconType)}
                    </div>
                    <span className="text-[11px] font-medium text-slate-200 max-w-[70px] truncate text-center drop-shadow-md">
                      {site.name}
                    </span>
                  </a>
                ))}

                {/* Add Site Tile */}
                <button
                  onClick={() => setIsAddSiteOpen(true)}
                  className="flex flex-col items-center gap-2 group transition-transform duration-200 hover:-translate-y-1 cursor-pointer"
                >
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center border border-dashed border-white/20 bg-white/[0.04] group-hover:bg-white/[0.08] group-hover:border-white/40 transition-all">
                    <Plus className="w-5 h-5 text-slate-400 group-hover:text-white" />
                  </div>
                  <span className="text-[11px] font-medium text-slate-300">Add site</span>
                </button>
              </div>

              {/* Carousel Pagination Dots */}
              <div className="flex items-center gap-1.5 mt-4">
                <span className="w-1.5 h-1.5 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]" />
                <span className="w-1.5 h-1.5 rounded-full bg-white/30" />
              </div>
            </div>

            {/* Brave Omnisearch Capsule */}
            <form
              onSubmit={handleHomeSearch}
              className="w-full max-w-2xl h-14 rounded-full bg-[#14131c]/85 backdrop-blur-2xl border border-white/15 shadow-[0_12px_36px_rgba(0,0,0,0.5)] focus-within:border-[#fb542b]/70 focus-within:ring-4 focus-within:ring-[#fb542b]/20 flex items-center px-4 gap-3 transition-all duration-200"
            >
              <div className="text-[#fb542b] flex-shrink-0">
                <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                  <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
                </svg>
              </div>

              <input
                type="text"
                value={homeInput}
                onChange={(e) => setHomeInput(e.target.value)}
                placeholder="Ask anything, find anything..."
                className="flex-1 bg-transparent border-none outline-none text-white text-[15px] placeholder-slate-400 font-normal"
                autoFocus
              />

              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={handleHomeAiSearch}
                  className="p-1.5 rounded-lg text-purple-400 hover:text-purple-300 hover:bg-purple-500/15 transition-colors cursor-pointer"
                  title="Ask Findra AI"
                >
                  <Sparkles className="w-4 h-4" />
                </button>

                <button
                  type="submit"
                  className="flex items-center space-x-1.5 h-9 px-3.5 rounded-full bg-white/[0.08] hover:bg-white/[0.16] border border-white/15 text-slate-200 text-xs font-semibold transition-colors cursor-pointer"
                >
                  <Search className="w-3.5 h-3.5" />
                  <span>Search</span>
                </button>

                <button
                  type="submit"
                  className="w-9 h-9 rounded-full bg-[#fb542b] hover:bg-[#ff6a3d] text-white flex items-center justify-center shadow-md shadow-[#fb542b]/40 hover:scale-105 transition-all cursor-pointer"
                  title="Submit"
                >
                  <ArrowUp className="w-4 h-4 stroke-[2.5]" />
                </button>
              </div>
            </form>
          </main>

          {/* Bottom Widgets Row */}
          <footer className="relative z-10 flex flex-col md:flex-row items-center md:items-end justify-between gap-6 w-full max-w-7xl mx-auto pt-4">
            {/* Bottom Left: Featured Offer & Privacy Stats */}
            <div className="flex flex-col sm:flex-row items-center sm:items-end gap-5">
              {/* Proton Mail Promo Card */}
              <div className="w-48 p-3.5 rounded-2xl bg-[#161320]/85 backdrop-blur-xl border border-purple-500/30 shadow-[0_8px_24px_rgba(0,0,0,0.4)] flex flex-col gap-1.5 hover:border-purple-500/50 transition-all">
                <div className="text-xl font-extrabold text-white tracking-tight">-60%</div>
                <div className="flex items-center space-x-1.5 text-xs font-bold text-slate-100">
                  <svg className="w-3.5 h-3.5 fill-[#6d4aff]" viewBox="0 0 24 24">
                    <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" />
                  </svg>
                  <span>Proton Mail</span>
                </div>
                <div className="text-[11px] text-slate-400 leading-tight">Email that protects your privacy</div>
                <a
                  href="https://proton.me/mail"
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 px-3 py-1 rounded-full bg-slate-100 hover:bg-white text-slate-900 text-[10.5px] font-bold text-center transition-colors"
                >
                  View Offers
                </a>
              </div>

              {/* Brave Privacy Stats Widget */}
              <div className="flex flex-col gap-1.5">
                <div className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">STATS</div>
                <div className="flex items-baseline gap-6 text-left">
                  <div>
                    <div className="text-lg font-bold text-white tracking-tight">110,148</div>
                    <div className="text-[11px] text-slate-400">Trackers & ads blocked</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-white tracking-tight">1,001.1 MB</div>
                    <div className="text-[11px] text-slate-400">Bandwidth saved</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-white tracking-tight">1.6 Hours</div>
                    <div className="text-[11px] text-slate-400">Time saved</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Right: Findra VPN Protection Card */}
            <div className="flex items-center rounded-2xl bg-[#14121c]/85 backdrop-blur-xl border border-white/15 shadow-[0_12px_32px_rgba(0,0,0,0.5)] overflow-hidden">
              {/* Left Vertical Icon Dock */}
              <div className="flex flex-col items-center gap-3.5 p-3.5 border-r border-white/10 bg-black/20 text-slate-400">
                <svg className="w-3.5 h-3.5 fill-current hover:text-[#fb542b] cursor-pointer transition-colors" viewBox="0 0 24 24">
                  <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
                </svg>
                <svg className="w-3.5 h-3.5 fill-current hover:text-[#fb542b] cursor-pointer transition-colors" viewBox="0 0 24 24">
                  <polygon points="12 2 22 20 2 20" />
                </svg>
                <svg className="w-3.5 h-3.5 stroke-current stroke-2 fill-none hover:text-[#fb542b] cursor-pointer transition-colors" viewBox="0 0 24 24">
                  <path d="M23 7l-7 5 7 5V7z" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                </svg>
              </div>

              {/* Card Content */}
              <div className="p-4 flex items-center gap-6">
                <div className="flex flex-col gap-1.5 text-left">
                  <div className="flex items-center space-x-1.5">
                    <span className="text-xs font-black tracking-wide text-[#fb542b] uppercase">FINDRA VPN</span>
                    <span className="text-[10px] text-slate-500">Powered by Guardian</span>
                  </div>
                  <div className="flex flex-col gap-1 text-[11px] text-slate-300">
                    <div className="flex items-center space-x-1.5">
                      <Check className="w-3.5 h-3.5 text-emerald-400 stroke-[2.5]" />
                      <span>Extra privacy & security online</span>
                    </div>
                    <div className="flex items-center space-x-1.5">
                      <Check className="w-3.5 h-3.5 text-emerald-400 stroke-[2.5]" />
                      <span>Hide your IP & change your location</span>
                    </div>
                    <div className="flex items-center space-x-1.5">
                      <Check className="w-3.5 h-3.5 text-emerald-400 stroke-[2.5]" />
                      <span>Protect every app on your device</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-center gap-1.5">
                  <button
                    onClick={() => setVpnActivated(!vpnActivated)}
                    className={`px-4 py-2 rounded-full text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                      vpnActivated
                        ? 'bg-emerald-600 text-white'
                        : 'bg-[#1e1b2e] hover:bg-[#2a2540] border border-white/20 text-white'
                    }`}
                  >
                    {vpnActivated ? 'Active ✓' : 'Start free trial'}
                  </button>
                  <span className="text-[10px] text-slate-500 underline cursor-pointer hover:text-slate-400">
                    Already purchased?
                  </span>
                </div>
              </div>
            </div>
          </footer>

          {/* Add Shortcut Modal */}
          {isAddSiteOpen && (
            <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="w-full max-w-sm rounded-2xl bg-[#181724] border border-white/15 p-5 shadow-2xl flex flex-col gap-4 text-left">
                <h3 className="text-base font-bold text-white">Add Top Site Shortcut</h3>
                <input
                  type="text"
                  placeholder="Site Name (e.g. GitHub)"
                  value={newSiteName}
                  onChange={(e) => setNewSiteName(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg bg-[#111019] border border-slate-700 text-white text-xs outline-none focus:border-[#fb542b]"
                />
                <input
                  type="url"
                  placeholder="https://..."
                  value={newSiteUrl}
                  onChange={(e) => setNewSiteUrl(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg bg-[#111019] border border-slate-700 text-white text-xs outline-none focus:border-[#fb542b]"
                />
                <div className="flex items-center justify-end space-x-2.5 mt-1">
                  <button
                    onClick={() => setIsAddSiteOpen(false)}
                    className="px-3.5 py-1.5 rounded-lg border border-slate-700 text-xs font-semibold text-slate-400 hover:text-white cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddTopSite}
                    className="px-4 py-1.5 rounded-lg bg-[#fb542b] hover:bg-[#ff6a3d] text-white text-xs font-bold cursor-pointer"
                  >
                    Add Shortcut
                  </button>
                </div>
              </div>
            </div>
          )}
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
