// ============================================================================
// AgentTrust: Cross-Database Referential Consistency Check
// Validates that every MongoDB interaction_log document has a matching,
// valid interaction_id in the PostgreSQL relational interactions table.
// ============================================================================

import { MongoClient } from "mongodb";
import pg from "pg";

const { Pool } = pg;

const pgConfig = {
  host: process.env.POSTGRES_HOST || "localhost",
  port: parseInt(process.env.POSTGRES_PORT || "5433", 10),
  database: process.env.POSTGRES_DB || "agenttrust",
  user: process.env.POSTGRES_USER || "agenttrust_admin",
  password: process.env.POSTGRES_PASSWORD || "agenttrust_secure_password_2026",
};

const mongoUri = process.env.MONGODB_URI || "mongodb://agenttrust_mongo:agenttrust_mongo_password_2026@localhost:27017/agenttrust?authSource=admin";
const mongoDbName = process.env.MONGO_DB || "agenttrust";

async function verifyCrossDbConsistency() {
  const pgPool = new Pool(pgConfig);
  const mongoClient = new MongoClient(mongoUri);

  try {
    console.log(">>> Connecting to PostgreSQL and MongoDB...");
    await mongoClient.connect();
    const mongoDb = mongoClient.db(mongoDbName);
    const logsCol = mongoDb.collection("interaction_logs");

    // 1. Fetch all interaction IDs from PostgreSQL
    const pgRes = await pgPool.query("SELECT interaction_id FROM interactions;");
    const pgIdSet = new Set(pgRes.rows.map((r) => r.interaction_id.toLowerCase()));
    console.log(`>>> PostgreSQL interactions count: ${pgIdSet.size}`);

    // 2. Fetch all interaction IDs from MongoDB
    const mongoDocs = await logsCol.find({}, { projection: { interaction_id: 1, agent_id: 1 } }).toArray();
    console.log(`>>> MongoDB interaction_logs count: ${mongoDocs.length}`);

    // 3. Perform cross-database referential integrity check
    const orphanedLogs = [];
    for (const doc of mongoDocs) {
      if (!pgIdSet.has(doc.interaction_id.toLowerCase())) {
        orphanedLogs.push(doc.interaction_id);
      }
    }

    if (orphanedLogs.length === 0) {
      console.log(`>>> SUCCESS: Cross-DB Consistency Verified!`);
      console.log(`>>> All ${mongoDocs.length} MongoDB log documents correspond to valid PostgreSQL interactions.`);
      console.log(`>>> Orphaned Documents: 0 (100% Referential Integrity PASS)`);
    } else {
      console.error(`>>> INTEGRITY FAILURE: ${orphanedLogs.length} orphaned MongoDB logs detected:`);
      console.error(orphanedLogs);
      process.exit(1);
    }
  } finally {
    await pgPool.end();
    await mongoClient.close();
  }
}

verifyCrossDbConsistency().catch((err) => {
  console.error("Cross-DB consistency verification failed:", err);
  process.exit(1);
});
