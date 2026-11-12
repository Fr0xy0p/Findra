import React, { useState, useEffect, useRef } from 'react';
import { Search, X, Clock, ArrowRight } from 'lucide-react';

interface SearchBarProps {
  initialQuery?: string;
  onSearch: (query: string) => void;
  autoFocus?: boolean;
  size?: 'large' | 'compact';
}

export const SearchBar: React.FC<SearchBarProps> = ({
  initialQuery = '',
  onSearch,
  autoFocus = false,
  size = 'large',
}) => {
  const [query, setQuery] = useState(initialQuery);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const justSubmittedRef = useRef<boolean>(false);

  // Sync with initialQuery
  useEffect(() => {
    setQuery(initialQuery);
    setIsOpen(false);
    setSuggestions([]);
    setSelectedIndex(-1);
  }, [initialQuery]);

  // Fetch suggestions ONLY when user is actively interacting with the input
  useEffect(() => {
    if (justSubmittedRef.current) {
      setIsOpen(false);
      return;
    }

    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    if (typeof document !== 'undefined' && document.activeElement !== inputRef.current) {
      setIsOpen(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/suggest?q=${encodeURIComponent(trimmed)}`);
        if (res.ok) {
          const data = await res.json();
          const list = data.suggestions || [];
          setSuggestions(list);
          if (
            typeof document !== 'undefined' &&
            document.activeElement === inputRef.current &&
            list.length > 0 &&
            !justSubmittedRef.current
          ) {
            setIsOpen(true);
          } else {
            setIsOpen(false);
          }
        }
      } catch (err) {
        // silent fail on suggest
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [query]);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSubmit = (searchQuery: string) => {
    const trimmed = searchQuery.trim();
    if (!trimmed) return;
    justSubmittedRef.current = true;
    setIsOpen(false);
    setSuggestions([]);
    setSelectedIndex(-1);
    inputRef.current?.blur();

    onSearch(trimmed);

    setTimeout(() => {
      justSubmittedRef.current = false;
    }, 300);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
        const selected = suggestions[selectedIndex];
        setQuery(selected);
        handleSubmit(selected);
      } else {
        handleSubmit(query);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setSelectedIndex(-1);
    }
  };

  const isLarge = size === 'large';

  return (
    <div className={`relative w-full ${isLarge ? 'max-w-2xl' : 'max-w-xl'}`}>
      <div
        className={`flex items-center w-full transition-all duration-200 bg-white dark:bg-[#212330] border ${
          isOpen && suggestions.length > 0
            ? 'rounded-t-2xl border-[#fb542b] ring-2 ring-[#fb542b]/25 shadow-lg'
            : 'rounded-full border-slate-200 dark:border-[#2e3245] hover:border-slate-300 dark:hover:border-[#3d425c] focus-within:border-[#fb542b] focus-within:ring-2 focus-within:ring-[#fb542b]/25 shadow-sm hover:shadow'
        } ${isLarge ? 'h-13 px-5' : 'h-11 px-4'}`}
      >
        <Search className={`${isLarge ? 'w-5 h-5' : 'w-4 h-4'} text-slate-400 dark:text-[#9ea4b6] mr-3 flex-shrink-0`} />

        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            justSubmittedRef.current = false;
            setQuery(e.target.value);
            setSelectedIndex(-1);
          }}
          onFocus={() => {
            justSubmittedRef.current = false;
            if (suggestions.length > 0) setIsOpen(true);
          }}
          onBlur={() => {
            setTimeout(() => {
              setIsOpen(false);
            }, 150);
          }}
          onKeyDown={handleKeyDown}
          autoFocus={autoFocus}
          placeholder="Search the polite web or enter a URL..."
          className={`w-full bg-transparent border-none outline-none text-slate-900 dark:text-[#f0f2f5] placeholder-slate-400 dark:placeholder-[#9ea4b6] font-normal ${
            isLarge ? 'text-base' : 'text-sm'
          }`}
        />

        <div className="flex items-center space-x-1.5 flex-shrink-0 ml-2">
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setSuggestions([]);
                setIsOpen(false);
                inputRef.current?.focus();
              }}
              className="p-1 hover:bg-slate-100 dark:hover:bg-[#2e3245] rounded-full text-slate-400 dark:text-[#9ea4b6] hover:text-slate-600 dark:hover:text-[#f0f2f5] transition-colors cursor-pointer"
              title="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}

          <button
            type="button"
            onClick={() => handleSubmit(query)}
            className={`flex items-center justify-center rounded-full bg-[#fb542b] hover:bg-[#e03e17] active:bg-[#c9330e] text-white transition-all cursor-pointer shadow-sm ${
              isLarge ? 'w-8 h-8' : 'w-7 h-7'
            }`}
            title="Search"
          >
            <ArrowRight className={`${isLarge ? 'w-4 h-4' : 'w-3.5 h-3.5'}`} />
          </button>
        </div>
      </div>

      {/* Autocomplete dropdown - Brave Search Style */}
      {isOpen && suggestions.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute left-0 right-0 top-full bg-white dark:bg-[#212330] border border-t-0 border-[#fb542b] rounded-b-2xl shadow-xl z-50 overflow-hidden py-2"
        >
          {suggestions.map((item, idx) => (
            <div
              key={idx}
              onMouseDown={(e) => {
                e.preventDefault();
                setQuery(item);
                handleSubmit(item);
              }}
              onMouseEnter={() => setSelectedIndex(idx)}
              className={`flex items-center px-5 py-2.5 cursor-pointer text-sm transition-colors ${
                idx === selectedIndex
                  ? 'bg-orange-50 dark:bg-[#2c3042] text-[#fb542b] font-medium'
                  : 'text-slate-700 dark:text-[#f0f2f5] hover:bg-slate-50 dark:hover:bg-[#282a3a]'
              }`}
            >
              <Clock className="w-4 h-4 text-slate-400 dark:text-[#9ea4b6] mr-3 flex-shrink-0" />
              <span className="truncate">{item}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
