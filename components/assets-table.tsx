'use client';

import { useState } from 'react';
import { Pencil } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { updateHoldingTag } from '@/app/actions/assets';
import type { AssetWithPrice } from './holdings-card';

interface AssetsTableProps {
  assets: AssetWithPrice[];
  baseCurrency?: string;
  onTagUpdated?: () => void;
}

export function AssetsTable({ assets, baseCurrency = 'USD', onTagUpdated }: AssetsTableProps) {
  const [editingAsset, setEditingAsset] = useState<AssetWithPrice | null>(null);
  const [editTagValue, setEditTagValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleEditTag = (asset: AssetWithPrice) => {
    setEditingAsset(asset);
    setEditTagValue(asset.tag || '');
    setError(null);
  };

  const handleSaveTag = async () => {
    if (!editingAsset) return;

    setSaving(true);
    setError(null);

    const result = await updateHoldingTag(
      editingAsset.symbol,
      editingAsset.market_type,
      editTagValue
    );

    setSaving(false);

    if (result.success) {
      setEditingAsset(null);
      onTagUpdated?.();
    } else {
      setError(result.error || 'Failed to update tag');
    }
  };

  const handleCloseDialog = () => {
    if (!saving) {
      setEditingAsset(null);
      setError(null);
    }
  };
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

  const totalValue = assets.reduce((sum, asset) => sum + (asset.value && asset.value > 0 ? asset.value : 0), 0);

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Symbol</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Market</TableHead>
              <TableHead>Tag</TableHead>
              <TableHead className="text-right">Quantity</TableHead>
              <TableHead className="text-right">Current Price</TableHead>
              <TableHead className="text-right">Total Value ({baseCurrency})</TableHead>
              <TableHead className="text-right">Allocation</TableHead>
              <TableHead className="w-[60px]"></TableHead>
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
                <TableCell>
                  <span className="text-muted-foreground text-sm">
                    {asset.tag || 'Uncategorized'}
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
                <TableCell className="text-right">
                  {asset.value !== undefined && asset.value > 0 && totalValue > 0 ? (
                    <span className="font-medium">
                      {((asset.value / totalValue) * 100).toFixed(2)}%
                    </span>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleEditTag(asset)}
                    title="Edit Tag"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!editingAsset} onOpenChange={(open) => !open && handleCloseDialog()}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>
              Edit Tag for {editingAsset?.symbol}
            </DialogTitle>
            <DialogDescription>
              Update the tag for all transactions of this asset. This will apply to the entire history.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="tag">Tag / Category</Label>
              <Input
                id="tag"
                placeholder="e.g., Tech, Dividend"
                value={editTagValue}
                onChange={(e) => setEditTagValue(e.target.value)}
                disabled={saving}
              />
            </div>
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialog} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSaveTag} disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

