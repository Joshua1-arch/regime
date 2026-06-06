import axios from 'axios';
import { MarketRegimeDetector } from './regimeDetector';
import { TrendAgent } from './agents/trendAgent';
import { MeanReversionAgent } from './agents/meanReversionAgent';
import { MomentumAgent } from './agents/momentumAgent';
import { MarketData, AgentSignal, RegimeWeights } from './types';

const detector = new MarketRegimeDetector();
const trendAgent = new TrendAgent();
const meanReversionAgent = new MeanReversionAgent();
const momentumAgent = new MomentumAgent();

export interface BacktestDataPoint {
  timestamp: number;         // Unix ms
  price: number;
  systemEquity: number;
  holdEquity: number;
  regime: string;
  drawdown: number;          // 0.0 - 1.0
}

export interface BacktestResult {
  dataPoints: BacktestDataPoint[];
  startingCapital: number;
  endingCapital: number;
  holdEndingCapital: number;
  systemReturnPct: number;
  holdReturnPct: number;
  outperformancePct: number;
  totalTrades: number;
  winRate: number;
  maxDrawdownPct: number;
  sharpeRatio: number;
  regimeCounts: Record<string, number>;
  regimePnL: Record<string, number>;
  completedAt: string;
}

function stdDev(values: number[], mean: number): number {
  const squareDiffs = values.map(v => Math.pow(v - mean, 2));
  return Math.sqrt(squareDiffs.reduce((s, v) => s + v, 0) / values.length);
}

// Local simplified detector logic to speed up historical simulations
function localDetectRegime(price: number, ema12: number, ema26: number, vol: number) {
  const diffPct = Math.abs(ema12 - ema26) / ema26;
  let regime = 'Sideways';
  
  if (diffPct > 0.005) {
    regime = 'Trending';
  } else if (vol > price * 0.008) {
    regime = 'Volatile';
  }

  const weights = {
    trendAgent: regime === 'Trending' ? 0.5 : regime === 'Volatile' ? 0.15 : 0.15,
    meanReversionAgent: regime === 'Sideways' ? 0.55 : regime === 'Volatile' ? 0.15 : 0.15,
    momentumAgent: regime === 'Volatile' ? 0.45 : regime === 'Trending' ? 0.25 : 0.15,
    newsAgent: regime === 'Volatile' ? 0.25 : 0.1
  };

  return { regime, weights };
}

