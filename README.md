# Regime-Aware Multi-Agent Trading System

An autonomous, multi-agent developer framework that dynamically classifies crypto market regimes using the Alibaba Qwen LLM and distributes capital allocations accordingly for spot trading on Bitget and Solana.

---

## 📊 System Architecture

```text
               +----------------------------------------+
               |  Market & On-Chain Data Feeds          |
               |  (Bitget Candles, Funding Rate + Dune) |
               +----------------------------------------+
                                    |
                                    v
               +----------------------------------------+
               |   MarketRegimeDetector (Qwen-Plus)     |
               |   -> Classifies: Trending/Sideways/Vol |
               |   -> Generates Allocations / Weights   |
               +----------------------------------------+
                                    |
            +-----------------------+-----------------------+
            |                       |                       |
            v                       v                       v
+-----------------------+ +-----------------------+ +-----------------------+
|  Trend Follower Agent | | Mean Reversion Agent  | |    Momentum Agent     |
|   (EMA Crossover)     | |      (RSI-14)         | |   (Volume Z-score)    |
+-----------------------+ +-----------------------+ +-----------------------+
            |                       |                       |
            +-----------------------+-----------------------+
                                    |
                                    v
                     +-----------------------------+
                     |    News Sentiment Agent     |
                     |  (Qwen qualitative parsing) |
                     +-----------------------------+
                                    |
                                    v
                     +-----------------------------+
                     |   Central Orchestrator      |
                     |   (Weighted Signal Blend)   |
                     +-----------------------------+
                                    |
                                    v
                     +-----------------------------+
                     |    Multi-Chain Executor     |
                     | (Bitget Spot / Solana Devnet) |
                     +-----------------------------+
                                    |
                                    v
                     +-----------------------------+
                     |    Web Dashboard Console    |
                     |  (Live stats, trades, PnL)  |
                     +-----------------------------+
```

---

## ⚙️ Plugin Architecture

The system is designed as an extensible **developer framework**. Any quant developer can build and deploy a custom trading agent by implementing the standard `Agent` and `AgentSignal` interfaces defined in the system.

### Custom Agent Interface
To add an agent, implement the following structure:
```typescript
import { MarketData, AgentSignal } from '../types';

export interface Agent {
  agentId: string;
  generateSignal(
    marketData: MarketData, 
    historicalCandles: any[], 
    context?: any
  ): Promise<AgentSignal>;
}
```

Once built, simply register your new agent in `src/orchestrator.ts` and update the Qwen LLM prompt inside `src/regimeDetector.ts` to include the agent's strategy profile in the dynamic weight allocation matrix.

---

## 📈 Performance Backtest Results

To validate the regime-aware capital-weighting approach, the system was ran through a **30-day hourly candle backtest simulation on BTC** (720 historical data points) comparing the System's return against a traditional Buy & Hold strategy.

| Metric | Buy & Hold Strategy | Regime-Aware Multi-Agent |
| :--- | :---: | :---: |
| **Starting Capital** | 10,000.00 USDT | 10,000.00 USDT |
| **Ending Capital** | 7,503.00 USDT | **8,964.16 USDT** |
| **Total Return** | -24.97% | **-10.36%** |
| **Outperformance** | *Baseline* | **+14.61%** |
| **Max Drawdown** | -24.97% | **-11.14%** |
| **Simulated Trades** | 1 | 34 |

> [!NOTE]
> During a major 25% market correction, the system successfully identified emerging bearish trends and range-bound volatility, reducing portfolio drawdown by more than half and achieving **14.61% alpha outperformance** compared to buy-and-hold.

---

## 🚀 Future Roadmap

* **Solana DEX execution:** Migrate devnet transaction execution to Solana mainnet using high-throughput Jupiter v6 swap contracts.
* **ZK-Proof of Trade Signals:** Implement zero-knowledge proofs (using RISC Zero or SP1) to prove trading agent execution rules and backtest accuracy without exposing proprietary alpha strategies.
* **On-Chain Agent Registry:** Deploy a decentralized registry on Solana/Bitget EVM allowing third-party developers to lease their agent weights on-chain.

---

## 🛠️ Setup & Installation

### 1. Install Dependencies
```bash
npm install
cd landing && npm install && cd ..
```

### 2. Configure Environment Variables
Create a `.env` file in the root directory:
```env
BITGET_API_KEY=your_bitget_key
BITGET_API_SECRET=your_bitget_secret
BITGET_PASSPHRASE=your_bitget_passphrase

DASHSCOPE_API_KEY=your_qwen_key
DASHSCOPE_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1

DUNE_API_KEY=your_dune_key

# Multi-Chain Executor Selection
# Options: bitget | solana
EXECUTOR=bitget

# Solana Configuration (optional)
SOLANA_PRIVATE_KEY=[your_private_key_as_comma_separated_integers]
SOLANA_RPC_URL=https://api.devnet.solana.com
```

### 3. Running the System
Start the main autonomous execution loop and the live web dashboard:
```bash
npm run start
```
Start the Next.js landing page:
```bash
cd landing
npm run dev -- -p 3001
```

---

## 🎬 3-Minute Video Pitch Script

### **Section 1: The Problem (0:00 - 0:30)**
* **Visual:** Close-up of terminal logs or market charts during a crash.
* **Voiceover:** 
  > "Crypto markets are highly moody. A strategy that generates massive gains during a trend will get completely chopped to pieces in a sideways market, and devastated in volatile flash crashes. Quantitative funds solve this by manually tuning allocations, but retail traders are left executing static strategies in changing regimes. The problem isn't the strategy—it's that our systems aren't aware of the regime."

### **Section 2: The Solution & Architecture (0:30 - 1:30)**
* **Visual:** Show the landing page layout and transitions to the system architecture diagram.
* **Voiceover:**
  > "Introducing the Regime-Aware Multi-Agent Trading System. Built for the Bitget AI Hackathon, our framework aggregates real-time indicators from Bitget and Dune, feeding them into the Alibaba Qwen LLM. Qwen classifies the market mood—Trending, Sideways, or Volatile—and allocates capital weights to four independent specialist agents. Trend Follower, Mean Reversion, Momentum, and News Sentiment agents generate signals, which are combined by a central orchestrator into a single, high-conviction execution."

### **Section 3: Live System Demo (1:30 - 2:30)**
* **Visual:** Screen record of the live dashboard (`localhost:3000`) with weights shifting, Qwen reasoning text, and order execution logs.
* **Voiceover:**
  > "Here is our live dashboard. As the system runs, Qwen outputs its cognitive reasoning directly to the console and web feed. Notice the dynamic shift—in this sideways market, capital allocation flows directly to the Mean Reversion Agent, executing range-bound trades on Bitget and Solana devnet, shielded by a five-percent session drawdown circuit breaker."

### **Section 4: Backtesting Results & Roadmap (2:30 - 3:00)**
* **Visual:** Display backtesting results table on screen.
* **Voiceover:**
  > "To prove it, we backtested the model over the last thirty days of hourly BTC data. In a market where BTC crashed twenty-five percent, the system outperformed buy-and-hold by fourteen point six percent, limiting drawdown to just eleven percent. Moving forward, we are expanding our executors to support Solana mainnet DEX swaps via Jupiter, introducing ZK-proofs of signal integrity, and launching an on-chain agent leasing registry. Thank you."
