"use client";

import React, { useState, useEffect } from "react";
import { RoleGate } from "../RoleGate";

export function PoliciesView() {
  const [policies, setPolicies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Create Policy Modal / Form state
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState("");
  const [ruleType, setRuleType] = useState("latency_d2b");
  const [threshold, setThreshold] = useState("300");
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchPolicies = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/policies", { credentials: "include" });
      if (res.ok) {
        const d = await res.json();
        setPolicies(d.policies || []);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPolicies();
  }, []);

  const handleCreatePolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name,
          rule_type: ruleType,
          threshold: parseFloat(threshold),
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setFormSuccess(`Policy '${name}' created successfully.`);
        setName("");
        setThreshold("300");
        setShowModal(false);
        await fetchPolicies();
      } else {
        setFormError(data.error || "Failed to create policy");
      }
    } catch {
      setFormError("Network error while submitting governance policy");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ padding: "2rem", maxWidth: "1400px", margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h2 style={{ fontSize: "1.5rem", marginBottom: "0.25rem" }}>Governance Policy Catalog</h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>
            Operational SLAs, latency thresholds, and protocol security rules evaluated by database triggers
          </p>
        </div>

        <div>
          <RoleGate
            allowedRoles={["admin"]}
            fallback={
              <button
                id="btn-create-policy"
                className="btn btn-secondary"
                disabled
                title="Auditor role is read-only. Login as Admin to author policies."
              >
                + Author Policy (Admin Only)
              </button>
            }
          >
            <button
              id="btn-create-policy"
              className="btn btn-primary"
              onClick={() => {
                setFormError(null);
                setShowModal(true);
              }}
            >
              + Author New Policy
            </button>
          </RoleGate>
        </div>
      </div>

      {formSuccess && (
        <div style={{ background: "rgba(16, 185, 129, 0.15)", border: "1px solid rgba(16, 185, 129, 0.4)", color: "#6ee7b7", padding: "0.75rem 1rem", borderRadius: "8px", marginBottom: "1.5rem", fontSize: "0.875rem" }}>
          {formSuccess}
        </div>
      )}

      <div className="glass-panel" style={{ padding: "1.5rem" }}>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Policy Name</th>
                <th>Rule Type</th>
                <th>Threshold</th>
                <th>Author</th>
                <th>Created At</th>
                <th>Enforcement Trigger</th>
              </tr>
            </thead>
            <tbody>
              {policies.map((p) => {
                const isProtocol = p.rule_type === "protocol_security";
                const isCritical = isProtocol || p.rule_type === "cert_integrity";

                return (
                  <tr key={p.policy_id}>
                    <td>
                      <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>{p.name}</div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{p.policy_id}</div>
                    </td>
                    <td>
                      <span className="mono" style={{ color: isCritical ? "var(--accent-rose)" : "var(--accent-cyan)" }}>
                        {p.rule_type}
                      </span>
                    </td>
                    <td>
                      <strong className="mono" style={{ fontSize: "0.9rem" }}>
                        {p.threshold} {p.rule_type.startsWith("latency") ? "ms" : "level"}
                      </strong>
                    </td>
                    <td style={{ color: "var(--text-secondary)" }}>
                      {p.created_by_username || "System Administrator"}
                    </td>
                    <td style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                      {new Date(p.created_at).toLocaleDateString()}
                    </td>
                    <td>
                      <span className={`severity-pill ${isCritical ? "critical" : "high"}`}>
                        {isCritical ? "Auto-Quarantine" : "Violation Flag"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Author Policy Modal (Admin only) */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content glass-panel">
            <h3 style={{ fontSize: "1.25rem", marginBottom: "0.5rem" }}>Author Governance Policy</h3>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginBottom: "1.25rem" }}>
              New policy rule evaluated automatically by PostgreSQL trigger <code className="mono">trg_evaluate_interaction_policies</code> on every interaction insert.
            </p>

            {formError && (
              <div id="policy-form-error" style={{ background: "rgba(244, 63, 94, 0.15)", border: "1px solid rgba(244, 63, 94, 0.4)", color: "#fb7185", padding: "0.6rem 0.85rem", borderRadius: "6px", fontSize: "0.85rem", marginBottom: "1rem" }}>
                {formError}
              </div>
            )}

            <form onSubmit={handleCreatePolicy} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: "0.35rem" }}>
                  Policy Name
                </label>
                <input
                  id="input-policy-name"
                  type="text"
                  className="input"
                  style={{ width: "100%" }}
                  placeholder="e.g. Edge Device Ingress Latency SLA"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: "0.35rem" }}>
                    Rule Type
                  </label>
                  <select
                    id="select-policy-rule-type"
                    className="select"
                    style={{ width: "100%" }}
                    value={ruleType}
                    onChange={(e) => setRuleType(e.target.value)}
                  >
                    <option value="latency_d2b">latency_d2b (Broker)</option>
                    <option value="latency_d2d">latency_d2d (D2D)</option>
                    <option value="latency_d2rev">latency_d2rev (Reviewer)</option>
                    <option value="protocol_security">protocol_security (Protocol)</option>
                    <option value="cert_integrity">cert_integrity (Certificate)</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: "0.35rem" }}>
                    Threshold Value
                  </label>
                  <input
                    id="input-policy-threshold"
                    type="number"
                    step="0.01"
                    min="0.01"
                    className="input"
                    style={{ width: "100%" }}
                    value={threshold}
                    onChange={(e) => setThreshold(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "1rem" }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowModal(false)}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  id="btn-submit-policy"
                  type="submit"
                  className="btn btn-primary"
                  disabled={submitting}
                >
                  {submitting ? "Committing Rule..." : "Register Policy"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
