// ============================================================================
// AgentTrust: Phase 4 API Layer Comprehensive Verification Matrix
// Runs full verification across Auth, RBAC, CRUD, Transactions, MongoDB & Defense
// ============================================================================

const BASE_URL = "http://localhost:3000";

let adminCookie = "";
let auditorCookie = "";
let adminToken = "";
let auditorToken = "";

async function runTests() {
  console.log("================================================================================");
  console.log("AGENTTRUST PHASE 4: FULL API & AUTH TEST MATRIX");
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
  // SECTION 1: Unauthenticated 401 Gating
  // ----------------------------------------------------------------------------
  console.log("--- SECTION 1: Unauthenticated Endpoint Gating ---");
  const unauthEndpoints = [
    "/api/agents",
    "/api/policies",
    "/api/interactions",
    "/api/violations",
    "/api/quarantine",
    "/api/logs",
    "/api/logs/anomalies"
  ];

  for (const ep of unauthEndpoints) {
    const res = await fetch(`${BASE_URL}${ep}`);
    assert(`Unauthenticated GET ${ep} returns 401`, res.status === 401, `Status: ${res.status}`);
  }

  // ----------------------------------------------------------------------------
  // SECTION 2: Authentication & Rate Limiting
  // ----------------------------------------------------------------------------
  console.log("\n--- SECTION 2: Authentication & Rate Limiting ---");
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
  assert("Auditor payload contains role 'auditor'", auditorData.user?.role === "auditor");
  const auditorSetCookie = auditorRes.headers.get("set-cookie") || "";
  auditorCookie = auditorSetCookie.split(";")[0];
  auditorToken = auditorData.token;

  // Admin login
  const adminRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "admin123" })
  });
  const adminData = await adminRes.json();
  assert("Admin login returns 200 OK", adminRes.status === 200, `Status: ${adminRes.status}`);
  assert("Admin payload contains role 'admin'", adminData.user?.role === "admin");
  const adminSetCookie = adminRes.headers.get("set-cookie") || "";
  adminCookie = adminSetCookie.split(";")[0];
  adminToken = adminData.token;

  // ----------------------------------------------------------------------------
  // SECTION 3: RBAC Enforcement (Auditor Read vs Write Access)
  // ----------------------------------------------------------------------------
  console.log("\n--- SECTION 3: RBAC Enforcement ---");
  // Auditor can read agents
  const audAgentsRes = await fetch(`${BASE_URL}/api/agents`, {
    headers: { Authorization: `Bearer ${auditorToken}` }
  });
  const audAgentsData = await audAgentsRes.json();
  assert("Auditor can read /api/agents (200 OK)", audAgentsRes.status === 200 && Array.isArray(audAgentsData.agents));

  // Auditor cannot create agents (403 Forbidden)
  const audAgentCreateRes = await fetch(`${BASE_URL}/api/agents`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${auditorToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ name: "Rogue-Agent", role: "executor" })
  });
  assert("Auditor POST /api/agents is 403 Forbidden", audAgentCreateRes.status === 403, `Status: ${audAgentCreateRes.status}`);

  // Auditor cannot create policies (403 Forbidden)
  const audPolicyCreateRes = await fetch(`${BASE_URL}/api/policies`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${auditorToken}`,
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
      Authorization: `Bearer ${auditorToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      agent_id: "00000000-0000-0000-0000-000000000001",
      action: "quarantine"
    })
  });
  assert("Auditor POST /api/quarantine/action is 403 Forbidden", audQuarantineRes.status === 403, `Status: ${audQuarantineRes.status}`);

  // ----------------------------------------------------------------------------
  // SECTION 4: Admin Privileged Operations & Transactional Isolation
  // ----------------------------------------------------------------------------
  console.log("\n--- SECTION 4: Admin Transactions & Quarantine Flow ---");
  
  // Pick an active agent to test manual quarantine
  const testAgent = audAgentsData.agents.find((a) => a.status === "active");
  assert("Found an active agent for quarantine test", !!testAgent, `Agent: ${testAgent?.name}`);

  if (testAgent) {
    // 1. Admin quarantines agent
    const qRes = await fetch(`${BASE_URL}/api/quarantine/action`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        agent_id: testAgent.agent_id,
        action: "quarantine",
        reason: "Phase 4 Automated Verification Test"
      })
    });
    const qData = await qRes.json();
    assert("Admin can manually quarantine agent (200 OK)", qRes.status === 200, `Status: ${qRes.status}`);
    assert("Quarantine action returned active event", qData.quarantine_event?.status === "active");

    // 2. Duplicate quarantine attempt fails cleanly (409 Conflict)
    const dupRes = await fetch(`${BASE_URL}/api/quarantine/action`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        agent_id: testAgent.agent_id,
        action: "quarantine"
      })
    });
    assert("Duplicate quarantine rejected (409 Conflict)", dupRes.status === 409, `Status: ${dupRes.status}`);

    // 3. Admin releases agent back to active
    const relRes = await fetch(`${BASE_URL}/api/quarantine/action`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        agent_id: testAgent.agent_id,
        action: "release",
        reason: "Verification completed successfully"
      })
    });
    const relData = await relRes.json();
    assert("Admin can release agent from quarantine (200 OK)", relRes.status === 200, `Status: ${relRes.status}`);
    assert("Quarantine event status updated to released", relData.quarantine_event?.status === "released");
  }

  // ----------------------------------------------------------------------------
  // SECTION 5: Stored Function Execution (compute_risk_score)
  // ----------------------------------------------------------------------------
  console.log("\n--- SECTION 5: Stored Function (compute_risk_score) ---");
  const riskRes = await fetch(`${BASE_URL}/api/risk/compute`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${adminToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ agent_id: audAgentsData.agents[0].agent_id })
  });
  const riskData = await riskRes.json();
  assert("POST /api/risk/compute successfully executes (200 OK)", riskRes.status === 200, `Status: ${riskRes.status}`);
  assert("Risk score value is a valid numeric score (0-100)", typeof riskData.computed_score === "number" && riskData.computed_score >= 0 && riskData.computed_score <= 100, `Score: ${riskData.computed_score}`);

  // ----------------------------------------------------------------------------
  // SECTION 6: SQL Injection Defense Proof
  // ----------------------------------------------------------------------------
  console.log("\n--- SECTION 6: Parameterized SQL Injection Defense ---");
  const sqliRes = await fetch(`${BASE_URL}/api/agents?search=%27%20OR%201=1%20--`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  const sqliData = await sqliRes.json();
  assert("SQL injection payload safely handled (200 OK, 0 matched rows)", sqliRes.status === 200 && sqliData.agents.length === 0, `Rows returned: ${sqliData.agents?.length}`);

  // ----------------------------------------------------------------------------
  // SECTION 7: MongoDB Unstructured Logs & Anomaly Aggregation
  // ----------------------------------------------------------------------------
  console.log("\n--- SECTION 7: MongoDB Logs & Aggregation Pipeline ---");
  const logsRes = await fetch(`${BASE_URL}/api/logs?limit=5`, {
    headers: { Authorization: `Bearer ${auditorToken}` }
  });
  const logsData = await logsRes.json();
  assert("Auditor can fetch MongoDB logs (200 OK)", logsRes.status === 200 && logsData.logs.length === 5);
  assert("Logs contain polymorphic raw_payload and headers", !!logsData.logs[0].raw_payload && !!logsData.logs[0].headers);

  const anomalyRes = await fetch(`${BASE_URL}/api/logs/anomalies`, {
    headers: { Authorization: `Bearer ${auditorToken}` }
  });
  const anomalyData = await anomalyRes.json();
  assert("Auditor can run MongoDB anomaly aggregation (200 OK)", anomalyRes.status === 200 && Array.isArray(anomalyData.anomalies));
  const topAnomaly = anomalyData.anomalies[0];
  assert("Top anomalous agent detected (Theta-RiskScorer, score >= 150)", topAnomaly?.computed_anomaly_score >= 150, `Agent: ${topAnomaly?.agent_name}, Score: ${topAnomaly?.computed_anomaly_score}`);

  // ----------------------------------------------------------------------------
  // SECTION 8: Rate Limiting Defense (Brute Force Protection)
  // ----------------------------------------------------------------------------
  console.log("\n--- SECTION 8: Rate Limiting Defense ---");
  let rateLimited = false;
  for (let i = 0; i < 12; i++) {
    const rlRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "X-Forwarded-For": "203.0.113.99"
      },
      body: JSON.stringify({ username: "admin", password: "wrong_password" })
    });
    if (rlRes.status === 429) {
      rateLimited = true;
      break;
    }
  }
  assert("Consecutive failed logins trigger HTTP 429 Too Many Requests", rateLimited);

  console.log("\n================================================================================");
  console.log(`TEST SUMMARY: ${passes} Passed, ${fails} Failed`);
  console.log("================================================================================");

  if (fails > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
