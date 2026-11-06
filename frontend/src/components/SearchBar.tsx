import React, { useState, useEffect, useRef } from 'react';
import { Search, X, Clock, TrendingUp } from 'lucide-react';

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
  size = 'large'
}) => {
  const [query, setQuery] = useState(initialQuery);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  // Fetch suggestions when query changes
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/suggest?q=${encodeURIComponent(trimmed)}`);
        if (res.ok) {
          const data = await res.json();
          setSuggestions(data.suggestions || []);
          setIsOpen(true);
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
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
          inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSubmit = (searchQuery: string) => {
    const trimmed = searchQuery.trim();
    if (!trimmed) return;
    setIsOpen(false);
    onSearch(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev < suggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : suggestions.length - 1));
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
    }
  };

  const isLarge = size === 'large';

  return (
    <div className={`relative w-full ${isLarge ? 'max-w-2xl' : 'max-w-xl'}`}>
      <div
        className={`flex items-center w-full transition-all duration-200 bg-white dark:bg-[#202124] border ${
          isOpen && suggestions.length > 0
            ? 'rounded-t-3xl border-slate-300 dark:border-slate-700 shadow-lg'
            : 'rounded-full border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 shadow-sm hover:shadow'
        } ${isLarge ? 'h-13 px-5' : 'h-11 px-4'}`}
      >
        <Search className={`${isLarge ? 'w-5 h-5' : 'w-4 h-4'} text-slate-400 mr-3 flex-shrink-0`} />
        
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelectedIndex(-1);
          }}
          onFocus={() => {
            if (suggestions.length > 0) setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          autoFocus={autoFocus}
          placeholder="Search the polite web or enter a topic..."
          className={`w-full bg-transparent border-none outline-none text-slate-800 dark:text-slate-100 placeholder-slate-400 ${
            isLarge ? 'text-base' : 'text-sm'
          }`}
        />

        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setSuggestions([]);
              inputRef.current?.focus();
            }}
            className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Autocomplete dropdown */}
      {isOpen && suggestions.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute left-0 right-0 top-full bg-white dark:bg-[#202124] border border-t-0 border-slate-300 dark:border-slate-700 rounded-b-3xl shadow-xl z-50 overflow-hidden py-2"
        >
          {suggestions.map((item, idx) => (
            <div
              key={idx}
              onClick={() => {
                setQuery(item);
                handleSubmit(item);
              }}
              onMouseEnter={() => setSelectedIndex(idx)}
              className={`flex items-center px-5 py-2.5 cursor-pointer text-sm transition-colors ${
                idx === selectedIndex
                  ? 'bg-slate-100 dark:bg-[#303134] text-blue-600 dark:text-blue-400 font-medium'
                  : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#28292c]'
              }`}
            >
              <Clock className="w-4 h-4 text-slate-400 mr-3 flex-shrink-0" />
              <span className="truncate">{item}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

