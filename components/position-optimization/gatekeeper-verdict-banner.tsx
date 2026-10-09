'use client';

import { Ban, ShieldCheck, ClipboardList } from 'lucide-react';
import type { ChecklistItemDef } from '@/lib/gatekeeper-checklist';

interface GatekeeperVerdictBannerProps {
  complete: boolean;
  passed: boolean;
  directionLabel: string;
  targetLabel: string;
  failedItems: ChecklistItemDef[];
  answered: number;
  total: number;
}

export function GatekeeperVerdictBanner({
  complete,
  passed,
  directionLabel,
  targetLabel,
  failedItems,
  answered,
  total,
}: GatekeeperVerdictBannerProps) {
  if (!complete) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-dashed bg-muted/30 p-6">
        <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:text-left">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 border-muted-foreground/30 bg-background">
            <ClipboardList className="h-7 w-7 text-muted-foreground" aria-hidden />
          </div>
          <div className="flex-1">
            <p className="text-lg font-semibold text-foreground">自查进行中</p>
            <p className="mt-1 text-sm text-muted-foreground">
              已完成 {answered}/{total} 项。全部答完后，这里会给出明确的{' '}
              <span className="font-medium text-foreground">继续交易</span> 或{' '}
              <span className="font-medium text-foreground">中止交易</span> 结论。
            </p>
          </div>
          <div
            className="text-3xl font-black tabular-nums text-muted-foreground"
            aria-label={`进度 ${answered} / ${total}`}
          >
            {Math.round((answered / total) * 100)}%
          </div>
        </div>
      </div>
    );
  }

  if (passed) {
    return (
      <div
        className="relative overflow-hidden rounded-2xl border-2 border-emerald-500/50 bg-gradient-to-br from-emerald-500/20 via-emerald-500/5 to-background p-6 shadow-lg shadow-emerald-500/10"
        role="status"
        aria-live="polite"
      >
        <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-emerald-400/20 blur-2xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-md">
            <ShieldCheck className="h-9 w-9" strokeWidth={2.25} aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-300">
              Gatekeeper · GO
            </p>
            <h2 className="mt-1 text-2xl font-black tracking-tight text-emerald-950 dark:text-emerald-50 sm:text-3xl">
              继续交易
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-emerald-900/90 dark:text-emerald-100/90">
              {directionLabel}
              {targetLabel ? ` · ${targetLabel}` : ''} — 全部自查项均为「是」。你可以按纪律执行；仍建议分批建仓并严守止损。
            </p>
          </div>
          <div className="shrink-0 rounded-xl bg-emerald-600 px-5 py-3 text-center text-white">
            <p className="text-[10px] font-semibold uppercase tracking-wider opacity-90">结论</p>
            <p className="text-xl font-black">PROCEED</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative overflow-hidden rounded-2xl border-2 border-red-500/55 bg-gradient-to-br from-red-500/20 via-red-500/5 to-background p-6 shadow-lg shadow-red-500/10"
      role="alert"
      aria-live="assertive"
    >
      <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-red-400/25 blur-2xl" />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-red-600 text-white shadow-md">
          <Ban className="h-9 w-9" strokeWidth={2.25} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-red-700 dark:text-red-300">
            Gatekeeper · ABORT
          </p>
          <h2 className="mt-1 text-2xl font-black tracking-tight text-red-950 dark:text-red-50 sm:text-3xl">
            中止本次交易
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-red-900/90 dark:text-red-100/90">
            {directionLabel}
            {targetLabel ? ` · ${targetLabel}` : ''} — 存在 {failedItems.length}{' '}
            项自查为「否」。请先修正计划、等待更好时机，或仅保存记录后离开。
          </p>
          <ul className="mt-4 space-y-2">
            {failedItems.map((item) => (
              <li
                key={item.id}
                className="flex gap-2 rounded-lg border border-red-500/30 bg-background/80 px-3 py-2 text-sm"
              >
                <span className="shrink-0 font-bold text-red-600">×</span>
                <span>
                  <span className="font-medium">{item.title}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{item.group}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="shrink-0 rounded-xl bg-red-600 px-5 py-3 text-center text-white sm:mt-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider opacity-90">结论</p>
          <p className="text-xl font-black">ABORT</p>
        </div>
      </div>
    </div>
  );
}
