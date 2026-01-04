'use client';

import { useState, useEffect, useCallback } from 'react';
import { HoldingsCard, type AssetWithPrice, type HoldingsData } from '@/components/holdings-card';
import { NetWorthChart } from '@/components/net-worth-chart';
import { AllocationPieChart } from '@/components/charts/allocation-pie-chart';

export default function Home() {
  const [holdings, setHoldings] = useState<HoldingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const fetchHoldings = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/transactions?view=holdings');
      
      if (!response.ok) {
        throw new Error('Failed to fetch holdings');
      }

      const data = await response.json();
      
      // Merge asset details with assets
      const assetsWithPrices: AssetWithPrice[] = (data.assets || []).map((asset: AssetWithPrice) => {
        const detail = data.assetDetails?.find(
          (d: any) => d.asset.symbol === asset.symbol && d.asset.market_type === asset.market_type
        );
        return {
          ...asset,
          price: detail?.price || asset.price || 0,
          value: detail?.value || asset.value || 0,
          currency: detail?.currency || asset.currency || 'USD',
          name: detail?.name || asset.name || undefined,
        };
      });

      setHoldings({
        ...data,
        assets: assetsWithPrices,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error('Error fetching holdings:', err);
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHoldings();
    
    // Refresh every 5 minutes to avoid rate limiting
    const interval = setInterval(fetchHoldings, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchHoldings, refreshKey]);

  // Callback to refresh data when assets are modified
  const handleAssetsChanged = useCallback(() => {
    setRefreshKey(prev => prev + 1);
    fetchHoldings();
  }, [fetchHoldings]);

  return (
    <main className="container mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-4xl font-bold tracking-tight">Portfolio Tracker</h1>
        <p className="text-muted-foreground mt-2">
          Track your assets across multiple markets in real-time
        </p>
      </div>
      
      <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-2">
        <div className="lg:col-span-2">
          <NetWorthChart days={30} refreshTrigger={refreshKey} />
        </div>
        <div className="lg:col-span-1">
          <AllocationPieChart 
            assets={holdings?.assets || []} 
            baseCurrency={holdings?.baseCurrency}
            loading={loading}
            error={error}
          />
        </div>
        <div className="lg:col-span-1">
          <HoldingsCard onAssetsChanged={handleAssetsChanged} />
        </div>
      </div>
    </main>
  );
}
