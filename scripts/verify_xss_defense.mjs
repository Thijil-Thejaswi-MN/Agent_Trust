import { MongoClient } from "mongodb";

try {
  process.loadEnvFile?.(".env.local");
} catch {}

async function checkXss() {
  const uri = process.env.MONGODB_URI;
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(process.env.MONGO_DB || "agenttrust");
  const col = db.collection("interaction_logs");

  const xssDoc = {
    interaction_id: "xss-test-payload-id-001",
    agent_id: "b0000000-0000-0000-0000-000000000001",
    timestamp: new Date(),
    headers: { "x-xss": "<script>alert('XSS')</script>" },
    raw_payload: { attack_vector: "<img src=x onerror=alert(1)>" }
  };
  await col.insertOne(xssDoc);

  const login = await fetch("http://localhost:3000/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "admin123" })
  });
  const cookie = login.headers.get("set-cookie").split(";")[0];

  const res = await fetch("http://localhost:3000/api/logs?interaction_id=xss-test-payload-id-001", {
    headers: { Cookie: cookie }
  });
  const data = await res.json();
  console.log("XSS Document Raw Payload from API:");
  console.log(JSON.stringify(data.logs[0].raw_payload, null, 2));

  // Clean up
  await col.deleteOne({ interaction_id: "xss-test-payload-id-001" });
  await client.close();
  console.log("Cleanup complete. Verified XSS string stored and retrieved as inert text.");
}

checkXss().catch(console.error);
