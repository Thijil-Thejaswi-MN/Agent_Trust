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
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

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
