# Portfolio Tracker

A modern, full-stack portfolio tracking application built with Next.js 14, supporting multiple markets including US stocks, China A-shares, Hong Kong stocks, and cryptocurrencies.

## Features

- 📊 **Multi-Market Support**: Track assets across US, China A-shares, HK stocks, and cryptocurrencies
- 💱 **Currency Normalization**: All values converted to a user-defined base currency (USD/CNY)
- 📈 **Real-time Price Updates**: Automatic price fetching from multiple sources
- 📉 **Historical Tracking**: Transaction-based system for accurate historical net worth calculation
- 📱 **Responsive Design**: Beautiful, dark-mode compatible UI built with Tailwind CSS and Shadcn/UI
- 🔄 **Automatic Updates**: Hourly portfolio snapshots via cron jobs
- 📊 **Interactive Charts**: 
  - Net Worth Area Chart with smart time formatting
  - Asset Allocation Pie Charts (by asset and by market)
- 💼 **Transaction Management**: Full CRUD operations for buy/sell transactions

## Tech Stack

- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS, Shadcn/UI
- **Backend**: Next.js API Routes
- **Database**: Supabase (PostgreSQL)
- **Charts**: Recharts
- **Price Data**: 
  - Tencent Finance API (primary for CN/HK/US stocks)
  - Yahoo Finance (fallback for US stocks)
  - CoinGecko API (cryptocurrencies)

## Getting Started

### Prerequisites

- Node.js 18+ 
- A Supabase account and project
- Environment variables (see below)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/Max10086/Portfolio-Tracker.git
cd Portfolio-Tracker
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
Create a `.env.local` file in the root directory:
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
BASE_CURRENCY=USD
CRON_SECRET=your_cron_secret
```

4. Run database migrations:
Follow the instructions in `SETUP.md` to set up your Supabase database.

5. Start the development server:
```bash
npm run dev
```

6. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
Portfolio/
├── app/
│   ├── api/              # API routes
│   │   ├── assets/       # Asset management
│   │   ├── cron/         # Cron job endpoints
│   │   ├── portfolio-snapshots/
│   │   └── transactions/ # Transaction CRUD
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── charts/           # Chart components
│   ├── ui/              # Shadcn/UI components
│   ├── add-asset-dialog.tsx
│   ├── assets-table.tsx
│   ├── holdings-card.tsx
│   ├── net-worth-chart.tsx
│   └── transactions-table.tsx
├── lib/
│   ├── price-service.ts  # Price fetching logic
│   ├── supabase.ts
│   └── utils.ts
├── supabase/
│   └── migrations/       # Database migrations
└── types/
```

## Key Features Explained

### Transaction-Based System

Instead of just tracking current holdings, the app uses a transaction-based system that records every buy/sell operation with dates. This enables:
- Accurate historical net worth calculation
- Better asset management with full transaction history
- Ability to track portfolio performance over time

### Multi-Source Price Fetching

The app intelligently fetches prices from multiple sources:
- **Tencent Finance API**: Primary source for all stocks (US/CN/HK) - free, no API key required
- **Yahoo Finance**: Fallback for US stocks
- **CoinGecko**: Cryptocurrency prices

### Currency Conversion

All asset values are automatically converted to your base currency using real-time exchange rates from exchangerate-api.com.

## Deployment

### Vercel (Recommended)

1. Push your code to GitHub
2. Import the project in Vercel
3. Add environment variables in Vercel dashboard
4. Deploy!

### Cron Jobs

Set up Vercel Cron to trigger `/api/cron/update-nav` hourly for automatic portfolio snapshots.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT

## Acknowledgments

- Built with [Next.js](https://nextjs.org/)
- UI components from [Shadcn/UI](https://ui.shadcn.com/)
- Charts powered by [Recharts](https://recharts.org/)
- Database by [Supabase](https://supabase.com/)

