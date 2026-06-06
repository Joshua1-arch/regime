import { AgentSignal, MarketData } from '../types';

/**
 * MeanReversionAgent specializes in sideways (range-bound) market regimes.
 * It uses the Relative Strength Index (RSI-14) to identify overbought or oversold conditions
 * and trade the return back to the historical mean.
 */
export class MeanReversionAgent {
  private agentId: string = 'mean_reversion_agent';

  /**
   * Generates a buy, sell, or hold signal based on RSI analysis.
   * 
   * @param marketData - Current spot market data for the target asset
   * @param historicalCandles - Array of historical candlestick prices: [ [timestamp, open, high, low, close, volume], ... ]
   * @returns A promise resolving to the generated AgentSignal
   */
  async generateSignal(
    marketData: MarketData,
    historicalCandles: any[]
  ): Promise<AgentSignal> {
    const timestamp = new Date().toISOString();

    try {
      if (!historicalCandles || historicalCandles.length < 15) {
        return {
          agentId: this.agentId,
          action: 'HOLD',
          confidence: 0.5,
          reasoning: `Insufficient candle data (got ${historicalCandles?.length || 0}, need at least 15 to compute RSI-14).`,
          timestamp
        };
      }

      // Extract closes
      const closes = historicalCandles.map(c => parseFloat(c[4])).filter(p => !isNaN(p));
      const rsiArr = this.calculateRSI(closes, 14);

      if (rsiArr.length === 0) {
        return {
          agentId: this.agentId,
          action: 'HOLD',
          confidence: 0.5,
          reasoning: 'Failed to calculate RSI values due to data discrepancy.',
          timestamp
        };
      }

      const rsi = rsiArr[rsiArr.length - 1];
      let action: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
      let confidence = 0.5;
      let reasoning = `RSI(14) is neutral at ${rsi.toFixed(2)}. No trade signal generated.`;

      if (rsi < 30) {
        action = 'BUY';
        // Map RSI from 30 -> 0 to Confidence 0.5 -> 0.95
        confidence = Math.min(0.95, 0.5 + 0.45 * ((30 - rsi) / 30));
        reasoning = `RSI(14) is oversold at ${rsi.toFixed(2)} (< 30). Recommending BUY for mean reversion.`;
      } else if (rsi > 70) {
        action = 'SELL';
        // Map RSI from 70 -> 100 to Confidence 0.5 -> 0.95
        confidence = Math.min(0.95, 0.5 + 0.45 * ((rsi - 70) / 30));
        reasoning = `RSI(14) is overbought at ${rsi.toFixed(2)} (> 70). Recommending SELL for mean reversion.`;
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
   * Calculates the Wilder's Relative Strength Index (RSI).
   */
  private calculateRSI(closes: number[], period: number = 14): number[] {
    if (closes.length <= period) return [];
    
    const rsi: number[] = [];
    let gains = 0;
    let losses = 0;

    // Calculate initial average gain and loss
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

    // Apply Wilder's smoothing
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
}
