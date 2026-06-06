import dns from 'dns';
import axios from 'axios';
import { MarketRegime, RegimeWeights, MarketData, OnChainData } from './types';

// Override default DNS to Google's public DNS servers to resolve connectivity issues
dns.setServers(['8.8.8.8', '8.8.4.4']);
const originalLookup = dns.lookup;
dns.lookup = function (hostname: string, options: any, callback: any) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  const isAll = options && options.all;
  dns.resolve4(hostname, (err, addresses) => {
    if (err) return (originalLookup as any).call(dns, hostname, options, callback);
    if (!addresses || addresses.length === 0) return (originalLookup as any).call(dns, hostname, options, callback);
    if (isAll) {
      callback(null, addresses.map(addr => ({ address: addr, family: 4 })));
    } else {
      callback(null, addresses[0], 4);
    }
  });
} as any;

/**
 * Interface representing the output of the regime detection process.
 */
export interface RegimeDetectionResult {
  regime: MarketRegime;
  confidence: number;
  weights: RegimeWeights;
  reasoning: string;
  marketSnapshot: {
    price: number;
    ema12: number;
    ema26: number;
    volatility: number;
    priceChange1h: number;
    fundingRate: number;
    btcDominance: number;
  };
  timestamp: string;
}

/**
 * MarketRegimeDetector uses Alibaba Qwen LLM to classify current market conditions
 * and determine appropriate capital allocations for specialist trading agents.
 */
export class MarketRegimeDetector {
  private apiKey: string;
  private apiUrl: string;

  /**
   * Initializes the regime detector with DashScope API keys.
   */
  constructor() {
    this.apiKey = process.env.DASHSCOPE_API_KEY || '';
    this.apiUrl = `${process.env.DASHSCOPE_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1'}/chat/completions`;
  }

  /**
   * Fetches the last 26 hourly BTC/USDT candles from Bitget.
   * Endpoint: GET /api/v2/spot/market/candles
   * Returns an array of candle arrays: [ [timestamp, open, high, low, close, volume, transactionAmount], ... ]
   */
  async fetchBTCSpotCandles(limit: number = 26): Promise<any[]> {
    const symbol = 'BTCUSDT';
    const granularity = '1h';
    const path = `/api/v2/spot/market/candles?symbol=${symbol}&granularity=${granularity}&limit=${limit}`;
    const url = `https://api.bitget.com${path}`;

    try {
      const response = await axios.get(url, { timeout: 10000 });
      if (response.data && response.data.code === '00000') {
        return response.data.data; // Ordered oldest to newest
      } else {
        throw new Error(`Bitget Spot Candles API error: ${response.data?.msg || JSON.stringify(response.data)}`);
      }
    } catch (error: any) {
      throw new Error(`Failed to fetch BTC spot candles: ${error.response?.data?.msg || error.message}`);
    }
  }

  /**
   * Fetches the current funding rate for BTCUSDT from the futures market.
   * Endpoint: GET /api/v2/mix/market/current-fund-rate
   */
  async fetchBTCFundingRate(): Promise<number> {
    const symbol = 'BTCUSDT';
    const productType = 'USDT-FUTURES';
    const path = `/api/v2/mix/market/current-fund-rate?symbol=${symbol}&productType=${productType}`;
    const url = `https://api.bitget.com${path}`;

    try {
      const response = await axios.get(url, { timeout: 10000 });
      if (response.data && response.data.code === '00000' && response.data.data?.length > 0) {
        const rateStr = response.data.data[0].fundingRate;
        return parseFloat(rateStr);
      } else {
        throw new Error(`Bitget Funding Rate API error: ${response.data?.msg || JSON.stringify(response.data)}`);
      }
    } catch (error: any) {
      throw new Error(`Failed to fetch BTC funding rate: ${error.response?.data?.msg || error.message}`);
    }
  }

