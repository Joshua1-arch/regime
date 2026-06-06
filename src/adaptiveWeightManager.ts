import * as fs from 'fs';
import * as path from 'path';
import { MongoClient } from 'mongodb';

// The 4 agent IDs used throughout the system
export type AgentId = 'trend_agent' | 'mean_reversion_agent' | 'momentum_agent' | 'news_agent';
export type Regime = 'Trending' | 'Sideways' | 'Volatile' | 'Unknown';

/**
 * Per-agent, per-regime performance record.
 * Tracks enough state to compute UCB1 scores.
 */
export interface AgentStats {
  wins: number;         // Times agent's signal matched actual price direction
  losses: number;       // Times agent's signal contradicted actual price direction
  totalPulls: number;   // Total times agent was consulted
  cumulativeReward: number; // Sum of all rewards (1=win, 0=neutral, -1=loss)
}

/**
 * Full performance state persisted to disk.
 */
export interface PerformanceState {
  totalRounds: number;
  agentStats: Record<Regime, Record<AgentId, AgentStats>>;
  lastUpdated: string;
}

const AGENT_IDS: AgentId[] = ['trend_agent', 'mean_reversion_agent', 'momentum_agent', 'news_agent'];
const REGIMES: Regime[] = ['Trending', 'Sideways', 'Volatile', 'Unknown'];
const DATA_DIR = path.join(process.cwd(), 'data');
const STATE_FILE = path.join(DATA_DIR, 'agent_performance.json');

// UCB1 exploration constant — higher = more exploration of underused agents
const UCB_EXPLORATION_CONSTANT = 1.5;

// Minimum weight any single agent can receive (prevents total exclusion)
const MIN_WEIGHT = 0.05;

/**
 * Creates a fresh zeroed AgentStats record.
 */
function emptyStats(): AgentStats {
  return { wins: 0, losses: 0, totalPulls: 0, cumulativeReward: 0 };
}

/**
 * Builds a fresh zeroed PerformanceState across all agents and regimes.
 */
function freshState(): PerformanceState {
  const agentStats: Record<string, Record<string, AgentStats>> = {};
  for (const regime of REGIMES) {
    agentStats[regime] = {};
    for (const agentId of AGENT_IDS) {
      agentStats[regime][agentId] = emptyStats();
    }
  }
  return {
    totalRounds: 0,
    agentStats: agentStats as PerformanceState['agentStats'],
    lastUpdated: new Date().toISOString()
  };
}

/**
 * AdaptiveWeightManager implements UCB1 Multi-Armed Bandit algorithm
 * to dynamically adjust agent capital weights based on empirical signal accuracy.
 *
 * How it works:
 * 1. Every cycle, agents generate BUY/SELL/HOLD signals.
 * 2. In the NEXT cycle, we observe the actual price direction.
 * 3. Agents whose prior signal correctly predicted the direction get rewarded.
 * 4. UCB1 formula: score_i = avg_reward_i + C * sqrt(ln(N) / n_i)
 *    where N = total rounds, n_i = times agent i was used, C = exploration constant.
 * 5. UCB scores are softmax-normalized into weights that sum to 1.0.
 * 6. These empirical weights are blended with Qwen's regime-based weights.
 *
 * The result: agents that are consistently right get more capital; 
 * agents that underperform in a given regime get progressively sidelined.
 */
export class AdaptiveWeightManager {
  private state: PerformanceState;
  private mongoClient: MongoClient | null = null;
  private db: any = null;
  private useMongo = false;

  constructor() {
    this.state = this.loadState();
    console.log(`🧠 AdaptiveWeightManager: Loaded local fallback performance state (Rounds: ${this.state.totalRounds}).`);
    
    const mongoUri = process.env.MONGODB_URI;
    if (mongoUri) {
      this.mongoClient = new MongoClient(mongoUri);
      this.useMongo = true;
    }
  }

  async connect(): Promise<void> {
    if (this.useMongo && this.mongoClient) {
      try {
        await this.mongoClient.connect();
        this.db = this.mongoClient.db('regime_trading');
        console.log('🧠 AdaptiveWeightManager: Connected successfully to MongoDB Cloud Atlas.');
        
        // Sync state from database
        const collection = this.db.collection('bandit_performance');
        const doc = await collection.findOne({ _id: 'latest' as any });
        if (doc) {
          const { _id, ...rest } = doc;
          this.state = rest as any;
          console.log(`🧠 AdaptiveWeightManager: Synced performance state from MongoDB Cloud Atlas. Total rounds: ${this.state.totalRounds}`);
        } else {
          console.log('🧠 AdaptiveWeightManager: No performance state found in MongoDB Cloud Atlas. Initializing fresh on cloud.');
          await this.saveStateCloud();
        }
      } catch (err: any) {
        console.error('🧠 AdaptiveWeightManager: Failed to initialize cloud storage, falling back to local file:', err.message);
        this.useMongo = false;
      }
    }
  }

