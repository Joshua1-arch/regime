import { AgentSignal, MarketData } from '../types';

/**
 * MomentumAgent captures high-velocity market moves.
 * It monitors volume breakouts using a Z-score of volume over the last 24 candles
 * and matches it with price action to ride rapid momentum expansions.
 */
export class MomentumAgent {
  private agentId: string = 'momentum_agent';

  /**
   * Generates a buy, sell, or hold signal based on volume Z-score and price direction.
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
      if (!historicalCandles || historicalCandles.length < 5) {
        return {
          agentId: this.agentId,
          action: 'HOLD',
          confidence: 0.5,
          reasoning: `Insufficient candle data (got ${historicalCandles?.length || 0}, need at least 5 for basic volume calculations).`,
          timestamp
        };
      }

      // Extract volumes and closes (limit to last 24 candles)
      const recentCandles = historicalCandles.slice(-24);
      const volumes = recentCandles.map(c => parseFloat(c[5])).filter(v => !isNaN(v));
      const closes = recentCandles.map(c => parseFloat(c[4])).filter(p => !isNaN(p));

      const currentVolume = volumes[volumes.length - 1];
      const historicalVolumes = volumes.slice(0, -1);

      if (historicalVolumes.length === 0) {
        return {
          agentId: this.agentId,
          action: 'HOLD',
          confidence: 0.5,
          reasoning: 'Failed to calculate volume baseline due to insufficient historical entries.',
          timestamp
        };
      }

      // Calculate baseline mean and standard deviation of historical volume
      const mean = historicalVolumes.reduce((sum, v) => sum + v, 0) / historicalVolumes.length;
      const sqDiffSum = historicalVolumes.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0);
      const stdDev = Math.sqrt(sqDiffSum / historicalVolumes.length);

      // Z-score calculation
      const zScore = stdDev === 0 ? 0 : (currentVolume - mean) / stdDev;

      // Price direction
      const currentClose = closes[closes.length - 1];
      const prevClose = closes[closes.length - 2];
      const priceRising = currentClose > prevClose;
      const priceFalling = currentClose < prevClose;

      let action: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
      let confidence = 0.5;
      let reasoning = `Volume Z-score is ${zScore.toFixed(2)} (below breakout threshold of 2.0). Volume is normal.`;

      if (zScore >= 2.0) {
        if (priceRising) {
          action = 'BUY';
          // Confidence scales from 0.5 up to 0.95 for higher Z-scores
          confidence = Math.min(0.95, 0.5 + 0.15 * (zScore - 2.0));
          reasoning = `Volume breakout detected! Volume Z-score is ${zScore.toFixed(2)} (>= 2.0) with price rising. Recommending BUY to ride momentum.`;
        } else if (priceFalling) {
          action = 'SELL';
          confidence = Math.min(0.95, 0.5 + 0.15 * (zScore - 2.0));
          reasoning = `Volume breakout detected! Volume Z-score is ${zScore.toFixed(2)} (>= 2.0) with price falling. Recommending SELL as momentum expands downward.`;
        } else {
          reasoning = `Volume breakout detected (Z-score: ${zScore.toFixed(2)}), but price is flat. Recommending HOLD.`;
        }
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
}
