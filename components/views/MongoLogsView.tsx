"use client";

import React, { useState, useEffect } from "react";

export function MongoLogsView() {
  const [anomalies, setAnomalies] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  const loadMongoData = async () => {
    try {
      const [anomRes, logRes] = await Promise.all([
        fetch("/api/logs/anomalies", { credentials: "include" }),
        fetch("/api/logs?limit=10", { credentials: "include" }),
      ]);

      if (anomRes.ok) {
        const d = await anomRes.json();
        setAnomalies(d.anomalies || []);
      }
      if (logRes.ok) {
        const d = await logRes.json();
        setLogs(d.logs || []);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMongoData();
  }, []);

  return (
    <div style={{ padding: "2rem", maxWidth: "1400px", margin: "0 auto" }}>
      <div style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ fontSize: "1.5rem", marginBottom: "0.25rem" }}>MongoDB Anomaly Pipeline & Raw Telemetry</h2>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>
          Unstructured JSON payload repository with 4-stage aggregation pipeline calculating composite anomaly scores
        </p>
      </div>

      {/* Aggregation Pipeline Anomaly Leaderboard */}
      <div className="glass-panel" style={{ padding: "1.5rem", marginBottom: "2rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <div>
            <h3 style={{ fontSize: "1.1rem" }}>Pipeline Anomaly Leaderboard</h3>
            <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
              Formula: 40×SuspiciousCommands + 30×BypassHeaders + 20×LargePayloads + 10×Errors
            </p>
          </div>
          <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
            Evaluated Agents: {anomalies.length}
          </span>
        </div>

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Rank</th>
                <th>Agent Name</th>
                <th>Type / Team</th>
                <th>Anomaly Score</th>
                <th>Bypass Headers</th>
                <th>Large Payloads</th>
                <th>Suspicious Cmds</th>
                <th>Errors</th>
                <th>Operational Status</th>
              </tr>
            </thead>
            <tbody>
              {anomalies.map((item, idx) => {
                const isHighAnomaly = item.computed_anomaly_score >= 100;
                return (
                  <tr
                    key={item.agent_id}
                    style={{
                      background: isHighAnomaly ? "rgba(244, 63, 94, 0.05)" : "transparent",
                    }}
                  >
                    <td>
                      <span
                        style={{
                          fontWeight: 700,
                          color: idx === 0 && isHighAnomaly ? "var(--accent-rose)" : "var(--text-muted)",
                        }}
                      >
                        #{idx + 1}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: isHighAnomaly ? "#fda4af" : "var(--text-primary)" }}>
                        {item.agent_name}
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{item.agent_id}</div>
                    </td>
                    <td style={{ color: "var(--text-secondary)" }}>
                      {item.agent_type} • {item.owner_team}
                    </td>
                    <td>
                      <span
                        className="severity-pill"
                        style={{
                          background: isHighAnomaly ? "rgba(244, 63, 94, 0.25)" : "rgba(16, 185, 129, 0.15)",
                          color: isHighAnomaly ? "#fb7185" : "#34d399",
                          border: `1px solid ${isHighAnomaly ? "rgba(244, 63, 94, 0.5)" : "rgba(16, 185, 129, 0.3)"}`,
                          fontSize: "0.8rem",
                          padding: "0.25rem 0.6rem",
                        }}
                      >
                        {item.computed_anomaly_score} pts
                      </span>
                    </td>
                    <td className="mono">{item.bypass_attempts}</td>
                    <td className="mono">{item.large_payload_events}</td>
                    <td className="mono" style={{ color: item.suspicious_commands_detected > 0 ? "var(--accent-rose)" : "inherit" }}>
                      {item.suspicious_commands_detected}
                    </td>
                    <td className="mono">{item.error_events}</td>
                    <td>
                      <span className={`status-pill ${item.agent_status}`}>
                        {item.agent_status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Raw MongoDB Interaction Logs */}
      <div className="glass-panel" style={{ padding: "1.5rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <h3 style={{ fontSize: "1.1rem" }}>Polymorphic Raw Payload Inspector</h3>
          <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
            Showing 10 most recent MongoDB documents
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {logs.map((log) => {
            const isExpanded = expandedLog === log._id;
            const hasBypass = log.headers?.["x-bypass-governance"];
            const hasSuspicious = (log.raw_payload?.suspicious_commands?.length || 0) > 0;

            return (
              <div
                key={log._id}
                style={{
                  background: "rgba(13, 18, 31, 0.8)",
                  border: `1px solid ${hasBypass || hasSuspicious ? "rgba(244, 63, 94, 0.3)" : "var(--border-subtle)"}`,
                  borderRadius: "8px",
                  padding: "0.85rem 1.25rem",
                  cursor: "pointer",
                }}
                onClick={() => setExpandedLog(isExpanded ? null : log._id)}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <code className="mono" style={{ color: "var(--accent-cyan)", fontSize: "0.8rem" }}>
                      {log.interaction_id}
                    </code>
                    {hasBypass && (
                      <span className="severity-pill critical" style={{ fontSize: "0.65rem" }}>
                        BYPASS HEADER DETECTED
                      </span>
                    )}
                    {hasSuspicious && (
                      <span className="severity-pill critical" style={{ fontSize: "0.65rem" }}>
                        SUSPICIOUS COMMAND DETECTED
                      </span>
                    )}
                  </div>

                  <div style={{ fontSize: "0.775rem", color: "var(--text-muted)" }}>
                    {new Date(log.timestamp).toLocaleString()} • {isExpanded ? "▲ Hide JSON" : "▼ View JSON"}
                  </div>
                </div>

                {isExpanded && (
                  <div style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid var(--border-subtle)" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "1rem" }}>
                      <div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>
                          HEADERS
                        </div>
                        <pre
                          style={{
                            background: "rgba(8, 12, 20, 0.9)",
                            padding: "0.75rem",
                            borderRadius: "6px",
                            fontSize: "0.75rem",
                            color: "var(--accent-cyan)",
                            overflowX: "auto",
                          }}
                        >
                          {JSON.stringify(log.headers, null, 2)}
                        </pre>
                      </div>

                      <div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>
                          POLYMORPHIC RAW PAYLOAD
                        </div>
                        <pre
                          style={{
                            background: "rgba(8, 12, 20, 0.9)",
                            padding: "0.75rem",
                            borderRadius: "6px",
                            fontSize: "0.75rem",
                            color: "#e2e8f0",
                            overflowX: "auto",
                          }}
                        >
                          {JSON.stringify(log.raw_payload, null, 2)}
                        </pre>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
