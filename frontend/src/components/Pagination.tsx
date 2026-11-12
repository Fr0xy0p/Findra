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
      {/* Numerical buttons - Brave Search Style */}
      <div className="flex items-center space-x-1.5 bg-white dark:bg-[#212330] p-1.5 rounded-2xl border border-slate-200 dark:border-[#2e3245] shadow-sm">
        <button
          disabled={currentPage === 1}
          onClick={() => onPageChange(currentPage - 1)}
          className="p-2 rounded-xl text-slate-500 hover:text-slate-800 dark:text-[#9ea4b6] dark:hover:text-[#f0f2f5] hover:bg-slate-100 dark:hover:bg-[#2c3042] disabled:opacity-25 disabled:pointer-events-none transition-colors cursor-pointer"
          title="Previous page"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        {pages.map((p) => (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            className={`w-9 h-9 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              p === currentPage
                ? 'bg-[#fb542b] text-white shadow-sm'
                : 'text-slate-700 dark:text-[#9ea4b6] hover:text-slate-900 dark:hover:text-[#f0f2f5] hover:bg-slate-100 dark:hover:bg-[#2c3042]'
            }`}
          >
            {p}
          </button>
        ))}

        <button
          disabled={currentPage === totalPages}
          onClick={() => onPageChange(currentPage + 1)}
          className="p-2 rounded-xl text-slate-500 hover:text-slate-800 dark:text-[#9ea4b6] dark:hover:text-[#f0f2f5] hover:bg-slate-100 dark:hover:bg-[#2c3042] disabled:opacity-25 disabled:pointer-events-none transition-colors cursor-pointer"
          title="Next page"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </nav>
  );
};
