import { Connection, Keypair, LAMPORTS_PER_SOL, SystemProgram, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import dotenv from 'dotenv';
import { CentralSignal } from '../types';

dotenv.config();

export class SolanaExecutor {
  private connection: Connection;
  private wallet: Keypair;
  
  // State variables matching the Bitget executor interface
  private initialBalance: number = 0;
  private peakBalance: number = 0;
  private isHalted: boolean = false;
  
  public sessionPnl: number = 0;

  constructor() {
    // Connect to Solana Devnet RPC
    const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
    this.connection = new Connection(rpcUrl, 'confirmed');

    // Load or generate Solana Keypair
    const secretKeyStr = process.env.SOLANA_PRIVATE_KEY;
    if (secretKeyStr) {
      try {
        const secretKey = Uint8Array.from(JSON.parse(secretKeyStr));
        this.wallet = Keypair.fromSecretKey(secretKey);
        console.log(`SolanaExecutor: Loaded existing wallet with Pubkey: ${this.wallet.publicKey.toBase58()}`);
      } catch (err) {
        console.error('SolanaExecutor: Failed to parse SOLANA_PRIVATE_KEY. Generating new keypair...');
        this.wallet = Keypair.generate();
        this.logNewWallet();
      }
    } else {
      this.wallet = Keypair.generate();
      this.logNewWallet();
    }
  }

  private logNewWallet() {
    console.log(`\n======================================================================`);
    console.log(`🔑 NEW SOLANA WALLET GENERATED`);
    console.log(`Pubkey: ${this.wallet.publicKey.toBase58()}`);
    console.log(`To fund this wallet for testing, run:`);
    console.log(`solana airdrop 2 ${this.wallet.publicKey.toBase58()} --url devnet`);
    console.log(`Or set SOLANA_PRIVATE_KEY in .env as a JSON array: [${this.wallet.secretKey.toString()}]`);
    console.log(`======================================================================\n`);
  }

  /**
   * Fetches the current wallet SOL balance.
   */
  async getSolBalance(): Promise<number> {
    try {
      const balance = await this.connection.getBalance(this.wallet.publicKey);
      return balance / LAMPORTS_PER_SOL;
    } catch (error) {
      console.error('SolanaExecutor: Error fetching SOL balance:', error);
      return 0;
    }
  }

  /**
   * Circuit breaker to check SOL balance drawdown.
   */
  async checkCircuitBreaker(): Promise<boolean> {
    if (this.isHalted) return true;

    const currentBalance = await this.getSolBalance();
    if (currentBalance === 0 && this.initialBalance > 0) {
      console.warn('SolanaExecutor: Balance is 0. Airdrop may be needed.');
      return false;
    }

    if (this.initialBalance === 0 && currentBalance > 0) {
      this.initialBalance = currentBalance;
      this.peakBalance = currentBalance;
      console.log(`SolanaExecutor: Initial SOL balance established at ${currentBalance.toFixed(4)} SOL.`);
      this.sessionPnl = 0;
      return false;
    }

    if (currentBalance > this.peakBalance) {
      this.peakBalance = currentBalance;
    }

    // Since we are paying transaction fees and simulated trading costs, PnL is tracked here
    this.sessionPnl = currentBalance - this.initialBalance;

    const drawdown = (this.peakBalance - currentBalance) / this.peakBalance;
    if (drawdown > 0.05 && this.initialBalance > 0) {
      this.isHalted = true;
      console.error(`🚨 SOLANA CIRCUIT BREAKER TRIGGERED: Drawdown of ${(drawdown * 100).toFixed(2)}% exceeds the 5% threshold.`);
      return true;
    }

    return false;
  }

  /**
   * Fetches a real Jupiter V6 swap quote from mainnet routing engine.
   * The quote shows exactly which pools would be used and the expected output.
   * Note: We log this as intelligence but execute on devnet via SystemProgram transfer.
   */
  async fetchJupiterQuote(inputMint: string, outputMint: string, amount: number): Promise<any> {
    const LAMPORTS = Math.floor(amount * LAMPORTS_PER_SOL);
    const url = `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${LAMPORTS}&slippageBps=50`;
    try {
      const res = await globalThis.fetch(url);
      const json = await res.json();
      return json;
    } catch (err: any) {
      console.warn(`SolanaExecutor: Jupiter quote failed: ${err.message}`);
      return null;
    }
  }

  /**
   * Executes a simulated Devnet trade by:
   * 1. Fetching a real Jupiter V6 quote (mainnet routing intelligence)
   * 2. Dispatching a real on-chain SystemProgram transfer to Solana Devnet
   *    (validates real cryptographic transaction building, signing, and RPC broadcast)
   */
  async executeTrade(signal: CentralSignal, symbol: string = 'SOL/USDC'): Promise<any> {
    console.log(`SolanaExecutor: Evaluating signal for Solana execution...`);

    const isHalted = await this.checkCircuitBreaker();
    if (isHalted) {
      console.warn('SolanaExecutor: Execution halted by circuit breaker.');
      return null;
    }

    if (signal.action === 'HOLD') {
      console.log(`SolanaExecutor: Signal is HOLD. Skipping on-chain execution.`);
      return { status: 'skipped', reason: 'HOLD signal' };
    }

    const currentBalance = await this.getSolBalance();
    if (currentBalance < 0.015) {
      console.error(`❌ SolanaExecutor: Insufficient balance (${currentBalance} SOL) to cover rent and gas fees.`);
      return { code: '43012', msg: 'Insufficient balance (Airdrop devnet SOL)' };
    }

    // SOL mint and USDC mint addresses (mainnet)
    const SOL_MINT = 'So11111111111111111111111111111111111111112';
    const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    const inputMint = signal.action === 'BUY' ? USDC_MINT : SOL_MINT;
    const outputMint = signal.action === 'BUY' ? SOL_MINT : USDC_MINT;

    // Fetch Jupiter routing quote for intelligence
    console.log(`SolanaExecutor: 📡 Fetching Jupiter V6 quote for ${signal.action} ${symbol}...`);
    const quote = await this.fetchJupiterQuote(inputMint, outputMint, 0.005);
    if (quote && quote.outAmount) {
      const outSol = parseInt(quote.outAmount) / LAMPORTS_PER_SOL;
      const routeSteps = quote.routePlan?.length || 1;
      console.log(`SolanaExecutor: ✅ Jupiter Quote: Expected output ${outSol.toFixed(6)} | Route steps: ${routeSteps} | Price impact: ${quote.priceImpactPct || '0'}%`);
    } else {
      console.log(`SolanaExecutor: ⚠️ Jupiter quote unavailable. Proceeding with devnet simulation.`);
    }

    const tradeAmountSOL = 0.005;
    const mockDestination = Keypair.generate().publicKey;

    console.log(`SolanaExecutor: Preparing devnet swap transaction: ${signal.action} ${tradeAmountSOL} SOL`);

    try {
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: this.wallet.publicKey,
          toPubkey: mockDestination,
          lamports: tradeAmountSOL * LAMPORTS_PER_SOL,
        })
      );

      const { blockhash } = await this.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = this.wallet.publicKey;

      console.log('SolanaExecutor: Signing and broadcasting transaction to Solana Devnet...');
      const signature = await sendAndConfirmTransaction(this.connection, transaction, [this.wallet]);
      console.log(`✅ SolanaExecutor: On-chain Transaction Confirmed! Signature: ${signature}`);

      return {
        code: '00000',
        msg: 'Success',
        data: {
          orderId: signature,
          side: signal.action.toLowerCase(),
          size: tradeAmountSOL,
          jupiterQuote: quote ? { outAmount: quote.outAmount, priceImpactPct: quote.priceImpactPct, routeSteps: quote.routePlan?.length } : null
        }
      };
    } catch (err: any) {
      console.error('❌ SolanaExecutor: Devnet transaction failed:', err.message || err);
      return { code: '500', msg: err.message || 'Transaction failed' };
    }
  }
}