export async function computeBacktest(): Promise<BacktestResult> {
  const limit = 30 * 24; // 30 days of hourly candles = 720 candles
  const symbol = 'BTCUSDT';
  const granularity = '1h';
  const url = `https://api.bitget.com/api/v2/spot/market/candles?symbol=${symbol}&granularity=${granularity}&limit=${limit}`;

  const res = await axios.get(url);
  if (!res.data || res.data.code !== '00000') {
    throw new Error(`Bitget backtest data fetch failed: ${res.data?.msg}`);
  }

  const rawCandles = res.data.data; // Oldest first
  if (rawCandles.length < 100) {
    throw new Error('Not enough historical candles returned for backtesting.');
  }

  const STARTING_CAPITAL = 10000;
  let cash = STARTING_CAPITAL;
  let btcPosition = 0;
  let entryPrice = 0;
  let peakEquity = STARTING_CAPITAL;
  let maxDrawdown = 0;
  let prevEquity = STARTING_CAPITAL;

  let totalTrades = 0;
  let winningTrades = 0;
  const hourlyReturns: number[] = [];
  const dataPoints: BacktestDataPoint[] = [];

  const regimeCounts: Record<string, number> = { Trending: 0, Sideways: 0, Volatile: 0 };
  const regimePnL: Record<string, number> = { Trending: 0, Sideways: 0, Volatile: 0 };

  const startPrice = parseFloat(rawCandles[50][4]);
  const holdBtc = STARTING_CAPITAL / startPrice;

  // Run backtest over the candles (starting at index 50 to have enough history for indicators)
  for (let i = 50; i < rawCandles.length; i++) {
    const subCandles = rawCandles.slice(i - 50, i);
    const currentPrice = parseFloat(rawCandles[i][4]);
    const candleTimestamp = parseInt(rawCandles[i][0]);

    const closes = subCandles.map((c: any) => parseFloat(c[4]));
    const avg = closes.reduce((a: number, b: number) => a + b, 0) / closes.length;
    const ema12 = closes.slice(-12).reduce((a: number, b: number) => a + b, 0) / 12;
    const ema26 = closes.slice(-26).reduce((a: number, b: number) => a + b, 0) / 26;
    const vol = stdDev(closes.slice(-24), avg);

    const { regime, weights } = localDetectRegime(currentPrice, ema12, ema26, vol);
    regimeCounts[regime] = (regimeCounts[regime] || 0) + 1;

    const dummyMarket: MarketData = { symbol: 'BTCUSDT', price: currentPrice, timestamp: new Date(candleTimestamp).toISOString() };

    const [trendSig, meanSig, momSig] = await Promise.all([
      trendAgent.generateSignal(dummyMarket, subCandles),
      meanReversionAgent.generateSignal(dummyMarket, subCandles),
      momentumAgent.generateSignal(dummyMarket, subCandles)
    ]);

    const price1hChange = (closes[closes.length - 1] - closes[closes.length - 2]) / closes[closes.length - 2];
    const newsAction = price1hChange > 0.002 ? 'BUY' : price1hChange < -0.002 ? 'SELL' : 'HOLD';
    const newsSig: AgentSignal = { agentId: 'news_agent', action: newsAction, confidence: 0.75, reasoning: '', timestamp: new Date().toISOString() };

    const signals = [trendSig, meanSig, momSig, newsSig];
    const weightMap: Record<string, number> = {
      trend_agent: weights.trendAgent,
      mean_reversion_agent: weights.meanReversionAgent,
      momentum_agent: weights.momentumAgent,
      news_agent: weights.newsAgent
    };

    let score = 0;
    for (const s of signals) {
      const v = s.action === 'BUY' ? 1 : s.action === 'SELL' ? -1 : 0;
      score += (weightMap[s.agentId] ?? 0.25) * s.confidence * v;
    }

    const decision = score > 0.2 ? 'BUY' : score < -0.2 ? 'SELL' : 'HOLD';

    if (decision === 'BUY' && cash > 50) {
      const buyAmount = cash * 0.95;
      btcPosition += (buyAmount * 0.999) / currentPrice;
      cash -= buyAmount;
      entryPrice = currentPrice;
      totalTrades++;
    } else if (decision === 'SELL' && btcPosition > 0.0001) {
      const sellVal = btcPosition * currentPrice * 0.999;
      cash += sellVal;
      btcPosition = 0;
      totalTrades++;
      if (currentPrice > entryPrice) winningTrades++;
    }

    const currentEquity = cash + btcPosition * currentPrice;
    if (currentEquity > peakEquity) peakEquity = currentEquity;
    const dd = (peakEquity - currentEquity) / peakEquity;
    if (dd > maxDrawdown) maxDrawdown = dd;

    const equityChange = currentEquity - prevEquity;
    regimePnL[regime] = (regimePnL[regime] || 0) + equityChange;

    const hr = (currentEquity - prevEquity) / prevEquity;
    hourlyReturns.push(hr);
    prevEquity = currentEquity;

    const holdEquity = holdBtc * currentPrice;

    // Record one data point per 4 hours (every 4th candle) to keep payload small
    if ((i - 50) % 4 === 0) {
      dataPoints.push({
        timestamp: candleTimestamp,
        price: currentPrice,
        systemEquity: parseFloat(currentEquity.toFixed(2)),
        holdEquity: parseFloat(holdEquity.toFixed(2)),
        regime,
        drawdown: parseFloat((dd * 100).toFixed(2))
      });
    }
  }

  const finalPrice = parseFloat(rawCandles[rawCandles.length - 1][4]);
  const finalEquity = cash + btcPosition * finalPrice;
  const holdFinal = holdBtc * finalPrice;

  const avgReturn = hourlyReturns.reduce((a, b) => a + b, 0) / hourlyReturns.length;
  const variance = hourlyReturns.reduce((a, b) => a + Math.pow(b - avgReturn, 2), 0) / hourlyReturns.length;
  const sharpe = Math.sqrt(variance) > 0 ? (avgReturn / Math.sqrt(variance)) * Math.sqrt(365 * 24) : 0;

  return {
    dataPoints,
    startingCapital: STARTING_CAPITAL,
    endingCapital: parseFloat(finalEquity.toFixed(2)),
    holdEndingCapital: parseFloat(holdFinal.toFixed(2)),
    systemReturnPct: parseFloat((((finalEquity - STARTING_CAPITAL) / STARTING_CAPITAL) * 100).toFixed(2)),
    holdReturnPct: parseFloat((((holdFinal - STARTING_CAPITAL) / STARTING_CAPITAL) * 100).toFixed(2)),
    outperformancePct: parseFloat((((finalEquity - STARTING_CAPITAL) / STARTING_CAPITAL - (holdFinal - STARTING_CAPITAL) / STARTING_CAPITAL) * 100).toFixed(2)),
    totalTrades,
    winRate: totalTrades > 0 ? parseFloat(((winningTrades / Math.max(1, totalTrades / 2)) * 100).toFixed(1)) : 0,
    maxDrawdownPct: parseFloat((maxDrawdown * 100).toFixed(2)),
    sharpeRatio: parseFloat(sharpe.toFixed(2)),
    regimeCounts,
    regimePnL: {
      Trending: parseFloat(regimePnL.Trending.toFixed(2)),
      Sideways: parseFloat(regimePnL.Sideways.toFixed(2)),
      Volatile: parseFloat(regimePnL.Volatile.toFixed(2))
    },
    completedAt: new Date().toISOString()
  };
}

