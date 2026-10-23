"use client";

import React, { useState } from "react";
import { AuthProvider, useAuth } from "@/components/AuthContext";
import { Navbar } from "@/components/Navbar";
import { LoginModal } from "@/components/LoginModal";
import { DashboardView } from "@/components/views/DashboardView";
import { AgentsView } from "@/components/views/AgentsView";
import { InteractionsView } from "@/components/views/InteractionsView";
import { ViolationsView } from "@/components/views/ViolationsView";
import { MongoLogsView } from "@/components/views/MongoLogsView";

function MainContent() {
  const { user, loading } = useAuth();
  const [activeTab, setActiveTab] = useState("dashboard");

  if (loading) {
    return (
      <div style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center", color: "var(--accent-cyan)" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>⚡</div>
          <div style={{ fontSize: "1rem", letterSpacing: "0.05em", textTransform: "uppercase" }}>
            Initializing AgentTrust Governance Platform...
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginModal />;
  }

  return (
    <div style={{ minHeight: "100vh", paddingBottom: "4rem" }}>
      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />
      <main>
        {activeTab === "dashboard" && <DashboardView />}
        {activeTab === "agents" && <AgentsView />}
        {activeTab === "interactions" && <InteractionsView />}
        {activeTab === "violations" && <ViolationsView />}
        {activeTab === "mongo" && <MongoLogsView />}
      </main>
    </div>
  );
}

export default function HomePage() {
  return (
    <AuthProvider>
      <MainContent />
    </AuthProvider>
  );
}
