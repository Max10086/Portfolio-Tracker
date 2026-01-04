'use client';

import { useState } from 'react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { MarketType } from '@/lib/price-service';

type TransactionType = 'BUY' | 'SELL';

interface AddAssetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAssetAdded: () => void;
}

export function AddAssetDialog({
  open,
  onOpenChange,
  onAssetAdded,
}: AddAssetDialogProps) {
  const [marketType, setMarketType] = useState<MarketType | ''>('');
  const [symbol, setSymbol] = useState('');
  const [quantity, setQuantity] = useState('');
  const [transactionType, setTransactionType] = useState<TransactionType>('BUY');
  const [transactionDate, setTransactionDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [pricePerUnit, setPricePerUnit] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!marketType || !symbol || !quantity) {
      setError('Please fill in all required fields');
      return;
    }

    const quantityNum = parseFloat(quantity);
    if (isNaN(quantityNum) || quantityNum <= 0) {
      setError('Quantity must be a positive number');
      return;
    }

    if (!transactionDate) {
      setError('Please select a transaction date');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/transactions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          symbol: symbol.trim(),
          market_type: marketType,
          transaction_type: transactionType,
          quantity: quantityNum,
          transaction_date: transactionDate,
          price_per_unit: pricePerUnit ? parseFloat(pricePerUnit) : undefined,
          notes: notes.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to add transaction');
      }

      // Reset form
      setMarketType('');
      setSymbol('');
      setQuantity('');
      setTransactionType('BUY');
      setTransactionDate(new Date().toISOString().split('T')[0]);
      setPricePerUnit('');
      setNotes('');
      setError(null);
      onAssetAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!loading) {
      onOpenChange(newOpen);
      if (!newOpen) {
        // Reset form when closing
        setMarketType('');
        setSymbol('');
        setQuantity('');
        setTransactionType('BUY');
        setTransactionDate(new Date().toISOString().split('T')[0]);
        setPricePerUnit('');
        setNotes('');
        setError(null);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add Transaction</DialogTitle>
          <DialogDescription>
            Record a buy or sell transaction for your portfolio.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            {/* Transaction Type */}
            <div className="grid gap-2">
              <Label htmlFor="transaction-type">Transaction Type</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={transactionType === 'BUY' ? 'default' : 'outline'}
                  className={`flex-1 ${transactionType === 'BUY' ? 'bg-green-600 hover:bg-green-700' : ''}`}
                  onClick={() => setTransactionType('BUY')}
                >
                  Buy
                </Button>
                <Button
                  type="button"
                  variant={transactionType === 'SELL' ? 'default' : 'outline'}
                  className={`flex-1 ${transactionType === 'SELL' ? 'bg-red-600 hover:bg-red-700' : ''}`}
                  onClick={() => setTransactionType('SELL')}
                >
                  Sell
                </Button>
              </div>
            </div>

            {/* Market Type */}
            <div className="grid gap-2">
              <Label htmlFor="market-type">Market Type</Label>
              <Select
                value={marketType}
                onValueChange={(value) => setMarketType(value as MarketType)}
              >
                <SelectTrigger id="market-type">
                  <SelectValue placeholder="Select market type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="US">US Stocks</SelectItem>
                  <SelectItem value="CN">China A-Shares</SelectItem>
                  <SelectItem value="HK">Hong Kong Stocks</SelectItem>
                  <SelectItem value="CRYPTO">Cryptocurrency</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Symbol */}
            <div className="grid gap-2">
              <Label htmlFor="symbol">Symbol</Label>
              <Input
                id="symbol"
                placeholder="e.g., AAPL, 600519, BTC"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                disabled={loading}
              />
            </div>

            {/* Quantity */}
            <div className="grid gap-2">
              <Label htmlFor="quantity">Quantity</Label>
              <Input
                id="quantity"
                type="number"
                step="any"
                min="0"
                placeholder="0.00"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                disabled={loading}
              />
            </div>

            {/* Transaction Date */}
            <div className="grid gap-2">
              <Label htmlFor="transaction-date">Transaction Date</Label>
              <Input
                id="transaction-date"
                type="date"
                value={transactionDate}
                onChange={(e) => setTransactionDate(e.target.value)}
                disabled={loading}
                max={new Date().toISOString().split('T')[0]}
              />
            </div>

            {/* Price Per Unit (Optional) */}
            <div className="grid gap-2">
              <Label htmlFor="price-per-unit">
                Price Per Unit <span className="text-muted-foreground">(Optional)</span>
              </Label>
              <Input
                id="price-per-unit"
                type="number"
                step="any"
                min="0"
                placeholder="Record purchase/sell price"
                value={pricePerUnit}
                onChange={(e) => setPricePerUnit(e.target.value)}
                disabled={loading}
              />
            </div>

            {/* Notes (Optional) */}
            <div className="grid gap-2">
              <Label htmlFor="notes">
                Notes <span className="text-muted-foreground">(Optional)</span>
              </Label>
              <Input
                id="notes"
                placeholder="Add a note..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={loading}
              />
            </div>

            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={loading}
              className={transactionType === 'BUY' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}
            >
              {loading ? 'Adding...' : `Add ${transactionType === 'BUY' ? 'Buy' : 'Sell'}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
