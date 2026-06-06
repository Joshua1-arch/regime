import dotenv from 'dotenv';
import { TrendAgent } from '../agents/trendAgent';
import { MeanReversionAgent } from '../agents/meanReversionAgent';
import { MomentumAgent } from '../agents/momentumAgent';
import { NewsAgent } from '../agents/newsAgent';
import { MarketRegimeDetector } from '../regimeDetector';
import { MarketData } from '../types';

// Load environment variables
dotenv.config();

async function runTest() {
  console.log('🧪 Starting multi-agent signal generation test...\n');

  // 1. Instantiate regime detector to fetch standard market data and candles
  const detector = new MarketRegimeDetector();
  
  console.log('🕯️ Fetching historical candle series (100 candles)...');
  let candles: any[] = [];
  let fundingRate = 0.0;
  
  try {
    candles = await detector.fetchBTCSpotCandles(100);
    console.log(`✅ Successfully fetched ${candles.length} candles.`);
  } catch (e: any) {
    console.error('❌ Failed to fetch candles:', e.message);
    process.exit(1);
  }

  try {
    fundingRate = await detector.fetchBTCFundingRate();
    console.log(`✅ Successfully fetched current funding rate: ${(fundingRate * 100).toFixed(4)}%`);
  } catch (e: any) {
    console.log('⚠️ Failed to fetch funding rate, falling back to 0.');
  }

  // 2. Prepare MarketData input using the latest candle close
  const latestCandle = candles[candles.length - 1];
  const latestPrice = parseFloat(latestCandle[4]);
  console.log(`📈 Current BTC Price: $${latestPrice}\n`);

  const marketData: MarketData = {
    symbol: 'BTCUSDT',
    price: latestPrice,
    timestamp: new Date().toISOString()
  };

  // 3. Define sample headlines for the News Agent
  const sampleHeadlines = [
    "Bitcoin network difficulty adjustment surges, showing high miner confidence.",
    "US Federal Reserve signals potential rate cuts, sparking bullish crypto interest.",
    "Whale wallet movements track large outflows from exchanges to cold storage."
  ];

  // 4. Instantiate all four agents
  const trendAgent = new TrendAgent();
  const meanReversionAgent = new MeanReversionAgent();
  const momentumAgent = new MomentumAgent();
  const newsAgent = new NewsAgent();

  console.log('📡 Requesting signals from all specialist sub-agents...\n');

  try {
    // Generate signals concurrently
    const [trendSignal, meanRevSignal, momentumSignal, newsSignal] = await Promise.all([
      trendAgent.generateSignal(marketData, candles),
      meanReversionAgent.generateSignal(marketData, candles),
      momentumAgent.generateSignal(marketData, candles),
      newsAgent.generateSignal(marketData, sampleHeadlines, { fundingRate, regime: 'Trending' })
    ]);

    // Print outputs side by side
    console.log('================================================================================');
    console.log('📢 AGENT SIGNAL EMISSION REPORT');
    console.log('================================================================================');
    
    const displaySignal = (title: string, signal: any) => {
      console.log(`🤖 Agent      : ${title}`);
      console.log(`   Signal     : ${signal.action} (Confidence: ${(signal.confidence * 100).toFixed(1)}%)`);
      console.log(`   Reasoning  : ${signal.reasoning}`);
      console.log('--------------------------------------------------------------------------------');
    };

    displaySignal('Trend Follower Agent', trendSignal);
    displaySignal('Mean Reversion Agent', meanRevSignal);
    displaySignal('Momentum Agent      ', momentumSignal);
    displaySignal('News Sentiment Agent', newsSignal);

    console.log('================================================================================');
    console.log('✅ Multi-agent signal generation complete.');

  } catch (error: any) {
    console.error('❌ Failed generating signals:', error.message || error);
  }
}

runTest();
