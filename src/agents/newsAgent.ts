import axios from 'axios';
import { AgentSignal, MarketData } from '../types';

/**
 * NewsAgent processes market news sentiment and social signals.
 * It uses the Qwen LLM to classify news headlines and overall market sentiment,
 * generating trading recommendations based on qualitative market context.
 */
export class NewsAgent {
  private agentId: string = 'news_agent';
  private apiKey: string;
  private apiUrl: string;

  /**
   * Initializes the news agent with DashScope API keys.
   */
  constructor() {
    this.apiKey = process.env.DASHSCOPE_API_KEY || '';
    this.apiUrl = `${process.env.DASHSCOPE_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1'}/chat/completions`;
  }

  /**
   * Generates a buy, sell, or hold signal based on recent news headlines, market sentiment,
   * and market indicators.
   * 
   * @param marketData - Current spot market data for the target asset
   * @param newsHeadlines - Array of recent news articles, headlines, or social posts
   * @param optionalParams - Optional parameters for funding rate and market regime
   * @returns A promise resolving to the generated AgentSignal
   */
  async generateSignal(
    marketData: MarketData,
    newsHeadlines: string[],
    optionalParams?: { fundingRate?: number; regime?: string }
  ): Promise<AgentSignal> {
    const timestamp = new Date().toISOString();

    try {
      if (!this.apiKey || this.apiKey === 'your_dashscope_api_key_here') {
        throw new Error('DASHSCOPE_API_KEY is not configured or placeholder.');
      }

      // Fetch funding rate if not supplied in optionalParams
      let fundingRate = optionalParams?.fundingRate;
      if (fundingRate === undefined) {
        try {
          const rateUrl = 'https://api.bitget.com/api/v2/mix/market/current-fund-rate?symbol=BTCUSDT&productType=USDT-FUTURES';
          const rateRes = await axios.get(rateUrl, { timeout: 5000 });
          if (rateRes.data && rateRes.data.code === '00000' && rateRes.data.data?.length > 0) {
            fundingRate = parseFloat(rateRes.data.data[0].fundingRate);
          }
        } catch (e: any) {
          fundingRate = 0.0; // Fallback
        }
      }

      const finalFundingRate = fundingRate ?? 0.0;
      const regime = optionalParams?.regime || 'Unknown';
      const headlinesText = newsHeadlines && newsHeadlines.length > 0
        ? newsHeadlines.map((h, i) => `${i + 1}. "${h}"`).join('\n')
        : 'No recent headlines. Analyze general sentiment based on market data.';

      const prompt = `
You are an expert quantitative news and sentiment analysis agent. Analyze the following market metrics and news headlines/social sentiment for BTC/USDT to generate a trading recommendation:

Market Context:
- Current Price: $${marketData.price}
- Funding Rate: ${(finalFundingRate * 100).toFixed(4)}%
- Market Regime: ${regime}

News Headlines / Social Sentiment:
${headlinesText}

Based on this qualitative and quantitative context, determine the sentiment action ('BUY', 'SELL', or 'HOLD'), a confidence score between 0.0 (no confidence) and 1.0 (maximum confidence), and a concise explanation of your reasoning.

Respond ONLY with a valid JSON object in the following format (no markdown blocks, no leading/trailing text):
{
  "action": "BUY" | "SELL" | "HOLD",
  "confidence": 0.75,
  "reasoning": "Plain English reasoning."
}
`;

      const response = await axios.post(
        this.apiUrl,
        {
          model: 'qwen-plus',
          messages: [
            { role: 'system', content: 'You are a quantitative news sentiment trading assistant.' },
            { role: 'user', content: prompt }
          ]
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000
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

      const action: 'BUY' | 'SELL' | 'HOLD' = (parsed.action === 'BUY' || parsed.action === 'SELL') ? parsed.action : 'HOLD';
      const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0.5;

      return {
        agentId: this.agentId,
        action,
        confidence,
        reasoning: parsed.reasoning || 'Successfully analyzed news sentiment.',
        timestamp
      };

    } catch (error: any) {
      return {
        agentId: this.agentId,
        action: 'HOLD',
        confidence: 0.5,
        reasoning: `NewsAgent fallback triggered due to error: ${error.message}`,
        timestamp
      };
    }
  }
}
