import React from 'react';
import { InstantAnswer } from '../types';
import { Calculator, ArrowRightLeft, Sparkles, BookOpen } from 'lucide-react';

interface Props {
  answer: InstantAnswer;
}

export const InstantAnswerCard: React.FC<Props> = ({ answer }) => {
  const getIcon = () => {
    switch (answer.type) {
      case 'calculator':
        return <Calculator className="w-5 h-5 text-blue-600 dark:text-blue-400" />;
      case 'converter':
        return <ArrowRightLeft className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />;
      case 'definition':
        return <BookOpen className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />;
      default:
        return <Sparkles className="w-5 h-5 text-amber-500" />;
    }
  };

  return (
    <div className="mb-6 p-5 rounded-2xl border border-blue-200 dark:border-blue-900/50 bg-gradient-to-r from-blue-50/50 via-white to-slate-50/50 dark:from-blue-950/20 dark:via-[#1a1a1e] dark:to-[#1a1a1e] shadow-sm max-w-2xl text-left">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-2">
          {getIcon()}
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {answer.badge || 'Instant Answer'}
          </span>
        </div>
      </div>

      <div className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100 my-1">
        {answer.title}
      </div>

      {answer.subtitle && (
        <div className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
          {answer.subtitle}
        </div>
      )}

      {answer.description && (
        <div className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
          {answer.description}
        </div>
      )}
    </div>
  );
};

