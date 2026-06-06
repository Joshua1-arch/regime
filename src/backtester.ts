import dotenv from 'dotenv';
import { MarketRegimeDetector } from './regimeDetector';
import { TrendAgent } from './agents/trendAgent';
import { MeanReversionAgent } from './agents/meanReversionAgent';
import { MomentumAgent } from './agents/momentumAgent';
import { MarketData, AgentSignal, RegimeWeights } from './types';

// Load environment variables
dotenv.config();

const detector = new MarketRegimeDetector();
const trendAgent = new TrendAgent();
const meanReversionAgent = new MeanReversionAgent();
const momentumAgent = new MomentumAgent();

// ANSI Color codes for clean terminal highlights
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

/**
 * Custom math helper to calculate Standard Deviation
 */
function stdDev(values: number[], mean: number): number {
  const squareDiffs = values.map(value => Math.pow(value - mean, 2));
  const avgSquareDiff = squareDiffs.reduce((sum, val) => sum + val, 0) / values.length;
  return Math.sqrt(avgSquareDiff);
}

/**
 * Local simulation of Wilder's RSI for backtesting efficiency
 */
function calculateRSI(closes: number[]): number {
  if (closes.length < 15) return 50;
  let gains = 0;
  let losses = 0;

  for (let i = 1; i < 15; i++) {
    const difference = closes[closes.length - 15 + i] - closes[closes.length - 15 + i - 1];
    if (difference >= 0) {
      gains += difference;
    } else {
      losses -= difference;
    }
  }

  let avgGain = gains / 14;
  let avgLoss = losses / 14;

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

/**
 * Local fast regime and weight assignment mapping (emulates Qwen LLM output rules)
 */
function localDetectRegime(price: number, ema12: number, ema26: number, volatility: number, rsi: number): { regime: string; weights: RegimeWeights } {
  const spreadPercent = Math.abs(ema12 - ema26) / price;

  if (volatility > 450) {
    return {
      regime: 'Volatile',
      weights: { trendAgent: 0.2, meanReversionAgent: 0.1, momentumAgent: 0.4, newsAgent: 0.3 }
    };
  } else if (spreadPercent > 0.005) {
    return {
      regime: 'Trending',
      weights: { trendAgent: 0.4, meanReversionAgent: 0.1, momentumAgent: 0.3, newsAgent: 0.2 }
    };
  } else {
    return {
      regime: 'Sideways',
      weights: { trendAgent: 0.2, meanReversionAgent: 0.4, momentumAgent: 0.1, newsAgent: 0.3 }
    };
  }
}

async function runBacktest() {
  console.log(`${colors.cyan}${colors.bold}======================================================================${colors.reset}`);
  console.log(`${colors.cyan}${colors.bold}📊 STARTING REGIME-AWARE MULTI-AGENT BACKTESTING ENGINE${colors.reset}`);
  console.log(`${colors.cyan}${colors.bold}======================================================================${colors.reset}`);
  console.log('⏳ Fetching 30 days of hourly BTC spot candles from Bitget...');

  try {
    // 720 candles = 30 days * 24 hours
    const rawCandles = await detector.fetchBTCSpotCandles(720);
    if (!rawCandles || rawCandles.length < 100) {
      throw new Error(`Insufficient candle history. Fetched ${rawCandles?.length || 0} candles.`);
    }

    console.log(`✅ Loaded ${rawCandles.length} hourly candles.`);

    // Simulation variables
    let cash = 10000.0; // Starting capital in USDT
    let btcPosition = 0.0; // BTC holdings
    let peakEquity = 10000.0;
    let maxDrawdown = 0.0;
    
    // For Sharpe Ratio calculations
    const hourlyReturns: number[] = [];
    let prevEquity = 10000.0;

    // Trade tracking
    let totalTrades = 0;
    let winningTrades = 0;
    let entryPrice = 0;

    // Slide window loop starting at index 50 to provide sufficient lookback buffer
    for (let i = 50; i < rawCandles.length; i++) {
      const subCandles = rawCandles.slice(i - 50, i + 1);
      const currentCandle = subCandles[subCandles.length - 1];
      const currentPrice = parseFloat(currentCandle[4]);
      const currentVolume = parseFloat(currentCandle[5]);

      // Calculate indicators
      const closes = subCandles.map(c => parseFloat(c[4]));
      const sum = closes.reduce((a, b) => a + b, 0);
      const avg = sum / closes.length;
      
      const ema12 = closes.slice(-12).reduce((a, b) => a + b, 0) / 12;
      const ema26 = closes.slice(-26).reduce((a, b) => a + b, 0) / 26;
      const vol = stdDev(closes.slice(-24), avg);
      const rsi = calculateRSI(closes);

      // 1. Get Regime Classification & Weights
      const regimeResult = localDetectRegime(currentPrice, ema12, ema26, vol, rsi);

      // 2. Generate Agent Signals
      const dummyMarketData: MarketData = { symbol: 'BTCUSDT', price: currentPrice, timestamp: new Date().toISOString() };
      
      const trendSignal = await trendAgent.generateSignal(dummyMarketData, subCandles);
      const meanSignal = await meanReversionAgent.generateSignal(dummyMarketData, subCandles);
      const momSignal = await momentumAgent.generateSignal(dummyMarketData, subCandles);

      // Emulate News Sentiment Agent using recent price velocity
      const price1hChange = (closes[closes.length - 1] - closes[closes.length - 2]) / closes[closes.length - 2];
      const newsAction = price1hChange > 0.002 ? 'BUY' : price1hChange < -0.002 ? 'SELL' : 'HOLD';
      const newsSignal: AgentSignal = {
        agentId: 'news_agent',
        action: newsAction,
        confidence: 0.75,
        reasoning: 'Velocity proxy news sentiment.',
        timestamp: new Date().toISOString()
      };

      // 3. Aggregate Signals
      const w = regimeResult.weights;
      const signals = [trendSignal, meanSignal, momSignal, newsSignal];
      
      let compositeScore = 0;
      signals.forEach(s => {
        const value = s.action === 'BUY' ? 1.0 : s.action === 'SELL' ? -1.0 : 0.0;
        let weight = 0.25;
        if (s.agentId === 'trend_agent') weight = w.trendAgent;
        if (s.agentId === 'mean_reversion_agent') weight = w.meanReversionAgent;
        if (s.agentId === 'momentum_agent') weight = w.momentumAgent;
        if (s.agentId === 'news_agent') weight = w.newsAgent;

        compositeScore += value * weight * s.confidence;
      });

      // Formulation Decision
      let decision = 'HOLD';
      if (compositeScore > 0.2) decision = 'BUY';
      else if (compositeScore < -0.2) decision = 'SELL';

      // 4. Simulate Executions
      if (decision === 'BUY' && cash > 50) {
        // Use 95% of available cash to buy BTC (simulating spot)
        const buyAmount = cash * 0.95;
        const fees = buyAmount * 0.001; // 0.1% spot trading fee
        btcPosition += (buyAmount - fees) / currentPrice;
        cash -= buyAmount;
        entryPrice = currentPrice;
        totalTrades++;
      } else if (decision === 'SELL' && btcPosition > 0.0001) {
        // Liquidate BTC holdings
        const sellVal = btcPosition * currentPrice;
        const fees = sellVal * 0.001;
        cash += (sellVal - fees);
        btcPosition = 0;
        totalTrades++;
        if (currentPrice > entryPrice) {
          winningTrades++;
        }
      }

      // Track daily portfolio equity
      const currentEquity = cash + (btcPosition * currentPrice);
      if (currentEquity > peakEquity) {
        peakEquity = currentEquity;
      }
      const dd = (peakEquity - currentEquity) / peakEquity;
      if (dd > maxDrawdown) {
        maxDrawdown = dd;
      }

      // Track hourly returns for Sharpe Ratio
      const hrReturn = (currentEquity - prevEquity) / prevEquity;
      hourlyReturns.push(hrReturn);
      prevEquity = currentEquity;
    }

    // Performance Calculations
    const finalPrice = parseFloat(rawCandles[rawCandles.length - 1][4]);
    const startPrice = parseFloat(rawCandles[50][4]);
    const finalEquity = cash + (btcPosition * finalPrice);
    
    const systemReturn = ((finalEquity - 10000.0) / 10000.0) * 100.0;
    const holdReturn = ((finalPrice - startPrice) / startPrice) * 100.0;
    const winRate = totalTrades > 0 ? (winningTrades / (totalTrades / 2)) * 100 : 0; // trades / 2 to get complete cycles

    // Sharpe Ratio
    const avgReturn = hourlyReturns.reduce((a, b) => a + b, 0) / hourlyReturns.length;
    const variance = hourlyReturns.reduce((a, b) => a + Math.pow(b - avgReturn, 2), 0) / hourlyReturns.length;
    const stdDevReturn = Math.sqrt(variance);
    const hourlySharpe = stdDevReturn > 0 ? avgReturn / stdDevReturn : 0;
    const annualizedSharpe = hourlySharpe * Math.sqrt(365 * 24); // Annualized from hourly

    console.log(`\n${colors.cyan}${colors.bold}======================================================================${colors.reset}`);
    console.log(`${colors.cyan}${colors.bold}📈 BACKTEST RESULTS SUMMARY (30-DAY BACKTEST)${colors.reset}`);
    console.log(`${colors.cyan}${colors.bold}======================================================================${colors.reset}`);
    console.log(`💰 Starting Capital    : 10,000.00 USDT`);
    console.log(`💵 Ending Capital      : ${finalEquity.toFixed(2)} USDT`);
    console.log(`🚀 System Total Return  : ${systemReturn.toFixed(2)}%`);
    console.log(`📈 Buy & Hold Return   : ${holdReturn.toFixed(2)}%`);
    console.log(`📊 Outperformance      : ${(systemReturn - holdReturn).toFixed(2)}%`);
    console.log(`🔄 Total Trades Simulated: ${totalTrades}`);
    console.log(`🎯 Win Rate            : ${Math.min(winRate, 100).toFixed(1)}%`);
    console.log(`📉 Max Drawdown        : ${(maxDrawdown * 100).toFixed(2)}%`);
    console.log(`🛡️ Sharpe Ratio        : ${annualizedSharpe.toFixed(2)}`);
    console.log(`${colors.cyan}${colors.bold}======================================================================${colors.reset}\n`);

  } catch (error: any) {
    console.error('❌ Backtester failed with error:', error.message || error);
  }
}

runBacktest();
