import dotenv from 'dotenv';
import { Orchestrator } from './orchestrator';
import { Executor as BitgetExecutor } from './executor';
import { SolanaExecutor } from './executors/solanaExecutor';
import { MarketData, OnChainData } from './types';
import { MarketRegimeDetector } from './regimeDetector';
import { DashboardServer } from './dashboard';

// Load environment variables
dotenv.config();

// CONFIGURABLE FLAGS FOR DEMO AND RECORDING
const DEMO_MODE = process.env.DEMO_MODE === 'true'; // When true, runs cycle every 30 seconds instead of 5 minutes
const PORT = parseInt(process.env.PORT || '3000', 10);
const EXECUTOR_TYPE = (process.env.EXECUTOR || 'bitget').toLowerCase();

// ANSI Color codes for clean terminal highlights
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  white: '\x1b[37m'
};

const orchestrator = new Orchestrator();

// Dynamically instantiate the selected executor
const executor = EXECUTOR_TYPE === 'solana' ? new SolanaExecutor() : new BitgetExecutor();
const detector = new MarketRegimeDetector();
const dashboard = new DashboardServer();

/**
 * Executes a single complete loop iteration of the trading system.
 */
async function runIteration() {
  const timeStr = new Date().toLocaleTimeString();
  console.log(`\n${colors.cyan}${colors.bold}================================================================================${colors.reset}`);
  console.log(`${colors.cyan}${colors.bold}⏰ [${timeStr}] STARTING SYSTEM PIPELINE CYCLE${colors.reset}`);
  console.log(`💡 Mode: Demo (${DEMO_MODE ? 'ON' : 'OFF'}) | Executor: ${EXECUTOR_TYPE.toUpperCase()}`);
  console.log(`${colors.cyan}${colors.bold}================================================================================${colors.reset}`);

  try {
    // 1. Fetch 100 spot candles from Bitget to determine latest price
    console.log(`${colors.white}🕯️ Fetching 100 hourly BTC/USDT candles from Bitget...${colors.reset}`);
    const candles = await detector.fetchBTCSpotCandles(100);
    if (!candles || candles.length === 0) {
      throw new Error('No historical candles returned from Bitget API.');
    }
    const latestPrice = parseFloat(candles[candles.length - 1][4]);
    console.log(`${colors.green}✅ Current BTC price retrieved: $${latestPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}${colors.reset}`);

    const marketData: MarketData = {
      symbol: 'BTCUSDT',
      price: latestPrice,
      timestamp: new Date().toISOString()
    };

    const onChainData: OnChainData = {
      timestamp: new Date().toISOString()
    };

    // Sample news headlines for the News Sentiment Agent
    const sampleHeadlines = [
      "Bitcoin options open interest hits yearly high, implying volatile expected moves.",
      "Global asset manager increases BTC allocation by 2%, citing long-term store of value properties.",
      "Dormant Bitcoin whale wallets move assets to new addresses after 8 years."
    ];

    // 2. Run the Orchestrator Pipeline (Regime detection -> Agent signal generation -> Signal Aggregation)
    console.log(`${colors.white}🔄 Invoking Orchestrator pipeline...${colors.reset}`);
    const centralSignal = await orchestrator.runPipeline(marketData, onChainData, candles, sampleHeadlines);

    const actionColor = centralSignal.action === 'BUY' ? colors.green : centralSignal.action === 'SELL' ? colors.red : colors.yellow;
    console.log(`\n${colors.bold}📊 Orchestrator Decision: ${actionColor}${centralSignal.action}${colors.reset} (Weighted Confidence: ${(centralSignal.confidence * 100).toFixed(1)}%)`);

    // 3. Execute Trade Order based on the aggregated Central Signal
    console.log(`${colors.white}⚡ Forwarding central signal to ${EXECUTOR_TYPE.toUpperCase()} trade executor...${colors.reset}`);
    const symbol = EXECUTOR_TYPE === 'solana' ? 'SOL/USDC' : 'BTCUSDT';
    const orderResult = await executor.executeTrade(centralSignal, symbol);

    // 4. Update Live Dashboard State
    const regimeRes = orchestrator.latestRegimeResult;
    const perfStats = orchestrator.getAdaptiveWeightManager().getPerformanceStats();
    dashboard.updateState({
      btcPrice: latestPrice,
      regime: regimeRes?.regime || 'Unknown',
      confidence: regimeRes?.confidence || 0.5,
      weights: regimeRes?.weights,
      qwenWeights: regimeRes?.qwenWeights,
      fearGreedIndex: regimeRes?.marketSnapshot?.fearGreedIndex ?? 50,
      fearGreedLabel: regimeRes?.marketSnapshot?.fearGreedLabel ?? 'Neutral',
      totalRounds: perfStats.totalRounds,
      performanceSummary: orchestrator.getAdaptiveWeightManager().getWinRateSummary(),
      lastSignal: {
        action: centralSignal.action,
        confidence: centralSignal.confidence,
        timestamp: centralSignal.timestamp
      },
      lastReasoning: regimeRes?.reasoning || 'Executed cycle successfully.',
      pnl: executor.sessionPnl
    });

    // Record trade attempts (BUY/SELL) in dashboard logs
    if (centralSignal.action !== 'HOLD') {
      let statusDetails = '';
      if (orderResult?.code === '00000') {
        statusDetails = `Success (ID: ${orderResult.data?.orderId})`;
        console.log(`${colors.green}${colors.bold}✅ Order placed successfully! ID: ${orderResult.data?.orderId}${colors.reset}`);
      } else if (orderResult?.code) {
        statusDetails = `Failed (${orderResult.msg})`;
        console.log(`${colors.red}❌ Order execution failed: ${orderResult.msg}${colors.reset}`);
      } else {
        statusDetails = `Attempted`;
        console.log(`${colors.yellow}⚠️ Order attempted but no valid response (likely demo/insufficient funds)${colors.reset}`);
      }

      dashboard.addTrade({
        timestamp: centralSignal.timestamp,
        action: centralSignal.action,
        price: EXECUTOR_TYPE === 'solana' ? 135.50 : latestPrice,
        size: EXECUTOR_TYPE === 'solana' ? 0.005 : 0.001,
        reasoning: `${regimeRes?.reasoning || 'No details'} [Status: ${statusDetails}]`
      });
    }

  } catch (error: any) {
    console.error(`${colors.red}❌ index: Error encountered during pipeline cycle execution: ${error.message || error}${colors.reset}`);
  }

  console.log(`${colors.cyan}${colors.bold}================================================================================${colors.reset}`);
  console.log(`${colors.cyan}${colors.bold}🏁 SYSTEM PIPELINE CYCLE COMPLETE${colors.reset}`);
  console.log(`${colors.cyan}${colors.bold}================================================================================\n`);
}

/**
 * Main application entry point.
 */
async function main() {
  console.log(`${colors.cyan}${colors.bold}🚀 INITIALIZING REGIME-AWARE MULTI-AGENT TRADING SYSTEM...${colors.reset}`);
  console.log(`🔧 Target Executor Service: ${colors.bold}${EXECUTOR_TYPE.toUpperCase()}${colors.reset}`);
  
  // Sync bandit performance database to MongoDB Atlas if available
  await orchestrator.initialize();

  // Start Express.js Dashboard Server
  dashboard.start(PORT);

  // Run immediately on startup
  await runIteration();

  // Schedule to run every 30 seconds if DEMO_MODE is true, otherwise every 5 minutes
  const intervalMs = DEMO_MODE ? 30 * 1000 : 5 * 60 * 1000;
  console.log(`${colors.yellow}⏰ Scheduled autonomous trading cycle every ${DEMO_MODE ? '30 seconds' : '5 minutes'}.${colors.reset}`);
  setInterval(runIteration, intervalMs);
}

main();
