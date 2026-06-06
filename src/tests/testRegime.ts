import dotenv from 'dotenv';
import { MarketRegimeDetector } from '../regimeDetector';
import { MarketData, OnChainData } from '../types';

// Load environment variables
dotenv.config();

async function runTest() {
  console.log('🧪 Starting test for MarketRegimeDetector...');
  
  const detector = new MarketRegimeDetector();
  
  // Dummy parameters since the detector fetches actual market data internally
  const marketData: MarketData = {
    symbol: 'BTCUSDT',
    price: 0,
    timestamp: new Date().toISOString()
  };
  
  const onChainData: OnChainData = {
    timestamp: new Date().toISOString()
  };
  
  try {
    const result = await detector.detectRegime(marketData, onChainData);
    
    console.log('\n==================================================');
    console.log('✅ REGIME DETECTION RESULT:');
    console.log('==================================================');
    console.log(`Market Regime: ${result.regime}`);
    console.log(`Confidence   : ${(result.confidence * 100).toFixed(1)}%`);
    console.log('Capital Weights:');
    console.log(` - Trend Agent         : ${(result.weights.trendAgent * 100).toFixed(1)}%`);
    console.log(` - Mean Reversion Agent: ${(result.weights.meanReversionAgent * 100).toFixed(1)}%`);
    console.log(` - Momentum Agent      : ${(result.weights.momentumAgent * 100).toFixed(1)}%`);
    console.log(` - News Agent          : ${(result.weights.newsAgent * 100).toFixed(1)}%`);
    console.log('\nMarket Snapshot:');
    console.log(JSON.stringify(result.marketSnapshot, null, 2));
    console.log('\nReasoning:');
    console.log(result.reasoning);
    console.log('==================================================');
    
  } catch (error: any) {
    console.error('❌ Test failed with error:', error.message || error);
  }
}

runTest();
