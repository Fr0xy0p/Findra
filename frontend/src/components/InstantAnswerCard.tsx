import React from 'react';
import { InstantAnswer } from '../types';
import { Calculator, ArrowRightLeft, Sparkles, BookOpen, ExternalLink, Shield, CheckCircle2 } from 'lucide-react';

interface Props {
  answer: InstantAnswer;
}

export const InstantAnswerCard: React.FC<Props> = ({ answer }) => {
  const isAI = answer.type === 'ai_overview';

  if (isAI) {
    return (
      <div className="mb-6 p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-[#2e3245] bg-white dark:bg-[#212330] shadow-sm hover:shadow-md transition-shadow max-w-2xl text-left relative overflow-hidden">
        {/* Brave Leo AI Top Glow Accent */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#fb542b] via-[#ff784b] to-[#7c3aed]" />

        {/* AI Overview Header */}
        <div className="flex items-center justify-between mb-3.5">
          <div className="flex items-center space-x-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-[#fb542b] to-[#7c3aed] flex items-center justify-center text-white shadow-sm">
              <Sparkles className="w-4 h-4 animate-pulse" />
            </div>
            <div>
              <span className="text-xs font-bold tracking-wider uppercase text-[#fb542b] block leading-none">
                {answer.badge || 'Findra AI Overview'}
              </span>
              <span className="text-[10px] text-slate-400 dark:text-[#9ea4b6]">Independent AI synthesis</span>
            </div>
          </div>
          <div className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60 text-[11px] font-medium">
            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
            <span>Verified Knowledge</span>
          </div>
        </div>

        {/* Primary Direct Answer */}
        <div className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-[#f0f2f5] tracking-tight my-1">
          {answer.title}
        </div>

        {/* Subtitle / Role / Context */}
        {answer.subtitle && (
          <div className="text-xs font-semibold text-[#fb542b] mb-2.5">
            {answer.subtitle}
          </div>
        )}

        {/* In-depth AI Synthesis */}
        {answer.description && (
          <div className="text-sm text-slate-700 dark:text-[#9ea4b6] leading-relaxed font-normal">
            {answer.description}
          </div>
        )}

        {/* Source Citation & Attribution Footer */}
        <div className="mt-4 pt-3.5 border-t border-slate-100 dark:border-[#2e3245] flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-[#9ea4b6]">
          {answer.source_url ? (
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400 dark:text-[#71788e] font-medium">Source:</span>
              <a
                href={answer.source_url}
                className="text-[#7c9bf8] hover:underline inline-flex items-center gap-1 font-medium truncate max-w-xs sm:max-w-md cursor-pointer"
              >
                <span>{answer.source_title || 'Authoritative Reference'}</span>
                <ExternalLink className="w-3 h-3 flex-shrink-0" />
              </a>
            </div>
          ) : (
            <div className="flex items-center gap-1 text-slate-400 dark:text-[#71788e]">
              <Shield className="w-3.5 h-3.5 text-[#fb542b]" />
              <span>Independent In-Engine Index</span>
            </div>
          )}
          <span className="text-[11px] text-slate-400 dark:text-[#71788e]">
            Findra Private Neural Synthesis
          </span>
        </div>
      </div>
    );
  }

  // Standard Instant Answer (Calculator, Unit Converter, Definition, Fact)
  const getIcon = () => {
    switch (answer.type) {
      case 'calculator':
        return <Calculator className="w-5 h-5 text-[#fb542b]" />;
      case 'converter':
        return <ArrowRightLeft className="w-5 h-5 text-emerald-500" />;
      case 'definition':
        return <BookOpen className="w-5 h-5 text-[#7c9bf8]" />;
      default:
        return <Sparkles className="w-5 h-5 text-amber-500" />;
    }
  };

  return (
    <div className="mb-6 p-5 rounded-2xl border border-slate-200 dark:border-[#2e3245] bg-white dark:bg-[#212330] shadow-sm max-w-2xl text-left">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-2">
          {getIcon()}
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-[#9ea4b6]">
            {answer.badge || 'Instant Answer'}
          </span>
        </div>
        <span className="text-[11px] font-medium text-slate-400 dark:text-[#71788e]">
          Findra Core
        </span>
      </div>

      <div className="text-2xl font-bold text-slate-900 dark:text-[#f0f2f5] my-1">
        {answer.title}
      </div>

      {answer.subtitle && (
        <div className="text-sm font-medium text-slate-600 dark:text-[#9ea4b6] mb-1">
          {answer.subtitle}
        </div>
      )}

      {answer.description && (
        <div className="text-xs text-slate-500 dark:text-[#9ea4b6] mt-2 leading-relaxed">
          {answer.description}
        </div>
      )}

      {answer.source_url && (
        <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-[#2e3245] text-xs">
          <a
            href={answer.source_url}
            className="text-[#7c9bf8] hover:underline inline-flex items-center gap-1 font-medium"
          >
            <span>{answer.source_title || 'Reference'}</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}
    </div>
  );
};
