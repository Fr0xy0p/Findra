import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  RotateCw,
  Globe,
  Lock,
  BookOpen,
  Maximize2,
  Minimize2,
  ExternalLink,
  X,
  Columns,
  Type,
  Clock,
  Sparkles,
  Share2
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

  // View Modes: 'web' or 'reader'
  const [viewMode, setViewMode] = useState<'web' | 'reader'>('web');
  const [readerData, setReaderData] = useState<ReaderData | null>(null);
  const [readerLoading, setReaderLoading] = useState(false);
  const [readerFontSize, setReaderFontSize] = useState<'sm' | 'base' | 'lg'>('base');
  const [copiedLink, setCopiedLink] = useState(false);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const currentUrl = history[historyIndex] || initialUrl;

  // Sync address input when current URL changes
  useEffect(() => {
    setInputUrl(currentUrl);
    setIsLoading(true);

    if (viewMode === 'reader') {
      fetchReaderContent(currentUrl);
    }
  }, [currentUrl]);

  // Listen for navigation messages sent by the proxy bridge inside the iframe
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

  // Browser Navigation Actions
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
    if (viewMode === 'web' && iframeRef.current) {
      iframeRef.current.src = `/api/proxy?url=${encodeURIComponent(currentUrl)}&t=${Date.now()}`;
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
        // Query search
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

  let hostname = '';
  try {
    hostname = new URL(currentUrl).hostname;
  } catch (e) {
    hostname = currentUrl;
  }

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

          {/* Split Screen / Fullscreen Toggle */}
          <button
            onClick={onToggleSplitView}
            title={isSplitView ? 'Expand to Fullscreen' : 'Split View with Search Results'}
            className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
          >
            {isSplitView ? <Maximize2 className="w-3.5 h-3.5" /> : <Columns className="w-3.5 h-3.5" />}
          </button>

          {/* Open in External Tab */}
          <a
            href={currentUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Open in Native Browser Tab"
            className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors inline-flex items-center"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>

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

      {/* Progress / Loading Indicator */}
      {isLoading && viewMode === 'web' && (
        <div className="w-full h-0.5 bg-slate-200 dark:bg-slate-800 overflow-hidden">
          <div className="w-full h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-600 animate-pulse" />
        </div>
      )}

      {/* ----------------- BROWSER VIEWPORT ----------------- */}
      <div className="flex-1 relative overflow-hidden bg-white dark:bg-[#121216]">
        {viewMode === 'web' ? (
          /* Live Web View via Findra In-App Proxy */
          <iframe
            ref={iframeRef}
            src={`/api/proxy?url=${encodeURIComponent(currentUrl)}`}
            title={pageTitle}
            onLoad={() => setIsLoading(false)}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
            className="w-full h-full border-none bg-white"
          />
        ) : (
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
                {/* Reader Toolbar: Font Size Controls */}
                <div className="flex items-center justify-between pb-4 mb-6 border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                  <div className="flex items-center space-x-3">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">{readerData.domain}</span>
                    <span>•</span>
                    <span className="flex items-center">
                      <Clock className="w-3.5 h-3.5 mr-1 text-slate-400" />
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

                {/* Article Title */}
                <h1 className="text-2xl sm:text-4xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight mb-6 leading-tight">
                  {readerData.title}
                </h1>

                {/* Article Paragraphs */}
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
                <button
                  onClick={() => setViewMode('web')}
                  className="px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Switch back to Web View
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Subtle In-App Browser Footer */}
      <footer className="px-4 py-1.5 bg-slate-100 dark:bg-[#181820] border-t border-slate-200 dark:border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
        <div className="flex items-center space-x-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>Findra In-App Browser Sandbox</span>
        </div>
        <div className="flex items-center space-x-3">
          <span>Press <kbd className="px-1 py-0.5 bg-slate-200 dark:bg-slate-700 rounded text-[10px]">Esc</kbd> to return to results</span>
          <a
            href={currentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 font-medium"
          >
            <span>Open in Tab</span>
            <ExternalLink className="w-2.5 h-2.5" />
          </a>
        </div>
      </footer>
    </div>
  );
};
