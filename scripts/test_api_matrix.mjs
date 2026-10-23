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
    "/api/logs/anomalies"
  ];

  for (const ep of unauthEndpoints) {
    const res = await fetch(`${BASE_URL}${ep}`);
    assert(`Unauthenticated GET ${ep} returns 401`, res.status === 401, `Status: ${res.status}`);
  }

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

  console.log("\n================================================================================");
  console.log(`TEST SUMMARY: ${passes} Passed, ${fails} Failed`);
  console.log("================================================================================");

  if (fails > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
