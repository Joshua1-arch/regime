import dotenv from 'dotenv';
import { Orchestrator } from '../orchestrator';
import { Executor } from '../executor';
import { MarketData, OnChainData } from '../types';
import { MarketRegimeDetector } from '../regimeDetector';

// Load environment variables
dotenv.config();

async function runTest() {
  console.log('🧪 Starting end-to-end Orchestrator + Executor test...');

  const orchestrator = new Orchestrator();
  const executor = new Executor();
  const detector = new MarketRegimeDetector();

  try {
    // 1. Fetch historical candles for price action
    console.log('\n[Step 1] Fetching 100 hourly BTC/USDT candles...');
    const candles = await detector.fetchBTCSpotCandles(100);
    const latestPrice = parseFloat(candles[candles.length - 1][4]);
    console.log(`✅ Current BTC Price determined: $${latestPrice}`);

    const marketData: MarketData = {
      symbol: 'BTCUSDT',
      price: latestPrice,
      timestamp: new Date().toISOString()
    };

    const onChainData: OnChainData = {
      timestamp: new Date().toISOString()
    };

    const newsHeadlines = [
      "Bitcoin spot volume increases, indicating high retail participation.",
      "Federal regulators announce supportive policy frameworks for spot crypto assets.",
      "Exchange net reserves decline to multi-year lows, showing holding sentiment."
    ];

    // 2. Run the pipeline
    console.log('\n[Step 2] Running Orchestrator pipeline...');
    const centralSignal = await orchestrator.runPipeline(marketData, onChainData, candles, newsHeadlines);

    console.log('\n==================================================');
    console.log('CENTRAL PIPELINE OUTPUT:');
    console.log(`Action    : ${centralSignal.action}`);
    console.log(`Confidence: ${(centralSignal.confidence * 100).toFixed(1)}%`);
    console.log('==================================================');

    // 3. Execute order on Bitget Paper Trading
    console.log('\n[Step 3] Executing order via Executor...');
    const orderResult = await executor.executeTrade(centralSignal, 'BTCUSDT');

    console.log('\n==================================================');
    console.log('EXECUTOR ORDER RESULT:');
    console.log(JSON.stringify(orderResult, null, 2));
    console.log('==================================================');

  } catch (error: any) {
    console.error('\n❌ End-to-End Test failed with error:', error.message || error);
  }

  console.log('\n🧪 End-to-end test finished.');
}

runTest();
