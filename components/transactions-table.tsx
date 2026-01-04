'use client';

import { useState } from 'react';
import { Pencil, Trash2, ArrowUpRight, ArrowDownRight } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { MarketType } from '@/lib/price-service';

export interface Transaction {
  id: string;
  symbol: string;
  market_type: 'US' | 'CN' | 'HK' | 'CRYPTO' | 'CASH';
  transaction_type: 'BUY' | 'SELL';
  quantity: number;
  price_per_unit?: number;
  transaction_date: string;
  notes?: string;
  created_at: string;
}

interface TransactionsTableProps {
  transactions: Transaction[];
  onTransactionUpdated: () => void;
}

export function TransactionsTable({ transactions, onTransactionUpdated }: TransactionsTableProps) {
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Edit form state
  const [editSymbol, setEditSymbol] = useState('');
  const [editMarketType, setEditMarketType] = useState<MarketType | ''>('');
  const [editTransactionType, setEditTransactionType] = useState<'BUY' | 'SELL'>('BUY');
  const [editQuantity, setEditQuantity] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editNotes, setEditNotes] = useState('');

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 8,
    }).format(value);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
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

  const handleEdit = (tx: Transaction) => {
    setEditingTransaction(tx);
    setEditSymbol(tx.symbol);
    setEditMarketType(tx.market_type);
    setEditTransactionType(tx.transaction_type);
    setEditQuantity(tx.quantity.toString());
    setEditDate(tx.transaction_date);
    setEditPrice(tx.price_per_unit?.toString() || '');
    setEditNotes(tx.notes || '');
    setError(null);
  };

  const handleSaveEdit = async () => {
    if (!editingTransaction) return;

    if (!editSymbol || !editMarketType || !editQuantity || !editDate) {
      setError('Please fill in all required fields');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/transactions/${editingTransaction.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: editSymbol.trim(),
          market_type: editMarketType,
          transaction_type: editTransactionType,
          quantity: parseFloat(editQuantity),
          transaction_date: editDate,
          price_per_unit: editPrice ? parseFloat(editPrice) : null,
          notes: editNotes.trim() || null,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update transaction');
      }

      setEditingTransaction(null);
      onTransactionUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/transactions/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete transaction');
      }

      setDeleteConfirmId(null);
      onTransactionUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  if (transactions.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No transactions recorded yet.
      </div>
    );
  }

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Symbol</TableHead>
              <TableHead>Market</TableHead>
              <TableHead className="text-right">Quantity</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions.map((tx) => (
              <TableRow key={tx.id}>
                <TableCell>
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    tx.transaction_type === 'BUY' 
                      ? 'bg-green-500/10 text-green-500' 
                      : 'bg-red-500/10 text-red-500'
                  }`}>
                    {tx.transaction_type === 'BUY' ? (
                      <ArrowDownRight className="h-3 w-3" />
                    ) : (
                      <ArrowUpRight className="h-3 w-3" />
                    )}
                    {tx.transaction_type}
                  </span>
                </TableCell>
                <TableCell className="font-medium">{tx.symbol}</TableCell>
                <TableCell>
                  <span className="inline-flex items-center rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium">
                    {getMarketTypeLabel(tx.market_type)}
                  </span>
                </TableCell>
                <TableCell className="text-right">{formatNumber(tx.quantity)}</TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {tx.price_per_unit ? formatNumber(tx.price_per_unit) : '-'}
                </TableCell>
                <TableCell>{formatDate(tx.transaction_date)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleEdit(tx)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => setDeleteConfirmId(tx.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editingTransaction} onOpenChange={(open) => !open && setEditingTransaction(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit Transaction</DialogTitle>
            <DialogDescription>
              Update the transaction details.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {/* Transaction Type */}
            <div className="grid gap-2">
              <Label>Transaction Type</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={editTransactionType === 'BUY' ? 'default' : 'outline'}
                  className={`flex-1 ${editTransactionType === 'BUY' ? 'bg-green-600 hover:bg-green-700' : ''}`}
                  onClick={() => setEditTransactionType('BUY')}
                >
                  Buy
                </Button>
                <Button
                  type="button"
                  variant={editTransactionType === 'SELL' ? 'default' : 'outline'}
                  className={`flex-1 ${editTransactionType === 'SELL' ? 'bg-red-600 hover:bg-red-700' : ''}`}
                  onClick={() => setEditTransactionType('SELL')}
                >
                  Sell
                </Button>
              </div>
            </div>

            {/* Market Type */}
            <div className="grid gap-2">
              <Label>Market Type</Label>
              <Select value={editMarketType} onValueChange={(v) => setEditMarketType(v as MarketType)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select market type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="US">US Stocks</SelectItem>
                  <SelectItem value="CN">China A-Shares</SelectItem>
                  <SelectItem value="HK">Hong Kong Stocks</SelectItem>
                  <SelectItem value="CRYPTO">Cryptocurrency</SelectItem>
                  <SelectItem value="CASH">Cash</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Symbol */}
            <div className="grid gap-2">
              <Label>Symbol</Label>
              <Input
                value={editSymbol}
                onChange={(e) => setEditSymbol(e.target.value)}
                disabled={loading}
              />
            </div>

            {/* Quantity */}
            <div className="grid gap-2">
              <Label>Quantity</Label>
              <Input
                type="number"
                step="any"
                min="0"
                value={editQuantity}
                onChange={(e) => setEditQuantity(e.target.value)}
                disabled={loading}
              />
            </div>

            {/* Date */}
            <div className="grid gap-2">
              <Label>Transaction Date</Label>
              <Input
                type="date"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
                disabled={loading}
                max={new Date().toISOString().split('T')[0]}
              />
            </div>

            {/* Price */}
            <div className="grid gap-2">
              <Label>Price Per Unit (Optional)</Label>
              <Input
                type="number"
                step="any"
                min="0"
                value={editPrice}
                onChange={(e) => setEditPrice(e.target.value)}
                disabled={loading}
              />
            </div>

            {/* Notes */}
            <div className="grid gap-2">
              <Label>Notes (Optional)</Label>
              <Input
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
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
            <Button variant="outline" onClick={() => setEditingTransaction(null)} disabled={loading}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={loading}>
              {loading ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirmId} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Transaction</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this transaction? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)} disabled={loading}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
              disabled={loading}
            >
              {loading ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