  private loadState(): PerformanceState {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (fs.existsSync(STATE_FILE)) {
        const raw = fs.readFileSync(STATE_FILE, 'utf-8');
        return JSON.parse(raw) as PerformanceState;
      }
    } catch (err: any) {
      console.warn(`AdaptiveWeightManager: Could not load state file. Starting fresh. (${err.message})`);
    }
    return freshState();
  }

  private saveState(): void {
    // 1. Save locally
    try {
      this.state.lastUpdated = new Date().toISOString();
      fs.writeFileSync(STATE_FILE, JSON.stringify(this.state, null, 2));
    } catch (err: any) {
      console.warn(`AdaptiveWeightManager: Could not save state file. (${err.message})`);
    }

    // 2. Save to cloud asynchronously in background
    if (this.useMongo && this.db) {
      this.saveStateCloud().catch(err => {
        console.error('🧠 AdaptiveWeightManager: Failed to save performance state to MongoDB Atlas:', err.message);
      });
    }
  }

  private async saveStateCloud(): Promise<void> {
    if (this.db) {
      const collection = this.db.collection('bandit_performance');
      await collection.updateOne(
        { _id: 'latest' as any },
        { $set: this.state },
        { upsert: true }
      );
    }
  }

  /**
   * Records the outcome of the previous cycle for all agents in a given regime.
   * Must be called at the START of each new cycle with the observed price change.
   *
   * @param regime - The regime that was active in the previous cycle
   * @param agentSignals - The signals that were generated in the previous cycle
   * @param priceChangePct - Actual % price change since last cycle (+ve = price went up)
   */
  recordOutcome(
    regime: Regime,
    agentSignals: Array<{ agentId: string; action: string }>,
    priceChangePct: number
  ): void {
    const safeRegime = (REGIMES.includes(regime as Regime) ? regime : 'Unknown') as Regime;

    // Threshold: ignore very small moves as noise (< 0.05% change)
    const NOISE_THRESHOLD = 0.0005;
    const isNoise = Math.abs(priceChangePct) < NOISE_THRESHOLD;

    this.state.totalRounds++;

    for (const signal of agentSignals) {
      const agentId = signal.agentId as AgentId;
      if (!AGENT_IDS.includes(agentId)) continue;

      const stats = this.state.agentStats[safeRegime][agentId];
      stats.totalPulls++;

      if (isNoise) {
        // Neutral outcome — no reward or penalty
        continue;
      }

      const priceWentUp = priceChangePct > 0;
      let reward = 0;

      if (signal.action === 'BUY' && priceWentUp) {
        reward = 1;
        stats.wins++;
      } else if (signal.action === 'SELL' && !priceWentUp) {
        reward = 1;
        stats.wins++;
      } else if (signal.action === 'HOLD') {
        reward = 0; // Neutral
      } else {
        reward = -1; // Wrong direction
        stats.losses++;
      }

      stats.cumulativeReward += reward;
    }

    this.saveState();

    if (!isNoise) {
      const direction = priceChangePct > 0 ? '📈 UP' : '📉 DOWN';
      console.log(`🧠 AdaptiveWeightManager: Round ${this.state.totalRounds} | Price moved ${direction} (${(priceChangePct * 100).toFixed(3)}%) | Regime: ${safeRegime}`);
    }
  }

  /**
   * Computes UCB1 scores for each agent in a given regime.
   *
   * UCB1 formula: avg_reward + C * sqrt(ln(N) / n_i)
   * - avg_reward: agent's historical accuracy in this regime
   * - exploration bonus: high for rarely-used agents, shrinks as they're used more
   *
   * @param regime - The current market regime
   * @returns Map of agentId -> UCB score (pre-normalization)
   */
  private computeUCBScores(regime: Regime): Record<AgentId, number> {
    const safeRegime = (REGIMES.includes(regime as Regime) ? regime : 'Unknown') as Regime;
    const N = Math.max(1, this.state.totalRounds);
    const scores: Partial<Record<AgentId, number>> = {};

    for (const agentId of AGENT_IDS) {
      const stats = this.state.agentStats[safeRegime][agentId];
      const n = Math.max(1, stats.totalPulls);

      // Average reward scaled to [0, 1] from [-1, 1]
      const avgRaw = stats.cumulativeReward / n;
      const avgReward = (avgRaw + 1) / 2; // Normalize to [0, 1]

      // UCB exploration bonus
      const explorationBonus = UCB_EXPLORATION_CONSTANT * Math.sqrt(Math.log(N) / n);

      scores[agentId] = avgReward + explorationBonus;
    }

    return scores as Record<AgentId, number>;
  }

  /**
   * Converts raw UCB scores into normalized weights using softmax.
   * Ensures all weights sum to 1.0 with a minimum floor per agent.
   */
  private ucbScoresToWeights(scores: Record<AgentId, number>): Record<AgentId, number> {
    // Softmax transformation
    const expScores: Record<string, number> = {};
    let expSum = 0;

    for (const agentId of AGENT_IDS) {
      const expVal = Math.exp(scores[agentId]);
      expScores[agentId] = expVal;
      expSum += expVal;
    }

    // Normalize with minimum floor
    const raw: Record<string, number> = {};
    for (const agentId of AGENT_IDS) {
      raw[agentId] = Math.max(MIN_WEIGHT, expScores[agentId] / expSum);
    }

    // Re-normalize after applying floor
    const rawSum = Object.values(raw).reduce((a, b) => a + b, 0);
    const weights: Partial<Record<AgentId, number>> = {};
    for (const agentId of AGENT_IDS) {
      weights[agentId] = raw[agentId] / rawSum;
    }

    return weights as Record<AgentId, number>;
  }

  /**
   * Computes final blended weights by combining:
   * - 60% empirical UCB1 weights (from agent performance history)
   * - 40% Qwen regime-based weights (structural market knowledge)
   *
   * This blend gives the system both learned accuracy AND regime-awareness.
   * As the system accumulates more rounds, the empirical weight gradually 
   * should dominate (the 60/40 split can be tuned).
   *
   * @param regime - Current market regime
   * @param qwenWeights - Weights output by Qwen regime classification
   * @returns Blended final weights as RegimeWeights
   */
  computeBlendedWeights(
    regime: Regime,
    qwenWeights: { trendAgent: number; meanReversionAgent: number; momentumAgent: number; newsAgent: number }
  ): { trendAgent: number; meanReversionAgent: number; momentumAgent: number; newsAgent: number } {
    const ucbScores = this.computeUCBScores(regime);
    const ucbWeights = this.ucbScoresToWeights(ucbScores);

    // Blend: 60% empirical UCB, 40% Qwen structural
    // In early rounds (< 10), trust Qwen more (80/20)
    const empiricalFactor = this.state.totalRounds >= 10 ? 0.60 : 0.20;
    const structuralFactor = 1 - empiricalFactor;

    const blended = {
      trendAgent:         (ucbWeights.trend_agent * empiricalFactor)           + (qwenWeights.trendAgent * structuralFactor),
      meanReversionAgent: (ucbWeights.mean_reversion_agent * empiricalFactor)  + (qwenWeights.meanReversionAgent * structuralFactor),
      momentumAgent:      (ucbWeights.momentum_agent * empiricalFactor)        + (qwenWeights.momentumAgent * structuralFactor),
      newsAgent:          (ucbWeights.news_agent * empiricalFactor)             + (qwenWeights.newsAgent * structuralFactor)
    };

    // Final re-normalization to guarantee sum = 1.0
    const total = blended.trendAgent + blended.meanReversionAgent + blended.momentumAgent + blended.newsAgent;
    return {
      trendAgent:         blended.trendAgent / total,
      meanReversionAgent: blended.meanReversionAgent / total,
      momentumAgent:      blended.momentumAgent / total,
      newsAgent:          blended.newsAgent / total
    };
  }

  /**
   * Returns the current raw performance stats for dashboard display.
   */
  getPerformanceStats(): PerformanceState {
    return this.state;
  }

  /**
   * Returns a summary of agent win rates per regime for dashboard rendering.
   */
  getWinRateSummary(): Record<string, Record<string, string>> {
    const summary: Record<string, Record<string, string>> = {};
    for (const regime of REGIMES) {
      summary[regime] = {};
      for (const agentId of AGENT_IDS) {
        const stats = this.state.agentStats[regime][agentId];
        const winRate = stats.totalPulls > 0
          ? ((stats.wins / stats.totalPulls) * 100).toFixed(1) + '%'
          : 'No data';
        summary[regime][agentId] = winRate;
      }
    }
    return summary;
  }
}
