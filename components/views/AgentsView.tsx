"use client";

import React, { useState, useEffect } from "react";
import { RoleGate } from "../RoleGate";

export function AgentsView() {
  const [agents, setAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // Agent registration modal state
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState("");
  const [agentType, setAgentType] = useState("Security");
  const [ownerTeam, setOwnerTeam] = useState("CyberSec");
  const [certFingerprint, setCertFingerprint] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  // Risk computation state
  const [computingId, setComputingId] = useState<string | null>(null);

  // Blast Radius Modal state
  const [blastTarget, setBlastTarget] = useState<any | null>(null);
  const [blastDepth, setBlastDepth] = useState<number>(3);
  const [blastResults, setBlastResults] = useState<any | null>(null);
  const [blastLoading, setBlastLoading] = useState(false);
  const [blastError, setBlastError] = useState<string | null>(null);

  const fetchAgents = async () => {
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (statusFilter) params.set("status", statusFilter);

      const res = await fetch(`/api/agents?${params.toString()}`, { credentials: "include" });
      if (res.ok) {
        const d = await res.json();
        setAgents(d.agents || []);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAgents();
  }, [search, statusFilter]);

  const handleComputeRisk = async (agentId: string) => {
    setComputingId(agentId);
    try {
      const res = await fetch("/api/risk/compute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ agent_id: agentId }),
      });
      if (res.ok) {
        await fetchAgents();
      }
    } finally {
      setComputingId(null);
    }
  };

  const handleOpenBlastRadius = async (agent: any, depth: number = 3) => {
    setBlastTarget(agent);
    setBlastDepth(depth);
    setBlastLoading(true);
    setBlastError(null);
    try {
      const res = await fetch(`/api/agents/blast-radius?agent_id=${agent.agent_id}&max_depth=${depth}`, {
        credentials: "include",
      });
      const data = await res.json();
      if (res.ok) {
        setBlastResults(data);
      } else {
        setBlastError(data.error || "Failed to compute blast radius");
      }
    } catch {
      setBlastError("Network error calculating blast radius");
    } finally {
      setBlastLoading(false);
    }
  };

  const handleCreateAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name,
          agent_type: agentType,
          owner_team: ownerTeam,
          cert_fingerprint: certFingerprint,
          status: "active",
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setShowModal(false);
        setName("");
        setCertFingerprint("");
        await fetchAgents();
      } else {
        setFormError(data.error || "Failed to create agent");
      }
    } catch {
      setFormError("Network error while registering agent");
    }
  };

  return (
    <div style={{ padding: "2rem", maxWidth: "1400px", margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h2 style={{ fontSize: "1.5rem", marginBottom: "0.25rem" }}>Agent Registry</h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>
            Autonomous agent identity catalog, cryptographic certificates, and posture scores
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <input
            id="input-agent-search"
            type="text"
            className="input"
            placeholder="Search by name or cert..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: "240px" }}
          />

          <select
            id="select-agent-status-filter"
            className="select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="quarantined">Quarantined</option>
            <option value="offline">Offline</option>
          </select>

          <RoleGate
            allowedRoles={["admin"]}
            fallback={
              <button
                id="btn-register-agent"
                className="btn btn-secondary"
                disabled
                title="Auditor role is read-only. Login as Admin to register new agents."
              >
                + Register Agent (Admin Only)
              </button>
            }
          >
            <button
              id="btn-register-agent"
              className="btn btn-primary"
              onClick={() => {
                setCertFingerprint(`SHA256:${Array.from({ length: 6 }, () => Math.floor(Math.random()*256).toString(16).toUpperCase().padStart(2, "0")).join(":")}`);
                setShowModal(true);
              }}
            >
              + Register Agent
            </button>
          </RoleGate>
        </div>
      </div>

      <div className="glass-panel" style={{ padding: "1.5rem" }}>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Agent Name</th>
                <th>Type</th>
                <th>Owner Team</th>
                <th>Status</th>
                <th>Risk Score (30d)</th>
                <th>Certificate Fingerprint</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((agent) => {
                const score = parseFloat(agent.latest_risk_score || "0");
                const scoreColor =
                  score >= 70 ? "var(--accent-rose)" : score >= 35 ? "var(--accent-amber)" : "var(--accent-emerald)";

                return (
                  <tr key={agent.agent_id}>
                    <td>
                      <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>{agent.name}</div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{agent.agent_id}</div>
                    </td>
                    <td>{agent.agent_type}</td>
                    <td>{agent.owner_team}</td>
                    <td>
                      <span className={`status-pill ${agent.status}`}>{agent.status}</span>
                    </td>
                    <td style={{ minWidth: "160px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", marginBottom: "0.25rem" }}>
                        <span style={{ fontWeight: 600, color: scoreColor }}>{score.toFixed(1)} / 100</span>
                        <span style={{ color: "var(--text-muted)" }}>
                          {agent.risk_computed_at ? new Date(agent.risk_computed_at).toLocaleDateString() : "uncomputed"}
                        </span>
                      </div>
                      <div className="risk-meter">
                        <div
                          className="risk-meter-fill"
                          style={{ width: `${Math.min(100, score)}%`, background: scoreColor }}
                        />
                      </div>
                    </td>
                    <td>
                      <code className="mono" style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                        {agent.cert_fingerprint}
                      </code>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", alignItems: "center" }}>
                        <button
                          id={`btn-blast-radius-${agent.agent_id}`}
                          className="btn btn-secondary"
                          style={{ padding: "0.35rem 0.65rem", fontSize: "0.75rem", borderColor: "var(--accent-cyan)", color: "var(--accent-cyan)" }}
                          onClick={() => handleOpenBlastRadius(agent, blastDepth)}
                          title="Trace downstream interaction blast radius via Recursive CTE"
                        >
                          Blast Radius
                        </button>
                        <RoleGate
                          allowedRoles={["admin"]}
                          fallback={
                            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                              Read-Only
                            </span>
                          }
                        >
                          <button
                            className="btn btn-secondary"
                            style={{ padding: "0.35rem 0.75rem", fontSize: "0.75rem" }}
                            disabled={computingId === agent.agent_id}
                            onClick={() => handleComputeRisk(agent.agent_id)}
                            title="Invokes compute_risk_score stored function"
                          >
                            {computingId === agent.agent_id ? "Computing..." : "Recompute Risk"}
                          </button>
                        </RoleGate>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Blast Radius Recursive CTE Modal */}
      {blastTarget && (
        <div className="modal-overlay">
          <div className="modal-content glass-panel" style={{ maxWidth: "800px", width: "95%" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span style={{ fontSize: "1.25rem" }}>💥</span>
                <h3 style={{ fontSize: "1.25rem" }}>Agent Interaction Blast Radius</h3>
              </div>
              <button className="btn btn-secondary" style={{ padding: "0.25rem 0.5rem" }} onClick={() => setBlastTarget(null)}>✕</button>
            </div>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginBottom: "1rem" }}>
              Evaluates downstream dependency risk for <strong style={{ color: "var(--accent-cyan)" }}>{blastTarget.name}</strong> using PostgreSQL <code className="mono">WITH RECURSIVE</code> traversal with cycle prevention.
            </p>

            <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.25rem", background: "rgba(255,255,255,0.02)", padding: "0.75rem", borderRadius: "8px", border: "1px solid var(--border-color)", flexWrap: "wrap" }}>
              <label style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>Max Traversal Depth:</label>
              <div style={{ display: "flex", gap: "0.35rem" }}>
                {[1, 2, 3, 4, 5].map((d) => (
                  <button
                    key={d}
                    className={`btn ${blastDepth === d ? "btn-primary" : "btn-secondary"}`}
                    style={{ padding: "0.25rem 0.65rem", fontSize: "0.8rem" }}
                    onClick={() => handleOpenBlastRadius(blastTarget, d)}
                  >
                    {d} {d === 1 ? "Hop" : "Hops"}
                  </button>
                ))}
              </div>
              {blastResults && (
                <span style={{ marginLeft: "auto", fontSize: "0.85rem", color: "var(--accent-amber)" }}>
                  Reachable Nodes: <strong>{blastResults.blast_radius_count}</strong>
                </span>
              )}
            </div>

            {blastLoading && <div style={{ textAlign: "center", padding: "2rem", color: "var(--accent-cyan)" }}>Executing recursive query...</div>}
            {blastError && <div style={{ color: "var(--accent-rose)", padding: "0.75rem", background: "rgba(244,63,94,0.1)", borderRadius: "6px" }}>{blastError}</div>}

            {blastResults && !blastLoading && (
              <div className="table-container" style={{ maxHeight: "360px", overflowY: "auto" }}>
                {blastResults.reachable_agents.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>
                    No downstream agents reachable within {blastDepth} hops.
                  </div>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th>Hop Depth</th>
                        <th>Target Agent</th>
                        <th>Type / Team</th>
                        <th>Status</th>
                        <th>Traversal Path (Cycle-Guarded)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {blastResults.reachable_agents.map((row: any, idx: number) => (
                        <tr key={idx}>
                          <td>
                            <span className="badge" style={{ background: row.depth === 1 ? "rgba(0,229,255,0.15)" : "rgba(168,85,247,0.15)", color: row.depth === 1 ? "var(--accent-cyan)" : "var(--accent-purple)" }}>
                              Depth {row.depth}
                            </span>
                          </td>
                          <td style={{ fontWeight: 600 }}>{row.agent_name}</td>
                          <td style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>{row.agent_type} · {row.owner_team}</td>
                          <td>
                            <span className={`status-badge ${row.status}`}>{row.status}</span>
                          </td>
                          <td>
                            <div style={{ fontSize: "0.75rem", fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>
                              {row.path_names.join(" ➔ ")}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Registration Modal */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content glass-panel">
            <h3 style={{ fontSize: "1.25rem", marginBottom: "0.5rem" }}>Register New Autonomous Agent</h3>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginBottom: "1.25rem" }}>
              Appends an authenticated cryptographic identity into the PostgreSQL agents registry.
            </p>

            {formError && (
              <div style={{ background: "rgba(244, 63, 94, 0.15)", border: "1px solid rgba(244, 63, 94, 0.4)", color: "#fb7185", padding: "0.5rem 0.75rem", borderRadius: "6px", fontSize: "0.8rem", marginBottom: "1rem" }}>
                {formError}
              </div>
            )}

            <form onSubmit={handleCreateAgent} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: "0.35rem" }}>
                  Agent Identifier Name
                </label>
                <input
                  type="text"
                  className="input"
                  style={{ width: "100%" }}
                  placeholder="e.g. Lambda-Broker-01"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: "0.35rem" }}>
                    Agent Type
                  </label>
                  <select
                    className="select"
                    style={{ width: "100%" }}
                    value={agentType}
                    onChange={(e) => setAgentType(e.target.value)}
                  >
                    <option value="Security">Security</option>
                    <option value="Financial">Financial</option>
                    <option value="Healthcare">Healthcare</option>
                    <option value="Logistics">Logistics</option>
                    <option value="NLP">NLP</option>
                    <option value="DevOps">DevOps</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: "0.35rem" }}>
                    Owner Team
                  </label>
                  <input
                    type="text"
                    className="input"
                    style={{ width: "100%" }}
                    value={ownerTeam}
                    onChange={(e) => setOwnerTeam(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: "0.35rem" }}>
                  Certificate Fingerprint
                </label>
                <input
                  type="text"
                  className="input"
                  style={{ width: "100%" }}
                  value={certFingerprint}
                  onChange={(e) => setCertFingerprint(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "1rem" }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Confirm Registration
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
