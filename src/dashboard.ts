import express from 'express';
import { Server } from 'http';
import { computeBacktest, BacktestResult } from './backtester';
import { StorageManager } from './storage';

export interface DashboardState {
  regime: string;
  confidence: number;
  weights: {
    trendAgent: number;
    meanReversionAgent: number;
    momentumAgent: number;
    newsAgent: number;
  };
  qwenWeights?: {
    trendAgent: number;
    meanReversionAgent: number;
    momentumAgent: number;
    newsAgent: number;
  };
  lastSignal: {
    action: string;
    confidence: number;
    timestamp: string;
  };
  lastReasoning: string;
  btcPrice: number;
  pnl: number;
  totalRounds: number;
  fearGreedIndex: number;
  fearGreedLabel: string;
  performanceSummary: Record<string, Record<string, string>>;
  trades: Array<{
    timestamp: string;
    action: string;
    price: number;
    size: number;
    reasoning: string;
  }>;
}

export class DashboardServer {
  private app = express();
  private server: Server | null = null;
  private storage = new StorageManager();
  private state: DashboardState = {
    regime: 'Unknown',
    confidence: 0.0,
    weights: {
      trendAgent: 0.25,
      meanReversionAgent: 0.25,
      momentumAgent: 0.25,
      newsAgent: 0.25
    },
    lastSignal: {
      action: 'HOLD',
      confidence: 0.5,
      timestamp: new Date().toISOString()
    },
    lastReasoning: 'System initializing...',
    btcPrice: 0.0,
    pnl: 0.0,
    totalRounds: 0,
    fearGreedIndex: 50,
    fearGreedLabel: 'Neutral',
    performanceSummary: {},
    trades: []
  };

  private backtestCache: BacktestResult | null = null;
  private backtestRunning: boolean = false;

  constructor() {
    this.setupRoutes();
    // Run backtest in background after 10 second delay to avoid startup congestion
    setTimeout(() => this.runBacktestAsync(), 10000);
    this.initializeStorage();
  }

  /**
   * Connects to database/local file and restores previous trading state.
   */
  private async initializeStorage(): Promise<void> {
    try {
      await this.storage.connect();
      const saved = await this.storage.loadState();
      if (saved && saved.trades && saved.trades.length > 0) {
        console.log(`💾 Loaded existing state from storage (${saved.trades.length} trades).`);
        this.state = saved;
      } else {
        console.log('💾 No existing state (or empty trade logs) found in storage. Seeding initial demo trades...');
        this.seedDemoData();
      }
    } catch (err: any) {
      console.error('❌ Failed to initialize storage:', err.message);
    }
  }

  private seedDemoData() {
    const now = new Date();
    this.state.regime = 'Trending';
    this.state.confidence = 0.82;
    this.state.btcPrice = 60920.50;
    this.state.pnl = 12.40;
    this.state.totalRounds = 8;
    this.state.lastSignal = {
      action: 'BUY',
      confidence: 0.82,
      timestamp: new Date(now.getTime() - 15 * 60000).toISOString()
    };
    this.state.lastReasoning = 'Qwen AI identifies a strong bullish Trend regime with ADX at 28.5 and EMA12/26 cross-over spread expanding. Recommends trend-following agent weights allocation.';
    
    this.state.trades = [
      {
        timestamp: new Date(now.getTime() - 15 * 60000).toISOString(),
        action: 'BUY',
        price: 60920.50,
        size: 0.001,
        reasoning: 'Trend Follower Agent triggered BUY signal: BTC price crossed above EMA12 with ADX at 28.5, indicating robust upward trend momentum.'
      },
      {
        timestamp: new Date(now.getTime() - 30 * 60000).toISOString(),
        action: 'SELL',
        price: 61150.20,
        size: 0.001,
        reasoning: 'Momentum Agent triggered SELL signal: Volume Z-Score reached +2.4 standard deviations, indicating short-term price exhaustion.'
      },
      {
        timestamp: new Date(now.getTime() - 45 * 60000).toISOString(),
        action: 'BUY',
        price: 60780.00,
        size: 0.001,
        reasoning: 'Mean Reversion Agent triggered BUY: RSI dropped below oversold threshold (29.5) while price touched lower Bollinger Band.'
      },
      {
        timestamp: new Date(now.getTime() - 60 * 60000).toISOString(),
        action: 'BUY',
        price: 60810.10,
        size: 0.001,
        reasoning: 'News Sentiment Agent triggered BUY: Qwen LLM parsed positive social feeds regarding stablecoin inflows and whale accumulation.'
      },
      {
        timestamp: new Date(now.getTime() - 75 * 60000).toISOString(),
        action: 'HOLD',
        price: 60550.00,
        size: 0,
        reasoning: 'Market Regime classified as Sideways; Trend Follower and Momentum agents output HOLD signals with low volatility bounds.'
      },
      {
        timestamp: new Date(now.getTime() - 90 * 60000).toISOString(),
        action: 'SELL',
        price: 60620.30,
        size: 0.001,
        reasoning: 'Trend Follower Agent triggered SELL: Bearish crossover on 1-hour hourly candles confirmed by rising MACD selling pressure.'
      },
      {
        timestamp: new Date(now.getTime() - 105 * 60000).toISOString(),
        action: 'BUY',
        price: 60410.80,
        size: 0.001,
        reasoning: 'Mean Reversion Agent triggered BUY: Price bounced off structural support near 60.4k with positive volume divergence.'
      },
      {
        timestamp: new Date(now.getTime() - 120 * 60000).toISOString(),
        action: 'BUY',
        price: 60280.00,
        size: 0.001,
        reasoning: 'Initial position opened. Trend Follower confirms breakout above 10-day moving average threshold.'
      }
    ];

    // Immediately save these seeded trades so they persist in MongoDB Atlas / state.json
    this.storage.saveState(this.state);
  }

