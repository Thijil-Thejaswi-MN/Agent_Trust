"use client";

import React, { useState, useEffect } from "react";
import { RoleGate } from "@/components/RoleGate";

export function MongoLogsView() {
  const [anomalies, setAnomalies] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const [annotations, setAnnotations] = useState<Record<string, any[]>>({});
  const [newAnnotationNote, setNewAnnotationNote] = useState<Record<string, string>>({});
  const [editingAnnotationId, setEditingAnnotationId] = useState<string | null>(null);
  const [editAnnotationText, setEditAnnotationText] = useState<string>("");
  const [reviewNote, setReviewNote] = useState<Record<string, string>>({});
  const [actionLoading, setActionLoading] = useState<string | null>(null);

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

  const loadAnnotationsForLog = async (interactionId: string) => {
    try {
      const res = await fetch(`/api/logs/annotations?interaction_id=${interactionId}`, { credentials: "include" });
      if (res.ok) {
        const d = await res.json();
        setAnnotations((prev) => ({ ...prev, [interactionId]: d.annotations || [] }));
      }
    } catch (e) {
      console.error("Failed to load annotations", e);
    }
  };

  const handleReview = async (interactionId: string, status: "approved" | "flagged" | "dismissed") => {
    setActionLoading(`review-${interactionId}-${status}`);
    try {
      const note = reviewNote[interactionId] || "";
      const res = await fetch("/api/logs/review", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ interaction_id: interactionId, status, note }),
      });
      if (res.ok) {
        const data = await res.json();
        setLogs((prev) =>
          prev.map((l) => (l.interaction_id === interactionId ? { ...l, review: data.review } : l))
        );
        setReviewNote((prev) => ({ ...prev, [interactionId]: "" }));
      }
    } finally {
      setActionLoading(null);
    }
  };

  const handleAddAnnotation = async (interactionId: string) => {
    const note = (newAnnotationNote[interactionId] || "").trim();
    if (!note) return;
    setActionLoading(`add-anno-${interactionId}`);
    try {
      const res = await fetch("/api/logs/annotations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ interaction_id: interactionId, note }),
      });
      if (res.ok) {
        const d = await res.json();
        setAnnotations((prev) => ({
          ...prev,
          [interactionId]: [d.annotation, ...(prev[interactionId] || [])],
        }));
        setNewAnnotationNote((prev) => ({ ...prev, [interactionId]: "" }));
      }
    } finally {
      setActionLoading(null);
    }
  };

  const handleUpdateAnnotation = async (interactionId: string, annotationId: string) => {
    if (!editAnnotationText.trim()) return;
    setActionLoading(`edit-anno-${annotationId}`);
    try {
      const res = await fetch("/api/logs/annotations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ annotation_id: annotationId, note: editAnnotationText.trim() }),
      });
      if (res.ok) {
        setAnnotations((prev) => ({
          ...prev,
          [interactionId]: (prev[interactionId] || []).map((a) =>
            a.annotation_id === annotationId ? { ...a, note: editAnnotationText.trim(), updated_at: new Date() } : a
          ),
        }));
        setEditingAnnotationId(null);
        setEditAnnotationText("");
      }
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteAnnotation = async (interactionId: string, annotationId: string) => {
    setActionLoading(`del-anno-${annotationId}`);
    try {
      const res = await fetch(`/api/logs/annotations?annotation_id=${annotationId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        setAnnotations((prev) => ({
          ...prev,
          [interactionId]: (prev[interactionId] || []).filter((a) => a.annotation_id !== annotationId),
        }));
      }
    } finally {
      setActionLoading(null);
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
          <h3 style={{ fontSize: "1.1rem" }}>Polymorphic Raw Payload Inspector & Governance Audit</h3>
          <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
            Showing 10 most recent MongoDB documents
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {logs.map((log) => {
            const isExpanded = expandedLog === log._id;
            const hasBypass = log.headers?.["x-bypass-governance"];
            const hasSuspicious = (log.raw_payload?.suspicious_commands?.length || 0) > 0;
            const logAnnotations = annotations[log.interaction_id] || [];
            const review = log.review;

            return (
              <div
                key={log._id}
                style={{
                  background: "rgba(13, 18, 31, 0.8)",
                  border: `1px solid ${hasBypass || hasSuspicious ? "rgba(244, 63, 94, 0.3)" : "var(--border-subtle)"}`,
                  borderRadius: "8px",
                  padding: "0.85rem 1.25rem",
                }}
              >
                {/* Header bar */}
                <div
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem", cursor: "pointer" }}
                  onClick={() => {
                    const next = isExpanded ? null : log._id;
                    setExpandedLog(next);
                    if (next && !annotations[log.interaction_id]) {
                      loadAnnotationsForLog(log.interaction_id);
                    }
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
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

                    {/* Review Badge */}
                    {review && (
                      <span
                        style={{
                          fontSize: "0.7rem",
                          fontWeight: 600,
                          padding: "0.2rem 0.5rem",
                          borderRadius: "4px",
                          textTransform: "uppercase",
                          background:
                            review.status === "approved"
                              ? "rgba(16, 185, 129, 0.2)"
                              : review.status === "flagged"
                              ? "rgba(244, 63, 94, 0.2)"
                              : "rgba(148, 163, 184, 0.2)",
                          color:
                            review.status === "approved"
                              ? "#34d399"
                              : review.status === "flagged"
                              ? "#fb7185"
                              : "#94a3b8",
                          border: `1px solid ${
                            review.status === "approved"
                              ? "rgba(16, 185, 129, 0.4)"
                              : review.status === "flagged"
                              ? "rgba(244, 63, 94, 0.4)"
                              : "rgba(148, 163, 184, 0.4)"
                          }`,
                        }}
                      >
                        REVIEW: {review.status} ({review.reviewed_by})
                      </span>
                    )}
                  </div>

                  <div style={{ fontSize: "0.775rem", color: "var(--text-muted)" }}>
                    {new Date(log.timestamp).toLocaleString()} • {isExpanded ? "▲ Hide Details" : "▼ View Details & Annotations"}
                  </div>
                </div>

                {isExpanded && (
                  <div style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid var(--border-subtle)" }}>
                    {/* Raw payload & headers grid */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "1rem", marginBottom: "1.5rem" }}>
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

                    {/* Admin Review Control Panel (Hidden for Auditor via RoleGate) */}
                    <RoleGate allowedRoles={["admin"]}>
                      <div
                        style={{
                          background: "rgba(18, 26, 43, 0.7)",
                          border: "1px solid var(--border-subtle)",
                          borderRadius: "6px",
                          padding: "1rem",
                          marginBottom: "1.5rem",
                        }}
                      >
                        <div style={{ fontSize: "0.825rem", fontWeight: 600, color: "var(--accent-cyan)", marginBottom: "0.5rem" }}>
                          Admin Log Review (updateOne + $set)
                        </div>
                        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
                          <input
                            type="text"
                            placeholder="Optional audit review note..."
                            value={reviewNote[log.interaction_id] || ""}
                            onChange={(e) =>
                              setReviewNote((prev) => ({ ...prev, [log.interaction_id]: e.target.value }))
                            }
                            className="input"
                            style={{ flex: 1, minWidth: "220px", fontSize: "0.8rem", padding: "0.4rem 0.6rem" }}
                          />
                          <button
                            onClick={() => handleReview(log.interaction_id, "approved")}
                            disabled={actionLoading === `review-${log.interaction_id}-approved`}
                            style={{
                              background: "rgba(16, 185, 129, 0.2)",
                              border: "1px solid rgba(16, 185, 129, 0.5)",
                              color: "#34d399",
                              padding: "0.4rem 0.8rem",
                              borderRadius: "6px",
                              fontSize: "0.775rem",
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                          >
                            ✓ Approve
                          </button>
                          <button
                            onClick={() => handleReview(log.interaction_id, "flagged")}
                            disabled={actionLoading === `review-${log.interaction_id}-flagged`}
                            style={{
                              background: "rgba(244, 63, 94, 0.2)",
                              border: "1px solid rgba(244, 63, 94, 0.5)",
                              color: "#fb7185",
                              padding: "0.4rem 0.8rem",
                              borderRadius: "6px",
                              fontSize: "0.775rem",
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                          >
                            ⚑ Flag
                          </button>
                          <button
                            onClick={() => handleReview(log.interaction_id, "dismissed")}
                            disabled={actionLoading === `review-${log.interaction_id}-dismissed`}
                            style={{
                              background: "rgba(148, 163, 184, 0.2)",
                              border: "1px solid rgba(148, 163, 184, 0.5)",
                              color: "#94a3b8",
                              padding: "0.4rem 0.8rem",
                              borderRadius: "6px",
                              fontSize: "0.775rem",
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                          >
                            ✕ Dismiss
                          </button>
                        </div>
                        {review?.note && (
                          <div style={{ marginTop: "0.5rem", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                            <strong>Current note:</strong> {review.note}
                          </div>
                        )}
                      </div>
                    </RoleGate>

                    {/* Log Annotations Panel */}
                    <div
                      style={{
                        background: "rgba(15, 22, 38, 0.85)",
                        border: "1px solid var(--border-subtle)",
                        borderRadius: "6px",
                        padding: "1rem",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                        <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-primary)" }}>
                          Interaction Annotations ({logAnnotations.length})
                        </div>
                        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                          Collection: <code className="mono">log_annotations</code>
                        </span>
                      </div>

                      {/* Admin Add Annotation Form (Hidden for Auditor via RoleGate) */}
                      <RoleGate allowedRoles={["admin"]}>
                        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
                          <input
                            type="text"
                            placeholder="Add compliance note or audit finding..."
                            value={newAnnotationNote[log.interaction_id] || ""}
                            onChange={(e) =>
                              setNewAnnotationNote((prev) => ({ ...prev, [log.interaction_id]: e.target.value }))
                            }
                            className="input"
                            style={{ flex: 1, fontSize: "0.8rem", padding: "0.4rem 0.6rem" }}
                          />
                          <button
                            onClick={() => handleAddAnnotation(log.interaction_id)}
                            disabled={actionLoading === `add-anno-${log.interaction_id}`}
                            style={{
                              background: "rgba(0, 229, 255, 0.15)",
                              border: "1px solid var(--accent-cyan)",
                              color: "var(--accent-cyan)",
                              padding: "0.4rem 0.85rem",
                              borderRadius: "6px",
                              fontSize: "0.775rem",
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                          >
                            + Add Annotation
                          </button>
                        </div>
                      </RoleGate>

                      {/* Annotations List */}
                      {logAnnotations.length === 0 ? (
                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontStyle: "italic" }}>
                          No annotations recorded for this interaction yet.
                        </div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                          {logAnnotations.map((anno) => {
                            const isEditing = editingAnnotationId === anno.annotation_id;
                            return (
                              <div
                                key={anno.annotation_id}
                                style={{
                                  background: "rgba(8, 12, 20, 0.7)",
                                  border: "1px solid var(--border-subtle)",
                                  borderRadius: "6px",
                                  padding: "0.6rem 0.85rem",
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                  flexWrap: "wrap",
                                  gap: "0.5rem",
                                }}
                              >
                                <div style={{ flex: 1, minWidth: "200px" }}>
                                  <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginBottom: "0.2rem" }}>
                                    <span style={{ color: "var(--accent-cyan)", fontWeight: 600 }}>{anno.author}</span> •{" "}
                                    {new Date(anno.created_at).toLocaleString()}
                                    {anno.updated_at && <span style={{ fontStyle: "italic" }}> (edited)</span>}
                                  </div>
                                  {isEditing ? (
                                    <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.3rem" }}>
                                      <input
                                        type="text"
                                        value={editAnnotationText}
                                        onChange={(e) => setEditAnnotationText(e.target.value)}
                                        className="input"
                                        style={{ flex: 1, fontSize: "0.8rem", padding: "0.3rem 0.5rem" }}
                                      />
                                      <button
                                        onClick={() => handleUpdateAnnotation(log.interaction_id, anno.annotation_id)}
                                        style={{
                                          background: "rgba(16, 185, 129, 0.2)",
                                          border: "1px solid #34d399",
                                          color: "#34d399",
                                          padding: "0.3rem 0.6rem",
                                          borderRadius: "4px",
                                          fontSize: "0.75rem",
                                          cursor: "pointer",
                                        }}
                                      >
                                        Save
                                      </button>
                                      <button
                                        onClick={() => setEditingAnnotationId(null)}
                                        style={{
                                          background: "transparent",
                                          border: "1px solid var(--border-subtle)",
                                          color: "var(--text-secondary)",
                                          padding: "0.3rem 0.6rem",
                                          borderRadius: "4px",
                                          fontSize: "0.75rem",
                                          cursor: "pointer",
                                        }}
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  ) : (
                                    <div style={{ fontSize: "0.825rem", color: "var(--text-primary)" }}>{anno.note}</div>
                                  )}
                                </div>

                                {/* Admin Mutating Actions (Hidden for Auditor via RoleGate) */}
                                <RoleGate allowedRoles={["admin"]}>
                                  {!isEditing && (
                                    <div style={{ display: "flex", gap: "0.4rem" }}>
                                      <button
                                        onClick={() => {
                                          setEditingAnnotationId(anno.annotation_id);
                                          setEditAnnotationText(anno.note);
                                        }}
                                        style={{
                                          background: "transparent",
                                          border: "1px solid var(--border-subtle)",
                                          color: "var(--text-secondary)",
                                          padding: "0.25rem 0.5rem",
                                          borderRadius: "4px",
                                          fontSize: "0.725rem",
                                          cursor: "pointer",
                                        }}
                                      >
                                        ✎ Edit
                                      </button>
                                      <button
                                        onClick={() => handleDeleteAnnotation(log.interaction_id, anno.annotation_id)}
                                        disabled={actionLoading === `del-anno-${anno.annotation_id}`}
                                        style={{
                                          background: "rgba(244, 63, 94, 0.15)",
                                          border: "1px solid rgba(244, 63, 94, 0.4)",
                                          color: "#fb7185",
                                          padding: "0.25rem 0.5rem",
                                          borderRadius: "4px",
                                          fontSize: "0.725rem",
                                          cursor: "pointer",
                                        }}
                                      >
                                        🗑 Delete
                                      </button>
                                    </div>
                                  )}
                                </RoleGate>
                              </div>
                            );
                          })}
                        </div>
                      )}
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
