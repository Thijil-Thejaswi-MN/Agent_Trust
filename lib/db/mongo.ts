// ============================================================================
// AgentTrust: MongoDB Client Singleton
// Uses official 'mongodb' driver for raw document operations and aggregations.
// Credentials strictly read from environment variables (.env.local).
// ============================================================================

import { MongoClient, Db } from "mongodb";

const uri = process.env.MONGODB_URI || "mongodb://agenttrust_mongo:your_secure_mongo_password_here@localhost:27017/agenttrust?authSource=admin";
const dbName = process.env.MONGO_DB || "agenttrust";

interface GlobalMongo {
  _mongoClientPromise?: Promise<MongoClient>;
}

const globalWithMongo = global as typeof globalThis & GlobalMongo;

let clientPromise: Promise<MongoClient>;

if (!globalWithMongo._mongoClientPromise) {
  const client = new MongoClient(uri, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
  });
  globalWithMongo._mongoClientPromise = client.connect();
}
clientPromise = globalWithMongo._mongoClientPromise;

/**
 * Returns a connected MongoClient promise.
 */
export async function getMongoClient(): Promise<MongoClient> {
  return clientPromise;
}

/**
 * Returns the AgentTrust database instance from MongoDB.
 */
export async function getMongoDb(): Promise<Db> {
  const client = await getMongoClient();
  return client.db(dbName);
}

export default clientPromise;
