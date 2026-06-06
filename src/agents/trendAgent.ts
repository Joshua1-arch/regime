import { AgentSignal, MarketData } from '../types';

/**
 * TrendAgent — Professional multi-indicator trend following system.
 *
 * Signal stack (3-factor confluence model):
 *   1. MACD (12, 26, 9) — Direction and histogram momentum
 *   2. Bollinger Band Position — Price location relative to bands (0=lower, 1=upper)
 *   3. ADX (14) — Trend strength filter (only trade when ADX > 25)
 *
 * Decision logic:
 *   - Requires at least 2 of 3 indicators to agree before BUY/SELL
 *   - Confidence scales with the degree of agreement and indicator strength
 *   - ADX < 20 → HOLD (no meaningful trend present)
 */
export class TrendAgent {
  private agentId: string = 'trend_agent';

  async generateSignal(marketData: MarketData, historicalCandles: any[]): Promise<AgentSignal> {
    const timestamp = new Date().toISOString();
    try {
      if (!historicalCandles || historicalCandles.length < 35) {
        return { agentId: this.agentId, action: 'HOLD', confidence: 0.5, reasoning: `Insufficient candle data (${historicalCandles?.length || 0} candles, need 35).`, timestamp };
      }

      const closes = historicalCandles.map(c => parseFloat(c[4])).filter(p => !isNaN(p));
      const highs  = historicalCandles.map(c => parseFloat(c[2])).filter(p => !isNaN(p));
      const lows   = historicalCandles.map(c => parseFloat(c[3])).filter(p => !isNaN(p));

      // ── 1. MACD (12, 26, 9) ──────────────────────────────────────────────
      const ema12 = this.ema(closes, 12);
      const ema26 = this.ema(closes, 26);
      const macdLine = ema12.map((v, i) => v - (ema26[i] || 0));
      const signalLine = this.ema(macdLine.filter(v => v !== 0), 9);
      const macdVal = macdLine[macdLine.length - 1];
      const signalVal = signalLine[signalLine.length - 1];
      const histogram = macdVal - signalVal;
      const prevHistogram = macdLine[macdLine.length - 2] - signalLine[signalLine.length - 2];

      const macdBullish = macdVal > signalVal && histogram > prevHistogram; // rising histogram
      const macdBearish = macdVal < signalVal && histogram < prevHistogram; // falling histogram

      // ── 2. Bollinger Band Position (%B) ──────────────────────────────────
      const bbPeriod = 20;
      const bbCloses = closes.slice(-bbPeriod);
      const bbMean = bbCloses.reduce((a, b) => a + b, 0) / bbPeriod;
      const bbStd = Math.sqrt(bbCloses.reduce((a, b) => a + Math.pow(b - bbMean, 2), 0) / bbPeriod);
      const upperBand = bbMean + 2 * bbStd;
      const lowerBand = bbMean - 2 * bbStd;
      const currentPrice = closes[closes.length - 1];
      const bbPct = bbStd > 0 ? (currentPrice - lowerBand) / (upperBand - lowerBand) : 0.5;

      const bbBullish = bbPct < 0.35; // price near lower band = potential reversal/trend entry
      const bbBearish = bbPct > 0.65; // price near upper band = overextended

      // ── 3. ADX (14) — Trend Strength ─────────────────────────────────────
      const adx = this.calculateADX(highs, lows, closes, 14);
      const trendStrong = adx > 22;
      const trendWeak = adx < 18;

      // ── Confluence Decision ───────────────────────────────────────────────
      let bullishVotes = 0;
      let bearishVotes = 0;
      if (macdBullish) bullishVotes++;
      if (bbBullish) bullishVotes++;
      if (macdBearish) bearishVotes++;
      if (bbBearish) bearishVotes++;

      // ADX acts as a multiplier on confidence, not a vote
      const adxMultiplier = trendStrong ? 1.0 : trendWeak ? 0.6 : 0.8;

      let action: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
      let baseConfidence = 0.5;
      let reasoning = '';

      if (trendWeak) {
        reasoning = `ADX(14)=${adx.toFixed(1)} — trend is weak. MACD histogram: ${histogram.toFixed(2)}. No strong trend signal. HOLD.`;
      } else if (bullishVotes >= 2) {
        action = 'BUY';
        baseConfidence = 0.65 + 0.1 * bullishVotes;
        reasoning = `MACD bullish (hist: ${histogram.toFixed(2)}), %B=${bbPct.toFixed(2)} (near lower band), ADX=${adx.toFixed(1)}. ${bullishVotes}/2 indicators bullish.`;
      } else if (bearishVotes >= 2) {
        action = 'SELL';
        baseConfidence = 0.65 + 0.1 * bearishVotes;
        reasoning = `MACD bearish (hist: ${histogram.toFixed(2)}), %B=${bbPct.toFixed(2)} (near upper band), ADX=${adx.toFixed(1)}. ${bearishVotes}/2 indicators bearish.`;
      } else {
        reasoning = `Mixed signals: MACD ${macdBullish ? '▲' : macdBearish ? '▼' : '→'}, %B=${bbPct.toFixed(2)}, ADX=${adx.toFixed(1)}. Insufficient confluence for entry. HOLD.`;
      }

      const confidence = Math.min(0.95, Math.max(0.45, baseConfidence * adxMultiplier));
      return { agentId: this.agentId, action, confidence, reasoning, timestamp };

    } catch (error: any) {
      return { agentId: this.agentId, action: 'HOLD', confidence: 0.5, reasoning: `TrendAgent error: ${error.message}`, timestamp };
    }
  }

