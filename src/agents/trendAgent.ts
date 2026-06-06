import { AgentSignal, MarketData } from '../types';

/**
 * TrendAgent specializes in trending market regimes.
 * It analyzes price direction and moving average crossovers (EMA 20/50)
 * to generate BUY, SELL, or HOLD signals.
 */
export class TrendAgent {
  private agentId: string = 'trend_agent';

  /**
   * Generates a buy, sell, or hold signal based on trend analysis.
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
      if (!historicalCandles || historicalCandles.length < 50) {
        // Fallback: If not enough candles are provided to calculate EMA 50, try calculating EMA 10/25 instead
        const closes = (historicalCandles || []).map(c => parseFloat(c[4])).filter(p => !isNaN(p));
        
        if (closes.length < 25) {
          return {
            agentId: this.agentId,
            action: 'HOLD',
            confidence: 0.5,
            reasoning: `Insufficient candle data (got ${closes.length}, need at least 25). Unable to determine trend.`,
            timestamp
          };
        }

        const emaShortArr = this.calculateEMA(closes, 10);
        const emaLongArr = this.calculateEMA(closes, 25);
        const emaShort = emaShortArr[emaShortArr.length - 1];
        const emaLong = emaLongArr[emaLongArr.length - 1];

        const diffPercent = Math.abs(emaShort - emaLong) / emaLong;
        const confidence = Math.min(0.95, Math.max(0.5, 0.5 + diffPercent * 100));
        const action = emaShort > emaLong ? 'BUY' : 'SELL';

        return {
          agentId: this.agentId,
          action,
          confidence,
          reasoning: `Trend detected using fallback EMA 10/25 crossover (Short EMA: $${emaShort.toFixed(2)}, Long EMA: $${emaLong.toFixed(2)}).`,
          timestamp
        };
      }

      // Extract closes
      const closes = historicalCandles.map(c => parseFloat(c[4])).filter(p => !isNaN(p));

      // Calculate EMA 20 and EMA 50
      const ema20Arr = this.calculateEMA(closes, 20);
      const ema50Arr = this.calculateEMA(closes, 50);

      const ema20 = ema20Arr[ema20Arr.length - 1];
      const ema50 = ema50Arr[ema50Arr.length - 1];

      const diffPercent = Math.abs(ema20 - ema50) / ema50;
      const confidence = Math.min(0.95, Math.max(0.5, 0.5 + diffPercent * 100));
      const action = ema20 > ema50 ? 'BUY' : 'SELL';

      return {
        agentId: this.agentId,
        action,
        confidence,
        reasoning: `Trend detected using standard EMA 20/50 crossover. EMA20 ($${ema20.toFixed(2)}) is ${ema20 > ema50 ? 'above' : 'below'} EMA50 ($${ema50.toFixed(2)}) by ${(diffPercent * 100).toFixed(2)}%.`,
        timestamp
      };

    } catch (error: any) {
      return {
        agentId: this.agentId,
        action: 'HOLD',
        confidence: 0.5,
        reasoning: `Error in TrendAgent execution: ${error.message}`,
        timestamp
      };
    }
  }

  /**
   * Calculates the Exponential Moving Average (EMA) for a given period.
   */
  private calculateEMA(prices: number[], period: number): number[] {
    if (prices.length < period) return [];
    const k = 2 / (period + 1);
    const ema: number[] = [];
    
    // Seed the first EMA value with the simple average of the first 'period' closes
    let sum = 0;
    for (let i = 0; i < period; i++) {
      sum += prices[i];
    }
    let emaVal = sum / period;
    ema.push(emaVal);
    
    for (let i = period; i < prices.length; i++) {
      emaVal = prices[i] * k + emaVal * (1 - k);
      ema.push(emaVal);
    }
    return ema;
  }
}
