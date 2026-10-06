'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Bell, CheckCircle2, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { formatFullMoney } from './chart-theme';
import { StopLossLadder } from './stop-loss-ladder';
import {
  STOP_TIER_META,
  type AssetRow,
  type AssetStopLossConfig,
  type StopTierId,
  assetRowKey,
} from './types';
import {
  ackStorageKey,
  acknowledgeTier,
  clearAckIfRecovered,
  emptyStopConfig,
  isTierAcknowledged,
  loadStopLossConfigs,
  saveStopAcknowledgements,
  saveStopLossConfigs,
  type StopAckMap,
} from '@/lib/stop-loss-config';
import {
  ackStopLossRemote,
  clearStopLossAckRemote,
  fetchStopLossRemote,
  saveStopLossRemote,
} from '@/lib/stop-loss-client';

interface StopLossViewProps {
  assets: AssetRow[];
  assetNameByKey?: Record<string, string>;
}

type TierField = 'price' | 'sellPct';

interface TierDraft {
  price: string;
  sellPct: string;
}

type AssetDraft = Record<StopTierId, TierDraft>;

function emptyDraft(): AssetDraft {
  return {
    relief: { price: '', sellPct: '' },
    retreat: { price: '', sellPct: '' },
    bailout: { price: '', sellPct: '' },
  };
}

function configToDraft(config: AssetStopLossConfig): AssetDraft {
  const toStr = (n: number | null) => (n != null && Number.isFinite(n) ? String(n) : '');
  return {
    relief: { price: toStr(config.relief.price), sellPct: toStr(config.relief.sellPct) },
    retreat: { price: toStr(config.retreat.price), sellPct: toStr(config.retreat.sellPct) },
    bailout: { price: toStr(config.bailout.price), sellPct: toStr(config.bailout.sellPct) },
  };
}