// CLI entrypoint
if (require.main === module) {
  (async () => {
    console.log('\x1b[36m\x1b[1m======================================================================\x1b[0m');
    console.log('\x1b[36m\x1b[1m📊 REGIME-AWARE MULTI-AGENT BACKTESTING ENGINE\x1b[0m');
    console.log('\x1b[36m\x1b[1m======================================================================\x1b[0m');
    console.log('⏳ Fetching 30 days of hourly BTC spot candles from Bitget...');
    try {
      const result = await computeBacktest();
      console.log(`\n\x1b[36m\x1b[1m======================================================================\x1b[0m`);
      console.log(`\x1b[36m\x1b[1m📈 BACKTEST RESULTS — 30 DAYS\x1b[0m`);
      console.log(`\x1b[36m\x1b[1m======================================================================\x1b[0m`);
      console.log(`💰 Starting Capital      : $${result.startingCapital.toLocaleString()}`);
      console.log(`💵 Ending Capital        : $${result.endingCapital.toLocaleString()}`);
      console.log(`🚀 System Total Return   : ${result.systemReturnPct}%`);
      console.log(`📈 Buy & Hold Return     : ${result.holdReturnPct}%`);
      console.log(`📊 Alpha (Outperformance): ${result.outperformancePct}%`);
      console.log(`🔄 Total Trades          : ${result.totalTrades}`);
      console.log(`🎯 Win Rate              : ${result.winRate}%`);
      console.log(`📉 Max Drawdown          : ${result.maxDrawdownPct}%`);
      console.log(`🛡️  Sharpe Ratio          : ${result.sharpeRatio}`);
      console.log(`🗓️  Regime Distribution    : Trending=${result.regimeCounts.Trending || 0}, Sideways=${result.regimeCounts.Sideways || 0}, Volatile=${result.regimeCounts.Volatile || 0}`);
      console.log(`\x1b[36m\x1b[1m======================================================================\x1b[0m\n`);
    } catch (e: any) {
      console.error('❌ Backtester failed:', e.message);
    }
  })();
}
