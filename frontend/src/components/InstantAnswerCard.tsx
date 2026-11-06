import React from 'react';
import { InstantAnswer } from '../types';
import { Calculator, ArrowRightLeft, Sparkles, BookOpen, ExternalLink, Bot, CheckCircle2 } from 'lucide-react';

interface Props {
  answer: InstantAnswer;
}

export const InstantAnswerCard: React.FC<Props> = ({ answer }) => {
  const isAI = answer.type === 'ai_overview';

  if (isAI) {
    return (
      <div className="mb-8 p-5 sm:p-6 rounded-2xl border border-violet-200/80 dark:border-violet-900/50 bg-gradient-to-br from-violet-50/70 via-indigo-50/30 to-white dark:from-violet-950/25 dark:via-[#191924] dark:to-[#14141c] shadow-sm hover:shadow-md transition-shadow max-w-2xl text-left">
        {/* AI Overview Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-violet-600 to-indigo-500 flex items-center justify-center text-white shadow-sm">
              <Sparkles className="w-3.5 h-3.5 animate-pulse" />
            </div>
            <span className="text-xs font-bold tracking-wider uppercase bg-gradient-to-r from-violet-600 via-indigo-600 to-purple-600 dark:from-violet-400 dark:via-indigo-300 dark:to-purple-300 bg-clip-text text-transparent">
              {answer.badge || 'Findra AI Overview'}
            </span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-violet-100/80 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800/50 text-[11px] font-medium">
            <CheckCircle2 className="w-3 h-3 text-violet-600 dark:text-violet-400" />
            <span>Verified Answer</span>
          </div>
        </div>

        {/* Primary Direct Answer */}
        <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight my-1.5">
          {answer.title}
        </div>

        {/* Subtitle / Role / Context */}
        {answer.subtitle && (
          <div className="text-sm font-semibold text-violet-700 dark:text-violet-400 mb-2.5">
            {answer.subtitle}
          </div>
        )}

        {/* In-depth AI Synthesis */}
        {answer.description && (
          <div className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed font-normal">
            {answer.description}
          </div>
        )}

        {/* Source Citation & Attribution Footer */}
        <div className="mt-4 pt-3.5 border-t border-violet-100/90 dark:border-violet-900/30 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
          {answer.source_url ? (
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400 dark:text-slate-500 font-medium">Source:</span>
              <a
                href={answer.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 hover:underline inline-flex items-center gap-1 font-semibold truncate max-w-xs sm:max-w-md"
              >
                <span>{answer.source_title || 'Authoritative Reference'}</span>
                <ExternalLink className="w-3 h-3 flex-shrink-0" />
              </a>
            </div>
          ) : (
            <div className="flex items-center gap-1 text-slate-400 dark:text-slate-500">
              <Bot className="w-3.5 h-3.5" />
              <span>Curated Knowledge Synthesis</span>
            </div>
          )}
          <span className="text-[11px] text-slate-400 dark:text-slate-500">
            Synthesized by Findra AI
          </span>
        </div>
      </div>
    );
  }

  // Standard Instant Answer (Calculator, Unit Converter, Definition, Fact)
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

      {answer.source_url && (
        <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
          <a
            href={answer.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
          >
            <span>{answer.source_title || 'Reference'}</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}
    </div>
  );
};
