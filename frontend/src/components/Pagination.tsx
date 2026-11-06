import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export const Pagination: React.FC<Props> = ({ currentPage, totalPages, onPageChange }) => {
  if (totalPages <= 1) return null;

  const maxVisible = 7;
  let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
  let endPage = Math.min(totalPages, startPage + maxVisible - 1);

  if (endPage - startPage + 1 < maxVisible) {
    startPage = Math.max(1, endPage - maxVisible + 1);
  }

  const pages = [];
  for (let i = startPage; i <= endPage; i++) {
    pages.push(i);
  }

  return (
    <nav className="flex flex-col items-center my-10 max-w-2xl">
      {/* Playful Google/Brave style Logo lettering */}
      <div className="flex items-center text-3xl font-bold tracking-tight mb-4 select-none">
        <span className="text-[#4285F4]">F</span>
        {pages.map((p) => (
          <span
            key={p}
            onClick={() => onPageChange(p)}
            className={`cursor-pointer transition-transform hover:scale-125 px-0.5 ${
              p === currentPage
                ? 'text-[#EA4335] underline underline-offset-4'
                : p % 3 === 0
                ? 'text-[#FBBC05]'
                : p % 2 === 0
                ? 'text-[#34A853]'
                : 'text-[#4285F4]'
            }`}
          >
            i
          </span>
        ))}
        <span className="text-[#FBBC05]">n</span>
        <span className="text-[#4285F4]">d</span>
        <span className="text-[#34A853]">r</span>
        <span className="text-[#EA4335]">a</span>
      </div>

      {/* Numerical buttons */}
      <div className="flex items-center space-x-1">
        <button
          disabled={currentPage === 1}
          onClick={() => onPageChange(currentPage - 1)}
          className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none transition-colors"
          title="Previous page"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        {pages.map((p) => (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            className={`w-9 h-9 rounded-lg text-sm font-medium transition-colors ${
              p === currentPage
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            {p}
          </button>
        ))}

        <button
          disabled={currentPage === totalPages}
          onClick={() => onPageChange(currentPage + 1)}
          className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none transition-colors"
          title="Next page"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    </nav>
  );
};

