"use client";

import React, { useState, useEffect } from "react";
import { RoleGate } from "../RoleGate";
import { useAuth } from "../AuthContext";

export function DashboardView() {
  const { user } = useAuth();
  const [agents, setAgents] = useState<any[]>([]);
  const [violations, setViolations] = useState<any[]>([]);
  const [quarantines, setQuarantines] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Simulation state
  const [scenario, setScenario] = useState<string>("critical_security_breach");
  const [simulating, setSimulating] = useState(false);
  const [simResult, setSimResult] = useState<any | null>(null);

  const loadData = async () => {
    try {
      const [agRes, vRes, qRes] = await Promise.all([
        fetch("/api/agents", { credentials: "include" }),
        fetch("/api/violations", { credentials: "include" }),
        fetch("/api/quarantine?status=active", { credentials: "include" }),
      ]);

      if (agRes.ok) {
        const d = await agRes.json();
        setAgents(d.agents || []);
      }
      if (vRes.ok) {
        const d = await vRes.json();
        setViolations(d.violations || []);
      }
      if (qRes.ok) {
        const d = await qRes.json();
        setQuarantines(d.events || []);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSimulate = async () => {
    setSimulating(true);
    setSimResult(null);
    try {
      const res = await fetch("/api/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ scenario }),
      });
      const data = await res.json();
      setSimResult(data);
      // Reload dashboard state to show newly fired violations / quarantines
      await loadData();
    } catch (err: any) {
      setSimResult({ error: "Failed to communicate with simulation endpoint" });
    } finally {
      setSimulating(false);
    }
  };

  const quarantinedCount = agents.filter((a) => a.status === "quarantined").length;
  const criticalViolations = violations.filter((v) => v.severity === "critical").length;

  return (
    <div style={{ padding: "2rem", maxWidth: "1400px", margin: "0 auto" }}>
      {/* KPI Cards */}
      <div className="kpi-grid">
        <div className="kpi-card glass-panel">
          <div className="kpi-title">Total Monitored Agents</div>
          <div className="kpi-value" style={{ color: "var(--accent-cyan)" }}>
            {loading ? "..." : agents.length}
          </div>
          <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
            Autonomous multi-agent registry
          </div>
        </div>

        <div className="kpi-card glass-panel">
          <div className="kpi-title">Active Quarantines</div>
          <div className="kpi-value" style={{ color: quarantinedCount > 0 ? "var(--accent-rose)" : "var(--accent-emerald)" }}>
            {loading ? "..." : quarantinedCount}
          </div>
          <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
            {quarantinedCount > 0 ? "Offending agents contained" : "All agents operational"}
          </div>
        </div>

        <div className="kpi-card glass-panel">
          <div className="kpi-title">Active Violations</div>
          <div className="kpi-value" style={{ color: "var(--accent-amber)" }}>
            {loading ? "..." : violations.length}
          </div>
          <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
            Governance breaches detected
          </div>
        </div>

        <div className="kpi-card glass-panel">
          <div className="kpi-title">Critical SLA Breaches</div>
          <div className="kpi-value" style={{ color: "var(--accent-rose)" }}>
            {loading ? "..." : criticalViolations}
          </div>
          <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
            Automatic trigger trigger cascade
          </div>
        </div>
      </div>

      {/* Live Simulation Banner */}
      <div className="simulation-banner">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent-cyan)", boxShadow: "0 0 10px var(--accent-cyan)" }} />
              <h3 style={{ fontSize: "1.1rem" }}>Runtime Trigger Cascade Simulator</h3>
            </div>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", maxWidth: "680px" }}>
              Simulates live agent interactions across PostgreSQL. Demonstrates the dual-trigger cascade:
              (1) <code className="mono">trg_evaluate_interaction_policies</code> evaluates SLA breaches & protocol compliance,
              and (2) <code className="mono">trg_auto_quarantine_on_critical_violation</code> automatically and idempotently quarantines offending source agents.
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <select
              id="select-simulation-scenario"
              className="select"
              value={scenario}
              onChange={(e) => setScenario(e.target.value)}
              disabled={simulating}
            >
              <option value="critical_security_breach">Prohibited Protocol (Critical Breach → Auto-Quarantine)</option>
              <option value="broker_latency_spike">Broker Latency Spike (&gt;250ms → High Violation)</option>
              <option value="reviewer_delay">Reviewer Delay (&gt;600ms → Medium Violation)</option>
              <option value="normal">Normal Compliant Interaction</option>
            </select>

            <RoleGate
              allowedRoles={["admin"]}
              fallback={
                <button
                  id="btn-simulate-interaction"
                  className="btn btn-secondary"
                  disabled
                  title="Auditor role is read-only. Login as Admin to simulate interactions."
                >
                  <span style={{ fontSize: "0.75rem", opacity: 0.8 }}>Auditor (Read-Only)</span>
                </button>
              }
            >
              <button
                id="btn-simulate-interaction"
                className="btn btn-primary"
                onClick={handleSimulate}
                disabled={simulating}
              >
                {simulating ? "Executing Cascade..." : "Simulate Interaction"}
              </button>
            </RoleGate>
          </div>
        </div>

        {/* Live Simulation Cascade Output */}
        {simResult && (
          <div
            id="simulation-result-panel"
            style={{
              background: "rgba(8, 12, 20, 0.7)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "8px",
              padding: "1rem",
              marginTop: "0.5rem",
              fontSize: "0.85rem",
            }}
          >
            {simResult.error ? (
              <div style={{ color: "#fb7185" }}>{simResult.error}</div>
            ) : (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                  <span style={{ color: "var(--accent-emerald)", fontWeight: 700 }}>✓ SIMULATION EXECUTED</span>
                  <span style={{ color: "var(--text-muted)" }}>•</span>
                  <span>Scenario: <strong style={{ color: "var(--text-primary)" }}>{simResult.scenario}</strong></span>
                  <span style={{ color: "var(--text-muted)" }}>•</span>
                  <span>Protocol: <code className="mono">{simResult.interaction?.protocol}</code></span>
                  {simResult.trigger_cascade_executed && (
                    <span className="severity-pill critical" style={{ marginLeft: "auto" }}>
                      TRIGGER CASCADE FIRED: AUTO-QUARANTINED
                    </span>
                  )}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginTop: "0.5rem" }}>
                  <div style={{ background: "rgba(255, 255, 255, 0.02)", padding: "0.75rem", borderRadius: "6px" }}>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>
                      SOURCE AGENT POSTURE
                    </div>
                    <div>Agent: <strong>{simResult.source_agent?.name}</strong></div>
                    <div>Status: <span className={`status-pill ${simResult.source_agent?.status}`}>{simResult.source_agent?.status}</span></div>
                  </div>

                  <div style={{ background: "rgba(255, 255, 255, 0.02)", padding: "0.75rem", borderRadius: "6px" }}>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>
                      DETECTED VIOLATIONS ({simResult.violations_detected?.length || 0})
                    </div>
                    {simResult.violations_detected?.length > 0 ? (
                      simResult.violations_detected.map((v: any, idx: number) => (
                        <div key={idx} style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.25rem" }}>
                          <span className={`severity-pill ${v.severity}`}>{v.severity}</span>
                          <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>{v.policy_name}</span>
                        </div>
                      ))
                    ) : (
                      <div style={{ color: "var(--accent-emerald)", fontSize: "0.8rem" }}>None (SLA Compliant)</div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Grid: Active Quarantines & Live Violations Stream */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: "1.5rem" }}>
        {/* Active Quarantines Panel */}
        <div className="glass-panel" style={{ padding: "1.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <h3 style={{ fontSize: "1.05rem" }}>Active Agent Containments</h3>
            <span className="status-pill quarantined">{quarantines.length} Isolated</span>
          </div>

          {quarantines.length === 0 ? (
            <div style={{ color: "var(--text-muted)", fontSize: "0.875rem", padding: "1.5rem 0", textAlign: "center" }}>
              No active agent quarantines. All agents operational.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {quarantines.map((q) => (
                <div
                  key={q.quarantine_id}
                  style={{
                    background: "rgba(244, 63, 94, 0.08)",
                    border: "1px solid rgba(244, 63, 94, 0.25)",
                    borderRadius: "8px",
                    padding: "0.85rem",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.25rem" }}>
                    <strong style={{ color: "#fda4af" }}>{q.agent_name}</strong>
                    <span className="status-pill quarantined">quarantined</span>
                  </div>
                  <div style={{ fontSize: "0.775rem", color: "var(--text-muted)" }}>
                    Type: {q.agent_type} • Team: {q.owner_team}
                  </div>
                  <div style={{ fontSize: "0.775rem", color: "var(--text-secondary)", marginTop: "0.35rem" }}>
                    Isolated: {new Date(q.quarantined_at).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Live Violations Feed */}
        <div className="glass-panel" style={{ padding: "1.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <h3 style={{ fontSize: "1.05rem" }}>Active Violations Posture</h3>
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Backed by active_violations_view</span>
          </div>

          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Severity</th>
                  <th>Policy</th>
                  <th>Source Agent</th>
                  <th>Protocol</th>
                  <th>Detected</th>
                </tr>
              </thead>
              <tbody>
                {violations.slice(0, 6).map((v) => (
                  <tr key={v.violation_id}>
                    <td>
                      <span className={`severity-pill ${v.severity}`}>{v.severity}</span>
                    </td>
                    <td style={{ fontWeight: 500 }}>{v.policy_name}</td>
                    <td>{v.source_agent_name}</td>
                    <td><code className="mono" style={{ fontSize: "0.75rem" }}>{v.protocol}</code></td>
                    <td style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                      {new Date(v.detected_at).toLocaleTimeString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
