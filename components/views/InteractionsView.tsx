"use client";

import React, { useState, useEffect } from "react";

export function InteractionsView() {
  const [interactions, setInteractions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");

  const fetchInteractions = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", "15");
      if (statusFilter) params.set("status", statusFilter);

      const res = await fetch(`/api/interactions?${params.toString()}`, { credentials: "include" });
      if (res.ok) {
        const d = await res.json();
        setInteractions(d.interactions || []);
        if (d.pagination) {
          setTotalPages(d.pagination.totalPages || 1);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInteractions();
  }, [page, statusFilter]);

  return (
    <div style={{ padding: "2rem", maxWidth: "1400px", margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h2 style={{ fontSize: "1.5rem", marginBottom: "0.25rem" }}>Interaction Audit Stream</h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>
            Real-time multi-agent communication telemetry, SLA benchmarks, and protocol verifications
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <select
            id="select-interaction-status"
            className="select"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Statuses</option>
            <option value="success">Success Only</option>
            <option value="failed">Failed / SLA Breached</option>
          </select>
        </div>
      </div>

      <div className="glass-panel" style={{ padding: "1.5rem" }}>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Interaction ID</th>
                <th>Source Agent</th>
                <th>Target Agent</th>
                <th>Protocol</th>
                <th>Status</th>
                <th>D2D Latency</th>
                <th>Broker Latency</th>
                <th>Reviewer Latency</th>
                <th>Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {interactions.map((it) => {
                const d2b = parseFloat(it.latency_d2b || "0");
                const d2rev = parseFloat(it.latency_d2rev || "0");
                const isBrokerSlaBreach = d2b > 250;
                const isRevSlaBreach = d2rev > 600;

                return (
                  <tr key={it.interaction_id}>
                    <td>
                      <code className="mono" style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                        {it.interaction_id.slice(0, 8)}...
                      </code>
                    </td>
                    <td>
                      <strong>{it.source_agent_name}</strong>
                    </td>
                    <td style={{ color: "var(--text-secondary)" }}>
                      {it.target_agent_name}
                    </td>
                    <td>
                      <code className="mono" style={{ fontSize: "0.775rem", color: it.protocol.includes("Legacy") ? "#fb7185" : "inherit" }}>
                        {it.protocol}
                      </code>
                    </td>
                    <td>
                      <span className={`status-pill ${it.status === "success" ? "active" : "quarantined"}`}>
                        {it.status}
                      </span>
                    </td>
                    <td>
                      <span className="mono">{it.latency_d2d ? `${it.latency_d2d} ms` : "-"}</span>
                    </td>
                    <td>
                      <span
                        className="mono"
                        style={{
                          color: isBrokerSlaBreach ? "var(--accent-rose)" : "inherit",
                          fontWeight: isBrokerSlaBreach ? 700 : "normal",
                        }}
                      >
                        {it.latency_d2b ? `${it.latency_d2b} ms` : "-"}
                        {isBrokerSlaBreach && " ⚠"}
                      </span>
                    </td>
                    <td>
                      <span
                        className="mono"
                        style={{
                          color: isRevSlaBreach ? "var(--accent-amber)" : "inherit",
                          fontWeight: isRevSlaBreach ? 700 : "normal",
                        }}
                      >
                        {it.latency_d2rev ? `${it.latency_d2rev} ms` : "-"}
                        {isRevSlaBreach && " ⚠"}
                      </span>
                    </td>
                    <td style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                      {new Date(it.initiated_at).toLocaleTimeString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "1.25rem", paddingTop: "1rem", borderTop: "1px solid var(--border-subtle)" }}>
          <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
            Page {page} of {totalPages}
          </span>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              className="btn btn-secondary"
              style={{ padding: "0.4rem 0.85rem", fontSize: "0.8rem" }}
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <button
              className="btn btn-secondary"
              style={{ padding: "0.4rem 0.85rem", fontSize: "0.8rem" }}
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
