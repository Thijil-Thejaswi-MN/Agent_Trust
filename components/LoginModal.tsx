"use client";

import React, { useState } from "react";
import { useAuth } from "./AuthContext";

export function LoginModal() {
  const { login } = useAuth();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const result = await login(username, password);
    setSubmitting(false);
    if (!result.success) {
      setError(result.error || "Authentication failed");
    }
  };

  const handleQuickLogin = async (user: string, pass: string) => {
    setUsername(user);
    setPassword(pass);
    setError(null);
    setSubmitting(true);
    const result = await login(user, pass);
    setSubmitting(false);
    if (!result.success) {
      setError(result.error || "Authentication failed");
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content glass-panel">
        <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              background: "linear-gradient(135deg, var(--accent-cyan), var(--accent-purple))",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 0 20px rgba(0, 229, 255, 0.4)",
              marginBottom: "1rem",
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#080c14" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <h2 style={{ fontSize: "1.5rem", marginBottom: "0.25rem" }}>AgentTrust Platform</h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>
            Multi-Agent Governance, Risk Monitoring & Runtime Containment
          </p>
        </div>

        {error && (
          <div
            id="login-error-banner"
            style={{
              background: "rgba(244, 63, 94, 0.15)",
              border: "1px solid rgba(244, 63, 94, 0.4)",
              color: "#fb7185",
              padding: "0.75rem",
              borderRadius: "8px",
              fontSize: "0.875rem",
              marginBottom: "1rem",
              textAlign: "center",
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <label style={{ display: "block", fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: "0.35rem" }}>
              Username
            </label>
            <input
              id="input-username"
              type="text"
              className="input"
              style={{ width: "100%" }}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: "0.35rem" }}>
              Password
            </label>
            <input
              id="input-password"
              type="password"
              className="input"
              style={{ width: "100%" }}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button
            id="btn-login-submit"
            type="submit"
            className="btn btn-primary"
            style={{ width: "100%", marginTop: "0.5rem" }}
            disabled={submitting}
          >
            {submitting ? "Authenticating..." : "Sign In to Governance Console"}
          </button>
        </form>

        <div style={{ margin: "1.5rem 0", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <div style={{ flex: 1, height: "1px", background: "var(--border-subtle)" }} />
          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Demo Personas
          </span>
          <div style={{ flex: 1, height: "1px", background: "var(--border-subtle)" }} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
          <button
            id="btn-quick-admin"
            type="button"
            className="btn btn-secondary"
            style={{ fontSize: "0.75rem", padding: "0.55rem" }}
            onClick={() => handleQuickLogin("admin", "admin123")}
            disabled={submitting}
          >
            <span style={{ color: "var(--accent-purple)", fontWeight: 700 }}>ADMIN</span>
            <span>(Full Control)</span>
          </button>

          <button
            id="btn-quick-auditor"
            type="button"
            className="btn btn-secondary"
            style={{ fontSize: "0.75rem", padding: "0.55rem" }}
            onClick={() => handleQuickLogin("auditor", "auditor123")}
            disabled={submitting}
          >
            <span style={{ color: "var(--accent-cyan)", fontWeight: 700 }}>AUDITOR</span>
            <span>(Read-Only)</span>
          </button>
        </div>
      </div>
    </div>
  );
}
