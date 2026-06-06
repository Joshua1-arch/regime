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
   * Executes a simulated Devnet trade by dispatching a real on-chain transfer transaction to Devnet.
   * This validates real cryptographic transaction building, signing, and RPC block broadcast.
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

    // Set up a mock destination / treasury burn address to receive a tiny amount of SOL (representing swap gas & mock value)
    const mockDestination = Keypair.generate().publicKey;
    const tradeAmountSOL = 0.005; // tiny size

    console.log(`SolanaExecutor: Preparing devnet swap transaction: ${signal.action} ${tradeAmountSOL} SOL`);

    try {
      // Create a SystemProgram transfer transaction
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: this.wallet.publicKey,
          toPubkey: mockDestination,
          lamports: tradeAmountSOL * LAMPORTS_PER_SOL,
        })
      );

      // Fetch fresh blockhash
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
          price: 135.50 // Mock swap fill price for SOL
        }
      };
    } catch (err: any) {
      console.error('❌ SolanaExecutor: Devnet transaction failed:', err.message || err);
      return { code: '500', msg: err.message || 'Transaction failed' };
    }
  }
}
