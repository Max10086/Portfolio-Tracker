'use client';

import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { ChecklistAnswer, ChecklistItemDef } from '@/lib/gatekeeper-checklist';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight, HelpCircle } from 'lucide-react';

export type GroupStep = [string, ChecklistItemDef[]];

export type GroupStepStatus = 'empty' | 'partial' | 'pass' | 'fail';

export function groupStepStatus(
  groupItems: ChecklistItemDef[],
  answers: Record<string, ChecklistAnswer>
): GroupStepStatus {
  let answered = 0;
  let nos = 0;
  for (const item of groupItems) {
    const a = answers[item.id];
    if (a === 'yes' || a === 'no') answered += 1;
    if (a === 'no') nos += 1;
  }
  if (answered === 0) return 'empty';
  if (nos > 0) return 'fail';
  if (answered >= groupItems.length) return 'pass';
  return 'partial';
}

const STATUS_DOT: Record<GroupStepStatus, string> = {
  empty: 'bg-muted-foreground/35 ring-muted-foreground/20',
  partial: 'bg-amber-500 ring-amber-500/30',
  pass: 'bg-emerald-500 ring-emerald-500/30',
  fail: 'bg-red-500 ring-red-500/30',
};

interface GatekeeperChecklistRailProps {
  steps: GroupStep[];
  answers: Record<string, ChecklistAnswer>;
  onAnswer: (id: string, value: ChecklistAnswer) => void;
  directionKey: string;
}

function ItemHint({ item }: { item: ChecklistItemDef }) {
  const [open, setOpen] = useState(false);

  const toggle = (e: MouseEvent) => {
    e.preventDefault();
    setOpen((v) => !v);
  };

  return (
    <Tooltip open={open} onOpenChange={setOpen} delayDuration={150}>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="shrink-0 rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label={`查看说明：${item.title}`}
          aria-expanded={open}
          onClick={toggle}
        >
          <HelpCircle className="h-4 w-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        align="end"
        className="max-w-[min(20rem,calc(100vw-2rem))] space-y-2 p-3 text-left"
        onPointerDownOutside={() => setOpen(false)}
      >
        <p>
          <span className="font-semibold text-foreground">常见错误</span>
          <br />
          {item.mistake}
        </p>
        <p>
          <span className="font-semibold text-foreground">检查标准</span>
          <br />
          {item.standard}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

export function GatekeeperChecklistRail({
  steps,
  answers,
  onAnswer,
  directionKey,
}: GatekeeperChecklistRailProps) {
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    setActiveStep(0);
  }, [directionKey]);

  const statuses = useMemo(
    () => steps.map(([, items]) => groupStepStatus(items, answers)),
    [steps, answers]
  );

  const safeStep = Math.min(activeStep, Math.max(0, steps.length - 1));
  const [groupName, groupItems] = steps[safeStep] ?? ['', []];
  const currentStatus = statuses[safeStep] ?? 'empty';
  const groupAnswered = groupItems.filter((i) => {
    const a = answers[i.id];
    return a === 'yes' || a === 'no';
  }).length;
  const groupComplete = groupItems.length > 0 && groupAnswered >= groupItems.length;

  const goNext = () => setActiveStep((s) => Math.min(steps.length - 1, s + 1));
  const goPrev = () => setActiveStep((s) => Math.max(0, s - 1));

  if (steps.length === 0) return null;

  return (
    <TooltipProvider>
      <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="border-b bg-muted/30 px-3 py-4 sm:px-4">
          <p className="mb-3 text-center text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
            自查轨道
          </p>
          <div className="flex items-start justify-between gap-1 overflow-x-auto pb-1">
            {steps.map(([name], idx) => {
              const status = statuses[idx];
              const isActive = idx === safeStep;
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => setActiveStep(idx)}
                  className={cn(
                    'flex min-w-[4.5rem] flex-1 flex-col items-center gap-1.5 rounded-lg px-1 py-1 transition-colors',
                    isActive && 'bg-background shadow-sm ring-1 ring-border'
                  )}
                >
                  <span
                    className={cn(
                      'flex h-3 w-3 shrink-0 rounded-full ring-2',
                      STATUS_DOT[status]
                    )}
                    aria-hidden
                  />
                  <span
                    className={cn(
                      'line-clamp-2 text-center text-[10px] font-medium leading-tight sm:text-[11px]',
                      isActive ? 'text-foreground' : 'text-muted-foreground'
                    )}
                  >
                    {name}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-2 hidden h-0.5 sm:block">
            <div className="relative mx-6 h-full rounded-full bg-muted">
              <div
                className="absolute left-0 top-0 h-full rounded-full bg-primary/60 transition-all duration-300"
                style={{
                  width:
                    steps.length <= 1
                      ? '100%'
                      : `${(safeStep / (steps.length - 1)) * 100}%`,
                }}
              />
            </div>
          </div>
        </div>

        <div className="px-4 py-4 sm:px-5">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-xs text-muted-foreground">
                第 {safeStep + 1} / {steps.length} 关
              </p>
              <h3 className="text-lg font-bold tracking-tight">{groupName}</h3>
            </div>
            <p className="text-xs tabular-nums text-muted-foreground">
              本关 {groupAnswered}/{groupItems.length}
              {currentStatus === 'fail' && (
                <span className="ml-1 font-medium text-red-600">· 存在否</span>
              )}
            </p>
          </div>

          <ul className="space-y-2">
            {groupItems.map((item, rowIdx) => {
              const ans = answers[item.id] ?? null;
              return (
                <li
                  key={item.id}
                  className={cn(
                    'flex items-center gap-2 rounded-xl border px-3 py-2.5 transition-colors sm:gap-3',
                    ans === 'no' && 'border-red-500/45 bg-red-500/5',
                    ans === 'yes' && 'border-emerald-500/25 bg-emerald-500/[0.04]'
                  )}
                >
                  <span className="hidden w-5 shrink-0 text-xs tabular-nums text-muted-foreground sm:inline">
                    {rowIdx + 1}.
                  </span>
                  <p className="min-w-0 flex-1 text-sm font-medium leading-snug">{item.title}</p>
                  <ItemHint item={item} />
                  <div
                    className="flex shrink-0 rounded-lg border bg-muted/50 p-0.5"
                    role="group"
                    aria-label={item.title}
                  >
                    <button
                      type="button"
                      className={cn(
                        'rounded-md px-2.5 py-1 text-xs font-semibold transition-colors sm:px-3',
                        ans === 'yes'
                          ? 'bg-emerald-600 text-white shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                      onClick={() => onAnswer(item.id, 'yes')}
                    >
                      是
                    </button>
                    <button
                      type="button"
                      className={cn(
                        'rounded-md px-2.5 py-1 text-xs font-semibold transition-colors sm:px-3',
                        ans === 'no'
                          ? 'bg-red-600 text-white shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                      onClick={() => onAnswer(item.id, 'no')}
                    >
                      否
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>

          <p className="mt-3 text-center text-[11px] text-muted-foreground">
            点击或悬停 <HelpCircle className="inline h-3 w-3" /> 查看常见错误与检查标准
          </p>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={safeStep <= 0}
              onClick={goPrev}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              上一关
            </Button>
            {groupComplete && safeStep < steps.length - 1 ? (
              <Button type="button" size="sm" onClick={goNext}>
                下一关
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            ) : (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={safeStep >= steps.length - 1}
                onClick={goNext}
              >
                下一关
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </section>
    </TooltipProvider>
  );
}
