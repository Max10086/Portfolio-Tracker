'use client';

import { useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2 } from 'lucide-react';
import type { AssetWithPrice } from '@/components/holdings-card';

interface AllocationPieChartProps {
  assets: AssetWithPrice[];
  baseCurrency?: string;
  loading?: boolean;
  error?: string | null;
}

interface ChartDataItem {
  name: string;
  value: number;
}

// Color palette for the pie chart
const CHART_COLORS = [
  '#10b981', // Green
  '#3b82f6', // Blue
  '#8b5cf6', // Purple
  '#f59e0b', // Amber
  '#ef4444', // Red
  '#06b6d4', // Cyan
  '#f97316', // Orange
  '#ec4899', // Pink
  '#14b8a6', // Teal
  '#6366f1', // Indigo
  '#84cc16', // Lime
  '#a855f7', // Violet
];

const MARKET_TYPE_LABELS: Record<string, string> = {
  US: 'US Stocks',
  CN: 'China A-Shares',
  HK: 'Hong Kong Stocks',
  CRYPTO: 'Cryptocurrency',
};

export function AllocationPieChart({ assets, baseCurrency = 'USD', loading = false, error = null }: AllocationPieChartProps) {
  // Process data by asset
  const dataByAsset = useMemo(() => {
    if (!assets || assets.length === 0) return [];

    // Filter assets with valid values
    const validAssets = assets.filter(
      (asset) => asset.value !== undefined && asset.value > 0
    );

    if (validAssets.length === 0) return [];

    // Sort by value descending
    const sorted = [...validAssets].sort((a, b) => (b.value || 0) - (a.value || 0));

    // If more than 10 assets, group smallest ones into "Others"
    if (sorted.length > 10) {
      const topAssets = sorted.slice(0, 9);
      const othersValue = sorted
        .slice(9)
        .reduce((sum, asset) => sum + (asset.value || 0), 0);

      return [
        ...topAssets.map((asset) => ({
          name: asset.name || asset.symbol, // Use company name if available
          value: asset.value || 0,
        })),
        {
          name: 'Others',
          value: othersValue,
        },
      ];
    }

    return sorted.map((asset) => ({
      name: asset.name || asset.symbol, // Use company name if available
      value: asset.value || 0,
    }));
  }, [assets]);

  // Process data by market type
  const dataByMarket = useMemo(() => {
    if (!assets || assets.length === 0) return [];

    const marketMap = new Map<string, number>();

    assets.forEach((asset) => {
      if (asset.value !== undefined && asset.value > 0) {
        const marketType = asset.market_type;
        const currentValue = marketMap.get(marketType) || 0;
        marketMap.set(marketType, currentValue + asset.value);
      }
    });

    return Array.from(marketMap.entries())
      .map(([marketType, value]) => ({
        name: MARKET_TYPE_LABELS[marketType] || marketType,
        value,
      }))
      .sort((a, b) => b.value - a.value);
  }, [assets]);

  // Calculate total value for percentage calculations
  const totalValue = useMemo(() => {
    return assets.reduce((sum, asset) => sum + (asset.value || 0), 0);
  }, [assets]);

  // Custom tooltip component
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0];
      const value = data.value as number;
      const percentage = totalValue > 0 ? (value / totalValue) * 100 : 0;

      return (
        <div className="rounded-lg border bg-card/95 backdrop-blur-sm p-3 shadow-xl ring-1 ring-border">
          <p className="text-sm font-semibold mb-1">{data.name}</p>
          <p className="text-base font-bold">
            {baseCurrency} {value.toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {percentage.toFixed(2)}% of portfolio
          </p>
        </div>
      );
    }
    return null;
  };

  // Custom label function for slices large enough
  const renderLabel = (entry: any) => {
    const percentage = totalValue > 0 ? (entry.value / totalValue) * 100 : 0;
    // Only show label if slice is >= 5% of total
    if (percentage >= 5) {
      return `${entry.name}: ${percentage.toFixed(1)}%`;
    }
    return '';
  };

  // Custom legend formatter - needs to know which dataset is active
  const createLegendRenderer = (data: ChartDataItem[]) => {
    return (props: any) => {
      const { payload } = props;
      if (!payload || payload.length === 0) return null;

      return (
        <div className="flex flex-wrap justify-center gap-4 mt-4">
          {payload.map((entry: any, index: number) => {
            // Match the payload entry to our data array
            const dataPoint = data[index];
            if (!dataPoint) return null;
            
            const value = dataPoint.value;
            const name = dataPoint.name;
            const percentage = totalValue > 0 ? (value / totalValue) * 100 : 0;
            
            return (
              <div key={`legend-${index}`} className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: entry.color }}
                />
                <span className="text-sm text-muted-foreground">
                  {name}: {baseCurrency} {value.toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })} ({percentage.toFixed(1)}%)
                </span>
              </div>
            );
          })}
        </div>
      );
    };
  };

  // Show loading state
  if (loading) {
    return (
      <Card className="h-[800px] flex flex-col">
        <CardHeader className="flex-shrink-0">
          <CardTitle>Asset Allocation</CardTitle>
          <CardDescription>Portfolio distribution by asset and market</CardDescription>
        </CardHeader>
        <CardContent className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <p className="text-muted-foreground">Loading asset allocation...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Show error state
  if (error) {
    return (
      <Card className="h-[800px] flex flex-col">
        <CardHeader className="flex-shrink-0">
          <CardTitle>Asset Allocation</CardTitle>
          <CardDescription>Portfolio distribution by asset and market</CardDescription>
        </CardHeader>
        <CardContent className="flex-1 flex items-center justify-center">
          <div className="rounded-md bg-destructive/10 p-4 text-sm text-destructive max-w-md">
            <p className="font-semibold mb-1">Error loading asset allocation</p>
            <p className="text-xs">{error}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!assets || assets.length === 0) {
    return (
      <Card className="h-[800px] flex flex-col">
        <CardHeader className="flex-shrink-0">
          <CardTitle>Asset Allocation</CardTitle>
          <CardDescription>Portfolio distribution by asset and market</CardDescription>
        </CardHeader>
        <CardContent className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground">No assets to display</p>
        </CardContent>
      </Card>
    );
  }

  if (totalValue === 0) {
    return (
      <Card className="h-[800px] flex flex-col">
        <CardHeader className="flex-shrink-0">
          <CardTitle>Asset Allocation</CardTitle>
          <CardDescription>Portfolio distribution by asset and market</CardDescription>
        </CardHeader>
        <CardContent className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground">No asset values available</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-[800px] flex flex-col">
      <CardHeader className="flex-shrink-0">
        <CardTitle>Asset Allocation</CardTitle>
        <CardDescription>Portfolio distribution by asset and market</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 overflow-auto">
        <Tabs defaultValue="asset" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="asset">By Asset</TabsTrigger>
            <TabsTrigger value="market">By Market</TabsTrigger>
          </TabsList>

          <TabsContent value="asset" className="mt-4">
            {dataByAsset.length === 0 ? (
              <div className="flex h-[400px] items-center justify-center">
                <p className="text-muted-foreground">No asset data available</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={500}>
                <PieChart>
                  <Pie
                    data={dataByAsset}
                    cx="50%"
                    cy="45%"
                    labelLine={false}
                    label={renderLabel}
                    outerRadius={100}
                    innerRadius={50}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {dataByAsset.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={CHART_COLORS[index % CHART_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend content={createLegendRenderer(dataByAsset)} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </TabsContent>

          <TabsContent value="market" className="mt-4">
            {dataByMarket.length === 0 ? (
              <div className="flex h-[400px] items-center justify-center">
                <p className="text-muted-foreground">No market data available</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={500}>
                <PieChart>
                  <Pie
                    data={dataByMarket}
                    cx="50%"
                    cy="45%"
                    labelLine={false}
                    label={renderLabel}
                    outerRadius={100}
                    innerRadius={50}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {dataByMarket.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={CHART_COLORS[index % CHART_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend content={createLegendRenderer(dataByMarket)} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