function parseOptionalPositive(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function parseSellPct(raw: string): number | null {
  const n = parseOptionalPositive(raw);
  if (n == null) return null;
  if (n > 100) return 100;
  return n;
}

function draftToConfig(draft: AssetDraft): AssetStopLossConfig {
  const tier = (id: StopTierId) => ({
    price: parseOptionalPositive(draft[id].price),
    sellPct: parseSellPct(draft[id].sellPct),
  });
  return {
    relief: tier('relief'),
    retreat: tier('retreat'),
    bailout: tier('bailout'),
  };
}

function formatQty(qty: number, marketType: string): string {
  if (marketType === 'CRYPTO') {
    return qty.toLocaleString('en-US', { maximumFractionDigits: 8 });
  }
  return qty.toLocaleString('en-US', { maximumFractionDigits: 4 });
}

function formatUnitPrice(price: number, marketType: string, currency: string): string {
  if (marketType === 'CRYPTO' && price < 1) {
    return `${currency} ${price.toLocaleString('en-US', { maximumFractionDigits: 6 })}`;
  }
  return formatFullMoney(price, currency);
}

const TIER_ORDER: StopTierId[] = ['relief', 'retreat', 'bailout'];

function configHasData(config: AssetStopLossConfig): boolean {
  return TIER_ORDER.some(
    (id) => config[id].price != null || config[id].sellPct != null
  );
}

const TIER_UI: Record<
  StopTierId,
  { accent: string; border: string; chip: string }
> = {
  relief: {
    accent: 'text-amber-700 dark:text-amber-300',
    border: 'border-amber-500/40',
    chip: 'bg-amber-500/15 text-amber-900 dark:text-amber-100',
  },
  retreat: {
    accent: 'text-orange-700 dark:text-orange-300',
    border: 'border-orange-500/40',
    chip: 'bg-orange-500/15 text-orange-900 dark:text-orange-100',
  },
  bailout: {
    accent: 'text-red-700 dark:text-red-300',
    border: 'border-red-500/40',
    chip: 'bg-red-500/15 text-red-900 dark:text-red-100',
  },
};

function riskDotSeverity(row: EvaluatedRow): number {
  if (row.activeAlerts.length > 0) {
    return row.worstActive?.meta.severity ?? 3;
  }
  if (row.tiers.some((t) => t.configured)) return 0;
  return -1;
}

interface EvaluatedTier {
  tierId: StopTierId;
  meta: (typeof STOP_TIER_META)[StopTierId];
  configured: boolean;
  triggered: boolean;
  acknowledged: boolean;
  activeAlert: boolean;
  stopPrice: number | null;
  sellPct: number | null;
  sellQty: number;
}

interface EvaluatedRow {
  asset: AssetRow;
  key: string;
  currency: string;
  price: number;
  qty: number;
  tiers: EvaluatedTier[];
  activeAlerts: EvaluatedTier[];
  worstActive: EvaluatedTier | null;
  ladderMin: number;
  ladderMax: number;
}

function MiniRiskBar({
  price,
  minP,
  maxP,
  tiers,
  severity,
}: {
  price: number;
  minP: number;
  maxP: number;
  tiers: EvaluatedTier[];
  severity: number;
}) {
  const span = maxP - minP || 1;
  const pct = Math.min(100, Math.max(0, ((price - minP) / span) * 100));
  const stopPcts = tiers
    .filter((t) => t.stopPrice != null)
    .map((t) => ({
      tierId: t.tierId,
      pct: Math.min(100, Math.max(0, ((t.stopPrice! - minP) / span) * 100)),
    }));

  const barTone =
    severity >= 3
      ? 'from-red-500/80 to-red-900/40'
      : severity === 2
        ? 'from-orange-500/70 to-orange-900/30'
        : severity === 1
          ? 'from-amber-400/70 to-amber-900/30'
          : 'from-emerald-500/50 to-muted';

  return (
    <div className="relative h-14 w-8 shrink-0 overflow-hidden rounded-md border bg-muted/30">
      <div className={`absolute inset-0 bg-gradient-to-t ${barTone}`} />
      {stopPcts.map((s) => (
        <div
          key={s.tierId}
          className="absolute left-0 right-0 border-t border-white/70 dark:border-white/30"
          style={{ bottom: `${s.pct}%` }}
        />
      ))}
      <div
        className="absolute left-0.5 right-0.5 h-1 rounded-full bg-foreground shadow"
        style={{ bottom: `calc(${pct}% - 2px)` }}
      />
    </div>
  );
}

export function StopLossView({ assets, assetNameByKey = {} }: StopLossViewProps) {
  const heldAssets = useMemo(
    () =>
      assets.filter(
        (a) =>
          a.marketType !== 'CASH' &&
          a.currentValue > 0 &&
          (a.quantity ?? 0) > 0 &&
          (a.currentPrice ?? 0) > 0
      ),
    [assets]
  );

  const [drafts, setDrafts] = useState<Record<string, AssetDraft>>({});
  const [acks, setAcks] = useState<StopAckMap>({});
  const [remoteLoaded, setRemoteLoaded] = useState(false);
  const [tableReady, setTableReady] = useState(true);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [expandedEdit, setExpandedEdit] = useState<Record<string, boolean>>({});
  const saveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const heldKeysSignature = useMemo(
    () =>
      heldAssets
        .map((a) => assetRowKey(a.symbol, a.marketType))
        .sort()
        .join('|'),
    [heldAssets]
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const remote = await fetchStopLossRemote();
        if (cancelled) return;

        setTableReady(remote.tableReady);
        const local = loadStopLossConfigs();
        const mergedConfigs = { ...remote.configs };

        if (remote.tableReady) {
          for (const [key, config] of Object.entries(local)) {
            if (!mergedConfigs[key] && configHasData(config)) {
              try {
                await saveStopLossRemote(key, config);
                mergedConfigs[key] = config;
              } catch {
                mergedConfigs[key] = config;
              }
            }
          }
        } else {
          Object.assign(mergedConfigs, local);
        }

        saveStopLossConfigs(mergedConfigs);
        setAcks(remote.acks);
        saveStopAcknowledgements(remote.acks);
        setSyncError(null);
      } catch (err) {
        if (cancelled) return;
        setSyncError(err instanceof Error ? err.message : 'Failed to load stop settings');
      } finally {
        if (!cancelled) setRemoteLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!remoteLoaded) return;
    const stored = loadStopLossConfigs();
    setDrafts((prev) => {
      const next = { ...prev };
      for (const asset of heldAssets) {
        const key = assetRowKey(asset.symbol, asset.marketType);
        if (!(key in next)) {
          next[key] = configToDraft(stored[key] || emptyStopConfig());
        }
      }
      return next;
    });
  }, [heldKeysSignature, heldAssets, remoteLoaded]);

  const persistDraft = useCallback((assetKey: string, draft: AssetDraft) => {
    const config = draftToConfig(draft);
    const stored = loadStopLossConfigs();
    stored[assetKey] = config;
    saveStopLossConfigs(stored);

    if (!tableReady) return;

    const existing = saveTimersRef.current[assetKey];
    if (existing) clearTimeout(existing);
    saveTimersRef.current[assetKey] = setTimeout(() => {
      void saveStopLossRemote(assetKey, config)
        .then(() => setSyncError(null))
        .catch((err) => {
          setSyncError(err instanceof Error ? err.message : 'Failed to save stop settings');
        });
    }, 450);
  }, [tableReady]);

  const updateField = (
    assetKey: string,
    tier: StopTierId,
    field: TierField,
    value: string
  ) => {
    setDrafts((prev) => {
      const current = prev[assetKey] || emptyDraft();
      const nextDraft = {
        ...current,
        [tier]: { ...current[tier], [field]: value },
      };
      persistDraft(assetKey, nextDraft);
      return { ...prev, [assetKey]: nextDraft };
    });
  };

  const evaluated: EvaluatedRow[] = useMemo(() => {
    return heldAssets.map((asset) => {
      const key = assetRowKey(asset.symbol, asset.marketType);
      const draft = drafts[key] || emptyDraft();
      const config = draftToConfig(draft);
      const price = asset.currentPrice ?? 0;
      const qty = asset.quantity ?? 0;
      const currency = asset.priceCurrency || 'USD';

      const tiers: EvaluatedTier[] = TIER_ORDER.map((tierId) => {
        const meta = STOP_TIER_META[tierId];
        const tierConfig = config[tierId];
        const configured = tierConfig.price != null && tierConfig.sellPct != null;
        const triggered =
          configured && price > 0 && tierConfig.price != null && price < tierConfig.price;
        const acknowledged = isTierAcknowledged(
          acks,
          key,
          tierId,
          tierConfig.price,
          tierConfig.sellPct
        );
        const activeAlert = triggered && !acknowledged;
        const sellQty =
          triggered && tierConfig.sellPct != null ? (qty * tierConfig.sellPct) / 100 : 0;
        return {
          tierId,
          meta,
          configured,
          triggered,
          acknowledged,
          activeAlert,
          stopPrice: tierConfig.price,
          sellPct: tierConfig.sellPct,
          sellQty,
        };
      });

      const activeAlerts = tiers.filter((t) => t.activeAlert);
      const worstActive =
        activeAlerts.length > 0
          ? activeAlerts.reduce((a, b) => (a.meta.severity >= b.meta.severity ? a : b))
          : null;

      const ladderPrices = [
        price,
        ...tiers.map((t) => t.stopPrice).filter((p): p is number => p != null && p > 0),
      ];
      const rawMin = Math.min(...ladderPrices);
      const rawMax = Math.max(...ladderPrices);
      const pad = (rawMax - rawMin) * 0.12 || rawMax * 0.05 || 1;

      return {
        asset,
        key,
        currency,
        price,
        qty,
        tiers,
        activeAlerts,
        worstActive,
        ladderMin: Math.max(0, rawMin - pad),
        ladderMax: rawMax + pad,
      };
    });
  }, [heldAssets, drafts, acks]);

  useEffect(() => {
    if (!remoteLoaded) return;
    setAcks((prev) => {
      let next = prev;
      const clearedTiers: Array<{ assetKey: string; tierId: StopTierId }> = [];
      for (const row of evaluated) {
        for (const t of row.tiers) {
          const beforeKey = ackStorageKey(row.key, t.tierId);
          const hadAck = Boolean(next[beforeKey]);
          next = clearAckIfRecovered(next, row.key, t.tierId, row.price, t.stopPrice);
          if (hadAck && !next[beforeKey]) {
            clearedTiers.push({ assetKey: row.key, tierId: t.tierId });
          }
        }
      }
      if (clearedTiers.length === 0) return prev;
      saveStopAcknowledgements(next);
      if (tableReady) {
        for (const item of clearedTiers) {
          void clearStopLossAckRemote(item.assetKey, item.tierId).catch(() => {});
        }
      }
      return next;
    });
  }, [evaluated, remoteLoaded, tableReady]);

  const acknowledgeOne = (
    assetKey: string,
    tierId: StopTierId,
    stopPrice: number,
    sellPct: number
  ) => {
    const next = acknowledgeTier(acks, assetKey, tierId, stopPrice, sellPct);
    saveStopAcknowledgements(next);
    setAcks(next);
    if (tableReady) {
      void ackStopLossRemote(assetKey, tierId, stopPrice, sellPct).catch((err) => {
        setSyncError(err instanceof Error ? err.message : 'Failed to save acknowledgement');
      });
    }
  };

  const acknowledgeAllActive = () => {
    let next = { ...acks };
    const pending: Array<{
      assetKey: string;
      tierId: StopTierId;
      stopPrice: number;
      sellPct: number;
    }> = [];
    for (const row of evaluated) {
      for (const t of row.activeAlerts) {
        if (t.stopPrice != null && t.sellPct != null) {
          next = acknowledgeTier(next, row.key, t.tierId, t.stopPrice, t.sellPct);
          pending.push({
            assetKey: row.key,
            tierId: t.tierId,
            stopPrice: t.stopPrice,
            sellPct: t.sellPct,
          });
        }
      }
    }
    saveStopAcknowledgements(next);
    setAcks(next);
    if (tableReady) {
      for (const item of pending) {
        void ackStopLossRemote(
          item.assetKey,
          item.tierId,
          item.stopPrice,
          item.sellPct
        ).catch(() => {});
      }
    }
  };

  const activeAlertCount = evaluated.reduce((n, row) => n + row.activeAlerts.length, 0);
  const armedCount = evaluated.filter((row) => row.tiers.some((t) => t.configured)).length;
  const anyConfigured = armedCount > 0;

  const sorted = useMemo(() => {
    return [...evaluated].sort((a, b) => {
      const sevA = a.worstActive?.meta.severity ?? 0;
      const sevB = b.worstActive?.meta.severity ?? 0;
      if (sevB !== sevA) return sevB - sevA;
      return b.asset.currentValue - a.asset.currentValue;
    });
  }, [evaluated]);

  if (heldAssets.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No open non-cash positions. Add holdings to configure stop-loss tiers.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {!remoteLoaded && (
        <p className="text-sm text-muted-foreground">Loading stop-loss settings…</p>
      )}
      {!tableReady && remoteLoaded && (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100">
          Cloud save unavailable: run Supabase migrations{' '}
          <code className="text-xs">006_asset_display_names.sql</code> and{' '}
          <code className="text-xs">007_asset_stop_loss.sql</code>. Using browser cache only until
          then.
        </p>
      )}
      {syncError && (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-900 dark:text-red-100">
          {syncError}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Active signals
          </p>
          <p
            className={`mt-1 text-3xl font-bold tabular-nums ${
              activeAlertCount > 0 ? 'text-red-600' : 'text-emerald-600'
            }`}
          >
            {activeAlertCount}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Unacknowledged stop breaches</p>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Armed
          </p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-foreground">{armedCount}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            of {heldAssets.length} positions with stops set
          </p>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Ladder view
          </p>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Dark line = live price. Colored bands = Relief / Retreat / Bailout. Edit thresholds
            below each chart; ack when you&apos;ve executed the sell.
          </p>
        </div>
      </div>

      {activeAlertCount > 0 ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-red-700 dark:text-red-300">
              <Bell className="h-4 w-4" aria-hidden />
              Action required
            </div>
            <Button type="button" size="sm" variant="secondary" onClick={acknowledgeAllActive}>
              Acknowledge all
            </Button>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {sorted
              .filter((row) => row.activeAlerts.length > 0)
              .map((row) => {
                const name = assetNameByKey[row.key] || row.asset.name || row.asset.symbol;
                return (
                  <div
                    key={`alert-${row.key}`}
                    className="rounded-xl border border-red-500/35 bg-gradient-to-br from-red-500/10 to-background p-4"
                  >
                    <p className="font-semibold">{name}</p>
                    <p className="text-xs text-muted-foreground">{row.asset.symbol}</p>
                    <div className="mt-3 space-y-2">
                      {row.activeAlerts.map((t) => (
                        <div
                          key={t.tierId}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-background/80 px-3 py-2 text-sm"
                        >
                          <div>
                            <span className={`font-medium ${TIER_UI[t.tierId].accent}`}>
                              {t.meta.labelZh}
                            </span>
                            <span className="text-muted-foreground"> · Sell {t.sellPct}%</span>
                            <span className="block text-xs text-muted-foreground">
                              {formatQty(t.sellQty, row.asset.marketType)} units
                            </span>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            onClick={() =>
                              t.stopPrice != null &&
                              t.sellPct != null &&
                              acknowledgeOne(row.key, t.tierId, t.stopPrice, t.sellPct)
                            }
                          >
                            <CheckCircle2 className="mr-1.5 h-4 w-4" />
                            Done
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-900 dark:text-emerald-100">
          <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden />
          {anyConfigured
            ? 'No unacknowledged stop signals — portfolio ladder is clear.'
            : 'Configure stop prices on the charts below to enable ladder alerts.'}
        </div>
      )}

      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Portfolio risk map
        </p>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {sorted.map((row) => {
            const displayName =
              assetNameByKey[row.key] || row.asset.name || row.asset.symbol;
            const showSymbol =
              displayName !== row.asset.symbol && row.asset.symbol.length > 0;
            const sev = riskDotSeverity(row);
            return (
              <div
                key={`map-${row.key}`}
                className="flex min-w-[92px] max-w-[112px] flex-col items-center gap-1.5 rounded-lg border bg-card px-2 py-2"
                title={
                  showSymbol ? `${displayName} (${row.asset.symbol})` : displayName
                }
              >
                <MiniRiskBar
                  price={row.price}
                  minP={row.ladderMin}
                  maxP={row.ladderMax}
                  tiers={row.tiers}
                  severity={sev}
                />
                <div className="w-full text-center">
                  <p className="line-clamp-2 text-[10px] font-medium leading-snug text-foreground">
                    {displayName}
                  </p>
                  {showSymbol && (
                    <p className="mt-0.5 truncate text-[9px] text-muted-foreground">
                      {row.asset.symbol}
                    </p>
                  )}
                </div>
                {row.activeAlerts.length > 0 && (
                  <span className="rounded-full bg-red-600 px-1.5 text-[9px] font-bold text-white">
                    {row.activeAlerts.length}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        {sorted.map((row) => {
          const { asset, key, currency, price, qty, tiers, activeAlerts } = row;
          const displayName = assetNameByKey[key] || asset.name || asset.symbol;
          const showEdit = expandedEdit[key] ?? false;
          const formatPrice = (n: number) => formatUnitPrice(n, asset.marketType, currency);

          return (
            <article
              key={key}
              className={`rounded-2xl border bg-card p-4 shadow-sm ${
                activeAlerts.length > 0 ? 'ring-2 ring-red-500/30' : ''
              }`}
            >
              <header className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-lg font-semibold">{displayName}</h3>
                  <p className="text-xs text-muted-foreground">
                    {asset.symbol} · {asset.marketType}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold tabular-nums">{formatPrice(price)}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {formatFullMoney(asset.currentValue, currency)}
                  </p>
                </div>
              </header>

              <StopLossLadder
                currentPrice={price}
                tiers={tiers.map((t) => ({
                  tierId: t.tierId,
                  labelEn: t.meta.labelEn,
                  labelZh: t.meta.labelZh,
                  stopPrice: t.stopPrice,
                  sellPct: t.sellPct,
                  configured: t.configured,
                  triggered: t.triggered,
                  activeAlert: t.activeAlert,
                  acknowledged: t.acknowledged,
                }))}
                formatPrice={formatPrice}
              />

              <div className="mt-3 flex flex-wrap gap-2">
                {tiers.map((t) => {
                  if (!t.configured) {
                    return (
                      <span
                        key={t.tierId}
                        className="rounded-full border border-dashed px-2 py-0.5 text-[10px] text-muted-foreground"
                      >
                        {t.meta.labelZh}: not set
                      </span>
                    );
                  }
                  if (t.activeAlert) {
                    return (
                      <span
                        key={t.tierId}
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${TIER_UI[t.tierId].chip}`}
                      >
                        {t.meta.labelZh}: sell {t.sellPct}%
                      </span>
                    );
                  }
                  if (t.acknowledged && t.triggered) {
                    return (
                      <span
                        key={t.tierId}
                        className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"
                      >
                        {t.meta.labelZh}: acked
                      </span>
                    );
                  }
                  return (
                    <span
                      key={t.tierId}
                      className="rounded-full bg-muted/60 px-2 py-0.5 text-[10px] text-muted-foreground"
                    >
                      {t.meta.labelZh}: armed
                    </span>
                  );
                })}
              </div>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-3 w-full text-muted-foreground"
                onClick={() => setExpandedEdit((p) => ({ ...p, [key]: !showEdit }))}
              >
                <SlidersHorizontal className="mr-2 h-4 w-4" />
                {showEdit ? 'Hide thresholds' : 'Edit stop thresholds'}
              </Button>

              {showEdit && (
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {tiers.map((t) => {
                    const draft = drafts[key] || emptyDraft();
                    const ui = TIER_UI[t.tierId];
                    return (
                      <div
                        key={t.tierId}
                        className={`rounded-lg border p-2.5 ${ui.border} bg-muted/20`}
                      >
                        <p className={`text-xs font-semibold ${ui.accent}`}>
                          {t.meta.labelEn}
                        </p>
                        <p className="text-[10px] text-muted-foreground">{t.meta.labelZh}</p>
                        <div className="mt-2 space-y-1.5">
                          <div>
                            <Label htmlFor={`${key}-${t.tierId}-price`} className="text-[10px]">
                              Stop ({currency})
                            </Label>
                            <Input
                              id={`${key}-${t.tierId}-price`}
                              className="mt-0.5 h-8 text-xs"
                              inputMode="decimal"
                              placeholder="Price"
                              value={draft[t.tierId].price}
                              onChange={(e) =>
                                updateField(key, t.tierId, 'price', e.target.value)
                              }
                            />
                          </div>
                          <div>
                            <Label htmlFor={`${key}-${t.tierId}-pct`} className="text-[10px]">
                              Sell %
                            </Label>
                            <Input
                              id={`${key}-${t.tierId}-pct`}
                              className="mt-0.5 h-8 text-xs"
                              inputMode="decimal"
                              placeholder="%"
                              value={draft[t.tierId].sellPct}
                              onChange={(e) =>
                                updateField(key, t.tierId, 'sellPct', e.target.value)
                              }
                            />
                          </div>
                          {t.activeAlert && t.stopPrice != null && t.sellPct != null && (
                            <Button
                              type="button"
                              size="sm"
                              className="mt-1 h-7 w-full text-xs"
                              variant="secondary"
                              onClick={() =>
                                acknowledgeOne(key, t.tierId, t.stopPrice!, t.sellPct!)
                              }
                            >
                              Mark done
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
