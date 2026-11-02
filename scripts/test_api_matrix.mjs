// ============================================================================
// AgentTrust: Phase 4 API Layer Comprehensive Verification Matrix
// Strict Cookie-Only, Concurrency, RBAC, Stored Functions, Anomaly Detection & CSRF
// ============================================================================

const BASE_URL = "http://localhost:3000";

let adminCookie = "";
let auditorCookie = "";

// Helper to extract cookie from Set-Cookie header
function extractTokenCookie(res) {
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) return "";
  const match = setCookie.match(/agenttrust_token=[^;]+/);
  return match ? match[0] : "";
}

async function runTests() {
  console.log("================================================================================");
  console.log("AGENTTRUST PHASE 4: REVISED COOKIE-ONLY FULL VERIFICATION MATRIX");
  console.log("================================================================================\n");

  let passes = 0;
  let fails = 0;

  function assert(title, condition, extra = "") {
    if (condition) {
      console.log(`[PASS] ${title}`);
      passes++;
    } else {
      console.error(`[FAIL] ${title} - ${extra}`);
      fails++;
    }
  }

  // ----------------------------------------------------------------------------
  // SECTION 1: Unauthenticated Endpoint Gating
  // ----------------------------------------------------------------------------
  console.log("--- SECTION 1: Unauthenticated Endpoint Gating (401 Gating) ---");
  const unauthEndpoints = [
    "/api/agents",
    "/api/policies",
    "/api/interactions",
    "/api/violations",
    "/api/quarantine",
    "/api/logs",
    "/api/logs/anomalies",
    "/api/logs/annotations",
    "/api/agents/blast-radius?agent_id=b0000000-0000-0000-0000-000000000001",
    "/api/stats"
  ];

  for (const ep of unauthEndpoints) {
    const res = await fetch(`${BASE_URL}${ep}`);
    assert(`Unauthenticated GET ${ep} returns 401`, res.status === 401, `Status: ${res.status}`);
  }

  const unauthReviewRes = await fetch(`${BASE_URL}/api/logs/review`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ interaction_id: "test", status: "approved" })
  });
  assert("Unauthenticated PATCH /api/logs/review returns 401", unauthReviewRes.status === 401, `Status: ${unauthReviewRes.status}`);

  // ----------------------------------------------------------------------------
  // SECTION 2: Authentication & Cookie-Only Issuance
  // ----------------------------------------------------------------------------
  console.log("\n--- SECTION 2: Authentication & Strict Cookie-Only Storage ---");
  // Bad login
  const badRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "wrong_password_xyz" })
  });
  const badData = await badRes.json();
  assert("Bad credentials return 401 Unauthorized", badRes.status === 401, `Status: ${badRes.status}`);
  assert("Generic error message returned (no user enumeration)", badData.error === "Invalid username or password", badData.error);

  // Auditor login
  const auditorRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "auditor", password: "auditor123" })
  });
  const auditorData = await auditorRes.json();
  assert("Auditor login returns 200 OK", auditorRes.status === 200, `Status: ${auditorRes.status}`);
  assert("Auditor response body has NO token field (Strict Cookie-Only)", auditorData.token === undefined);
  assert("Auditor payload contains role 'auditor'", auditorData.user?.role === "auditor");
  auditorCookie = extractTokenCookie(auditorRes);
  assert("Auditor Set-Cookie contains agenttrust_token", auditorCookie.startsWith("agenttrust_token="));

  // Admin login
  const adminRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "admin123" })
  });
  const adminData = await adminRes.json();
  assert("Admin login returns 200 OK", adminRes.status === 200, `Status: ${adminRes.status}`);
  assert("Admin response body has NO token field (Strict Cookie-Only)", adminData.token === undefined);
  assert("Admin payload contains role 'admin'", adminData.user?.role === "admin");
  adminCookie = extractTokenCookie(adminRes);
  assert("Admin Set-Cookie contains agenttrust_token", adminCookie.startsWith("agenttrust_token="));

  // Verify Bearer tokens are REJECTED (Cookie-only enforcement)
  const fakeBearerRes = await fetch(`${BASE_URL}/api/agents`, {
    headers: { Authorization: "Bearer some_dummy_token_value" }
  });
  assert("Bearer token is rejected with 401 (Cookie-only enforcement)", fakeBearerRes.status === 401, `Status: ${fakeBearerRes.status}`);

  // ----------------------------------------------------------------------------
  // SECTION 3: RBAC Enforcement (Auditor Read vs Write Access)
  // ----------------------------------------------------------------------------
  console.log("\n--- SECTION 3: RBAC Enforcement ---");
  // Auditor can read agents
  const audAgentsRes = await fetch(`${BASE_URL}/api/agents`, {
    headers: { Cookie: auditorCookie }
  });
  const audAgentsData = await audAgentsRes.json();
  assert("Auditor can read /api/agents via Cookie (200 OK)", audAgentsRes.status === 200 && Array.isArray(audAgentsData.agents));

  // Auditor can read aggregated stats (/api/stats: GROUP BY, HAVING, subqueries, aggregates)
  const audStatsRes = await fetch(`${BASE_URL}/api/stats`, {
    headers: { Cookie: auditorCookie }
  });
  const audStatsData = await audStatsRes.json();
  assert("Auditor can read /api/stats via Cookie (200 OK)", audStatsRes.status === 200, `Status: ${audStatsRes.status}`);
  assert("Stats endpoint executes GROUP BY ... HAVING on protocol analytics", Array.isArray(audStatsData.protocol_analytics) && audStatsData.protocol_analytics.length > 0);
  assert("Stats endpoint executes subquery for uncontained violations", typeof audStatsData.uncontained_violations === "number");

  // Auditor cannot create agents (403 Forbidden)
  const audAgentCreateRes = await fetch(`${BASE_URL}/api/agents`, {
    method: "POST",
    headers: {
      Cookie: auditorCookie,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ name: "Rogue-Agent", agent_type: "Security", owner_team: "SecOps", cert_fingerprint: "SHA256:FAKE" })
  });
  assert("Auditor POST /api/agents is 403 Forbidden", audAgentCreateRes.status === 403, `Status: ${audAgentCreateRes.status}`);

  // Auditor cannot create policies (403 Forbidden)
  const audPolicyCreateRes = await fetch(`${BASE_URL}/api/policies`, {
    method: "POST",
    headers: {
      Cookie: auditorCookie,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      name: "Test Policy",
      rule_type: "latency_sla",
      threshold: 100
    })
  });
  assert("Auditor POST /api/policies is 403 Forbidden", audPolicyCreateRes.status === 403, `Status: ${audPolicyCreateRes.status}`);

  // Auditor cannot perform quarantine action (403 Forbidden)
  const audQuarantineRes = await fetch(`${BASE_URL}/api/quarantine/action`, {
    method: "POST",
    headers: {
      Cookie: auditorCookie,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      agent_id: "00000000-0000-0000-0000-000000000001",
      action: "quarantine"
    })
  });
  assert("Auditor POST /api/quarantine/action is 403 Forbidden", audQuarantineRes.status === 403, `Status: ${audQuarantineRes.status}`);

  // Auditor cannot invoke POST /api/risk/compute (403 Forbidden)
  const audRiskRes = await fetch(`${BASE_URL}/api/risk/compute`, {
    method: "POST",
    headers: {
      Cookie: auditorCookie,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ agent_id: audAgentsData.agents[0].agent_id })
  });
  assert("Auditor POST /api/risk/compute is 403 Forbidden (Admin only)", audRiskRes.status === 403, `Status: ${audRiskRes.status}`);

  // ----------------------------------------------------------------------------
  // SECTION 4: Admin Transactions, Quarantine Flow & Concurrency
  // ----------------------------------------------------------------------------
  console.log("\n--- SECTION 4: Admin Transactions & Concurrency (SELECT ... FOR UPDATE) ---");
  
  // Find an active agent for quarantine test
  const testAgent = audAgentsData.agents.find((a) => a.status === "active");
  assert("Found an active agent for quarantine test", !!testAgent, `Agent: ${testAgent?.name}`);

  if (testAgent) {
    // Concurrency Test: Fire two simultaneous quarantine requests for the same agent
    console.log("Firing 2 simultaneous quarantine requests for same agent...");
    const [p1, p2] = await Promise.all([
      fetch(`${BASE_URL}/api/quarantine/action`, {
        method: "POST",
        headers: { Cookie: adminCookie, "Content-Type": "application/json" },
        body: JSON.stringify({ agent_id: testAgent.agent_id, action: "quarantine" })
      }),
      fetch(`${BASE_URL}/api/quarantine/action`, {
        method: "POST",
        headers: { Cookie: adminCookie, "Content-Type": "application/json" },
        body: JSON.stringify({ agent_id: testAgent.agent_id, action: "quarantine" })
      })
    ]);

    const statuses = [p1.status, p2.status].sort();
    assert("Concurrent quarantine: Exactly one 200 OK and one 409 Conflict", statuses[0] === 200 && statuses[1] === 409, `Statuses: ${statuses.join(", ")}`);

    // Release agent back to active
    const relRes = await fetch(`${BASE_URL}/api/quarantine/action`, {
      method: "POST",
      headers: { Cookie: adminCookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        agent_id: testAgent.agent_id,
        action: "release",
        reason: "Concurrency test cleanup"
      })
    });
    const relData = await relRes.json();
    assert("Admin can release agent from quarantine (200 OK)", relRes.status === 200, `Status: ${relRes.status}`);
    assert("Quarantine event status updated to released", relData.quarantine_event?.status === "released");
  }

  // ----------------------------------------------------------------------------
  // SECTION 5: Stored Function Execution (compute_risk_score - Admin only)
  // ----------------------------------------------------------------------------
  console.log("\n--- SECTION 5: Stored Function (compute_risk_score) ---");
  const riskRes = await fetch(`${BASE_URL}/api/risk/compute`, {
    method: "POST",
    headers: {
      Cookie: adminCookie,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ agent_id: audAgentsData.agents[0].agent_id })
  });
  const riskData = await riskRes.json();
  assert("Admin POST /api/risk/compute successfully executes (200 OK)", riskRes.status === 200, `Status: ${riskRes.status}`);
  assert("Risk score value is a valid numeric score (0-100)", typeof riskData.computed_score === "number" && riskData.computed_score >= 0 && riskData.computed_score <= 100, `Score: ${riskData.computed_score}`);

  // ----------------------------------------------------------------------------
  // SECTION 6: Defensive Controls: Malformed JSON, Bad UUID, Origin & SQLi
  // ----------------------------------------------------------------------------
  console.log("\n--- SECTION 6: Defensive Controls & Error Hygiene ---");
  // 1. Parameterized SQL injection defense
  const sqliRes = await fetch(`${BASE_URL}/api/agents?search=%27%20OR%201=1%20--`, {
    headers: { Cookie: adminCookie }
  });
  const sqliData = await sqliRes.json();
  assert("SQL injection payload safely handled (200 OK, 0 matched rows)", sqliRes.status === 200 && sqliData.agents.length === 0, `Rows returned: ${sqliData.agents?.length}`);

  // 2. Malformed JSON returns 400 with no stack trace
  const malformedRes = await fetch(`${BASE_URL}/api/quarantine/action`, {
    method: "POST",
    headers: { Cookie: adminCookie, "Content-Type": "application/json" },
    body: "{\"agent_id\": " // Broken JSON
  });
  const malformedText = await malformedRes.text();
  assert("Malformed JSON returns 400 Bad Request", malformedRes.status === 400, `Status: ${malformedRes.status}`);
  assert("No stack trace or internal SQL in malformed response", !malformedText.includes("at ") && !malformedText.includes("SELECT") && !malformedText.includes("node_modules"), malformedText);

  // 3. Invalid UUID returns 400 with clean error
  const invalidUuidRes = await fetch(`${BASE_URL}/api/quarantine/action`, {
    method: "POST",
    headers: { Cookie: adminCookie, "Content-Type": "application/json" },
    body: JSON.stringify({ agent_id: "not-a-valid-uuid-1234", action: "quarantine" })
  });
  const invalidUuidText = await invalidUuidRes.text();
  assert("Invalid UUID returns 400 Bad Request", invalidUuidRes.status === 400, `Status: ${invalidUuidRes.status}`);
  assert("No stack trace in invalid UUID response", !invalidUuidText.includes("at ") && !invalidUuidText.includes("syntax error"), invalidUuidText);

  // 4. Cross-Origin Mutating Request Rejection (Origin check)
  const csrfRes = await fetch(`${BASE_URL}/api/quarantine/action`, {
    method: "POST",
    headers: {
      Cookie: adminCookie,
      "Content-Type": "application/json",
      Origin: "http://malicious-cross-origin.com"
    },
    body: JSON.stringify({ agent_id: testAgent.agent_id, action: "quarantine" })
  });
  assert("Cross-origin mutating POST rejected (403 Forbidden)", csrfRes.status === 403, `Status: ${csrfRes.status}`);

  // ----------------------------------------------------------------------------
  // SECTION 7: MongoDB Unstructured Logs & Anomaly Aggregation
  // ----------------------------------------------------------------------------
  console.log("\n--- SECTION 7: MongoDB Logs & Aggregation Pipeline ---");
  const logsRes = await fetch(`${BASE_URL}/api/logs?limit=5`, {
    headers: { Cookie: auditorCookie }
  });
  const logsData = await logsRes.json();
  assert("Auditor can fetch MongoDB logs via Cookie (200 OK)", logsRes.status === 200 && logsData.logs.length === 5);
  assert("Logs contain polymorphic raw_payload and headers", !!logsData.logs[0].raw_payload && !!logsData.logs[0].headers);

  const anomalyRes = await fetch(`${BASE_URL}/api/logs/anomalies`, {
    headers: { Cookie: auditorCookie }
  });
  const anomalyData = await anomalyRes.json();
  assert("Auditor can run MongoDB anomaly aggregation (200 OK)", anomalyRes.status === 200 && Array.isArray(anomalyData.anomalies));
  const topAnomaly = anomalyData.anomalies[0];
  assert("Top anomalous agent correctly detected as 'Theta-Threat-Scanner' (score: 150)", topAnomaly?.agent_name === "Theta-Threat-Scanner" && topAnomaly?.computed_anomaly_score === 150, `Agent: ${topAnomaly?.agent_name}, Score: ${topAnomaly?.computed_anomaly_score}`);

  // ----------------------------------------------------------------------------
  // SECTION 7.5: MongoDB RUD & Schema Validation (NoSQL Feature)
  // ----------------------------------------------------------------------------
  console.log("\n--- SECTION 7.5: MongoDB RUD & Schema Validation ---");
  const sampleInteractionId = logsData.logs[0].interaction_id;

  // A. PATCH /api/logs/review RBAC
  const reviewAuditorRes = await fetch(`${BASE_URL}/api/logs/review`, {
    method: "PATCH",
    headers: { Cookie: auditorCookie, "Content-Type": "application/json" },
    body: JSON.stringify({ interaction_id: sampleInteractionId, status: "flagged", note: "Auditor attempted review" })
  });
  assert("Auditor PATCH /api/logs/review is 403 Forbidden", reviewAuditorRes.status === 403, `Status: ${reviewAuditorRes.status}`);

  const reviewAdminRes = await fetch(`${BASE_URL}/api/logs/review`, {
    method: "PATCH",
    headers: { Cookie: adminCookie, "Content-Type": "application/json" },
    body: JSON.stringify({ interaction_id: sampleInteractionId, status: "flagged", note: "Admin compliance review" })
  });
  const reviewAdminData = await reviewAdminRes.json();
  assert("Admin PATCH /api/logs/review succeeds (200 OK)", reviewAdminRes.status === 200 && reviewAdminData.success);
  assert("Admin review response contains status and reviewer", reviewAdminData.review?.status === "flagged" && reviewAdminData.review?.reviewed_by === "admin");

  // B. MongoDB Schema Validation ($jsonSchema) Rejection Test
  const mongoClientMod = await import("mongodb");
  const mongoClient = new mongoClientMod.MongoClient(process.env.MONGODB_URI || "mongodb://agenttrust_mongo:your_secure_mongo_password_here@localhost:27017/agenttrust?authSource=admin");
  await mongoClient.connect();
  const mongoDb = mongoClient.db(process.env.MONGO_DB || "agenttrust");
  let schemaRejected = false;
  try {
    // Intentionally invalid: note is empty string violating minLength: 1
    await mongoDb.collection("log_annotations").insertOne({
      annotation_id: "invalid-001",
      interaction_id: sampleInteractionId,
      author: "tester",
      note: "", // Fails validator minLength 1
      created_at: new Date()
    });
  } catch (err) {
    schemaRejected = err.message.includes("Document failed validation");
  }
  assert("MongoDB $jsonSchema validator rejects invalid document (empty note)", schemaRejected);

  // C. CRUD /api/logs/annotations RBAC & Functionality
  // 1. Create (POST)
  const annoCreateAuditorRes = await fetch(`${BASE_URL}/api/logs/annotations`, {
    method: "POST",
    headers: { Cookie: auditorCookie, "Content-Type": "application/json" },
    body: JSON.stringify({ interaction_id: sampleInteractionId, note: "Auditor annotation" })
  });
  assert("Auditor POST /api/logs/annotations is 403 Forbidden", annoCreateAuditorRes.status === 403, `Status: ${annoCreateAuditorRes.status}`);

  const annoCreateAdminRes = await fetch(`${BASE_URL}/api/logs/annotations`, {
    method: "POST",
    headers: { Cookie: adminCookie, "Content-Type": "application/json" },
    body: JSON.stringify({ interaction_id: sampleInteractionId, note: "Initial audit observation" })
  });
  const annoCreated = await annoCreateAdminRes.json();
  assert("Admin POST /api/logs/annotations succeeds (201 Created)", annoCreateAdminRes.status === 201 && !!annoCreated.annotation?.annotation_id);
  const testAnnoId = annoCreated.annotation?.annotation_id;

  // 2. Read (GET)
  const annoReadAuditorRes = await fetch(`${BASE_URL}/api/logs/annotations?interaction_id=${sampleInteractionId}`, {
    headers: { Cookie: auditorCookie }
  });
  const annoReadData = await annoReadAuditorRes.json();
  assert("Auditor GET /api/logs/annotations succeeds (200 OK)", annoReadAuditorRes.status === 200 && Array.isArray(annoReadData.annotations));
  assert("Auditor can see created annotation", annoReadData.annotations.some((a) => a.annotation_id === testAnnoId));

  // 3. Update (PATCH)
  const annoUpdateAuditorRes = await fetch(`${BASE_URL}/api/logs/annotations`, {
    method: "PATCH",
    headers: { Cookie: auditorCookie, "Content-Type": "application/json" },
    body: JSON.stringify({ annotation_id: testAnnoId, note: "Auditor tried edit" })
  });
  assert("Auditor PATCH /api/logs/annotations is 403 Forbidden", annoUpdateAuditorRes.status === 403, `Status: ${annoUpdateAuditorRes.status}`);

  const annoUpdateAdminRes = await fetch(`${BASE_URL}/api/logs/annotations`, {
    method: "PATCH",
    headers: { Cookie: adminCookie, "Content-Type": "application/json" },
    body: JSON.stringify({ annotation_id: testAnnoId, note: "Updated audit observation: resolved" })
  });
  assert("Admin PATCH /api/logs/annotations succeeds (200 OK)", annoUpdateAdminRes.status === 200);

  // 4. Delete (DELETE)
  const annoDeleteAuditorRes = await fetch(`${BASE_URL}/api/logs/annotations?annotation_id=${testAnnoId}`, {
    method: "DELETE",
    headers: { Cookie: auditorCookie }
  });
  assert("Auditor DELETE /api/logs/annotations is 403 Forbidden", annoDeleteAuditorRes.status === 403, `Status: ${annoDeleteAuditorRes.status}`);

  const annoDeleteAdminRes = await fetch(`${BASE_URL}/api/logs/annotations?annotation_id=${testAnnoId}`, {
    method: "DELETE",
    headers: { Cookie: adminCookie }
  });
  assert("Admin DELETE /api/logs/annotations succeeds (200 OK)", annoDeleteAdminRes.status === 200);

  // Clean up any test review on interaction_logs and test annotations from mongo
  await mongoDb.collection("log_annotations").deleteMany({ interaction_id: sampleInteractionId });
  await mongoDb.collection("interaction_logs").updateOne({ interaction_id: sampleInteractionId }, { $unset: { review: "" } });
  await mongoClient.close();

  // ----------------------------------------------------------------------------
  // SECTION 8: Rate Limiting Defense (Per-Username Brute Force Protection)
  // ----------------------------------------------------------------------------
  console.log("\n--- SECTION 8: Rate Limiting Defense ---");
  let rateLimited = false;
  // Test per-username throttling without any spoofed X-Forwarded-For header
  for (let i = 0; i < 7; i++) {
    const rlRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "throttled_attacker_target", password: "wrong_password" })
    });
    if (rlRes.status === 429) {
      rateLimited = true;
      break;
    }
  }
  assert("Consecutive failed logins per username trigger HTTP 429 (no spoofed headers)", rateLimited);

  // ----------------------------------------------------------------------------
  // SECTION 8.5: Recursive CTE Blast Radius Endpoint Verification
  // ----------------------------------------------------------------------------
  console.log("\n--- SECTION 8.5: Recursive CTE Blast Radius ---");
  const blastResAdmin = await fetch(`${BASE_URL}/api/agents/blast-radius?agent_id=b0000000-0000-0000-0000-000000000001&max_depth=3`, {
    headers: { Cookie: adminCookie }
  });
  assert("Admin GET /api/agents/blast-radius returns 200", blastResAdmin.status === 200);
  const blastDataAdmin = await blastResAdmin.json();
  assert("Blast radius returns reachable agents array", Array.isArray(blastDataAdmin.reachable_agents));
  assert("Blast radius returns max_depth 3", blastDataAdmin.max_depth === 3);

  const blastResAuditor = await fetch(`${BASE_URL}/api/agents/blast-radius?agent_id=b0000000-0000-0000-0000-000000000001&max_depth=3`, {
    headers: { Cookie: auditorCookie }
  });
  assert("Auditor GET /api/agents/blast-radius returns 200 (Read Allowed)", blastResAuditor.status === 200);

  // ----------------------------------------------------------------------------
  // SECTION 9: Database Baseline Restoration
  // ----------------------------------------------------------------------------
  console.log("\n--- SECTION 9: Restoring Clean Seed Baseline ---");
  try {
    process.loadEnvFile?.(".env.local");
  } catch {}

  const pg = await import("pg");
  const pool = new pg.default.Pool({
    host: process.env.POSTGRES_HOST || "localhost",
    port: parseInt(process.env.POSTGRES_PORT || "5433", 10),
    database: process.env.POSTGRES_DB || "agenttrust",
    user: process.env.POSTGRES_USER || "agenttrust_admin",
    password: process.env.POSTGRES_PASSWORD,
  });

  // 1. Delete extra quarantine events, keep only seeded Theta quarantine
  await pool.query("DELETE FROM quarantine_events WHERE quarantine_id <> 'f0000000-0000-0000-0000-000000000001';");
  await pool.query("UPDATE quarantine_events SET status = 'active', released_at = NULL WHERE quarantine_id = 'f0000000-0000-0000-0000-000000000001';");

  // 2. Delete extra risk scores, keep only 10 seeded baseline scores
  await pool.query("DELETE FROM risk_scores WHERE score_id::text NOT LIKE '10000000-0000-0000-0000-%';");

  // 3. Reset agent statuses to exact seed baseline
  await pool.query("UPDATE agents SET status = 'quarantined' WHERE agent_id = 'b0000000-0000-0000-0000-000000000008';");
  await pool.query("UPDATE agents SET status = 'offline' WHERE agent_id = 'b0000000-0000-0000-0000-000000000010';");
  await pool.query("UPDATE agents SET status = 'active' WHERE agent_id NOT IN ('b0000000-0000-0000-0000-000000000008', 'b0000000-0000-0000-0000-000000000010');");

  // 4. Delete simulated interactions & cascade violations
  await pool.query("DELETE FROM interactions WHERE interaction_id::text NOT LIKE 'd0000000-0000-0000-0000-%';");

  // Query counts to verify exact restoration
  const agCheck = await pool.query("SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status = 'active') AS active, COUNT(*) FILTER (WHERE status = 'quarantined') AS quarantined FROM agents;");
  const qCheck = await pool.query("SELECT COUNT(*) AS count FROM quarantine_events;");
  const rCheck = await pool.query("SELECT COUNT(*) AS count FROM risk_scores;");
  const iCheck = await pool.query("SELECT COUNT(*) AS count FROM interactions;");

  await pool.end();

  const restored = (
    parseInt(agCheck.rows[0].total) === 10 &&
    parseInt(agCheck.rows[0].active) === 8 &&
    parseInt(agCheck.rows[0].quarantined) === 1 &&
    parseInt(qCheck.rows[0].count) === 1 &&
    parseInt(rCheck.rows[0].count) === 10 &&
    parseInt(iCheck.rows[0].count) === 45
  );

  assert("Seed baseline restored: 10 agents (8 active, 1 quarantined), 1 quarantine event, 10 risk scores, 45 interactions", restored);

  console.log("\n================================================================================");
  console.log(`TEST SUMMARY: ${passes} Passed, ${fails} Failed`);
  console.log("================================================================================");

  if (fails > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
