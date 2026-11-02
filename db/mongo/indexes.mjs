// ============================================================================
// AgentTrust: MongoDB Indexes Configuration
// Creates single and compound indexes on the interaction_logs collection
// and schema-validated log_annotations collection
// Configuration strictly read from environment variables (.env.local)
// ============================================================================

import { MongoClient } from "mongodb";

// Automatically load .env.local if present in Node 20+
try {
  process.loadEnvFile?.(".env.local");
} catch {}

const uri = process.env.MONGODB_URI;
if (!uri) {
  throw new Error("Missing required MONGODB_URI environment variable.");
}
const dbName = process.env.MONGO_DB || "agenttrust";

async function applyIndexes() {
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const db = client.db(dbName);
    const collection = db.collection("interaction_logs");

    console.log(">>> Applying indexes on collection 'interaction_logs'...");

    // 1. Unique index on interaction_id (1-to-1 linkage with PostgreSQL interactions table)
    const idx1 = await collection.createIndex({ interaction_id: 1 }, { unique: true, name: "idx_interaction_id" });
    console.log(`Created: ${idx1}`);

    // 2. Single index on agent_id (for agent-specific log retrieval)
    const idx2 = await collection.createIndex({ agent_id: 1 }, { name: "idx_agent_id" });
    console.log(`Created: ${idx2}`);

    // 3. Single descending index on timestamp (for time-series feed queries)
    const idx3 = await collection.createIndex({ timestamp: -1 }, { name: "idx_timestamp_desc" });
    console.log(`Created: ${idx3}`);

    // 4. Compound index on (agent_id, timestamp) for efficient per-agent history browsing
    const idx4 = await collection.createIndex({ agent_id: 1, timestamp: -1 }, { name: "idx_agent_timestamp" });
    console.log(`Created: ${idx4}`);

    // 5. Collection creation with JSON Schema validation for log_annotations
    console.log(">>> Ensuring 'log_annotations' collection with $jsonSchema validation...");
    const validator = {
      $jsonSchema: {
        bsonType: "object",
        required: ["annotation_id", "interaction_id", "author", "note", "created_at"],
        properties: {
          annotation_id: {
            bsonType: "string",
            description: "UUID v4 unique identifier - required string"
          },
          interaction_id: {
            bsonType: "string",
            description: "Foreign key reference to interaction - required string"
          },
          author: {
            bsonType: "string",
            description: "Username of the author - required string"
          },
          note: {
            bsonType: "string",
            minLength: 1,
            description: "Annotation content - required string with minLength 1"
          },
          created_at: {
            bsonType: "date",
            description: "Timestamp of annotation creation - required date"
          },
          updated_at: {
            bsonType: "date",
            description: "Timestamp of last update - optional date"
          }
        }
      }
    };

    const existingCollections = await db.listCollections({ name: "log_annotations" }).toArray();
    if (existingCollections.length === 0) {
      await db.createCollection("log_annotations", { validator });
      console.log("Created collection 'log_annotations' with schema validator.");
    } else {
      await db.command({ collMod: "log_annotations", validator });
      console.log("Updated schema validator on existing 'log_annotations' collection.");
    }

    const annotationsCollection = db.collection("log_annotations");
    const aidx1 = await annotationsCollection.createIndex({ annotation_id: 1 }, { unique: true, name: "idx_annotation_id" });
    console.log(`Created: ${aidx1}`);

    const aidx2 = await annotationsCollection.createIndex({ interaction_id: 1 }, { name: "idx_annotation_interaction_id" });
    console.log(`Created: ${aidx2}`);

    const aidx3 = await annotationsCollection.createIndex({ created_at: -1 }, { name: "idx_annotation_created_at_desc" });
    console.log(`Created: ${aidx3}`);

    console.log(">>> Index creation complete. Current collection indexes:");
    const indexes = await collection.indexes();
    console.log(JSON.stringify(indexes, null, 2));
    const annotationIndexes = await annotationsCollection.indexes();
    console.log(JSON.stringify(annotationIndexes, null, 2));
  } finally {
    await client.close();
  }
}

applyIndexes().catch((err) => {
  console.error("Failed to apply MongoDB indexes:", err);
  process.exit(1);
});