  /** Standard EMA with SMA seed */
  private ema(prices: number[], period: number): number[] {
    if (prices.length < period) return prices.map(() => 0);
    const k = 2 / (period + 1);
    const result: number[] = [];
    let seed = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
    result.push(...new Array(period - 1).fill(0));
    result.push(seed);
    for (let i = period; i < prices.length; i++) {
      seed = prices[i] * k + seed * (1 - k);
      result.push(seed);
    }
    return result;
  }

  /**
   * Wilder's ADX (Average Directional Index).
   * Measures trend strength independent of direction (0=no trend, 100=maximum trend).
   */
  private calculateADX(highs: number[], lows: number[], closes: number[], period: number): number {
    if (highs.length < period + 1) return 20; // neutral fallback
    const trList: number[] = [];
    const plusDM: number[] = [];
    const minusDM: number[] = [];

    for (let i = 1; i < highs.length; i++) {
      const highDiff = highs[i] - highs[i - 1];
      const lowDiff = lows[i - 1] - lows[i];
      trList.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1])));
      plusDM.push(highDiff > lowDiff && highDiff > 0 ? highDiff : 0);
      minusDM.push(lowDiff > highDiff && lowDiff > 0 ? lowDiff : 0);
    }

    const wilderSmooth = (arr: number[], p: number): number[] => {
      const out: number[] = [arr.slice(0, p).reduce((a, b) => a + b, 0)];
      for (let i = p; i < arr.length; i++) out.push(out[out.length - 1] - out[out.length - 1] / p + arr[i]);
      return out;
    };

    const atr = wilderSmooth(trList, period);
    const smPlusDM = wilderSmooth(plusDM, period);
    const smMinusDM = wilderSmooth(minusDM, period);

    const diPlus = smPlusDM.map((v, i) => atr[i] === 0 ? 0 : (v / atr[i]) * 100);
    const diMinus = smMinusDM.map((v, i) => atr[i] === 0 ? 0 : (v / atr[i]) * 100);
    const dx = diPlus.map((v, i) => {
      const sum = v + diMinus[i];
      return sum === 0 ? 0 : (Math.abs(v - diMinus[i]) / sum) * 100;
    });

    const adxArr = wilderSmooth(dx.slice(0, period), period);
    for (let i = period; i < dx.length; i++) adxArr.push(adxArr[adxArr.length - 1] - adxArr[adxArr.length - 1] / period + dx[i]);
    return adxArr[adxArr.length - 1] || 20;
  }
}
