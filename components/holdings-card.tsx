'use client';

import { useState, useEffect } from 'react';
import { Plus, RefreshCw, History, Wallet } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AddAssetDialog } from '@/components/add-asset-dialog';
import { AssetsTable } from '@/components/assets-table';
import { TransactionsTable, type Transaction } from '@/components/transactions-table';

export interface AssetWithPrice {
  id: string;
  symbol: string;
  market_type: 'US' | 'CN' | 'HK' | 'CRYPTO';
  quantity: number;
  created_at?: string;
  first_transaction_date?: string;
  last_transaction_date?: string;
  transaction_count?: number;
  price?: number;
  value?: number;
  currency?: string;      // Original currency of the asset (e.g., CNY for A-shares)
  baseCurrency?: string;  // Base currency for value display (e.g., USD)
  name?: string;
}

export interface HoldingsData {
  assets: AssetWithPrice[];
  assetDetails: Array<{
    asset: {
      id: string;
      symbol: string;
      market_type: 'US' | 'CN' | 'HK' | 'CRYPTO';
      quantity: number;
    };
    price: number;
    value: number;
    currency: string;
    name?: string;
  }>;
  totalValue?: number;
  baseCurrency?: string;
}

interface HoldingsCardProps {
  onAssetsChanged?: () => void;
}

export function HoldingsCard({ onAssetsChanged }: HoldingsCardProps) {
  const [holdings, setHoldings] = useState<HoldingsData | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('holdings');

  const fetchHoldings = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Fetch from the new transactions API
      const response = await fetch('/api/transactions?view=holdings');
      
      if (!response.ok) {
        throw new Error('Failed to fetch holdings');
      }

      const data = await response.json();
      
      if (data.error && !data.assets) {
        throw new Error(data.details || data.error || 'Failed to fetch holdings');
      }
      
      // Format assets with prices
      const assetsWithPrices: AssetWithPrice[] = (data.assets || []).map((asset: AssetWithPrice) => {
        const detail = data.assetDetails?.find(
          (d: any) => d.asset.symbol === asset.symbol && d.asset.market_type === asset.market_type
        );
        return {
          ...asset,
          price: detail?.price || asset.price || 0,
          value: detail?.value || asset.value || 0,
          currency: detail?.currency || asset.currency || 'USD',
          baseCurrency: data.baseCurrency || 'USD', // Use base currency from API
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
  };

  const fetchTransactions = async () => {
    try {
      const response = await fetch('/api/transactions?view=transactions');
      if (!response.ok) {
        throw new Error('Failed to fetch transactions');
      }
      const data = await response.json();
      setTransactions(data.transactions || []);
    } catch (err) {
      console.error('Error fetching transactions:', err);
    }
  };

  const fetchAll = async () => {
    await Promise.all([fetchHoldings(), fetchTransactions()]);
  };

  useEffect(() => {
    fetchAll();
    
    // Refresh prices every 5 minutes
    const interval = setInterval(fetchAll, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const handleAssetAdded = () => {
    setIsDialogOpen(false);
    fetchAll();
    onAssetsChanged?.();
  };

  const handleTransactionUpdated = () => {
    fetchAll();
    onAssetsChanged?.();
  };

  return (
    <Card className="h-[800px] flex flex-col">
      <CardHeader className="flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Portfolio</CardTitle>
            <CardDescription>
              Manage your holdings and transactions
              {holdings?.totalValue !== undefined && holdings.totalValue > 0 && (
                <span className="ml-2 font-semibold text-foreground">
                  • Total: {holdings.baseCurrency || 'USD'} {holdings.totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              )}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="icon"
              onClick={() => fetchAll()}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <Button onClick={() => setIsDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Transaction
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden flex flex-col">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex flex-col h-full">
          <TabsList className="grid w-full grid-cols-2 mb-4 flex-shrink-0">
            <TabsTrigger value="holdings" className="flex items-center gap-2">
              <Wallet className="h-4 w-4" />
              Holdings
            </TabsTrigger>
            <TabsTrigger value="transactions" className="flex items-center gap-2">
              <History className="h-4 w-4" />
              Transactions
            </TabsTrigger>
          </TabsList>

          <TabsContent value="holdings" className="flex-1 overflow-auto mt-0">
            {loading && (
              <div className="flex items-center justify-center py-8">
                <div className="text-muted-foreground">Loading holdings...</div>
              </div>
            )}
            
            {error && (
              <div className="rounded-md bg-destructive/10 p-4 text-sm text-destructive">
                <p className="font-semibold mb-1">Error loading holdings</p>
                <p className="text-xs">{error}</p>
                {error.includes('table') && (
                  <p className="text-xs mt-2 text-muted-foreground">
                    Please ensure the database migrations have been run in Supabase.
                  </p>
                )}
              </div>
            )}

            {!loading && !error && holdings && holdings.assets.length > 0 && (
              <AssetsTable assets={holdings.assets} baseCurrency={holdings.baseCurrency || 'USD'} />
            )}

            {!loading && !error && (!holdings || holdings.assets.length === 0) && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <p className="text-muted-foreground mb-4">No holdings yet</p>
                <Button onClick={() => setIsDialogOpen(true)} variant="outline">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Your First Transaction
                </Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="transactions" className="flex-1 overflow-auto mt-0">
            <TransactionsTable 
              transactions={transactions} 
              onTransactionUpdated={handleTransactionUpdated}
            />
          </TabsContent>
        </Tabs>
      </CardContent>

      <AddAssetDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        onAssetAdded={handleAssetAdded}
      />
    </Card>
  );
}
