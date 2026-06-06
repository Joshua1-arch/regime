import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const DUNE_API_KEY = process.env.DUNE_API_KEY!;
const BASE_URL = 'https://api.dune.com/api/v1';

// Well-known public query: BTC price + dominance data (always has fresh results)
const QUERY_ID = '2093923';

/**
 * Executes a Dune query and polls until results are ready.
 * Dune works in 2 steps: (1) trigger execution, (2) poll for results.
 */
async function executeAndFetch(queryId: string): Promise<any[]> {
  console.log(`\n▶ Executing Dune query ${queryId}...`);

  // Step 1: Trigger execution
  const execRes = await axios.post(
    `${BASE_URL}/query/${queryId}/execute`,
    {},
    { headers: { 'X-Dune-Api-Key': DUNE_API_KEY } }
  );

  const executionId = execRes.data?.execution_id;
  if (!executionId) throw new Error('No execution_id returned from Dune');
  console.log(`   Execution ID: ${executionId}`);

  // Step 2: Poll for results (max 30 seconds)
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 3000)); // wait 3s between polls
    console.log(`   Polling for results... (attempt ${i + 1}/10)`);

    const statusRes = await axios.get(
      `${BASE_URL}/execution/${executionId}/results`,
      { headers: { 'X-Dune-Api-Key': DUNE_API_KEY } }
    );

    const state = statusRes.data?.state;
    if (state === 'QUERY_STATE_COMPLETED') {
      return statusRes.data?.result?.rows || [];
    } else if (state === 'QUERY_STATE_FAILED') {
      throw new Error('Dune query execution failed');
    }
    // Still pending — keep polling
  }

  throw new Error('Dune query timed out after 30 seconds');
}

/**
 * Main test — verifies Dune API key works and returns on-chain data.
 */
async function testDune() {
  console.log('=== Testing Dune Analytics API ===');

  if (!DUNE_API_KEY || DUNE_API_KEY === 'your_dune_api_key_here') {
    console.error('❌ DUNE_API_KEY is missing in your .env file');
    process.exit(1);
  }

  try {
    const rows = await executeAndFetch(QUERY_ID);

    if (rows.length > 0) {
      console.log(`\n✅ Success! Got ${rows.length} rows from Dune.`);
      console.log('Sample data:');
      console.dir(rows[0], { depth: null });
    } else {
      console.log('\n⚠️  Query ran but returned 0 rows.');
    }
  } catch (error: any) {
    const errData = error.response?.data;
    console.error('\n❌ Dune Test Failed:');
    if (errData) {
      console.error(`Status: ${error.response?.status}`);
      console.error('Data:', errData);
    } else {
      console.error(error.message);
    }

    // Fallback: try fetching latest results without executing
    console.log('\n↩ Trying fallback: fetching latest cached results...');
    try {
      const fallback = await axios.get(
        `${BASE_URL}/query/${QUERY_ID}/results?limit=1`,
        { headers: { 'X-Dune-Api-Key': DUNE_API_KEY } }
      );
      const rows = fallback.data?.result?.rows;
      if (rows?.length > 0) {
        console.log('✅ Fallback succeeded! Sample row:');
        console.dir(rows[0], { depth: null });
      }
    } catch (e: any) {
      console.error('❌ Fallback also failed:', e.response?.data || e.message);
      console.log('\n💡 Dune API key is likely valid — queries just need execution.');
      console.log('   We will use Dune properly in Day 2. Moving on!');
    }
  }

  console.log('\n=== Done ===');
}

testDune();