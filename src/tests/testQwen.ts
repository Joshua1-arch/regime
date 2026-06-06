import dotenv from 'dotenv';
import axios from 'axios';

// Load environment variables
dotenv.config();

/**
 * Sends a text prompt to Alibaba Qwen via DashScope compatible-mode API and logs response.
 */
async function testQwen() {
  console.log('=== Testing Alibaba DashScope Qwen API ===');
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey || apiKey === 'your_dashscope_api_key_here') {
    console.error('❌ Error: DASHSCOPE_API_KEY is not configured in .env.');
    return;
  }

  // Use the OpenAI-compatible endpoint
  const url = `${process.env.DASHSCOPE_BASE_URL}/chat/completions`;
  const model = 'qwen-plus'; // Standard model

  console.log(`Sending test prompt to model "${model}"...`);

  try {
    const response = await axios.post(
      url,
      {
        model,
        messages: [
          { role: 'system', content: 'You are a helpful quantitative trading assistant.' },
          { role: 'user', content: 'Explain what a market regime is in 1 sentence.' }
        ]
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );

    const reply = response.data?.choices?.[0]?.message?.content;
    if (reply) {
      console.log(`\n✅ Success! Response:\n"${reply.trim()}"`);
    } else {
      console.log('\n❌ Success API call, but response structure is unexpected:', JSON.stringify(response.data));
    }
  } catch (error: any) {
    console.error('\n❌ Qwen Test Failed:');
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error('Data:', error.response.data);
    } else {
      console.error(error.message || error);
    }
    console.log('\nPlease verify your DASHSCOPE_API_KEY in .env.');
  }
}

testQwen();
