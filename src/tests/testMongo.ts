import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

async function testConnection() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('❌ MONGODB_URI is not set in your .env file!');
    process.exit(1);
  }

  console.log('📡 Attempting to connect to MongoDB with URI:', uri);
  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log('✅ Connection successful!');
    
    const db = client.db('regime_trading');
    const collections = await db.listCollections().toArray();
    console.log('📂 Databases/Collections found:', collections.map(c => c.name));
    
    // Check if there is already a saved state
    const collection = db.collection('dashboard_state');
    const doc = await collection.findOne({ _id: 'latest' as any });
    if (doc) {
      console.log('📥 Found existing dashboard state in database:', JSON.stringify(doc, null, 2).substring(0, 300) + '...');
    } else {
      console.log('ℹ️ No existing dashboard state found in "dashboard_state" collection yet.');
    }

    // Check if there is already a saved bandit performance
    const banditCol = db.collection('bandit_performance');
    const banditDoc = await banditCol.findOne({ _id: 'latest' as any });
    if (banditDoc) {
      console.log('📥 Found existing bandit performance in database (Rounds: ' + banditDoc.totalRounds + ')');
    } else {
      console.log('ℹ️ No existing bandit performance found in "bandit_performance" collection yet.');
    }
  } catch (error: any) {
    console.error('❌ MongoDB Connection failed:', error.message || error);
  } finally {
    await client.close();
  }
}

testConnection();