  /**
   * Fetches BTC dominance from Dune Analytics.
   * Uses execute + poll pattern. Falls back to 52 (52%) if unavailable.
   */
  async fetchBTCDominance(): Promise<number> {
    const apiKey = process.env.DUNE_API_KEY;
    if (!apiKey || apiKey === 'your_dune_api_key_here') {
      console.log('⚠️ DUNE_API_KEY not configured or placeholder. Falling back to 52% BTC dominance.');
      return 52.0;
    }

    const queryId = '2093923'; // public query from testDune
    const baseUrl = 'https://api.dune.com/api/v1';

    try {
      console.log(`[Dune] Triggering query ${queryId} execution...`);
      const execRes = await axios.post(
        `${baseUrl}/query/${queryId}/execute`,
        {},
        {
          headers: { 'X-Dune-Api-Key': apiKey },
          timeout: 10000
        }
      );

      const executionId = execRes.data?.execution_id;
      if (!executionId) {
        throw new Error('No execution_id returned from Dune');
      }

      // Poll up to 5 times (every 2 seconds) for a total of 10s max
      for (let i = 0; i < 5; i++) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        console.log(`[Dune] Polling execution ${executionId} (attempt ${i + 1}/5)...`);
        
        const statusRes = await axios.get(
          `${baseUrl}/execution/${executionId}/results`,
          {
            headers: { 'X-Dune-Api-Key': apiKey },
            timeout: 5000
          }
        );

        const state = statusRes.data?.state;
        if (state === 'QUERY_STATE_COMPLETED') {
          const rows = statusRes.data?.result?.rows || [];
          if (rows.length > 0) {
            const row = rows[0];
            // Look for a column containing 'dom' or 'dominance'
            const key = Object.keys(row).find(k => k.toLowerCase().includes('dom') || k.toLowerCase().includes('dominance'));
            if (key !== undefined && row[key] !== undefined) {
              return parseFloat(row[key]);
            }
            for (const val of Object.values(row)) {
              if (typeof val === 'number') return val;
              if (typeof val === 'string' && !isNaN(parseFloat(val))) return parseFloat(val);
            }
          }
          throw new Error('Completed but empty rows or missing columns');
        } else if (state === 'QUERY_STATE_FAILED') {
          throw new Error('Dune query execution failed');
        }
      }
      throw new Error('Polling timed out');
    } catch (error: any) {
      console.log(`⚠️ Dune query failed (${error.message || error}). Falling back to 52% BTC dominance.`);
      return 52.0;
    }
  }

  /**
   * Helper to calculate Exponential Moving Average (EMA)
   */
  private calculateEMA(prices: number[], period: number): number[] {
    const k = 2 / (period + 1);
    const ema: number[] = [];
    if (prices.length === 0) return [];
    
    let emaVal = prices[0];
    ema.push(emaVal);
    
    for (let i = 1; i < prices.length; i++) {
      emaVal = prices[i] * k + emaVal * (1 - k);
      ema.push(emaVal);
    }
    return ema;
  }

  /**
   * Helper to calculate standard deviation of values
   */
  private calculateStdDev(values: number[]): number {
    if (values.length <= 1) return 0;
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const sumSqDiff = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0);
    return Math.sqrt(sumSqDiff / (values.length - 1));
  }

  /**
   * Classifies the market regime using price feeds and on-chain data.
   * Sends market context to Alibaba Qwen LLM for advanced regime classification.
   * 
   * @param marketData - Current spot market data (e.g., BTC/USDT price)
   * @param onChainData - On-chain data from Dune Analytics (e.g., stablecoin supply)
   * @returns A promise resolving to the regime classification, agent weights, and explanation
   */
  async detectRegime(
    marketData: MarketData,
    onChainData: OnChainData
  ): Promise<RegimeDetectionResult> {
    const timestamp = new Date().toISOString();

    try {
      console.log('📈 Starting market regime detection pipeline...');
      
      // 1. Fetch candles
      console.log('🕯️ Fetching BTC/USDT hourly candles from Bitget...');
      const candles = await this.fetchBTCSpotCandles(26);

      // 2. Fetch funding rate
      console.log('💸 Fetching BTC funding rate from Bitget...');
      const fundingRate = await this.fetchBTCFundingRate();

      // 3. Fetch BTC dominance
      console.log('📊 Fetching BTC dominance from Dune...');
      const btcDominance = await this.fetchBTCDominance();

      // 4. Calculate indicators
      const closes = candles.map(c => parseFloat(c[4])).filter(p => !isNaN(p));
      if (closes.length < 26) {
        throw new Error(`Insufficient candle data. Expected 26, got ${closes.length}`);
      }

      const ema12Array = this.calculateEMA(closes, 12);
      const ema26Array = this.calculateEMA(closes, 26);
      const ema12 = ema12Array[ema12Array.length - 1];
      const ema26 = ema26Array[ema26Array.length - 1];

      const volatility = this.calculateStdDev(closes);

      const lastClose = closes[closes.length - 1];
      const prevClose = closes[closes.length - 2];
      const priceChange1h = ((lastClose - prevClose) / prevClose) * 100;

      const snapshot = {
        price: lastClose,
        ema12,
        ema26,
        volatility,
        priceChange1h,
        fundingRate,
        btcDominance
      };

      console.log('Snapshot calculated:', JSON.stringify(snapshot, null, 2));

      // 5. Query Qwen LLM
      if (!this.apiKey || this.apiKey === 'your_dashscope_api_key_here') {
        throw new Error('DASHSCOPE_API_KEY is not configured or placeholder.');
      }

      const prompt = `
You are an expert quantitative trading assistant. Analyze the following BTC/USDT market metrics and classify the current market regime:

Market Snapshot:
- Current Price: $${lastClose}
- EMA(12): $${ema12.toFixed(2)}
- EMA(26): $${ema26.toFixed(2)}
- Volatility (1h standard deviation of close prices over 26h): $${volatility.toFixed(2)}
- 1h Price Change: ${priceChange1h.toFixed(4)}%
- Funding Rate: ${(fundingRate * 100).toFixed(4)}% (Interval: 8h)
- BTC Dominance: ${btcDominance.toFixed(2)}%

Classification options:
- 'Trending': Strong directional movement (EMA12 cross EMA26, high price change). Assign high weight to Trend and Momentum.
- 'Sideways': Low volatility, flat price change, range-bound. Assign high weight to Mean Reversion.
- 'Volatile': High volatility, high price change, unstable. Assign high weight to News Reactive and Momentum.

Respond ONLY with a valid JSON object in the following format (no markdown blocks, no leading/trailing text):
{
  "regime": "Trending" | "Sideways" | "Volatile",
  "confidence": 0.85,
  "weights": {
    "trendAgent": 0.40,
    "meanReversionAgent": 0.10,
    "momentumAgent": 0.30,
    "newsAgent": 0.20
  },
  "reasoning": "Explain reasoning in 2 sentences."
}
IMPORTANT: The sum of weights in your response must be exactly 1.0. All values in weights must be positive numbers.
`;

      console.log('🤖 Sending prompt to Qwen LLM (qwen-plus)...');
      const response = await axios.post(
        this.apiUrl,
        {
          model: 'qwen-plus',
          messages: [
            { role: 'system', content: 'You are a helpful quantitative trading assistant.' },
            { role: 'user', content: prompt }
          ]
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 15000
        }
      );

      const reply = response.data?.choices?.[0]?.message?.content;
      if (!reply) {
        throw new Error('Empty response from Qwen LLM');
      }

      let parsed: any;
      try {
        let cleanReply = reply.trim();
        if (cleanReply.startsWith('```')) {
          cleanReply = cleanReply.replace(/^```json\s*/i, '').replace(/```$/, '').trim();
        }
        parsed = JSON.parse(cleanReply);
      } catch (e: any) {
        throw new Error(`Failed to parse LLM JSON response: ${reply}. Error: ${e.message}`);
      }

      const regime: MarketRegime = (parsed.regime === 'Trending' || parsed.regime === 'Volatile') ? parsed.regime : 'Sideways';
      const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0.5;
      
      let weights = parsed.weights || {};
      const sum = (weights.trendAgent || 0) + (weights.meanReversionAgent || 0) + (weights.momentumAgent || 0) + (weights.newsAgent || 0);
      
      if (Math.abs(sum - 1.0) > 0.01 || isNaN(sum)) {
        console.log(`⚠️ LLM returned invalid weights summing to ${sum}. Normalizing...`);
        const total = (weights.trendAgent || 0) + (weights.meanReversionAgent || 0) + (weights.momentumAgent || 0) + (weights.newsAgent || 0) || 1;
        weights = {
          trendAgent: (weights.trendAgent || 0) / total,
          meanReversionAgent: (weights.meanReversionAgent || 0) / total,
          momentumAgent: (weights.momentumAgent || 0) / total,
          newsAgent: (weights.newsAgent || 0) / total
        };
      }

      return {
        regime,
        confidence,
        weights,
        reasoning: parsed.reasoning || 'Successfully classified regime.',
        marketSnapshot: snapshot,
        timestamp
      };

    } catch (error: any) {
      console.error(`❌ [RegimeDetector] Error: ${error.message}`);
      // Fallback
      return {
        regime: 'Sideways',
        confidence: 0.5,
        weights: this.getDefaultWeights(),
        reasoning: `Fallback triggered due to error: ${error.message}`,
        marketSnapshot: {
          price: marketData.price || 0,
          ema12: 0,
          ema26: 0,
          volatility: 0,
          priceChange1h: 0,
          fundingRate: 0,
          btcDominance: 52
        },
        timestamp
      };
    }
  }

  /**
   * Generates default capital weights for specialist agents if LLM classification fails.
   * Uses an even distribution of capital as a fallback mechanism.
   * 
   * @returns Evenly distributed weights across all 4 specialist agents
   */
  getDefaultWeights(): RegimeWeights {
    return {
      trendAgent: 0.25,
      meanReversionAgent: 0.25,
      momentumAgent: 0.25,
      newsAgent: 0.25
    };
  }

  /**
   * Starts a loop that runs the regime detection every 5 minutes.
   * Calls callback with the result.
   */
  startLoop(callback?: (result: RegimeDetectionResult) => void) {
    console.log('🔄 Starting Market Regime Detection loop (every 5 minutes)...');
    
    const run = async () => {
      console.log(`\n⏰ [${new Date().toLocaleTimeString()}] Running regime detection...`);
      const dummyMarketData: MarketData = { symbol: 'BTCUSDT', price: 0, timestamp: new Date().toISOString() };
      const dummyOnChainData: OnChainData = { timestamp: new Date().toISOString() };
      
      const result = await this.detectRegime(dummyMarketData, dummyOnChainData);
      console.log(`📊 Regime: ${result.regime} (Confidence: ${(result.confidence * 100).toFixed(0)}%)`);
      console.log('⚖️ Weights:', JSON.stringify(result.weights, null, 2));
      console.log('📝 Reasoning:', result.reasoning);
      
      if (callback) {
        callback(result);
      }
    };

    // Run immediately
    run();

    // Set interval for every 5 minutes (300,000 ms)
    const intervalId = setInterval(run, 5 * 60 * 1000);
    return intervalId;
  }
}
