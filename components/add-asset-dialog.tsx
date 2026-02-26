'use client';

import { useState, useEffect, useCallback } from 'react';
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
type CashCurrency = 'USD' | 'CNY' | 'HKD';

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
  const [cashCurrency, setCashCurrency] = useState<CashCurrency>('USD');
  const[quantity, setQuantity] = useState('');
  const [transactionType, setTransactionType] = useState<TransactionType>('BUY');
  const [transactionDate, setTransactionDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [pricePerUnit, setPricePerUnit] = useState('');
  const [notes, setNotes] = useState('');
  const [tag, setTag] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updateCashBalance, setUpdateCashBalance] = useState(true);
  const [cashAssetSymbol, setCashAssetSymbol] = useState<CashCurrency>('USD');
  const [cashAssets, setCashAssets] = useState<Array<{ symbol: string; quantity: number; label: string }>>([]);

  const isCash = marketType === 'CASH';
  const showCashOptions = updateCashBalance && !isCash;

  // Default cash asset to match asset currency
  const defaultCashForMarket = (mt: MarketType | ''): CashCurrency => {
    if (mt === 'CN') return 'CNY';
    if (mt === 'HK') return 'HKD';
    return 'USD';
  };

  useEffect(() => {
    if (marketType) {
      setCashAssetSymbol(defaultCashForMarket(marketType));
    }
  }, [marketType]);

  // 1. 定义强制获取最新现金余额的函数（添加时间戳和无缓存请求头）
  const fetchLatestCashAssets = useCallback(async () => {
    try {
      const res = await fetch(`/api/cash-assets?_t=${Date.now()}`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
        },
      });
      const data = res.ok ? await res.json() : { cashAssets:[] };
      setCashAssets(data.cashAssets ||[]);
    } catch (error) {
      setCashAssets([]);
    }
  },[]);

  // 2. 在弹窗打开时调用该函数
  useEffect(() => {
    if (open) {
      fetchLatestCashAssets();
    }
  },[open, fetchLatestCashAssets]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // For cash, use the selected currency as symbol
    const finalSymbol = isCash ? cashCurrency : symbol;
    
    if (!marketType || (!isCash && !symbol) || !quantity) {
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
          symbol: finalSymbol,
          market_type: marketType,
          transaction_type: transactionType,
          quantity: quantityNum,
          transaction_date: transactionDate,
          price_per_unit: pricePerUnit ? parseFloat(pricePerUnit) : undefined,
          notes: notes.trim() || undefined,
          update_cash_balance: !isCash ? updateCashBalance : false,
          cash_asset_symbol: showCashOptions ? cashAssetSymbol : undefined,
          tag: tag.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to add transaction');
      }

      // Reset form
      setMarketType('');
      setSymbol('');
      setCashCurrency('USD');
      setQuantity('');
      setTransactionType('BUY');
      setTransactionDate(new Date().toISOString().split('T')[0]);
      setPricePerUnit('');
      setNotes('');
      setTag('');
      setUpdateCashBalance(true);
      setCashAssetSymbol('USD');
      setError(null);
      
      // 3. 提交成功后，主动刷新一次现金余额，保证弹窗不关闭时数据也是最新的
      fetchLatestCashAssets();
      
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
        setCashCurrency('USD');
        setQuantity('');
        setTransactionType('BUY');
        setTransactionDate(new Date().toISOString().split('T')[0]);
        setPricePerUnit('');
        setNotes('');
        setTag('');
        setUpdateCashBalance(true);
        setCashAssetSymbol('USD');
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

            {/* Asset Type */}
            <div className="grid gap-2">
              <Label htmlFor="market-type">Asset Type</Label>
              <Select
                value={marketType}
                onValueChange={(value) => {
                  setMarketType(value as MarketType);
                  // Reset symbol when market type changes
                  setSymbol('');
                }}
              >
                <SelectTrigger id="market-type">
                  <SelectValue placeholder="Select asset type" />
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

            {/* Symbol or Cash Currency */}
            {isCash ? (
              <div className="grid gap-2">
                <Label htmlFor="cash-currency">Currency</Label>
                <Select
                  value={cashCurrency}
                  onValueChange={(value) => setCashCurrency(value as CashCurrency)}
                >
                  <SelectTrigger id="cash-currency">
                    <SelectValue placeholder="Select currency" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD - US Dollar</SelectItem>
                    <SelectItem value="CNY">CNY - Chinese Yuan</SelectItem>
                    <SelectItem value="HKD">HKD - Hong Kong Dollar</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : (
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
            )}

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

            {/* Update Cash Balance - only for non-cash assets */}
            {!isCash && (
              <>
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="update-cash"
                    checked={updateCashBalance}
                    onChange={(e) => setUpdateCashBalance(e.target.checked)}
                    disabled={loading}
                    className="h-4 w-4 rounded border-input"
                  />
                  <Label htmlFor="update-cash" className="font-normal cursor-pointer">
                    Update Cash Balance?
                  </Label>
                </div>
                {showCashOptions && (
                  <div className="grid gap-2">
                    <Label htmlFor="cash-asset">Cash Asset to deduct from / add to</Label>
                    <Select
                      value={cashAssetSymbol}
                      onValueChange={(v) => setCashAssetSymbol(v as CashCurrency)}
                      disabled={loading}
                    >
                      <SelectTrigger id="cash-asset">
                        <SelectValue placeholder="Select cash asset" />
                      </SelectTrigger>
                      <SelectContent>
                        {cashAssets.length > 0 ? (
                          cashAssets.map((ca) => (
                            <SelectItem key={ca.symbol} value={ca.symbol}>
                              {ca.label} (balance: {ca.quantity.toLocaleString('en-US', { minimumFractionDigits: 2 })})
                            </SelectItem>
                          ))
                        ) : (
                          <>
                            <SelectItem value="USD">USD Cash</SelectItem>
                            <SelectItem value="CNY">CNY Cash</SelectItem>
                            <SelectItem value="HKD">HKD Cash</SelectItem>
                          </>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </>
            )}

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

            {/* Tag/Category (Optional) */}
            <div className="grid gap-2">
              <Label htmlFor="tag">
                Tag / Category <span className="text-muted-foreground">(Optional)</span>
              </Label>
              <Input
                id="tag"
                placeholder="e.g., Tech, Dividend"
                value={tag}
                onChange={(e) => setTag(e.target.value)}
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