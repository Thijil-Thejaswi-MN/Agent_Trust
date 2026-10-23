// ============================================================================
// AgentTrust: Cross-Database Referential Consistency Check
// Validates:
// 1. Every MongoDB interaction_log has a matching PostgreSQL interaction.
// 2. Every PostgreSQL interaction has a matching MongoDB interaction_log.
// 3. For each document, log.agent_id equals interaction.source_agent_id.
// Configuration strictly read from environment variables (.env.local)
// ============================================================================

import { MongoClient } from "mongodb";
import pg from "pg";

const { Pool } = pg;

// Automatically load .env.local if present in Node 20+
try {
  process.loadEnvFile?.(".env.local");
} catch {}

const pgPassword = process.env.POSTGRES_PASSWORD;
if (!pgPassword) {
  throw new Error("Missing required POSTGRES_PASSWORD environment variable.");
}

const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) {
  throw new Error("Missing required MONGODB_URI environment variable.");
}

const pgConfig = {
  host: process.env.POSTGRES_HOST || "localhost",
  port: parseInt(process.env.POSTGRES_PORT || "5433", 10),
  database: process.env.POSTGRES_DB || "agenttrust",
  user: process.env.POSTGRES_USER || "agenttrust_admin",
  password: pgPassword,
};

const mongoDbName = process.env.MONGO_DB || "agenttrust";

async function verifyCrossDbConsistency() {
  const pgPool = new Pool(pgConfig);
  const mongoClient = new MongoClient(mongoUri);

  try {
    console.log(">>> Connecting to PostgreSQL and MongoDB using environment configuration...");
    await mongoClient.connect();
    const mongoDb = mongoClient.db(mongoDbName);
    const logsCol = mongoDb.collection("interaction_logs");

    // 1. Fetch all interactions from PostgreSQL (id + source_agent_id)
    const pgRes = await pgPool.query("SELECT interaction_id, source_agent_id FROM interactions;");
    const pgMap = new Map();
    for (const r of pgRes.rows) {
      pgMap.set(r.interaction_id.toLowerCase(), r.source_agent_id.toLowerCase());
    }
    console.log(`>>> PostgreSQL total interactions: ${pgMap.size}`);

    // 2. Fetch all interaction logs from MongoDB
    const mongoDocs = await logsCol.find({}, { projection: { interaction_id: 1, agent_id: 1 } }).toArray();
    const mongoMap = new Map();
    for (const d of mongoDocs) {
      mongoMap.set(d.interaction_id.toLowerCase(), d.agent_id.toLowerCase());
    }
    console.log(`>>> MongoDB total interaction_logs: ${mongoMap.size}`);

    let errorsFound = 0;

    // 3. Check: Every MongoDB log has a valid PostgreSQL interaction
    for (const [mId, mAgentId] of mongoMap.entries()) {
      if (!pgMap.has(mId)) {
        console.error(`[ERROR] Orphaned MongoDB log: interaction_id ${mId} does not exist in PostgreSQL`);
        errorsFound++;
      }
    }

    // 4. Check: Every PostgreSQL interaction has a matching MongoDB log
    for (const [pgId, pgSourceId] of pgMap.entries()) {
      if (!mongoMap.has(pgId)) {
        console.error(`[ERROR] Missing MongoDB log for PostgreSQL interaction_id ${pgId}`);
        errorsFound++;
      }
    }

    // 5. Check: log.agent_id equals interaction.source_agent_id for every interaction
    for (const [id, pgSourceId] of pgMap.entries()) {
      const mAgentId = mongoMap.get(id);
      if (mAgentId && mAgentId !== pgSourceId) {
        console.error(`[MISMATCH] Agent ID discrepancy on interaction ${id}: PG source_agent_id=${pgSourceId} vs Mongo agent_id=${mAgentId}`);
        errorsFound++;
      }
    }

    if (errorsFound === 0) {
      console.log(`\n============================================================`);
      console.log(`>>> BIDIRECTIONAL CROSS-DB CONSISTENCY: 100% PASS`);
      console.log(`>>> 1. Mongo -> PG mapping: All ${mongoMap.size} documents exist in PG`);
      console.log(`>>> 2. PG -> Mongo mapping: All ${pgMap.size} interactions exist in Mongo`);
      console.log(`>>> 3. Agent identity alignment: 100% matched (log.agent_id === interaction.source_agent_id)`);
      console.log(`============================================================\n`);
    } else {
      console.error(`>>> CONSISTENCY CHECK FAILED with ${errorsFound} errors.`);
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