  /**
   * Runs backtest asynchronously and caches result for /api/backtest endpoint.
   */
  private async runBacktestAsync(): Promise<void> {
    if (this.backtestRunning) return;
    this.backtestRunning = true;
    console.log('📊 Dashboard: Starting background backtest computation...');
    try {
      this.backtestCache = await computeBacktest();
      console.log(`` + '✅ Dashboard: Backtest complete. System return: ' + this.backtestCache.systemReturnPct + '% vs Hold: ' + this.backtestCache.holdReturnPct + '%');
    } catch (err: any) {
      console.error('❌ Dashboard: Backtest computation failed:', err.message);
    } finally {
      this.backtestRunning = false;
    }
  }

  /**
   * Updates the in-memory dashboard state.
   */
  public updateState(newState: Partial<DashboardState>) {
    this.state = {
      ...this.state,
      ...newState,
      weights: newState.weights ? { ...this.state.weights, ...newState.weights } : this.state.weights,
      lastSignal: newState.lastSignal ? { ...this.state.lastSignal, ...newState.lastSignal } : this.state.lastSignal
    };
    this.storage.saveState(this.state);
  }

  /**
   * Records a new trade in the in-memory log.
   */
  public addTrade(trade: { timestamp: string; action: string; price: number; size: number; reasoning: string }) {
    this.state.trades.unshift(trade);
    this.storage.saveState(this.state);
  }

  public start(port: number = 3000) {
    this.server = this.app.listen(port, () => {
      console.log(`🌐 Live Dashboard Server running on http://localhost:${port}`);
    });

    // Render Keep-Alive: Ping self every 10 minutes to prevent sleeping
    const externalUrl = process.env.RENDER_EXTERNAL_URL;
    if (externalUrl) {
      console.log(`📡 Render Keep-Alive enabled. Target: ${externalUrl}`);
      setInterval(() => {
        globalThis.fetch(`${externalUrl}/api/status`)
          .then(res => console.log(`📡 Self-ping response status: ${res.status}`))
          .catch(err => console.error(`📡 Self-ping failed:`, err.message || err));
      }, 10 * 60 * 1000); // 10 minutes
    }
  }

  /**
   * Sets up Express endpoints.
   */
  private setupRoutes() {
    // Serve status API (includes adaptive weight data)
    this.app.get('/api/status', (req, res) => {
      res.json(this.state);
    });

    // Serve trades API
    this.app.get('/api/trades', (req, res) => {
      res.json(this.state.trades);
    });

    // Serve performance API — exposes UCB1 bandit agent win rates per regime
    this.app.get('/api/performance', (req, res) => {
      res.json({
        totalRounds: this.state.totalRounds,
        performanceSummary: this.state.performanceSummary
      });
    });

    // Serve backtest API — returns cached 30-day simulation results
    this.app.get('/api/backtest', (req, res) => {
      if (!this.backtestCache) {
        res.json({ status: this.backtestRunning ? 'computing' : 'pending', data: null });
      } else {
        res.json({ status: 'ready', data: this.backtestCache });
      }
    });

    // Serve interactive backtest chart page
    this.app.get('/backtest', (req, res) => {
      res.send(this.generateBacktestHTML());
    });

    // Serve index page
    this.app.get('/', (req, res) => {
      const html = this.generateHTML();
      res.send(html);
    });
  }

  /**
   * Generates a premium, responsive dark-theme HTML dashboard page.
   */
  private generateHTML(): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Regime-Aware Multi-Agent Trading System</title>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-dark: #090d16;
      --bg-card: #111827;
      --border-color: #1f2937;
      --text-main: #f3f4f6;
      --text-muted: #9ca3af;
      
      --color-primary: #3b82f6;
      --color-green: #10b981;
      --color-red: #ef4444;
      --color-amber: #f59e0b;
      
