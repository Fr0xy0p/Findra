import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  RotateCw,
  Globe,
  Lock,
  BookOpen,
  Maximize2,
  ExternalLink,
  X,
  Columns,
  Share2,
  Play,
  Flame,
  Music,
  Gamepad2,
  Tv,
  Radio,
  AlertCircle,
  Search,
  ShieldAlert
} from 'lucide-react';

interface ReaderData {
  title: string;
  domain: string;
  url: string;
  reading_time_minutes: number;
  word_count: number;
  paragraphs: string[];
  excerpt: string;
}

interface Props {
  initialUrl: string;
  initialTitle?: string;
  onClose: () => void;
  isSplitView: boolean;
  onToggleSplitView: () => void;
}

interface YouTubeEmbedInfo {
  isYouTube: boolean;
  embedUrl: string | null;
  isHome: boolean;
  videoId?: string;
  query?: string;
}

export function parseYouTubeEmbed(urlStr: string): YouTubeEmbedInfo {
  try {
    let clean = urlStr.trim();
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
      clean = 'https://' + clean;
    }
    const url = new URL(clean);
    const host = url.hostname.toLowerCase();
    const isYt = host.includes('youtube.com') || host.includes('youtu.be');
    if (!isYt) {
      return { isYouTube: false, embedUrl: null, isHome: false };
    }

    // youtu.be/VIDEO_ID
    if (host.includes('youtu.be')) {
      const vid = url.pathname.replace(/^\//, '').split(/[?#]/)[0];
      if (vid) {
        return {
          isYouTube: true,
          embedUrl: `https://www.youtube-nocookie.com/embed/${vid}?autoplay=1&enablejsapi=1`,
          isHome: false,
          videoId: vid,
        };
      }
    }

    // /watch?v=VIDEO_ID
    const vid = url.searchParams.get('v');
    if (vid) {
      const t = url.searchParams.get('t') ? `&start=${parseInt(url.searchParams.get('t') || '0', 10)}` : '';
      return {
        isYouTube: true,
        embedUrl: `https://www.youtube-nocookie.com/embed/${vid}?autoplay=1&enablejsapi=1${t}`,
        isHome: false,
        videoId: vid,
      };
    }

    // /shorts/VIDEO_ID
    if (url.pathname.includes('/shorts/')) {
      const shortId = url.pathname.split('/shorts/')[1]?.split(/[/?#]/)[0];
      if (shortId) {
        return {
          isYouTube: true,
          embedUrl: `https://www.youtube-nocookie.com/embed/${shortId}?autoplay=1&enablejsapi=1`,
          isHome: false,
          videoId: shortId,
        };
      }
    }

    // /embed/VIDEO_ID
    if (url.pathname.includes('/embed/')) {
      const vid = url.pathname.split('/embed/')[1]?.split(/[/?#]/)[0];
      return { isYouTube: true, embedUrl: clean, isHome: false, videoId: vid };
    }

    // /playlist?list=ID
    const list = url.searchParams.get('list');
    if (list) {
      return {
        isYouTube: true,
        embedUrl: `https://www.youtube-nocookie.com/embed/videoseries?list=${list}&autoplay=1`,
        isHome: false,
      };
    }

    // Root homepage or general landing page
    return {
      isYouTube: true,
      embedUrl: null,
      isHome: true,
    };
  } catch (e) {
    return { isYouTube: false, embedUrl: null, isHome: false };
  }
}

const EMBED_RESTRICTED_SITES = [
  'facebook.com',
  'twitter.com',
  'x.com',
  'instagram.com',
  'netflix.com',
  'linkedin.com',
  'accounts.google.com'
];

export const EmbeddedBrowser: React.FC<Props> = ({
  initialUrl,
  initialTitle,
  onClose,
  isSplitView,
  onToggleSplitView,
}) => {
  // Navigation & History State
  const [history, setHistory] = useState<string[]>([initialUrl]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [inputUrl, setInputUrl] = useState(initialUrl);
  const [pageTitle, setPageTitle] = useState(initialTitle || initialUrl);
  const [isLoading, setIsLoading] = useState(true);
  const [loadTimeoutNotice, setLoadTimeoutNotice] = useState(false);

  // In-App YouTube Hub Player State
  const [activeYtVideoId, setActiveYtVideoId] = useState<string>('jfKfPfyJRdk');
  const [ytCustomInput, setYtCustomInput] = useState<string>('');

  // View Modes: 'web' or 'reader'
  const [viewMode, setViewMode] = useState<'web' | 'reader'>('web');
  const [readerData, setReaderData] = useState<ReaderData | null>(null);
  const [readerLoading, setReaderLoading] = useState(false);
  const [readerFontSize, setReaderFontSize] = useState<'sm' | 'base' | 'lg'>('base');
  const [copiedLink, setCopiedLink] = useState(false);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const currentUrl = history[historyIndex] || initialUrl;
  const ytInfo = parseYouTubeEmbed(currentUrl);

  let hostname = '';
  try {
    hostname = new URL(currentUrl).hostname;
  } catch (e) {
    hostname = currentUrl;
  }

  const isRestrictedNonYt = EMBED_RESTRICTED_SITES.some(
    (domain) => hostname === domain || hostname.endsWith('.' + domain)
  );

  // Sync address input when current URL changes
  useEffect(() => {
    setInputUrl(currentUrl);
    setIsLoading(true);
    setLoadTimeoutNotice(false);

    // If a non-YouTube page takes longer than 3.5s, display helper notice
    const timer = setTimeout(() => {
      setLoadTimeoutNotice(true);
    }, 3500);

    if (viewMode === 'reader') {
      fetchReaderContent(currentUrl);
    }

    return () => clearTimeout(timer);
  }, [currentUrl]);

  // Listen for navigation messages sent by proxy bridge
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!event.data) return;

      if (event.data.type === 'FINDRA_URL_CHANGE' && event.data.url) {
        const newUrl = event.data.url;
        setHistory((prev) => {
          const next = prev.slice(0, historyIndex + 1);
          return [...next, newUrl];
        });
        setHistoryIndex((prev) => prev + 1);
      } else if (event.data.type === 'FINDRA_PAGE_LOADED') {
        if (event.data.title) {
          setPageTitle(event.data.title);
        }
        setIsLoading(false);
        setLoadTimeoutNotice(false);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [historyIndex]);

  // Handle Esc key to exit browser
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Fetch Reader Mode data
  const fetchReaderContent = async (url: string) => {
    setReaderLoading(true);
    try {
      const res = await fetch(`/api/reader?url=${encodeURIComponent(url)}`);
      if (res.ok) {
        const data = await res.json();
        setReaderData(data);
        if (data.title) setPageTitle(data.title);
      } else {
        setReaderData(null);
      }
    } catch (e) {
      setReaderData(null);
    } finally {
      setReaderLoading(false);
    }
  };

  const handleToggleReaderMode = () => {
    if (viewMode === 'web') {
      setViewMode('reader');
      if (!readerData || readerData.url !== currentUrl) {
        fetchReaderContent(currentUrl);
      }
    } else {
      setViewMode('web');
    }
  };

  const handleBack = () => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
    }
  };

  const handleForward = () => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
    }
  };

  const handleReload = () => {
    setIsLoading(true);
    setLoadTimeoutNotice(false);
    if (viewMode === 'web' && iframeRef.current) {
      if (ytInfo.isYouTube && ytInfo.embedUrl) {
        iframeRef.current.src = `${ytInfo.embedUrl}&reload=${Date.now()}`;
      } else {
        iframeRef.current.src = `/api/proxy?url=${encodeURIComponent(currentUrl)}&t=${Date.now()}`;
      }
    } else {
      fetchReaderContent(currentUrl);
    }
  };

  const handleAddressSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let target = inputUrl.trim();
    if (!target) return;

    if (!target.startsWith('http://') && !target.startsWith('https://')) {
      if (target.includes('.') && !target.includes(' ')) {
        target = 'https://' + target;
      } else {
        target = `https://www.google.com/search?q=${encodeURIComponent(target)}`;
      }
    }

    setHistory((prev) => [...prev.slice(0, historyIndex + 1), target]);
    setHistoryIndex((prev) => prev + 1);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(currentUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handlePlayCustomYt = (e: React.FormEvent) => {
    e.preventDefault();
    const query = ytCustomInput.trim();
    if (!query) return;

    // Check if it's a URL
    const parsed = parseYouTubeEmbed(query);
    if (parsed.isYouTube && parsed.videoId) {
      setActiveYtVideoId(parsed.videoId);
      return;
    }

    // If a video ID was entered directly (11 characters)
    if (/^[a-zA-Z0-9_-]{11}$/.test(query)) {
      setActiveYtVideoId(query);
      return;
    }

    // Otherwise navigate to search query
    const target = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    setHistory((prev) => [...prev.slice(0, historyIndex + 1), target]);
    setHistoryIndex((prev) => prev + 1);
  };

  return (
    <div
      className={`flex flex-col bg-white dark:bg-[#131317] border-slate-300 dark:border-slate-800 shadow-2xl transition-all duration-200 z-50 ${
        isSplitView
          ? 'w-full lg:w-[58%] h-[calc(100vh-65px)] sticky top-[65px] rounded-l-2xl border-l border-t border-b'
          : 'fixed inset-0 w-screen h-screen'
      }`}
    >
      {/* ----------------- BROWSER CHROME TOOLBAR ----------------- */}
      <header className="flex items-center justify-between px-3 py-2 bg-slate-100/90 dark:bg-[#1a1a22] border-b border-slate-200 dark:border-slate-800 text-xs gap-2 select-none">
        {/* Navigation Buttons: Back, Forward, Reload */}
        <div className="flex items-center space-x-1">
          <button
            onClick={handleBack}
            disabled={historyIndex === 0}
            title="Go Back"
            className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-transparent transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <button
            onClick={handleForward}
            disabled={historyIndex >= history.length - 1}
            title="Go Forward"
            className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-transparent transition-colors cursor-pointer"
          >
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            onClick={handleReload}
            title="Reload Webpage"
            className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-blue-500' : ''}`} />
          </button>
        </div>

        {/* Omnibox / Address Bar */}
        <form onSubmit={handleAddressSubmit} className="flex-1 max-w-2xl mx-1 sm:mx-2">
          <div className="flex items-center bg-white dark:bg-[#101014] border border-slate-300 dark:border-slate-700/80 rounded-xl px-2.5 py-1 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent transition-all shadow-inner">
            <Lock className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 mr-1.5 flex-shrink-0" />
            <span className="hidden sm:inline-block font-semibold text-slate-700 dark:text-slate-200 mr-1 text-[11px] truncate max-w-[120px]">
              {hostname}
            </span>
            <input
              type="text"
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              placeholder="Search or enter web address"
              className="flex-1 bg-transparent text-slate-800 dark:text-slate-200 text-xs focus:outline-none font-mono"
            />
          </div>
        </form>

        {/* View Switcher & Action Controls */}
        <div className="flex items-center space-x-1.5">
          {/* Reader Mode Button */}
          <button
            onClick={handleToggleReaderMode}
            title={viewMode === 'reader' ? 'Switch to Full Web View' : 'Switch to Clean Reader View'}
            className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              viewMode === 'reader'
                ? 'bg-blue-600 text-white font-semibold'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span className="hidden md:inline">{viewMode === 'reader' ? 'Reader On' : 'Reader'}</span>
          </button>

          {/* Copy Link */}
          <button
            onClick={handleCopyLink}
            title={copiedLink ? 'Copied!' : 'Copy URL'}
            className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
          >
            <Share2 className={`w-3.5 h-3.5 ${copiedLink ? 'text-emerald-500' : ''}`} />
          </button>

          {/* Direct Open in Tab Button (Prominent) */}
          <a
            href={currentUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Open directly in Native Browser Tab"
            className="flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/60 border border-blue-200 dark:border-blue-800 transition-colors"
          >
            <span className="hidden sm:inline">Open in Tab</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>

          {/* Split Screen / Fullscreen Toggle */}
          <button
            onClick={onToggleSplitView}
            title={isSplitView ? 'Expand to Fullscreen' : 'Split View with Search Results'}
            className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
          >
            {isSplitView ? <Maximize2 className="w-3.5 h-3.5" /> : <Columns className="w-3.5 h-3.5" />}
          </button>

          {/* Close In-App Browser Button */}
          <button
            onClick={onClose}
            title="Close In-App Browser (Esc)"
            className="p-1.5 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer ml-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Progress / Loading Bar */}
      {isLoading && viewMode === 'web' && !ytInfo.isHome && !isRestrictedNonYt && (
        <div className="w-full h-0.5 bg-slate-200 dark:bg-slate-800 overflow-hidden">
          <div className="w-full h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-600 animate-pulse" />
        </div>
      )}

      {/* ----------------- BROWSER VIEWPORT ----------------- */}
      <div className="flex-1 relative overflow-hidden bg-white dark:bg-[#121216]">
        {viewMode === 'reader' ? (
          /* Distraction-Free Reader Mode */
          <div className="w-full h-full overflow-y-auto px-6 sm:px-16 py-8 text-left bg-[#fcfcfd] dark:bg-[#141418]">
            {readerLoading ? (
              <div className="max-w-2xl mx-auto space-y-4 py-12 animate-pulse">
                <div className="h-8 bg-slate-200 dark:bg-slate-800 rounded w-3/4" />
                <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-1/4" />
                <div className="h-24 bg-slate-200 dark:bg-slate-800 rounded w-full mt-6" />
                <div className="h-24 bg-slate-200 dark:bg-slate-800 rounded w-full" />
              </div>
            ) : readerData && readerData.paragraphs.length > 0 ? (
              <article className="max-w-3xl mx-auto">
                <div className="flex items-center justify-between pb-4 mb-6 border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                  <div className="flex items-center space-x-3">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">{readerData.domain}</span>
                    <span>•</span>
                    <span className="flex items-center">
                      <span className="mr-1 text-slate-400">⏱</span>
                      {readerData.reading_time_minutes} min read ({readerData.word_count} words)
                    </span>
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <button
                      onClick={() => setReaderFontSize('sm')}
                      className={`px-2 py-0.5 rounded text-xs cursor-pointer ${
                        readerFontSize === 'sm' ? 'bg-blue-600 text-white' : 'hover:bg-slate-200 dark:hover:bg-slate-800'
                      }`}
                    >
                      A-
                    </button>
                    <button
                      onClick={() => setReaderFontSize('base')}
                      className={`px-2 py-0.5 rounded text-xs cursor-pointer ${
                        readerFontSize === 'base' ? 'bg-blue-600 text-white' : 'hover:bg-slate-200 dark:hover:bg-slate-800'
                      }`}
                    >
                      A
                    </button>
                    <button
                      onClick={() => setReaderFontSize('lg')}
                      className={`px-2 py-0.5 rounded text-xs cursor-pointer ${
                        readerFontSize === 'lg' ? 'bg-blue-600 text-white' : 'hover:bg-slate-200 dark:hover:bg-slate-800'
                      }`}
                    >
                      A+
                    </button>
                  </div>
                </div>

                <h1 className="text-2xl sm:text-4xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight mb-6 leading-tight">
                  {readerData.title}
                </h1>

                <div
                  className={`space-y-5 text-slate-800 dark:text-slate-200 leading-relaxed ${
                    readerFontSize === 'sm'
                      ? 'text-sm'
                      : readerFontSize === 'lg'
                      ? 'text-lg leading-loose'
                      : 'text-base'
                  }`}
                >
                  {readerData.paragraphs.map((p, idx) => (
                    <p key={idx}>{p}</p>
                  ))}
                </div>
              </article>
            ) : (
              <div className="max-w-xl mx-auto text-center py-20">
                <BookOpen className="w-12 h-12 text-slate-400 mx-auto mb-3" />
                <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-1">
                  Reader View Unavailable
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                  This page may be an interactive web app or multimedia site with no article text.
                </p>
                <div className="flex items-center justify-center space-x-3">
                  <button
                    onClick={() => setViewMode('web')}
                    className="px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Switch back to Web View
                  </button>
                  <a
                    href={currentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-semibold rounded-lg hover:bg-slate-300 transition-colors"
                  >
                    Open in New Tab ↗
                  </a>
                </div>
              </div>
            )}
          </div>
        ) : ytInfo.isYouTube && ytInfo.isHome ? (
          /* ================= FIRST-CLASS YOUTUBE VIDEO HUB ================= */
          <div className="w-full h-full overflow-y-auto px-4 sm:px-10 py-6 bg-slate-900 text-white text-left">
            <div className="max-w-4xl mx-auto">
              {/* YouTube Platform Header Card */}
              <div className="bg-gradient-to-r from-red-950/60 via-slate-800/80 to-slate-900 border border-red-900/40 rounded-2xl p-5 mb-6 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex items-center space-x-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-red-600 flex items-center justify-center shadow-lg shadow-red-600/30 flex-shrink-0">
                    <Play className="w-6 h-6 fill-white text-white ml-0.5" />
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <h2 className="text-xl font-bold tracking-tight">YouTube</h2>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-600/20 text-red-400 border border-red-500/30">
                        Official Video Hub
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 mt-0.5">
                      YouTube's full desktop interface restricts cross-origin framing. Watch videos below or launch the full website!
                    </p>
                  </div>
                </div>

                <a
                  href={currentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full md:w-auto px-5 py-2.5 rounded-xl font-bold text-sm bg-red-600 hover:bg-red-500 text-white transition-all shadow-lg shadow-red-600/30 flex items-center justify-center space-x-2 flex-shrink-0 cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-white" />
                  <span>Launch Official YouTube.com ↗</span>
                </a>
              </div>

              {/* Working Embedded Video Player */}
              <div className="bg-black rounded-2xl overflow-hidden border border-slate-800 shadow-2xl mb-6 aspect-video max-h-[500px]">
                <iframe
                  src={`https://www.youtube-nocookie.com/embed/${activeYtVideoId}?autoplay=1&enablejsapi=1`}
                  title="YouTube Player"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  className="w-full h-full border-none"
                />
              </div>

              {/* In-App Video Selector & Quick Playlist */}
              <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-4 mb-6">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Curated Channels & Video Selector
                  </span>
                  <span className="text-xs text-slate-400">Click to play instantly</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                  {[
                    { id: 'jfKfPfyJRdk', title: 'Lofi Chill Beats', category: 'Music', icon: Music },
                    { id: 'kqtD5dpn9C8', title: 'Python Full Course', category: 'Coding', icon: Radio },
                    { id: 'f9XyB85i-Wk', title: 'Web Development', category: 'Dev', icon: Tv },
                    { id: '21X5lGlDOfg', title: 'Space Exploration', category: 'Science', icon: Flame },
                  ].map((vid) => {
                    const Icon = vid.icon;
                    const isActive = activeYtVideoId === vid.id;
                    return (
                      <button
                        key={vid.id}
                        onClick={() => setActiveYtVideoId(vid.id)}
                        className={`p-2.5 rounded-xl text-left border transition-all cursor-pointer ${
                          isActive
                            ? 'bg-red-600/20 border-red-500 text-white font-semibold'
                            : 'bg-slate-900/60 border-slate-700 hover:bg-slate-700/60 text-slate-300'
                        }`}
                      >
                        <div className="flex items-center space-x-1.5 mb-1">
                          <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-red-400' : 'text-slate-400'}`} />
                          <span className="text-[10px] text-slate-400 uppercase font-bold">{vid.category}</span>
                        </div>
                        <p className="text-xs truncate">{vid.title}</p>
                      </button>
                    );
                  })}
                </div>

                {/* Custom Video Search / Link Launcher */}
                <form onSubmit={handlePlayCustomYt} className="flex gap-2">
                  <div className="flex-1 flex items-center bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 focus-within:border-red-500">
                    <Search className="w-3.5 h-3.5 text-slate-400 mr-2 flex-shrink-0" />
                    <input
                      type="text"
                      value={ytCustomInput}
                      onChange={(e) => setYtCustomInput(e.target.value)}
                      placeholder="Paste any YouTube video link or enter video ID (e.g. dQw4w9WgXcQ)..."
                      className="bg-transparent text-xs text-white focus:outline-none w-full"
                    />
                  </div>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-red-600 hover:bg-red-500 text-white transition-colors cursor-pointer flex-shrink-0"
                  >
                    Play Video
                  </button>
                </form>
              </div>
            </div>
          </div>
        ) : ytInfo.isYouTube && ytInfo.embedUrl ? (
          /* ================= EMBEDDED YOUTUBE VIDEO ================= */
          <iframe
            ref={iframeRef}
            src={ytInfo.embedUrl}
            title={pageTitle}
            onLoad={() => setIsLoading(false)}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            className="w-full h-full border-none bg-black"
          />
        ) : isRestrictedNonYt ? (
          /* ================= EMBED RESTRICTED WEB APP FALLBACK ================= */
          <div className="w-full h-full flex items-center justify-center p-6 bg-slate-900 text-white">
            <div className="max-w-md w-full bg-slate-800 border border-slate-700 rounded-2xl p-6 text-center shadow-2xl">
              <ShieldAlert className="w-12 h-12 text-amber-500 mx-auto mb-4" />
              <h2 className="text-xl font-bold mb-2">{hostname}</h2>
              <p className="text-xs text-slate-300 leading-relaxed mb-6">
                This web application blocks in-app iframe embedding due to security and authentication policies.
              </p>
              <a
                href={currentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-3 px-4 rounded-xl font-semibold text-xs bg-blue-600 hover:bg-blue-500 text-white transition-colors flex items-center justify-center space-x-2"
              >
                <span>Open {hostname} in New Tab</span>
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </div>
        ) : (
          /* ================= LIVE WEB VIEW VIA FINDRA PROXY ================= */
          <iframe
            ref={iframeRef}
            src={`/api/proxy?url=${encodeURIComponent(currentUrl)}`}
            title={pageTitle}
            onLoad={() => {
              setIsLoading(false);
              setLoadTimeoutNotice(false);
            }}
            onError={() => {
              setIsLoading(false);
              setLoadTimeoutNotice(true);
            }}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads allow-presentation allow-modals"
            className="w-full h-full border-none bg-white"
          />
        )}
      </div>

      {/* Subtle In-App Browser Footer */}
      <footer className="px-4 py-1.5 bg-slate-100 dark:bg-[#181820] border-t border-slate-200 dark:border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
        <div className="flex items-center space-x-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>
            {ytInfo.isYouTube ? 'YouTube In-App Video Engine' : 'Findra In-App Browser Sandbox'}
          </span>
        </div>
        <div className="flex items-center space-x-3">
          <span>Press <kbd className="px-1 py-0.5 bg-slate-200 dark:bg-slate-700 rounded text-[10px]">Esc</kbd> to return to results</span>
          <a
            href={currentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 font-semibold"
          >
            <span>Open in Native Browser Tab</span>
            <ExternalLink className="w-2.5 h-2.5" />
          </a>
        </div>
      </footer>
    </div>
  );
};
