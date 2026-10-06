'use client';

import { useEffect, useState } from 'react';
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

export interface EditableTransaction {
  id: string;
  symbol: string;
  market_type: 'US' | 'CN' | 'HK' | 'CRYPTO' | 'CASH';
  transaction_type: 'BUY' | 'SELL';
  quantity: number;
  price_per_unit?: number | null;
  transaction_date: string;
  notes?: string | null;
  tag?: string | null;
}

interface EditTransactionDialogProps {
  transaction: EditableTransaction | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

function toDateInputValue(value: string): string {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return date.toISOString().split('T')[0];
}

export function EditTransactionDialog({
  transaction,
  open,
  onOpenChange,
  onSaved,
}: EditTransactionDialogProps) {
  const [symbol, setSymbol] = useState('');
  const [marketType, setMarketType] = useState<EditableTransaction['market_type']>('US');
  const [transactionType, setTransactionType] = useState<'BUY' | 'SELL'>('BUY');
  const [quantity, setQuantity] = useState('');
  const [pricePerUnit, setPricePerUnit] = useState('');
  const [transactionDate, setTransactionDate] = useState('');
  const [notes, setNotes] = useState('');
  const [tag, setTag] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!transaction || !open) return;
    setSymbol(transaction.symbol);
    setMarketType(transaction.market_type);
    setTransactionType(transaction.transaction_type);
    setQuantity(String(transaction.quantity));
    setPricePerUnit(
      transaction.price_per_unit != null && !Number.isNaN(Number(transaction.price_per_unit))
        ? String(transaction.price_per_unit)
        : ''
    );
    setTransactionDate(toDateInputValue(transaction.transaction_date));
    setNotes(transaction.notes || '');
    setTag(transaction.tag || '');
    setError(null);
  }, [transaction, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transaction) return;

    const quantityNum = parseFloat(quantity);
    if (!symbol.trim() || !transactionDate || Number.isNaN(quantityNum) || quantityNum <= 0) {
      setError('Symbol, date, and a positive quantity are required.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/transactions/${transaction.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: symbol.trim(),
          market_type: marketType,
          transaction_type: transactionType,
          quantity: quantityNum,
          price_per_unit: pricePerUnit.trim() === '' ? null : parseFloat(pricePerUnit),
          transaction_date: transactionDate,
          notes: notes.trim() || null,
          tag: tag.trim() || null,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.details || payload.error || 'Failed to update transaction');
      }

      onOpenChange(false);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update transaction');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !loading && onOpenChange(next)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit transaction</DialogTitle>
          <DialogDescription>
            Update fields as originally recorded. Tag changes apply to all transactions with the same
            symbol and market.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="edit-symbol">Symbol</Label>
              <Input
                id="edit-symbol"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label>Market</Label>
              <Select
                value={marketType}
                onValueChange={(v) => setMarketType(v as EditableTransaction['market_type'])}
                disabled={loading}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="US">US</SelectItem>
                  <SelectItem value="CN">CN</SelectItem>
                  <SelectItem value="HK">HK</SelectItem>
                  <SelectItem value="CRYPTO">Crypto</SelectItem>
                  <SelectItem value="CASH">Cash</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={transactionType}
                onValueChange={(v) => setTransactionType(v as 'BUY' | 'SELL')}
                disabled={loading}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BUY">Buy</SelectItem>
                  <SelectItem value="SELL">Sell</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-date">Date</Label>
              <Input
                id="edit-date"
                type="date"
                value={transactionDate}
                onChange={(e) => setTransactionDate(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="edit-qty">Quantity</Label>
              <Input
                id="edit-qty"
                type="number"
                step="any"
                min="0"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-price">Price per unit</Label>
              <Input
                id="edit-price"
                type="number"
                step="any"
                min="0"
                value={pricePerUnit}
                onChange={(e) => setPricePerUnit(e.target.value)}
                placeholder="Optional"
                disabled={loading}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-tag">Tag / category</Label>
            <Input
              id="edit-tag"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              placeholder="Applies to all history for this ticker"
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-notes">Notes</Label>
            <Input
              id="edit-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={loading}
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
