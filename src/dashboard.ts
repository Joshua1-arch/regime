import express from 'express';
import { Server } from 'http';

export interface DashboardState {
  regime: string;
  confidence: number;
  weights: {
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
    trades: []
  };

  constructor() {
    this.setupRoutes();
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
  }

  /**
   * Records a new trade in the in-memory log.
   */
  public addTrade(trade: { timestamp: string; action: string; price: number; size: number; reasoning: string }) {
    this.state.trades.unshift(trade);
  }

  /**
   * Starts the Express.js server on the specified port.
   */
  public start(port: number = 3000) {
    this.server = this.app.listen(port, () => {
      console.log(`🌐 Live Dashboard Server running on http://localhost:${port}`);
    });
  }

  /**
   * Sets up Express endpoints.
   */
  private setupRoutes() {
    // Serve status API
    this.app.get('/api/status', (req, res) => {
      res.json(this.state);
    });

    // Serve trades API
    this.app.get('/api/trades', (req, res) => {
      res.json(this.state.trades);
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
      <div style="font-size: 12px; font-weight: 600; text-align: right; color: var(--text-muted)">
        AUTO-REFRESHING EVERY 5s<br>
        <span id="last-update" style="font-family: 'JetBrains Mono', monospace;">--:--:--</span>
      </div>
    </header>

    <!-- Main Content Grid -->
    <div class="dashboard-grid">
      
      <!-- Left Column: Status / Controller -->
      <div style="display: flex; flex-direction: column; gap: 24px;">
        <!-- Market Status Card -->
        <div class="card">
          <div class="card-title">MARKET ANALYSIS SNAPSHOT</div>
          
          <div class="metrics-row">
            <div class="metric-box">
              <span class="metric-label">BTC/USDT Price</span>
              <span class="metric-value" id="btc-price">$0.00</span>
            </div>
            <div class="metric-box">
              <span class="metric-label">Market Regime</span>
              <span class="regime-badge unknown" id="regime">Unknown</span>
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
    async function updateDashboard() {
      try {
        const res = await fetch('/api/status');
        const data = await res.json();

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
}
