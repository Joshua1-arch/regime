import axios from 'axios';
import * as CryptoJS from 'crypto-js';
import { CentralSignal } from './types';

/**
 * The Executor connects to the Bitget exchange API, monitors account balance/equity,
 * implements a drawdown circuit breaker, and executes spot orders.
 */
export class Executor {
  private apiKey: string;
  private secretKey: string;
  private passphrase: string;
  private baseUrl: string = 'https://api.bitget.com';

  // Circuit breaker state
  private initialEquity: number = 0;
  private peakEquity: number = 0;
  private isHalted: boolean = false;
  
  public sessionPnl: number = 0;

  /**
   * Initializes the Executor with keys from environment variables.
   */
  constructor() {
    this.apiKey = process.env.BITGET_API_KEY || '';
    this.secretKey = process.env.BITGET_API_SECRET || '';
    this.passphrase = process.env.BITGET_PASSPHRASE || '';
  }

  /**
   * Creates the required HMAC-SHA256 signature for private Bitget endpoints.
   */
  private sign(timestamp: string, method: string, path: string, body: string = ''): string {
    const message = timestamp + method.toUpperCase() + path + body;
    const signature = CryptoJS.HmacSHA256(message, this.secretKey);
    return CryptoJS.enc.Base64.stringify(signature);
  }

  /**
   * Generates headers required for private Bitget requests.
   */
  private getPrivateHeaders(method: string, path: string, body: string = '') {
    const timestamp = Date.now().toString();
    return {
      'ACCESS-KEY': this.apiKey,
      'ACCESS-SIGN': this.sign(timestamp, method, path, body),
      'ACCESS-TIMESTAMP': timestamp,
      'ACCESS-PASSPHRASE': this.passphrase,
      'Content-Type': 'application/json',
      'locale': 'en-US',
    };
  }

  /**
   * Fetches the current BTC/USDT price from the public ticker.
   */
  async fetchBTCPrice(): Promise<number> {
    const path = '/api/v2/spot/market/tickers?symbol=BTCUSDT';
    try {
      const res = await axios.get(`${this.baseUrl}${path}`, { timeout: 5000 });
      const priceStr = res.data?.data?.[0]?.lastPr;
      return parseFloat(priceStr) || 0;
    } catch (e: any) {
      console.error('Executor: Failed to fetch current BTC price:', e.message);
      return 0;
    }
  }

  /**
   * Retrieves account balances and calculates total equity (USDT value + BTC value).
   */
  async getEquity(btcPrice: number): Promise<number> {
    const path = '/api/v2/spot/account/assets';
    const headers = this.getPrivateHeaders('GET', path);

    try {
      const res = await axios.get(`${this.baseUrl}${path}`, { headers, timeout: 8000 });
      
      let usdtAvailable = 0;
      let btcAvailable = 0;

      if (res.data && res.data.code === '00000' && Array.isArray(res.data.data)) {
        for (const asset of res.data.data) {
          if (asset.coin === 'USDT') {
            usdtAvailable = parseFloat(asset.available) || 0;
          } else if (asset.coin === 'BTC') {
            btcAvailable = parseFloat(asset.available) || 0;
          }
        }
      } else {
        throw new Error(res.data?.msg || JSON.stringify(res.data));
      }

      const totalEquity = usdtAvailable + (btcAvailable * btcPrice);
      return totalEquity;
    } catch (error: any) {
      console.error('Executor: Failed to retrieve account balance for equity calculation:', error.message);
      // Fallback: return 0 to indicate failure
      return 0;
    }
  }

  /**
   * Checks the circuit breaker drawdown. Returns true if halted.
   */
  async checkCircuitBreaker(btcPrice: number): Promise<boolean> {
    if (this.isHalted) {
      return true;
    }

    const currentEquity = await this.getEquity(btcPrice);
    if (currentEquity === 0) {
      console.log('Executor: Skipping circuit breaker check due to balance API failure.');
      return false; // skip check if API fails
    }

    if (this.initialEquity === 0) {
      this.initialEquity = currentEquity;
      this.peakEquity = currentEquity;
      console.log(`Executor: Initial equity established at $${currentEquity.toFixed(2)} USDT.`);
      this.sessionPnl = 0;
      return false;
    }

    this.sessionPnl = currentEquity - this.initialEquity;

    if (currentEquity > this.peakEquity) {
      this.peakEquity = currentEquity;
    }

    const drawdown = (this.peakEquity - currentEquity) / this.peakEquity;
    console.log(`Executor: Current Equity: $${currentEquity.toFixed(2)} USDT | Drawdown: ${(drawdown * 100).toFixed(2)}% (Peak: $${this.peakEquity.toFixed(2)} USDT)`);

    if (drawdown > 0.05) {
      this.isHalted = true;
      console.error(`🚨 CIRCUIT BREAKER TRIGGERED: Drawdown of ${(drawdown * 100).toFixed(2)}% exceeds the 5% threshold. Halting all trades.`);
      return true;
    }

    return false;
  }

  /**
   * Executes a trade order on Bitget based on the orchestrated CentralSignal.
   * 
   * @param signal - The combined trade action and confidence score from the Orchestrator
   * @param symbol - The trading pair symbol, e.g., 'BTCUSDT'
   * @returns A promise resolving to the result of the order execution
   */
  async executeTrade(
    signal: CentralSignal,
    symbol: string = 'BTCUSDT'
  ): Promise<any> {
    console.log(`Executor: Evaluating signal for execution...`);

    // Fetch price for circuit breaker check
    const btcPrice = await this.fetchBTCPrice();
    if (btcPrice === 0) {
      console.error('Executor: Aborting trade execution because BTC price is 0 (price feed failure).');
      return null;
    }

    // Check circuit breaker drawdown
    const isHalted = await this.checkCircuitBreaker(btcPrice);
    if (isHalted) {
      console.warn('Executor: Trade Execution HALTED by circuit breaker.');
      return null;
    }

    // Handle HOLD signal
    if (signal.action === 'HOLD') {
      console.log(`Executor: Signal is HOLD. Skipping order placement.`);
      return { status: 'skipped', reason: 'HOLD signal' };
    }

    // Formulate place order payload
    const path = '/api/v2/spot/trade/place-order';
    const bodyObj = {
      symbol,
      side: signal.action === 'BUY' ? 'buy' : 'sell',
      orderType: 'market',
      force: 'gtc',
      size: '0.001' // fixed tiny size for safety
    };
    
    const bodyStr = JSON.stringify(bodyObj);
    console.log(`Executor: Placing Spot Order -> Side: ${bodyObj.side.toUpperCase()} | Type: MARKET | Size: ${bodyObj.size} BTC`);

    try {
      const headers = this.getPrivateHeaders('POST', path, bodyStr);
      const res = await axios.post(`${this.baseUrl}${path}`, bodyObj, { headers, timeout: 8000 });

      if (res.data && res.data.code === '00000') {
        console.log(`✅ Executor: Order placed successfully! Order ID: ${res.data.data?.orderId}`);
        return res.data;
      } else {
        console.error(`❌ Executor: Order failed with API code ${res.data?.code}: ${res.data?.msg || JSON.stringify(res.data)}`);
        return res.data;
      }
    } catch (error: any) {
      console.error(`❌ Executor: Request error while placing order:`, error.response?.data || error.message);
      return null;
    }
  }
}
