"use client";

import { motion } from "framer-motion";

// SVGs for the how-it-works icons
const SearchIcon = () => (
  <svg className="w-6 h-6 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
  </svg>
);

const ChartBarIcon = () => (
  <svg className="w-6 h-6 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  </svg>
);

const AdjustmentsIcon = () => (
  <svg className="w-6 h-6 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
  </svg>
);

const LightningBoltIcon = () => (
  <svg className="w-6 h-6 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
  </svg>
);

// SVGs for Tech Stack logos
const TechLogo = ({ name, subtitle }: { name: string; subtitle: string }) => (
  <div className="flex flex-col items-center justify-center p-4 bg-slate-900/50 border border-slate-800 rounded-xl hover:border-blue-500/50 transition-colors">
    <span className="font-mono text-sm font-bold text-slate-100 tracking-wider uppercase">{name}</span>
    <span className="text-[10px] text-slate-500 font-semibold mt-1 uppercase tracking-widest">{subtitle}</span>
  </div>
);

export default function Home() {
  const dashboardUrl = process.env.NEXT_PUBLIC_DASHBOARD_URL || "http://localhost:3000";

  const scrollToDashboard = () => {
    const el = document.getElementById("dashboard");
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-[#0a0f1e] overflow-x-hidden">
      
      {/* Background gradients */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[600px] pointer-events-none overflow-hidden opacity-30">
        <div className="absolute top-[-200px] left-[20%] w-[600px] h-[600px] rounded-full bg-blue-600/30 blur-[120px]" />
        <div className="absolute top-[-100px] right-[20%] w-[500px] h-[500px] rounded-full bg-indigo-600/20 blur-[100px]" />
      </div>

      {/* Navigation Bar */}
      <nav className="sticky top-0 z-50 backdrop-blur-md bg-[#0a0f1e]/80 border-b border-slate-900 py-4 px-6 md:px-12 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="w-3.5 h-3.5 rounded-full bg-blue-500 animate-pulse shadow-[0_0_8px_rgba(59,130,246,0.8)]" />
          <span className="font-bold text-sm tracking-wider uppercase text-slate-200">REGIME SYSTEM</span>
        </div>
        <div className="hidden md:flex items-center gap-8 text-xs font-semibold tracking-wider text-slate-400 uppercase">
          <a href="#how-it-works" className="hover:text-slate-100 transition-colors">How it works</a>
          <a href="#agents" className="hover:text-slate-100 transition-colors">Specialist Agents</a>
          <a href="#tech-stack" className="hover:text-slate-100 transition-colors">Tech Stack</a>
          <a href="#dashboard" className="hover:text-slate-100 transition-colors">Live Dashboard</a>
        </div>
        <div>
          <button 
            onClick={scrollToDashboard}
            className="text-xs font-bold uppercase tracking-wider bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-lg transition-all shadow-md shadow-blue-600/20"
          >
            Monitor Live Feed
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative px-6 py-24 md:py-32 flex flex-col items-center text-center max-w-4xl mx-auto z-10">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-blue-950/40 border border-blue-900/60 rounded-full text-[11px] font-bold tracking-wider text-blue-400 uppercase mb-8"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
          Bitget AI × Crypto Hackathon — Track 1 Entry
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="text-4xl md:text-6xl font-extrabold tracking-tight text-white leading-[1.1] mb-6"
        >
          The First <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-blue-500 to-indigo-400">Regime-Aware</span> AI Trading System
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="text-base md:text-lg text-slate-400 max-w-2xl leading-relaxed mb-10"
        >
          An autonomous multi-agent portfolio management system that detects crypto market regime shifts using Alibaba Qwen AI and executes risk-adjusted trading on Bitget.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="flex flex-col sm:flex-row gap-4"
        >
          <button 
            onClick={scrollToDashboard}
            className="text-sm font-bold uppercase tracking-wider bg-white hover:bg-slate-100 text-[#0a0f1e] px-8 py-3.5 rounded-xl transition-all shadow-lg shadow-white/5"
          >
            View Live Dashboard
          </button>
          <a
            href="#"
            className="text-sm font-bold uppercase tracking-wider bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 hover:border-slate-700 px-8 py-3.5 rounded-xl transition-all"
          >
            View on GitHub
          </a>
        </motion.div>
      </section>

      {/* How it Works Section */}
      <section id="how-it-works" className="px-6 py-20 bg-slate-950/40 border-y border-slate-900/60 z-10">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-white mb-3">Modular Execution Flow</h2>
            <p className="text-sm text-slate-500 max-w-md mx-auto">A 5-minute autonomous pipeline translating data variables to real order fills.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            
            <div className="flex flex-col gap-4 p-6 bg-[#0c1328]/60 border border-slate-900 rounded-2xl relative">
              <div className="w-12 h-12 rounded-xl bg-blue-950/40 border border-blue-900/50 flex items-center justify-center">
                <SearchIcon />
              </div>
              <h3 className="font-bold text-slate-200">1. Detect Market Mood</h3>
              <p className="text-xs text-slate-400 leading-relaxed">Fetches spot candles, funding rates, and Dune on-chain metrics. Inputs data to Qwen LLM for market regime classification.</p>
            </div>

            <div className="flex flex-col gap-4 p-6 bg-[#0c1328]/60 border border-slate-900 rounded-2xl">
              <div className="w-12 h-12 rounded-xl bg-blue-950/40 border border-blue-900/50 flex items-center justify-center">
                <AdjustmentsIcon />
              </div>
              <h3 className="font-bold text-slate-200">2. Assign Agent Weights</h3>
              <p className="text-xs text-slate-400 leading-relaxed">Dynamically shifts capital allocation weights among specialist agents based on Qwen's regime output.</p>
            </div>

            <div className="flex flex-col gap-4 p-6 bg-[#0c1328]/60 border border-slate-900 rounded-2xl">
              <div className="w-12 h-12 rounded-xl bg-blue-950/40 border border-blue-900/50 flex items-center justify-center">
                <ChartBarIcon />
              </div>
              <h3 className="font-bold text-slate-200">3. Combine Signals</h3>
              <p className="text-xs text-slate-400 leading-relaxed">Blends specialist BUY/SELL/HOLD recommendations into a single weighted Central Signal.</p>
            </div>

            <div className="flex flex-col gap-4 p-6 bg-[#0c1328]/60 border border-slate-900 rounded-2xl">
              <div className="w-12 h-12 rounded-xl bg-blue-950/40 border border-blue-900/50 flex items-center justify-center">
                <LightningBoltIcon />
              </div>
              <h3 className="font-bold text-slate-200">4. Execute Trade</h3>
              <p className="text-xs text-slate-400 leading-relaxed">Dispatches HMAC-signed spot market orders directly to Bitget, monitored by a 5% session drawdown circuit breaker.</p>
            </div>

          </div>
        </div>
      </section>

      {/* Specialist Agents Section */}
      <section id="agents" className="px-6 py-20 z-10">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-white mb-3">Specialist Trading Agents</h2>
            <p className="text-sm text-slate-500 max-w-md mx-auto">Four independent strategies activated dynamically depending on market volatility.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            
            <div className="p-8 bg-[#0c1328]/60 border border-slate-900 rounded-2xl flex flex-col gap-3 hover:border-slate-800 transition-colors">
              <div className="flex justify-between items-center">
                <span className="font-bold text-slate-100 text-lg">Trend Follower Agent</span>
                <span className="text-[10px] font-bold tracking-wider uppercase text-blue-400 bg-blue-950/40 px-2.5 py-1 rounded-md border border-blue-900/60">EMA Crossover</span>
              </div>
              <p className="text-sm text-slate-400 leading-relaxed">
                Calculates short-term EMA 20 and long-term EMA 50 to capture directional extensions. Triggers BUY when EMA20 crosses above EMA50, and SELL when below. Receives peak capital allocation in trending markets.
              </p>
            </div>

            <div className="p-8 bg-[#0c1328]/60 border border-slate-900 rounded-2xl flex flex-col gap-3 hover:border-slate-800 transition-colors">
              <div className="flex justify-between items-center">
                <span className="font-bold text-slate-100 text-lg">Mean Reversion Agent</span>
                <span className="text-[10px] font-bold tracking-wider uppercase text-blue-400 bg-blue-950/40 px-2.5 py-1 rounded-md border border-blue-900/60">RSI Oscillator</span>
              </div>
              <p className="text-sm text-slate-400 leading-relaxed">
                Computes Wilder's RSI-14 over candle close intervals. Generates counter-trend BUY orders during oversold extremes (&lt; 30) and SELL orders during overbought extremes (&gt; 70). Receives primary allocation in sideways ranges.
              </p>
            </div>

            <div className="p-8 bg-[#0c1328]/60 border border-slate-900 rounded-2xl flex flex-col gap-3 hover:border-slate-800 transition-colors">
              <div className="flex justify-between items-center">
                <span className="font-bold text-slate-100 text-lg">Momentum Agent</span>
                <span className="text-[10px] font-bold tracking-wider uppercase text-blue-400 bg-blue-950/40 px-2.5 py-1 rounded-md border border-blue-900/60">Volume Z-score</span>
              </div>
              <p className="text-sm text-slate-400 leading-relaxed">
                Measures trading volume spikes using standard deviation Z-scores over a 24-candle window. Triggers BUY on volume breakouts with positive price velocity, and SELL on volume breakouts with falling prices.
              </p>
            </div>

            <div className="p-8 bg-[#0c1328]/60 border border-slate-900 rounded-2xl flex flex-col gap-3 hover:border-slate-800 transition-colors">
              <div className="flex justify-between items-center">
                <span className="font-bold text-slate-100 text-lg">News Sentiment Agent</span>
                <span className="text-[10px] font-bold tracking-wider uppercase text-blue-400 bg-blue-950/40 px-2.5 py-1 rounded-md border border-blue-900/60">Qwen LLM Semantic</span>
              </div>
              <p className="text-sm text-slate-400 leading-relaxed">
                Applies qualitative analysis of current media articles, news, and social headlines using LLM semantic parsing to alignment trade setups with fundamental market macro catalysts.
              </p>
            </div>

          </div>
        </div>
      </section>

      {/* Tech Stack Section */}
      <section id="tech-stack" className="px-6 py-20 bg-slate-950/40 border-y border-slate-900/60 z-10">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-white mb-3">Enterprise Tech Stack</h2>
            <p className="text-sm text-slate-500 max-w-md mx-auto">Engineered using robust financial API endpoints and AI frameworks.</p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <TechLogo name="Bitget" subtitle="REST Private API" />
            <TechLogo name="Qwen AI" subtitle="Alibaba DashScope" />
            <TechLogo name="Dune Analytics" subtitle="Query Engine" />
            <TechLogo name="Solana" subtitle="Future Execution" />
            <TechLogo name="Node.js & TS" subtitle="Backend Runtime" />
          </div>
        </div>
      </section>

      {/* Embedded Live Dashboard Feed Section */}
      <section id="dashboard" className="px-6 py-20 max-w-6xl mx-auto z-10 w-full">
        <div className="text-center mb-12">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-white mb-3">Live System Feed</h2>
          <p className="text-sm text-slate-500 max-w-md mx-auto">Direct iframe viewing of the local portfolio dashboard server running on port 3000.</p>
        </div>

        {/* Dashboard Shell Mockup */}
        <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl shadow-blue-500/5">
          <div className="bg-slate-900 border-b border-slate-800 px-6 py-3.5 flex items-center justify-between">
            <div className="flex gap-2">
              <span className="w-3 h-3 rounded-full bg-rose-500" />
              <span className="w-3 h-3 rounded-full bg-amber-500" />
              <span className="w-3 h-3 rounded-full bg-emerald-500" />
            </div>
            <span className="text-[11px] font-mono text-slate-500 font-bold tracking-wider">{dashboardUrl}</span>
            <div className="w-12" />
          </div>
          
          <div className="relative w-full h-[620px] bg-[#090d16]">
            <iframe 
              src={dashboardUrl} 
              className="w-full h-full border-none"
              title="Live Trading System Dashboard"
            />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto py-12 px-6 border-t border-slate-900 bg-slate-950/20 text-center z-10">
        <p className="text-xs text-slate-600 font-semibold tracking-wider uppercase">
          Developed for the Bitget AI × Crypto Hackathon • Track 1 Entry
        </p>
      </footer>

    </div>
  );
}
