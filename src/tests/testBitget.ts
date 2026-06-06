import dotenv from 'dotenv';
import axios from 'axios';
import * as CryptoJS from 'crypto-js';

dotenv.config();

const API_KEY = process.env.BITGET_API_KEY!;
const SECRET_KEY = process.env.BITGET_API_SECRET!;
const PASSPHRASE = process.env.BITGET_PASSPHRASE!;
const BASE_URL = 'https://api.bitget.com';

/**
 * Creates the required signature for Bitget private API calls.
 * Bitget requires: Base64(HMAC-SHA256(timestamp + method + path + body))
 */
function sign(timestamp: string, method: string, path: string, body: string = ''): string {
  const message = timestamp + method.toUpperCase() + path + body;
  const signature = CryptoJS.HmacSHA256(message, SECRET_KEY);
  return CryptoJS.enc.Base64.stringify(signature);
}

/**
 * Returns headers required for every private Bitget API request.
 */
function getPrivateHeaders(method: string, path: string, body: string = '') {
  const timestamp = Date.now().toString();
  return {
    'ACCESS-KEY': API_KEY,
    'ACCESS-SIGN': sign(timestamp, method, path, body),
    'ACCESS-TIMESTAMP': timestamp,
    'ACCESS-PASSPHRASE': PASSPHRASE,
    'Content-Type': 'application/json',
    'locale': 'en-US',
  };
}

/**
 * Test 1: Fetch BTC/USDT price — public endpoint, no auth needed.
 */
async function testPublicPrice() {
  console.log('\n📡 Test 1: Fetching BTC/USDT spot price (public)...');
  const path = '/api/v2/spot/market/tickers?symbol=BTCUSDT';
  const res = await axios.get(`${BASE_URL}${path}`);
  const ticker = res.data?.data?.[0];
  if (ticker) {
    console.log(`✅ BTC/USDT Price: $${ticker.lastPr}`);
    console.log(`   24h High: $${ticker.high24h} | 24h Low: $${ticker.low24h}`);
  } else {
    console.log('⚠️  Got response but no ticker data:', res.data);
  }
}

/**
 * Test 2: Fetch paper trading account balance — private endpoint, requires auth.
 */
async function testAccountBalance() {
  console.log('\n🔐 Test 2: Fetching paper trading account balance (private)...');
  const path = '/api/v2/spot/account/assets';
  const headers = getPrivateHeaders('GET', path);
  const res = await axios.get(`${BASE_URL}${path}`, { headers });

  if (res.data?.data?.length > 0) {
    console.log('✅ Account assets found:');
    // Only show assets with a balance > 0
    const nonZero = res.data.data.filter((a: any) => parseFloat(a.available) > 0);
    if (nonZero.length > 0) {
      nonZero.forEach((a: any) => {
        console.log(`   ${a.coin}: ${a.available} available`);
      });
    } else {
      console.log('   (No assets with balance > 0 — paper trading account may be empty)');
      console.log('   First asset returned:', res.data.data[0]);
    }
  } else {
    console.log('⚠️  Response received but no assets returned:', res.data);
  }
}

/**
 * Main runner — runs both tests and reports results.
 */
async function runTests() {
  console.log('=== Bitget API Test (axios + manual signing) ===');
  console.log(`Base URL: ${BASE_URL}`);

  // Validate env vars before making any calls
  if (!API_KEY || API_KEY === 'your_bitget_api_key_here') {
    console.error('❌ BITGET_API_KEY is missing in your .env file');
    process.exit(1);
  }
  if (!SECRET_KEY || SECRET_KEY === 'your_bitget_api_secret_here') {
    console.error('❌ BITGET_API_SECRET is missing in your .env file');
    process.exit(1);
  }
  if (!PASSPHRASE || PASSPHRASE === 'your_bitget_passphrase_here') {
    console.error('❌ BITGET_PASSPHRASE is missing in your .env file');
    process.exit(1);
  }

  try {
    await testPublicPrice();
  } catch (e: any) {
    console.error('❌ Public price test failed:', e.response?.data || e.message);
  }

  try {
    await testAccountBalance();
  } catch (e: any) {
    const errData = e.response?.data;
    console.error('❌ Account balance test failed:');
    if (errData?.code === '40001') {
      console.error('   Invalid API key — double check BITGET_API_KEY in .env');
    } else if (errData?.code === '40003') {
      console.error('   Wrong passphrase — double check BITGET_PASSPHRASE in .env');
    } else if (errData?.code === '40005') {
      console.error('   Invalid signature — double check BITGET_API_SECRET in .env');
    } else {
      console.error('  ', errData || e.message);
    }
  }

  console.log('\n=== Done ===');
}

runTests();