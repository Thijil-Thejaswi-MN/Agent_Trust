"use client";

import React from "react";
import { useAuth } from "./AuthContext";

interface RoleGateProps {
  allowedRoles: ("admin" | "auditor")[];
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * RoleGate: Client-side UI visibility controller for RBAC.
 * Note: The server-side Route Handlers strictly enforce 403 on the API level.
 */
export function RoleGate({ allowedRoles, fallback = null, children }: RoleGateProps) {
  const { user } = useAuth();

  if (!user || !allowedRoles.includes(user.role)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
