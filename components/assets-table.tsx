'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { AssetWithPrice } from './holdings-card';

interface AssetsTableProps {
  assets: AssetWithPrice[];
  baseCurrency?: string;
}

export function AssetsTable({ assets, baseCurrency = 'USD' }: AssetsTableProps) {
  const formatCurrency = (value: number, currency: string = 'USD') => {
    // Handle unsupported currency codes
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value);
    } catch {
      // Fallback for unsupported currencies
      return `${currency} ${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
  };

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 8,
    }).format(value);
  };

  const getMarketTypeLabel = (marketType: string) => {
    const labels: Record<string, string> = {
      US: 'US',
      CN: 'CN',
      HK: 'HK',
      CRYPTO: 'Crypto',
      CASH: 'Cash',
    };
    return labels[marketType] || marketType;
  };

  if (assets.length === 0) {
    return null;
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Symbol</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Market</TableHead>
            <TableHead className="text-right">Quantity</TableHead>
            <TableHead className="text-right">Current Price</TableHead>
            <TableHead className="text-right">Total Value ({baseCurrency})</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {assets.map((asset) => (
            <TableRow key={asset.id}>
              <TableCell className="font-medium">{asset.symbol}</TableCell>
              <TableCell className="text-muted-foreground">
                {asset.name || '-'}
              </TableCell>
              <TableCell>
                <span className="inline-flex items-center rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium">
                  {getMarketTypeLabel(asset.market_type)}
                </span>
              </TableCell>
              <TableCell className="text-right">
                {formatNumber(asset.quantity)}
              </TableCell>
              <TableCell className="text-right">
                {asset.price !== undefined && asset.price > 0
                  ? formatCurrency(asset.price, asset.currency || 'USD')
                  : (
                      <span className="text-muted-foreground text-xs">Price unavailable</span>
                    )}
              </TableCell>
              <TableCell className="text-right font-semibold">
                {asset.value !== undefined && asset.value > 0
                  ? formatCurrency(asset.value, asset.baseCurrency || baseCurrency)
                  : (
                      <span className="text-muted-foreground">-</span>
                    )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

