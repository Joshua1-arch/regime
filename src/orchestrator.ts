import { CentralSignal, MarketData, OnChainData, RegimeWeights, AgentSignal, TradeAction } from './types';
import { MarketRegimeDetector } from './regimeDetector';
import { TrendAgent } from './agents/trendAgent';
import { MeanReversionAgent } from './agents/meanReversionAgent';
import { MomentumAgent } from './agents/momentumAgent';
import { NewsAgent } from './agents/newsAgent';
import { AdaptiveWeightManager, Regime } from './adaptiveWeightManager';

/**
 * The Orchestrator coordinates market regime detection and signal aggregation
 * across all specialist trading agents. It now uses a UCB1 Multi-Armed Bandit
 * AdaptiveWeightManager to continuously learn which agents perform best per regime.
 */
export class Orchestrator {
  private regimeDetector: MarketRegimeDetector;
  private trendAgent: TrendAgent;
  private meanReversionAgent: MeanReversionAgent;
  private momentumAgent: MomentumAgent;
  private newsAgent: NewsAgent;
  private adaptiveWeights: AdaptiveWeightManager;

  public latestRegimeResult: any = null;

  // State for outcome tracking between cycles
  private lastPrice: number = 0;
  private lastRegime: Regime = 'Unknown';
  private lastSignals: AgentSignal[] = [];

  constructor() {
    this.regimeDetector = new MarketRegimeDetector();
    this.trendAgent = new TrendAgent();
    this.meanReversionAgent = new MeanReversionAgent();
    this.momentumAgent = new MomentumAgent();
    this.newsAgent = new NewsAgent();
    this.adaptiveWeights = new AdaptiveWeightManager();
  }

  /**
   * Initializes database connections for bandit learning performance.
   */
  async initialize(): Promise<void> {
    await this.adaptiveWeights.connect();
  }

  /**
   * Orchestrates the full analysis pipeline:
   * 1. Records the outcome of the PREVIOUS cycle (for bandit learning).
   * 2. Detects the current market regime via Qwen.
   * 3. Computes blended weights (60% empirical UCB1 + 40% Qwen structural).
   * 4. Triggers signal generation from all specialist agents.
   * 5. Aggregates signals using blended adaptive weights.
   */
  async runPipeline(
    marketData: MarketData,
    onChainData: OnChainData,
    historicalCandles: any[],
    newsHeadlines: string[]
  ): Promise<CentralSignal> {
    console.log('Orchestrator: Executing central intelligence pipeline...');

    const currentPrice = marketData.price || (historicalCandles.length > 0 ? parseFloat(historicalCandles[historicalCandles.length - 1][4]) : 0);
    const updatedMarketData: MarketData = { ...marketData, price: currentPrice };

    // ── STEP 1: Record previous cycle outcome for bandit learning ──────────
    if (this.lastPrice > 0 && this.lastSignals.length > 0) {
      const priceChangePct = (currentPrice - this.lastPrice) / this.lastPrice;
      this.adaptiveWeights.recordOutcome(
        this.lastRegime,
        this.lastSignals.map(s => ({ agentId: s.agentId, action: s.action })),
        priceChangePct
      );
    }

    // ── STEP 2: Detect market regime via Qwen ─────────────────────────────
    const regimeResult = await this.regimeDetector.detectRegime(updatedMarketData, onChainData);
    const regime = regimeResult.regime as Regime;
    this.latestRegimeResult = regimeResult;

    // ── STEP 3: Compute blended UCB1 + Qwen weights ───────────────────────
    const blendedWeights = this.adaptiveWeights.computeBlendedWeights(regime, regimeResult.weights);

    // Expose blended weights to dashboard (override pure Qwen weights)
    this.latestRegimeResult = {
      ...regimeResult,
      weights: blendedWeights,
      qwenWeights: regimeResult.weights, // Preserve original Qwen weights for comparison
      performanceSummary: this.adaptiveWeights.getWinRateSummary()
    };

    console.log(`Orchestrator: Regime "${regime}" | Blended weights (UCB1 + Qwen):`);
    console.log(`  📊 Trend:        ${(blendedWeights.trendAgent * 100).toFixed(1)}%`);
    console.log(`  📊 MeanReversion: ${(blendedWeights.meanReversionAgent * 100).toFixed(1)}%`);
    console.log(`  📊 Momentum:     ${(blendedWeights.momentumAgent * 100).toFixed(1)}%`);
    console.log(`  📊 News:         ${(blendedWeights.newsAgent * 100).toFixed(1)}%`);

    // ── STEP 4: Generate agent signals in parallel ─────────────────────────
    let fundingRate = regimeResult.marketSnapshot?.fundingRate || 0.0;
    console.log('Orchestrator: Emitting signals to Trend, Mean Reversion, Momentum, and News Agents...');

    const [trendSig, meanRevSig, momentumSig, newsSig] = await Promise.all([
      this.trendAgent.generateSignal(updatedMarketData, historicalCandles),
      this.meanReversionAgent.generateSignal(updatedMarketData, historicalCandles),
      this.momentumAgent.generateSignal(updatedMarketData, historicalCandles),
      this.newsAgent.generateSignal(updatedMarketData, newsHeadlines, { fundingRate, regime })
    ]);

    const signals = [trendSig, meanRevSig, momentumSig, newsSig];
    console.log('Orchestrator: Agent signals received:');
    signals.forEach(s => {
      console.log(` - [${s.agentId}]: ${s.action} (Confidence: ${(s.confidence * 100).toFixed(1)}%)`);
    });

    // ── STEP 5: Aggregate signals with blended adaptive weights ───────────
    const centralSignal = this.aggregateSignals(signals, blendedWeights);
    console.log(`Orchestrator: Formulated Central Signal: ${centralSignal.action} (Weighted Confidence: ${(centralSignal.confidence * 100).toFixed(1)}%)`);

    // Store state for next cycle's outcome evaluation
    this.lastPrice = currentPrice;
    this.lastRegime = regime;
    this.lastSignals = signals;

    return centralSignal;
  }

  /**
   * Combines individual agent recommendations into a single weighted action.
   */
  private aggregateSignals(signals: AgentSignal[], weights: RegimeWeights): CentralSignal {
    const timestamp = new Date().toISOString();

    const weightMap: { [key: string]: number } = {
      trend_agent:           weights.trendAgent,
      mean_reversion_agent:  weights.meanReversionAgent,
      momentum_agent:        weights.momentumAgent,
      news_agent:            weights.newsAgent
    };

    let weightedScoreSum = 0;
    let confidenceSum = 0;

    for (const signal of signals) {
      const weight = weightMap[signal.agentId] ?? 0.25;
      let numericAction = 0;
      if (signal.action === 'BUY') numericAction = 1;
      else if (signal.action === 'SELL') numericAction = -1;

      weightedScoreSum += weight * signal.confidence * numericAction;
      confidenceSum += weight * signal.confidence;
    }

    const isDemo = process.env.DEMO_MODE === 'true';
    const threshold = isDemo ? 0.1 : 0.2;

    let action: TradeAction = 'HOLD';
    if (weightedScoreSum > threshold) action = 'BUY';
    else if (weightedScoreSum < -threshold) action = 'SELL';

    return {
      action,
      confidence: Math.min(1.0, Math.max(0.0, confidenceSum)),
      agentSignals: signals,
      timestamp
    };
  }

  /**
   * Exposes the adaptive weight manager for dashboard integration.
   */
  getAdaptiveWeightManager(): AdaptiveWeightManager {
    return this.adaptiveWeights;
  }
}
