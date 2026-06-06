import fs from 'fs';
import path from 'path';
import { MongoClient, Db } from 'mongodb';

import { DashboardState } from './dashboard';

export class StorageManager {
  private mongoClient: MongoClient | null = null;
  private db: Db | null = null;
  private localFilePath = path.join(process.cwd(), 'state.json');
  private useMongo = false;

  constructor() {
    const mongoUri = process.env.MONGODB_URI;
    if (mongoUri) {
      console.log('📡 MONGODB_URI detected. Initializing cloud storage connection...');
      this.mongoClient = new MongoClient(mongoUri);
      this.useMongo = true;
    } else {
      console.log('💾 MONGODB_URI not set. Falling back to local state.json storage...');
    }
  }

  async connect(): Promise<void> {
    if (this.useMongo && this.mongoClient) {
      try {
        await this.mongoClient.connect();
        this.db = this.mongoClient.db('regime_trading');
        console.log('✅ Connected successfully to MongoDB Cloud Atlas.');
      } catch (err: any) {
        console.error('❌ Failed to connect to MongoDB, falling back to local file storage:', err.message);
        this.useMongo = false;
      }
    }
  }

  async saveState(state: DashboardState): Promise<void> {
    if (this.useMongo && this.db) {
      try {
        const collection = this.db.collection('dashboard_state');
        await collection.updateOne(
          { _id: 'latest' as any },
          { $set: state },
          { upsert: true }
        );
      } catch (err: any) {
        console.error('❌ Error saving state to MongoDB Atlas:', err.message);
        this.saveStateLocal(state);
      }
    } else {
      this.saveStateLocal(state);
    }
  }

  private saveStateLocal(state: DashboardState): void {
    try {
      fs.writeFileSync(this.localFilePath, JSON.stringify(state, null, 2), 'utf-8');
    } catch (err: any) {
      console.error('❌ Error writing local state.json:', err.message);
    }
  }

  async loadState(): Promise<DashboardState | null> {
    if (this.useMongo && this.db) {
      try {
        const collection = this.db.collection('dashboard_state');
        const doc = await collection.findOne({ _id: 'latest' as any });
        if (doc) {
          const { _id, ...rest } = doc;
          return rest as any;
        }
      } catch (err: any) {
        console.error('❌ Error reading state from MongoDB Atlas:', err.message);
      }
    }

    return this.loadStateLocal();
  }

  private loadStateLocal(): DashboardState | null {
    try {
      if (fs.existsSync(this.localFilePath)) {
        const data = fs.readFileSync(this.localFilePath, 'utf-8');
        return JSON.parse(data) as DashboardState;
      }
    } catch (err: any) {
      console.error('❌ Error reading local state.json:', err.message);
    }
    return null;
  }
}
