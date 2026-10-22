export default function HomePage() {
  return (
    <main style={{ padding: "4rem 2rem", maxWidth: "900px", margin: "0 auto", textAlign: "center" }}>
      <h1 style={{ fontSize: "2.5rem", marginBottom: "1rem", color: "var(--accent-cyan)" }}>
        AgentTrust
      </h1>
      <p style={{ fontSize: "1.2rem", color: "var(--text-muted)", marginBottom: "2rem" }}>
        Multi-Agent Governance, Risk Monitoring & Runtime Policy Enforcement
      </p>
      <div style={{
        background: "var(--bg-secondary)",
        padding: "1.5rem",
        borderRadius: "8px",
        border: "1px solid var(--border-color)",
        display: "inline-block",
        textAlign: "left"
      }}>
        <h3 style={{ marginBottom: "0.5rem", color: "var(--accent-emerald)" }}>System Scaffold Ready</h3>
        <p style={{ color: "var(--text-muted)", fontSize: "0.95rem" }}>
          Next.js App Router scaffolded with TypeScript and pinned dependencies.
        </p>
      </div>
    </main>
  );
}