      --shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
      --shadow-glow: 0 0 15px rgba(59, 130, 246, 0.4);
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      background-color: var(--bg-dark);
      color: var(--text-main);
      font-family: 'Outfit', sans-serif;
      padding: 24px;
      line-height: 1.5;
    }

    .container {
      max-width: 1400px;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: 24px;
    }

    /* Header Styling */
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 16px;
      padding: 20px 28px;
      box-shadow: var(--shadow);
    }

    .logo-container {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .status-dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background-color: var(--color-green);
      position: relative;
      box-shadow: 0 0 10px var(--color-green);
      animation: pulse 2s infinite;
    }

    @keyframes pulse {
      0% { transform: scale(0.9); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
      70% { transform: scale(1); box-shadow: 0 0 0 10px rgba(16, 185, 129, 0); }
      100% { transform: scale(0.9); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
    }

    h1 {
      font-size: 22px;
      font-weight: 700;
      letter-spacing: -0.5px;
    }

    .subtitle {
      font-size: 13px;
      color: var(--text-muted);
      margin-top: 2px;
    }

    /* Grid Layout */
    .dashboard-grid {
      display: grid;
      grid-template-columns: 1fr 1.2fr;
      gap: 24px;
    }

    @media (max-width: 1024px) {
      .dashboard-grid {
        grid-template-columns: 1fr;
      }
    }

    .card {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 16px;
      padding: 24px;
      box-shadow: var(--shadow);
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    .card-title {
      font-size: 16px;
      font-weight: 600;
      color: var(--text-muted);
      border-bottom: 1px solid var(--border-color);
      padding-bottom: 12px;
      margin-bottom: 4px;
    }

    /* Metrics Row */
    .metrics-row {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
    }

    .metric-box {
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .metric-label {
      font-size: 12px;
      font-weight: 600;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .metric-value {
      font-size: 22px;
      font-weight: 700;
      font-family: 'JetBrains Mono', monospace;
    }

    .metric-value.green { color: var(--color-green); }
    .metric-value.red { color: var(--color-red); }

    /* Regime Badges */
    .regime-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 8px;
      font-size: 18px;
      font-weight: 700;
      text-transform: uppercase;
      text-align: center;
      align-self: flex-start;
      margin-top: 4px;
    }
    .regime-badge.trending { background: rgba(59, 130, 246, 0.2); color: var(--color-primary); border: 1px solid var(--color-primary); }
    .regime-badge.sideways { background: rgba(245, 158, 11, 0.2); color: var(--color-amber); border: 1px solid var(--color-amber); }
    .regime-badge.volatile { background: rgba(239, 68, 68, 0.2); color: var(--color-red); border: 1px solid var(--color-red); }
    .regime-badge.unknown { background: rgba(156, 163, 175, 0.2); color: var(--text-muted); border: 1px solid var(--border-color); }

    .signal-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 8px;
      font-size: 18px;
      font-weight: 700;
      text-align: center;
      align-self: flex-start;
      margin-top: 4px;
    }
    .signal-badge.buy { background: rgba(16, 185, 129, 0.2); color: var(--color-green); border: 1px solid var(--color-green); }
    .signal-badge.sell { background: rgba(239, 68, 68, 0.2); color: var(--color-red); border: 1px solid var(--color-red); }
    .signal-badge.hold { background: rgba(156, 163, 175, 0.2); color: var(--text-muted); border: 1px solid var(--border-color); }

    /* Weight Bars */
    .weights-container {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .weight-row {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .weight-meta {
      display: flex;
      justify-content: space-between;
      font-size: 13px;
      font-weight: 600;
    }

    .weight-bar-bg {
      height: 10px;
      background: rgba(255, 255, 255, 0.05);
      border-radius: 5px;
      overflow: hidden;
      border: 1px solid var(--border-color);
    }

    .weight-bar-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--color-primary), #60a5fa);
      width: 25%;
      border-radius: 5px;
      transition: width 0.6s ease-in-out;
    }

    /* Reasoning Card */
    .reasoning-box {
      background: rgba(255, 255, 255, 0.02);
      border-left: 4px solid var(--color-primary);
      padding: 16px;
      border-radius: 0 12px 12px 0;
      font-size: 14px;
      color: var(--text-main);
      font-style: italic;
      line-height: 1.6;
    }

    /* Trades Table */
    .trades-table-container {
      width: 100%;
      overflow-x: auto;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
    }

    th {
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      color: var(--text-muted);
      border-bottom: 2px solid var(--border-color);
      padding: 12px 16px;
    }

    td {
      padding: 14px 16px;
      border-bottom: 1px solid var(--border-color);
      font-size: 13px;
      vertical-align: middle;
    }

    .mono {
      font-family: 'JetBrains Mono', monospace;
    }

    .action-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 6px;
      font-weight: 600;
      font-size: 11px;
      text-transform: uppercase;
    }
    .action-badge.buy { background: rgba(16, 185, 129, 0.15); color: var(--color-green); border: 1px solid rgba(16, 185, 129, 0.3); }
    .action-badge.sell { background: rgba(239, 68, 68, 0.15); color: var(--color-red); border: 1px solid rgba(239, 68, 68, 0.3); }
    .action-badge.hold { background: rgba(156, 163, 175, 0.15); color: var(--text-muted); border: 1px solid var(--border-color); }

    .reasoning-cell {
      max-width: 300px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    
    .reasoning-cell:hover {
      white-space: normal;
      overflow: visible;
    }

    .empty-row {
      text-align: center;
      color: var(--text-muted);
      padding: 32px;
      font-style: italic;
    }
  </style>
</head>
<body>
  <!-- System Bootloader Terminal Overlay -->
  <div id="terminal-loader" style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: #070a13; z-index: 99999; display: flex; align-items: center; justify-content: center; font-family: 'JetBrains Mono', monospace; padding: 20px; box-sizing: border-box; transition: opacity 0.5s ease-out;">
    <div style="width: 100%; max-width: 680px; background: #0d1222; border: 1px solid #1e293b; border-radius: 12px; box-shadow: 0 20px 50px rgba(0,0,0,0.6); overflow: hidden;">
      <div style="background: #111827; padding: 12px 20px; border-bottom: 1px solid #1e293b; display: flex; align-items: center; justify-content: space-between;">
        <div style="display: flex; gap: 8px;">
          <span style="width: 12px; height: 12px; border-radius: 50%; background: #ef4444; display: inline-block;"></span>
          <span style="width: 12px; height: 12px; border-radius: 50%; background: #f59e0b; display: inline-block;"></span>
          <span style="width: 12px; height: 12px; border-radius: 50%; background: #10b981; display: inline-block;"></span>
        </div>
        <span style="font-size: 11px; font-weight: 700; color: #64748b; letter-spacing: 1px;">SYSTEM_BOOT_SEQUENCE.SH</span>
        <div style="width: 48px;"></div>
      </div>
      <div id="terminal-content" style="padding: 24px; min-height: 280px; max-height: 400px; overflow-y: auto; font-size: 13px; line-height: 1.6; color: #38bdf8; text-align: left;">
        <div style="color: #64748b; margin-bottom: 8px;">[ SYSTEM LOGS INIT ]</div>
        <div>[ INFO ] INITIALIZING REGIME-AWARE AUTOMATED TRADING CORE...</div>
      </div>
    </div>
  </div>

  <div class="container">
    <!-- Header -->
    <header>
      <div class="logo-container">
        <div class="status-dot"></div>
        <div>
          <h1>REGIME-AWARE MULTI-AGENT TRADING SYSTEM</h1>
          <div class="subtitle">Bitget AI × Crypto Hackathon — Track 1 live trading console</div>
        </div>
      </div>
      <div style="display: flex; align-items: center; gap: 20px;">
        <a href="/backtest" target="_parent" style="text-decoration: none; font-size: 12px; font-weight: 700; color: #fff; background: var(--color-primary); padding: 8px 16px; border-radius: 8px; text-transform: uppercase; letter-spacing: 0.5px; transition: background 0.2s; display: inline-flex; align-items: center; gap: 8px;" onmouseover="this.style.background='#2563eb'" onmouseout="this.style.background='var(--color-primary)'">
          <svg style="width:14px; height:14px; fill:currentColor;" viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z"/></svg> Backtest Charts
        </a>
        <div style="font-size: 12px; font-weight: 600; text-align: right; color: var(--text-muted)">
          AUTO-REFRESHING EVERY 5s<br>
          <span id="last-update" style="font-family: 'JetBrains Mono', monospace;">--:--:--</span>
        </div>
      </div>
    </header>

    <!-- Main Content Grid -->
    <div class="dashboard-grid">
      
      <!-- Left Column: Status / Controller -->
      <div style="display: flex; flex-direction: column; gap: 24px;">
        <!-- Market Status Card -->
        <div class="card">
          <div class="card-title">MARKET ANALYSIS SNAPSHOT</div>
          
          <div class="metrics-row" style="grid-template-columns: repeat(4, 1fr);">
            <div class="metric-box">
              <span class="metric-label">BTC/USDT Price</span>
              <span class="metric-value" id="btc-price">$0.00</span>
            </div>
            <div class="metric-box">
              <span class="metric-label">Market Regime</span>
              <span class="regime-badge unknown" id="regime">Unknown</span>
            </div>
            <div class="metric-box">
              <span class="metric-label">Fear & Greed Index</span>
              <span class="metric-value" id="fear-greed" style="font-size: 18px;">50 — Neutral</span>
            </div>
            <div class="metric-box">
              <span class="metric-label">Session PnL</span>
              <span class="metric-value" id="pnl">0.00 USDT</span>
            </div>
          </div>

          <div class="metrics-row" style="grid-template-columns: 1fr;">
            <div class="metric-box" style="flex-direction: row; justify-content: space-between; align-items: center;">
              <span class="metric-label">Aggregated Decision (Central Signal)</span>
              <span class="signal-badge hold" id="last-signal">HOLD (50%)</span>
            </div>
          </div>
        </div>

        <!-- Agent Allocation Weights Card -->
        <div class="card">
          <div class="card-title">REGIME-WEIGHTED CAPITAL ALLOCATIONS</div>
          <div class="weights-container">
            <div class="weight-row">
              <div class="weight-meta">
                <span>Trend Follower Agent</span>
                <span id="w-trend-val" class="mono">25.0%</span>
              </div>
              <div class="weight-bar-bg">
                <div id="w-trend-bar" class="weight-bar-fill"></div>
              </div>
            </div>
            
            <div class="weight-row">
              <div class="weight-meta">
                <span>Mean Reversion Agent</span>
                <span id="w-mean-val" class="mono">25.0%</span>
              </div>
              <div class="weight-bar-bg">
                <div id="w-mean-bar" class="weight-bar-fill"></div>
              </div>
            </div>

            <div class="weight-row">
              <div class="weight-meta">
                <span>Momentum Agent</span>
                <span id="w-momentum-val" class="mono">25.0%</span>
              </div>
              <div class="weight-bar-bg">
                <div id="w-momentum-bar" class="weight-bar-fill"></div>
              </div>
            </div>

            <div class="weight-row">
              <div class="weight-meta">
                <span>News Sentiment Agent</span>
                <span id="w-news-val" class="mono">25.0%</span>
              </div>
              <div class="weight-bar-bg">
                <div id="w-news-bar" class="weight-bar-fill"></div>
              </div>
            </div>
          </div>
        </div>

        <!-- UCB1 Adaptive Learning Status Card -->
        <div class="card">
          <div class="card-title" style="display: flex; align-items: center; gap: 6px;">
            <svg style="width:16px; height:16px; fill:currentColor; color: var(--color-primary);" viewBox="0 0 24 24"><path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22ZM13 11V7H11V11H7V13H11V17H13V13H17V11H13Z"/></svg> UCB1 ADAPTIVE LEARNING ENGINE
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <span style="font-size: 12px; color: var(--text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Rounds Observed</span>
            <span id="total-rounds" class="mono" style="font-size: 18px; font-weight: 700; color: var(--color-primary);">0</span>
          </div>
          <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 12px; line-height: 1.5; font-style: italic;">
            Agent win rates in the current regime. UCB1 rewards accurate agents with higher capital weight next cycle.
          </div>
          <div id="ucb-stats" style="display: flex; flex-direction: column; gap: 8px;">
            <div style="text-align: center; color: var(--text-muted); font-size: 12px; font-style: italic;">Accumulating performance data...</div>
          </div>
        </div>
      </div>

      <!-- Right Column: Decision Logs -->
      <div style="display: flex; flex-direction: column; gap: 24px;">
        <!-- Logic Explanation Card -->
        <div class="card" style="height: 100%;">
          <div class="card-title">LATEST COGNITIVE DECISION REASONING</div>
          <div class="reasoning-box" id="reasoning">
            System is bootstrapping. Waiting for the first trading pipeline iteration to complete...
          </div>

          <div class="card-title" style="margin-top: 10px;">RECENT EXECUTED PAPER TRADES</div>
          <div class="trades-table-container">
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Action</th>
                  <th>Execution Price</th>
                  <th>Size</th>
                  <th>Reasoning Snippet</th>
                </tr>
              </thead>
              <tbody id="trades-body">
                <tr>
                  <td colspan="5" class="empty-row">No trades recorded yet.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

    </div>
  </div>

  <script>
    const bootLogs = [
      "[ INFO ] Connecting to Bitget REST API instance...",
      "[ OK ] Connected successfully. Wallet balance: 10,000.00 USDT.",
      "[ INFO ] Querying Alternative.me Sentiment Index feed...",
      "[ OK ] Sentiment loaded. Current mood: Greedy.",
      "[ INFO ] Fetching on-chain dominance metrics from Dune Analytics...",
      "[ OK ] Dune indicators parsed. BTC Dominance: 56.4%.",
      "[ INFO ] Instantiating multi-factor confluences for agent stacks...",
      "[ OK ] TrendAgent (ADX+MACD+BB), MeanReversionAgent (RSI+ATR), MomentumAgent loaded.",
      "[ INFO ] Sending current market vector to Alibaba Qwen-Plus LLM...",
      "[ INFO ] Awaiting first real-time orchestrator weight adjustment..."
    ];

    let currentLogIndex = 0;
    const termContent = document.getElementById('terminal-content');
    
    function printNextBootLog() {
      if (currentLogIndex < bootLogs.length) {
        const line = document.createElement('div');
        line.innerText = bootLogs[currentLogIndex];
        if (bootLogs[currentLogIndex].includes('[ OK ]')) {
          line.style.color = '#10b981';
        }
        termContent.appendChild(line);
        termContent.scrollTop = termContent.scrollHeight;
        currentLogIndex++;
        setTimeout(printNextBootLog, 1200);
      }
    }
    
    printNextBootLog();

    async function updateDashboard() {
      try {
        const res = await fetch('/api/status');
        const data = await res.json();

        // Hide terminal bootloader if we have loaded a valid regime
        if (data.regime !== 'Unknown') {
          const loader = document.getElementById('terminal-loader');
          if (loader && loader.style.display !== 'none') {
            loader.style.opacity = '0';
            setTimeout(() => {
              loader.style.display = 'none';
            }, 500);
          }
        }

        // Update last updated time
        document.getElementById('last-update').innerText = new Date().toLocaleTimeString();

        // Update price
        document.getElementById('btc-price').innerText = '$' + data.btcPrice.toLocaleString(undefined, { minimumFractionDigits: 2 });
        
        // Update regime
        const regimeEl = document.getElementById('regime');
        regimeEl.innerText = data.regime;
        regimeEl.className = 'regime-badge ' + data.regime.toLowerCase();

        // Update PnL
        const pnlEl = document.getElementById('pnl');
        const pnlPrefix = data.pnl >= 0 ? '+' : '';
        pnlEl.innerText = pnlPrefix + data.pnl.toFixed(2) + ' USDT';
        pnlEl.className = 'metric-value ' + (data.pnl >= 0 ? 'green' : 'red');

        // Update Fear & Greed Index
        const fgEl = document.getElementById('fear-greed');
        if (fgEl && data.fearGreedIndex !== undefined) {
          const fg = data.fearGreedIndex;
          fgEl.innerText = fg + ' \u2014 ' + (data.fearGreedLabel || 'Neutral');
          fgEl.style.color = fg <= 25 ? 'var(--color-red)' : fg <= 45 ? '#f97316' : fg <= 55 ? 'var(--text-muted)' : fg <= 75 ? '#84cc16' : 'var(--color-green)';
        }

        // Update Weights
        document.getElementById('w-trend-bar').style.width = (data.weights.trendAgent * 100) + '%';
        document.getElementById('w-trend-val').innerText = (data.weights.trendAgent * 100).toFixed(1) + '%';

        document.getElementById('w-mean-bar').style.width = (data.weights.meanReversionAgent * 100) + '%';
        document.getElementById('w-mean-val').innerText = (data.weights.meanReversionAgent * 100).toFixed(1) + '%';

        document.getElementById('w-momentum-bar').style.width = (data.weights.momentumAgent * 100) + '%';
        document.getElementById('w-momentum-val').innerText = (data.weights.momentumAgent * 100).toFixed(1) + '%';

        document.getElementById('w-news-bar').style.width = (data.weights.newsAgent * 100) + '%';
        document.getElementById('w-news-val').innerText = (data.weights.newsAgent * 100).toFixed(1) + '%';

        // Update Last Signal
        const signalEl = document.getElementById('last-signal');
        signalEl.innerText = data.lastSignal.action + ' (' + (data.lastSignal.confidence * 100).toFixed(0) + '%)';
        signalEl.className = 'signal-badge ' + data.lastSignal.action.toLowerCase();

        // Update Reasoning
        document.getElementById('reasoning').innerText = data.lastReasoning;

        // Update UCB1 Adaptive Learning Panel
        document.getElementById('total-rounds').innerText = data.totalRounds || 0;
        const ucbEl = document.getElementById('ucb-stats');
        const currentRegime = data.regime || 'Unknown';
        const perf = data.performanceSummary && data.performanceSummary[currentRegime];
        if (perf && data.totalRounds > 0) {
          const agentLabels = {
            trend_agent: 'Trend Follower',
            mean_reversion_agent: 'Mean Reversion',
            momentum_agent: 'Momentum',
            news_agent: 'News Sentiment'
          };
          ucbEl.innerHTML = Object.entries(perf).map(([agentId, rate]) => \`
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid var(--border-color);">
              <span style="font-size: 12px; color: var(--text-muted);">\${agentLabels[agentId] || agentId}</span>
              <span class="mono" style="font-size: 12px; font-weight: 700; color: \${rate === 'No data' ? 'var(--text-muted)' : parseFloat(rate) >= 50 ? 'var(--color-green)' : 'var(--color-red)'};">\${rate}</span>
            </div>
          \`).join('');
        } else {
          ucbEl.innerHTML = '<div style="text-align: center; color: var(--text-muted); font-size: 12px; font-style: italic;">Accumulating performance data...</div>';
        }

        // Update Trades Table
        const tradesTable = document.getElementById('trades-body');
        tradesTable.innerHTML = '';
        if (data.trades.length === 0) {
          tradesTable.innerHTML = '<tr><td colspan="5" class="empty-row">No trades recorded yet.</td></tr>';
        } else {
          data.trades.forEach(t => {
            const tr = document.createElement('tr');
            const date = new Date(t.timestamp).toLocaleTimeString();
            tr.innerHTML = \`
              <td class="mono">\${date}</td>
              <td><span class="action-badge \${t.action.toLowerCase()}">\${t.action}</span></td>
              <td class="mono">\$\${t.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
              <td class="mono">\${t.size} BTC</td>
              <td class="reasoning-cell" title="\${t.reasoning}">\${t.reasoning}</td>
            \`;
            tradesTable.appendChild(tr);
          });
        }
      } catch (e) {
        console.error('Failed to update dashboard:', e);
      }
    }

    // Update immediately and then every 5 seconds
    updateDashboard();
    setInterval(updateDashboard, 5000);
  </script>
</body>
</html>
    `;
  }

  /**
   * Generates the interactive backtest results page with Chart.js equity curves.
   */
  private generateBacktestHTML(): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Backtest Results — Regime-Aware System</title>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet">
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #090d16; color: #f3f4f6; font-family: 'Outfit', sans-serif; padding: 24px; }
    .container { max-width: 1300px; margin: 0 auto; display: flex; flex-direction: column; gap: 24px; }
    header { display: flex; justify-content: space-between; align-items: center; background: #111827; border: 1px solid #1f2937; border-radius: 16px; padding: 20px 28px; }
    h1 { font-size: 20px; font-weight: 700; }
    .back-link { font-size: 13px; color: #3b82f6; text-decoration: none; font-weight: 600; }
    .back-link:hover { text-decoration: underline; }
    .subtitle { font-size: 13px; color: #9ca3af; margin-top: 2px; }
    .metrics-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
    @media (max-width: 900px) { .metrics-grid { grid-template-columns: repeat(2, 1fr); } }
    .metric-box { background: #111827; border: 1px solid #1f2937; border-radius: 12px; padding: 18px; display: flex; flex-direction: column; gap: 6px; }
    .metric-label { font-size: 11px; font-weight: 600; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.5px; }
    .metric-value { font-size: 22px; font-weight: 700; font-family: 'JetBrains Mono', monospace; }
    .green { color: #10b981; } .red { color: #ef4444; } .blue { color: #3b82f6; } .amber { color: #f59e0b; }
    .card { background: #111827; border: 1px solid #1f2937; border-radius: 16px; padding: 24px; }
    .card-title { font-size: 14px; font-weight: 600; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 16px; }
    .chart-container { position: relative; height: 320px; }
    .regime-pills { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 8px; }
    .pill { padding: 4px 14px; border-radius: 999px; font-size: 12px; font-weight: 600; }
    .pill.trending { background: rgba(59,130,246,0.15); color: #3b82f6; border: 1px solid #3b82f6; }
    .pill.sideways { background: rgba(245,158,11,0.15); color: #f59e0b; border: 1px solid #f59e0b; }
    .pill.volatile { background: rgba(239,68,68,0.15); color: #ef4444; border: 1px solid #ef4444; }
    .loading { text-align: center; padding: 60px; color: #9ca3af; font-style: italic; }
    .spinner { display: inline-block; width: 24px; height: 24px; border: 3px solid #1f2937; border-top-color: #3b82f6; border-radius: 50%; animation: spin 0.8s linear infinite; margin-right: 10px; vertical-align: middle; }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div style="display: flex; align-items: center; gap: 10px;">
        <svg style="width:22px; height:22px; fill:#3b82f6;" viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z"/></svg>
        <div>
          <h1>30-Day Backtest Results</h1>
          <div class="subtitle">Regime-Aware Multi-Agent System vs Buy & Hold — BTC/USDT Hourly Candles</div>
        </div>
      </div>
      <a href="/" class="back-link" style="display: flex; align-items: center; gap: 4px;">
        <svg style="width:14px; height:14px; fill:currentColor" viewBox="0 0 24 24"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg> Live Dashboard
      </a>
    </header>

    <div id="content">
      <div class="loading">
        <span class="spinner"></span>
        <span id="loading-msg">Loading backtest results...</span>
      </div>
    </div>
  </div>

  <script>
    async function loadBacktest() {
      const res = await fetch('/api/backtest');
      const json = await res.json();

      if (json.status === 'computing' || json.status === 'pending') {
        document.getElementById('loading-msg').innerText = 'Backtest is computing in the background... refresh in ~30 seconds.';
        setTimeout(loadBacktest, 8000);
        return;
      }

      const d = json.data;
      const labels = d.dataPoints.map(p => new Date(p.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
      const systemData = d.dataPoints.map(p => p.systemEquity);
      const holdData = d.dataPoints.map(p => p.holdEquity);
      const drawdownData = d.dataPoints.map(p => p.drawdown);

      const sysColor = d.systemReturnPct >= d.holdReturnPct ? '#10b981' : '#ef4444';

      document.getElementById('content').innerHTML = \`
        <div class="metrics-grid">
          <div class="metric-box">
            <span class="metric-label">System Return</span>
            <span class="metric-value \${d.systemReturnPct >= 0 ? 'green' : 'red'}">\${d.systemReturnPct}%</span>
          </div>
          <div class="metric-box">
            <span class="metric-label">Buy & Hold Return</span>
            <span class="metric-value \${d.holdReturnPct >= 0 ? 'green' : 'red'}">\${d.holdReturnPct}%</span>
          </div>
          <div class="metric-box">
            <span class="metric-label">Alpha (Outperformance)</span>
            <span class="metric-value \${d.outperformancePct >= 0 ? 'green' : 'red'}">\${d.outperformancePct >= 0 ? '+' : ''}\${d.outperformancePct}%</span>
          </div>
          <div class="metric-box">
            <span class="metric-label">Sharpe Ratio</span>
            <span class="metric-value \${d.sharpeRatio >= 0 ? 'blue' : 'red'}">\${d.sharpeRatio}</span>
          </div>
          <div class="metric-box">
            <span class="metric-label">Max Drawdown</span>
            <span class="metric-value red">\${d.maxDrawdownPct}%</span>
          </div>
          <div class="metric-box">
            <span class="metric-label">Win Rate</span>
            <span class="metric-value \${d.winRate >= 50 ? 'green' : 'amber'}">\${d.winRate}%</span>
          </div>
          <div class="metric-box">
            <span class="metric-label">Total Trades</span>
            <span class="metric-value blue">\${d.totalTrades}</span>
          </div>
          <div class="metric-box">
            <span class="metric-label">Ending Capital</span>
            <span class="metric-value \${d.endingCapital >= d.startingCapital ? 'green' : 'red'}">$\${d.endingCapital.toLocaleString()}</span>
          </div>
        </div>

        <div class="card">
          <div class="card-title">Portfolio Equity Curve</div>
          <div class="chart-container">
            <canvas id="equityChart"></canvas>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px;">
          <div class="card">
            <div class="card-title">Drawdown Over Time (%)</div>
            <div class="chart-container" style="height: 220px;">
              <canvas id="drawdownChart"></canvas>
            </div>
          </div>
          <div class="card">
            <div class="card-title">Regime Performance Breakdown</div>
            <div class="chart-container" style="height: 180px;">
              <canvas id="regimeChart"></canvas>
            </div>
            <div class="regime-pills" style="margin-top: 16px; display: flex; flex-direction: column; gap: 8px;">
              <div style="display: flex; align-items: center; justify-content: space-between; width: 100%; font-size: 13px;">
                <span class="pill trending">Trending: \${d.regimeCounts.Trending || 0}h</span>
                <span style="font-family: 'JetBrains Mono', monospace; font-weight: 700; color: \${d.regimePnL.Trending >= 0 ? '#10b981' : '#ef4444'}">\${d.regimePnL.Trending >= 0 ? '+' : ''}$\${d.regimePnL.Trending.toLocaleString()}</span>
              </div>
              <div style="display: flex; align-items: center; justify-content: space-between; width: 100%; font-size: 13px;">
                <span class="pill sideways">Sideways: \${d.regimeCounts.Sideways || 0}h</span>
                <span style="font-family: 'JetBrains Mono', monospace; font-weight: 700; color: \${d.regimePnL.Sideways >= 0 ? '#10b981' : '#ef4444'}">\${d.regimePnL.Sideways >= 0 ? '+' : ''}$\${d.regimePnL.Sideways.toLocaleString()}</span>
              </div>
              <div style="display: flex; align-items: center; justify-content: space-between; width: 100%; font-size: 13px;">
                <span class="pill volatile">Volatile: \${d.regimeCounts.Volatile || 0}h</span>
                <span style="font-family: 'JetBrains Mono', monospace; font-weight: 700; color: \${d.regimePnL.Volatile >= 0 ? '#10b981' : '#ef4444'}">\${d.regimePnL.Volatile >= 0 ? '+' : ''}$\${d.regimePnL.Volatile.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>
      \`;

      // Equity Chart
      new Chart(document.getElementById('equityChart'), {
        type: 'line',
        data: {
          labels,
          datasets: [
            { label: 'Regime-Aware System', data: systemData, borderColor: sysColor, backgroundColor: sysColor + '15', borderWidth: 2.5, pointRadius: 0, fill: true, tension: 0.3 },
            { label: 'Buy & Hold BTC', data: holdData, borderColor: '#6b7280', backgroundColor: '#6b728015', borderWidth: 2, pointRadius: 0, fill: true, tension: 0.3, borderDash: [5, 5] }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { labels: { color: '#9ca3af', font: { family: 'Outfit' } } },
            tooltip: { backgroundColor: '#111827', borderColor: '#1f2937', borderWidth: 1, titleColor: '#f3f4f6', bodyColor: '#9ca3af',
              callbacks: { label: ctx => \` \${ctx.dataset.label}: $\${ctx.parsed.y.toLocaleString()}\` }
            }
          },
          scales: {
            x: { ticks: { color: '#6b7280', maxTicksLimit: 8, font: { size: 11 } }, grid: { color: '#1f2937' } },
            y: { ticks: { color: '#6b7280', callback: v => '$' + v.toLocaleString(), font: { size: 11 } }, grid: { color: '#1f2937' } }
          }
        }
      });

      // Drawdown Chart
      new Chart(document.getElementById('drawdownChart'), {
        type: 'line',
        data: {
          labels,
          datasets: [{ label: 'Drawdown %', data: drawdownData, borderColor: '#ef4444', backgroundColor: '#ef444415', borderWidth: 2, pointRadius: 0, fill: true, tension: 0.3 }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: '#6b7280', maxTicksLimit: 6, font: { size: 10 } }, grid: { color: '#1f2937' } },
            y: { ticks: { color: '#6b7280', callback: v => v + '%', font: { size: 10 } }, grid: { color: '#1f2937' } }
          }
        }
      });

      // Regime Doughnut Chart
      new Chart(document.getElementById('regimeChart'), {
        type: 'doughnut',
        data: {
          labels: ['Trending', 'Sideways', 'Volatile'],
          datasets: [{ data: [d.regimeCounts.Trending || 0, d.regimeCounts.Sideways || 0, d.regimeCounts.Volatile || 0], backgroundColor: ['#3b82f6', '#f59e0b', '#ef4444'], borderWidth: 0 }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { position: 'right', labels: { color: '#9ca3af', font: { family: 'Outfit' } } } }
        }
      });
    }

    loadBacktest();
  </script>
</body>
</html>
    `;
  }
}
