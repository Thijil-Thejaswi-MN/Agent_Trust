"use client";

import React, { useState, useEffect } from "react";
import { RoleGate } from "../RoleGate";

export function ViolationsView() {
  const [violations, setViolations] = useState<any[]>([]);
  const [quarantines, setQuarantines] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Manual action modal state
  const [targetAgent, setTargetAgent] = useState<any | null>(null);
  const [targetAction, setTargetAction] = useState<"quarantine" | "release">("quarantine");
  const [actionReason, setActionReason] = useState("");
  const [submittingAction, setSubmittingAction] = useState(false);

  const loadData = async () => {
    try {
      const [vRes, qRes, aRes] = await Promise.all([
        fetch("/api/violations", { credentials: "include" }),
        fetch("/api/quarantine", { credentials: "include" }),
        fetch("/api/agents", { credentials: "include" }),
      ]);

      if (vRes.ok) {
        const d = await vRes.json();
        setViolations(d.violations || []);
      }
      if (qRes.ok) {
        const d = await qRes.json();
        setQuarantines(d.events || []);
      }
      if (aRes.ok) {
        const d = await aRes.json();
        setAgents(d.agents || []);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleExecuteAction = async () => {
    if (!targetAgent) return;
    setSubmittingAction(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await fetch("/api/quarantine/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          agent_id: targetAgent.agent_id,
          action: targetAction,
          reason: actionReason || `Manual ${targetAction} initiated from Governance Console`,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setActionSuccess(data.message || `Successfully executed ${targetAction}`);
        setTargetAgent(null);
        setActionReason("");
        await loadData();
      } else {
        setActionError(data.error || `Failed to execute ${targetAction}`);
      }
    } catch {
      setActionError("Network error during quarantine state transition");
    } finally {
      setSubmittingAction(false);
    }
  };

  return (
    <div style={{ padding: "2rem", maxWidth: "1400px", margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h2 style={{ fontSize: "1.5rem", marginBottom: "0.25rem" }}>Governance Violations & Quarantine Containment</h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>
            Operational posture backed by <code className="mono">active_violations_view</code> and pessimistic row-locking state machine (<code className="mono">SELECT ... FOR UPDATE</code>)
          </p>
        </div>
      </div>

      {actionSuccess && (
        <div style={{ background: "rgba(16, 185, 129, 0.15)", border: "1px solid rgba(16, 185, 129, 0.4)", color: "#6ee7b7", padding: "0.75rem 1rem", borderRadius: "8px", marginBottom: "1.5rem", fontSize: "0.875rem" }}>
          {actionSuccess}
        </div>
      )}

      {actionError && (
        <div style={{ background: "rgba(244, 63, 94, 0.15)", border: "1px solid rgba(244, 63, 94, 0.4)", color: "#fb7185", padding: "0.75rem 1rem", borderRadius: "8px", marginBottom: "1.5rem", fontSize: "0.875rem" }}>
          {actionError}
        </div>
      )}

      {/* Grid: Active Violations Table & Quarantine Log */}
      <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
        {/* Active Violations View */}
        <div className="glass-panel" style={{ padding: "1.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <h3 style={{ fontSize: "1.1rem" }}>Active Violations Posture</h3>
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Total: {violations.length}</span>
          </div>

          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Severity</th>
                  <th>Policy Rule</th>
                  <th>Source Agent</th>
                  <th>Target Agent</th>
                  <th>Description</th>
                  <th>Isolation Status</th>
                  <th>Detected At</th>
                </tr>
              </thead>
              <tbody>
                {violations.map((v) => (
                  <tr key={v.violation_id}>
                    <td>
                      <span className={`severity-pill ${v.severity}`}>{v.severity}</span>
                    </td>
                    <td style={{ fontWeight: 600 }}>{v.policy_name}</td>
                    <td>{v.source_agent_name}</td>
                    <td style={{ color: "var(--text-secondary)" }}>{v.target_agent_name}</td>
                    <td style={{ fontSize: "0.8rem", maxWidth: "340px", color: "var(--text-secondary)" }}>
                      {v.description}
                    </td>
                    <td>
                      <span className={`status-pill ${v.is_source_quarantined ? "quarantined" : "active"}`}>
                        {v.is_source_quarantined ? "Quarantined" : "Uncontained"}
                      </span>
                    </td>
                    <td style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                      {new Date(v.detected_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Quarantine Action & Containment History */}
        <div className="glass-panel" style={{ padding: "1.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <h3 style={{ fontSize: "1.1rem" }}>Quarantine Containment Audit Trail</h3>
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Total Events: {quarantines.length}</span>
          </div>

          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Containment ID</th>
                  <th>Agent Name</th>
                  <th>Status</th>
                  <th>Triggering Violation</th>
                  <th>Quarantined At</th>
                  <th>Released At</th>
                  <th style={{ textAlign: "right" }}>Governance Action</th>
                </tr>
              </thead>
              <tbody>
                {quarantines.map((q) => (
                  <tr key={q.quarantine_id}>
                    <td>
                      <code className="mono" style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                        {q.quarantine_id.slice(0, 8)}...
                      </code>
                    </td>
                    <td style={{ fontWeight: 600 }}>{q.agent_name}</td>
                    <td>
                      <span className={`status-pill ${q.quarantine_status}`}>
                        {q.quarantine_status}
                      </span>
                    </td>
                    <td style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                      {q.violation_severity ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                          <span className={`severity-pill ${q.violation_severity}`}>{q.violation_severity}</span>
                          <span>{q.violation_description?.slice(0, 40)}...</span>
                        </span>
                      ) : (
                        <span style={{ color: "var(--text-muted)" }}>Manual Operator Isolation</span>
                      )}
                    </td>
                    <td style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                      {new Date(q.quarantined_at).toLocaleString()}
                    </td>
                    <td style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                      {q.released_at ? new Date(q.released_at).toLocaleString() : "-"}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <RoleGate
                        allowedRoles={["admin"]}
                        fallback={
                          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                            Auditor Read-Only
                          </span>
                        }
                      >
                        {q.quarantine_status === "active" ? (
                          <button
                            id={`btn-release-${q.agent_id.slice(0, 8)}`}
                            className="btn btn-success"
                            style={{ padding: "0.35rem 0.75rem", fontSize: "0.75rem" }}
                            onClick={() => {
                              setTargetAgent({ agent_id: q.agent_id, name: q.agent_name });
                              setTargetAction("release");
                              setActionReason("Operator verified threat neutralization");
                            }}
                          >
                            Release Agent
                          </button>
                        ) : (
                          <button
                            id={`btn-quarantine-${q.agent_id.slice(0, 8)}`}
                            className="btn btn-danger"
                            style={{ padding: "0.35rem 0.75rem", fontSize: "0.75rem" }}
                            onClick={() => {
                              setTargetAgent({ agent_id: q.agent_id, name: q.agent_name });
                              setTargetAction("quarantine");
                              setActionReason("Manual operator isolation");
                            }}
                          >
                            Quarantine Again
                          </button>
                        )}
                      </RoleGate>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Action Confirmation Modal */}
      {targetAgent && (
        <div className="modal-overlay">
          <div className="modal-content glass-panel">
            <h3 style={{ fontSize: "1.25rem", marginBottom: "0.5rem" }}>
              Confirm {targetAction === "quarantine" ? "Agent Quarantine" : "Agent Release"}
            </h3>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginBottom: "1.25rem" }}>
              Target: <strong style={{ color: "var(--text-primary)" }}>{targetAgent.name}</strong> ({targetAgent.agent_id})
            </p>

            <div style={{ marginBottom: "1rem" }}>
              <label style={{ display: "block", fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: "0.35rem" }}>
                Operational Justification / Audit Reason
              </label>
              <textarea
                className="input"
                style={{ width: "100%", height: "80px", resize: "none" }}
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
                placeholder="Reason recorded in governance containment ledger..."
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setTargetAgent(null)}
                disabled={submittingAction}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`btn ${targetAction === "quarantine" ? "btn-danger" : "btn-success"}`}
                onClick={handleExecuteAction}
                disabled={submittingAction}
              >
                {submittingAction ? "Executing..." : `Confirm ${targetAction.toUpperCase()}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
