import { AgentSignal, MarketData } from '../types';

/**
 * MeanReversionAgent specializes in sideways (range-bound) market regimes.
 * It uses a triple-indicator confluence model to identify overbought or oversold conditions:
 *   1. RSI (14) — Standard momentum oscillator
 *   2. Bollinger Bands (20, 2) — Reversion bounds
 *   3. Average True Range (ATR) — Used for dynamic exit bounds and volatility scaling
 * 
 * Decision Logic:
 *   - BUY if RSI < 30 and price is below or near the lower Bollinger Band.
 *   - SELL if RSI > 70 and price is above or near the upper Bollinger Band.
 *   - HOLD if indicators diverge or are in neutral territory.
 */
export class MeanReversionAgent {
  private agentId: string = 'mean_reversion_agent';

  async generateSignal(
    marketData: MarketData,
    historicalCandles: any[]
  ): Promise<AgentSignal> {
    const timestamp = new Date().toISOString();

    try {
      if (!historicalCandles || historicalCandles.length < 21) {
        return {
          agentId: this.agentId,
          action: 'HOLD',
          confidence: 0.5,
          reasoning: `Insufficient candle data (got ${historicalCandles?.length || 0}, need at least 21 to calculate Mean Reversion indicator set).`,
          timestamp
        };
      }

      // Extract closes, highs, lows
      const closes = historicalCandles.map(c => parseFloat(c[4])).filter(p => !isNaN(p));
      const highs = historicalCandles.map(c => parseFloat(c[2])).filter(p => !isNaN(p));
      const lows = historicalCandles.map(c => parseFloat(c[3])).filter(p => !isNaN(p));
      
      const currentPrice = closes[closes.length - 1];

      // ── 1. Calculate RSI-14 ──────────────────────────────────────────────
      const rsiArr = this.calculateRSI(closes, 14);
      const rsi = rsiArr[rsiArr.length - 1];

      // ── 2. Calculate Bollinger Bands (20, 2) ─────────────────────────────
      const bbPeriod = 20;
      const bbCloses = closes.slice(-bbPeriod);
      const bbMean = bbCloses.reduce((a, b) => a + b, 0) / bbPeriod;
      const bbVariance = bbCloses.reduce((a, b) => a + Math.pow(b - bbMean, 2), 0) / bbPeriod;
      const bbStdDev = Math.sqrt(bbVariance);
      const upperBand = bbMean + 2 * bbStdDev;
      const lowerBand = bbMean - 2 * bbStdDev;

      // Distance from bands (%B)
      const pctB = bbStdDev > 0 ? (currentPrice - lowerBand) / (upperBand - lowerBand) : 0.5;

      // ── 3. Calculate ATR-14 (Average True Range) for volatility threshold ─
      const atr = this.calculateATR(highs, lows, closes, 14);

      let action: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
      let confidence = 0.5;
      let reasoning = `Market is in neutral territory. RSI is ${rsi.toFixed(2)} and price %B is ${pctB.toFixed(2)}. No mean-reversion opportunity.`;

      // ── Confluence Decision Logic ─────────────────────────────────────────
      const isOversold = rsi < 32 && pctB < 0.15; // RSI oversold and price at/below lower BB
      const isOverbought = rsi > 68 && pctB > 0.85; // RSI overbought and price at/above upper BB

      if (isOversold) {
        action = 'BUY';
        // Confidence scales based on how extreme the oversold condition is
        const rsiFactor = Math.min(1.0, (32 - rsi) / 15);
        const bbFactor = Math.min(1.0, (0.15 - pctB) / 0.15);
        confidence = Math.min(0.95, 0.6 + 0.25 * (rsiFactor + bbFactor) / 2);
        reasoning = `Confluence BUY: RSI is oversold at ${rsi.toFixed(2)} (< 32) and price is below the lower Bollinger Band (%B: ${pctB.toFixed(2)}). ATR volatility is $${atr.toFixed(2)}.`;
      } else if (isOverbought) {
        action = 'SELL';
        // Confidence scales based on how extreme the overbought condition is
        const rsiFactor = Math.min(1.0, (rsi - 68) / 15);
        const bbFactor = Math.min(1.0, (pctB - 0.85) / 0.15);
        confidence = Math.min(0.95, 0.6 + 0.25 * (rsiFactor + bbFactor) / 2);
        reasoning = `Confluence SELL: RSI is overbought at ${rsi.toFixed(2)} (> 68) and price is above the upper Bollinger Band (%B: ${pctB.toFixed(2)}). ATR volatility is $${atr.toFixed(2)}.`;
      }

      return {
        agentId: this.agentId,
        action,
        confidence,
        reasoning,
        timestamp
      };

    } catch (error: any) {
      return {
        agentId: this.agentId,
        action: 'HOLD',
        confidence: 0.5,
        reasoning: `Error in MeanReversionAgent execution: ${error.message}`,
        timestamp
      };
    }
  }

  /**
   * Calculates Wilder's Relative Strength Index (RSI).
   */
  private calculateRSI(closes: number[], period: number = 14): number[] {
    if (closes.length <= period) return [];
    
    const rsi: number[] = [];
    let gains = 0;
    let losses = 0;

    for (let i = 1; i <= period; i++) {
      const change = closes[i] - closes[i - 1];
      if (change > 0) {
        gains += change;
      } else {
        losses += Math.abs(change);
      }
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;

    let rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsi.push(100 - 100 / (1 + rs));

    for (let i = period + 1; i < closes.length; i++) {
      const change = closes[i] - closes[i - 1];
      const gain = change > 0 ? change : 0;
      const loss = change < 0 ? Math.abs(change) : 0;

      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;

      rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      rsi.push(100 - 100 / (1 + rs));
    }

    return rsi;
  }

  /**
   * Calculates Average True Range (ATR).
   */
  private calculateATR(highs: number[], lows: number[], closes: number[], period: number = 14): number {
    if (closes.length <= period) return 0;

    const trueRanges: number[] = [];
    
    for (let i = 1; i < closes.length; i++) {
      const high = highs[i];
      const low = lows[i];
      const prevClose = closes[i - 1];
      
      const tr = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );
      trueRanges.push(tr);
    }

    // Initial ATR
    let sum = 0;
    for (let i = 0; i < period; i++) {
      sum += trueRanges[i];
    }
    let atr = sum / period;

    // Wilder's smoothing
    for (let i = period; i < trueRanges.length; i++) {
      atr = (atr * (period - 1) + trueRanges[i]) / period;
    }

    return atr;
  }
}
