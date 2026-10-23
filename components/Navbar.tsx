"use client";

import React from "react";
import { useAuth } from "./AuthContext";

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export function Navbar({ activeTab, setActiveTab }: NavbarProps) {
  const { user, logout } = useAuth();

  const tabs = [
    { id: "dashboard", label: "Dashboard" },
    { id: "agents", label: "Agent Registry" },
    { id: "policies", label: "Governance Policies" },
    { id: "interactions", label: "Interactions & Telemetry" },
    { id: "violations", label: "Violations & Quarantine" },
    { id: "mongo", label: "MongoDB Anomaly Pipeline" },
  ];

  return (
    <header className="navbar">
      <div className="brand">
        <div className="brand-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#080c14" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
        </div>
        <div>
          <span>Agent</span>
          <span style={{ color: "var(--accent-cyan)" }}>Trust</span>
        </div>
      </div>

      <nav className="nav-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            id={`nav-tab-${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
            className={`nav-tab-btn ${activeTab === tab.id ? "active" : ""}`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="user-badge">
        {user && (
          <>
            <span
              id="active-user-role-badge"
              className={`role-pill ${user.role}`}
            >
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} />
              {user.role}
            </span>
            <span style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>
              {user.username}
            </span>
            <button
              id="btn-logout"
              onClick={() => logout()}
              className="btn btn-secondary"
              style={{ padding: "0.4rem 0.85rem", fontSize: "0.8rem" }}
            >
              Sign Out
            </button>
          </>
        )}
      </div>
    </header>
  );
}
