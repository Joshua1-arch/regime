import { AgentSignal, MarketData } from '../types';

/**
 * MomentumAgent captures high-velocity market moves.
 * It uses a confluence of three indicators to validate breakouts:
 *   1. Volume Z-score (24h period) — Checks if volume expansion is statistically significant.
 *   2. Price Rate of Change (ROC-10) — Measures the velocity of price movement.
 *   3. Wilder's Positive/Negative Directional Indicators (DI+/DI-) — Confirms trend direction.
 * 
 * Decision Logic:
 *   - BUY if Volume Z-score >= 2.0 (volume breakout), ROC-10 > 0.5% (rising velocity), and DI+ > DI-.
 *   - SELL if Volume Z-score >= 2.0 (volume breakout), ROC-10 < -0.5% (falling velocity), and DI- > DI+.
 *   - HOLD if volume is normal or indicators contradict.
 */
export class MomentumAgent {
  private agentId: string = 'momentum_agent';

  async generateSignal(
    marketData: MarketData,
    historicalCandles: any[]
  ): Promise<AgentSignal> {
    const timestamp = new Date().toISOString();

    try {
      if (!historicalCandles || historicalCandles.length < 25) {
        return {
          agentId: this.agentId,
          action: 'HOLD',
          confidence: 0.5,
          reasoning: `Insufficient candle data (got ${historicalCandles?.length || 0}, need at least 25 to calculate Momentum indicator set).`,
          timestamp
        };
      }

      // Extract closes, highs, lows, volumes (limit to last 24 candles)
      const recentCandles = historicalCandles.slice(-24);
      const volumes = recentCandles.map(c => parseFloat(c[5])).filter(v => !isNaN(v));
      const closes = recentCandles.map(c => parseFloat(c[4])).filter(p => !isNaN(p));
      const highs = recentCandles.map(c => parseFloat(c[2])).filter(p => !isNaN(p));
      const lows = recentCandles.map(c => parseFloat(c[3])).filter(p => !isNaN(p));

      // ── 1. Calculate Volume Z-score ──────────────────────────────────────
      const currentVolume = volumes[volumes.length - 1];
      const historicalVolumes = volumes.slice(0, -1);
      
      const meanVol = historicalVolumes.reduce((sum, v) => sum + v, 0) / historicalVolumes.length;
      const sqDiffSumVol = historicalVolumes.reduce((sum, v) => sum + Math.pow(v - meanVol, 2), 0);
      const stdDevVol = Math.sqrt(sqDiffSumVol / historicalVolumes.length);
      const zScore = stdDevVol === 0 ? 0 : (currentVolume - meanVol) / stdDevVol;

      // ── 2. Calculate Price Rate of Change (ROC-10) ────────────────────────
      const rocPeriod = 10;
      const currentClose = closes[closes.length - 1];
      const prevRocClose = closes[closes.length - 1 - rocPeriod];
      const roc = ((currentClose - prevRocClose) / prevRocClose) * 100;

      // ── 3. Calculate Directional Movement Indexes (DI+/DI-) ──────────────
      const { diPlus, diMinus } = this.calculateDI(highs, lows, closes, 14);

      let action: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
      let confidence = 0.5;
      let reasoning = `Volume Z-score is ${zScore.toFixed(2)} (normal volume). Price Rate of Change (ROC) is ${roc.toFixed(2)}%. No momentum breakout.`;

      // ── Confluence Decision Logic ─────────────────────────────────────────
      const isVolumeBreakout = zScore >= 1.8; // Statistically significant volume increase
      const isBullishMomentum = isVolumeBreakout && roc > 0.4 && diPlus > diMinus;
      const isBearishMomentum = isVolumeBreakout && roc < -0.4 && diMinus > diPlus;

      if (isBullishMomentum) {
        action = 'BUY';
        // Confidence scales up from 0.6 to 0.95 depending on volume intensity and price velocity
        const velocityFactor = Math.min(1.0, roc / 2.0); // capped at 2.0% ROC
        const volumeFactor = Math.min(1.0, (zScore - 1.8) / 3.0);
        confidence = Math.min(0.95, 0.65 + 0.3 * (velocityFactor + volumeFactor) / 2);
        reasoning = `Bullish Momentum Breakout! Volume Z-score: ${zScore.toFixed(2)}, ROC-10: ${roc.toFixed(2)}%, and DI+ (${diPlus.toFixed(1)}) > DI- (${diMinus.toFixed(1)}).`;
      } else if (isBearishMomentum) {
        action = 'SELL';
        const velocityFactor = Math.min(1.0, Math.abs(roc) / 2.0);
        const volumeFactor = Math.min(1.0, (zScore - 1.8) / 3.0);
        confidence = Math.min(0.95, 0.65 + 0.3 * (velocityFactor + volumeFactor) / 2);
        reasoning = `Bearish Momentum Breakout! Volume Z-score: ${zScore.toFixed(2)}, ROC-10: ${roc.toFixed(2)}%, and DI- (${diMinus.toFixed(1)}) > DI+ (${diPlus.toFixed(1)}).`;
      } else if (isVolumeBreakout) {
        reasoning = `Volume Z-score is high (${zScore.toFixed(2)}) but price ROC (${roc.toFixed(2)}%) or DIs do not confirm direction. No trade.`;
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
        reasoning: `Error in MomentumAgent execution: ${error.message}`,
        timestamp
      };
    }
  }

  /**
   * Calculates Wilder's DI+ and DI- (Directional Indicators).
   */
  private calculateDI(highs: number[], lows: number[], closes: number[], period: number = 14): { diPlus: number; diMinus: number } {
    if (closes.length <= period) {
      return { diPlus: 50, diMinus: 50 };
    }

    const trList: number[] = [];
    const plusDM: number[] = [];
    const minusDM: number[] = [];

    for (let i = 1; i < closes.length; i++) {
      const highDiff = highs[i] - highs[i - 1];
      const lowDiff = lows[i - 1] - lows[i];
      
      trList.push(Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i] - closes[i - 1]),
        Math.abs(lows[i] - closes[i - 1])
      ));
      
      plusDM.push(highDiff > lowDiff && highDiff > 0 ? highDiff : 0);
      minusDM.push(lowDiff > highDiff && lowDiff > 0 ? lowDiff : 0);
    }

    // Smoothed TR and DMs
    const smooth = (arr: number[], p: number): number[] => {
      if (arr.length === 0) return [];
      const out: number[] = [];
      let sum = 0;
      for (let i = 0; i < p; i++) {
        sum += arr[i] || 0;
      }
      out.push(sum);
      for (let i = p; i < arr.length; i++) {
        out.push(out[out.length - 1] - out[out.length - 1] / p + arr[i]);
      }
      return out;
    };

    const atr = smooth(trList, period);
    const smPlusDM = smooth(plusDM, period);
    const smMinusDM = smooth(minusDM, period);

    const lastIdx = atr.length - 1;
    if (lastIdx < 0 || atr[lastIdx] === 0) {
      return { diPlus: 50, diMinus: 50 };
    }

    const diPlus = (smPlusDM[lastIdx] / atr[lastIdx]) * 100;
    const diMinus = (smMinusDM[lastIdx] / atr[lastIdx]) * 100;

    return { diPlus, diMinus };
  }
}
