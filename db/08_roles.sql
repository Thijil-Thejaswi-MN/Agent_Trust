-- ============================================================================
-- AgentTrust: Database-Level Role-Based Access Control (RBAC)
-- Target DBMS: PostgreSQL 16+
--
-- DEMO CREDENTIAL NOTICE (ACADEMIC EVALUATION ONLY):
-- Application login roles are provisioned with documented passwords:
--   - agenttrust_app_admin   / agenttrust_admin_pass
--   - agenttrust_app_auditor / agenttrust_auditor_pass
-- These match the credentials specified in .env.example.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. CREATE GROUP ROLES (Distinguished from cluster owner 'agenttrust_admin')
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'at_admin_role') THEN
        CREATE ROLE at_admin_role NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'at_auditor_role') THEN
        CREATE ROLE at_auditor_role NOLOGIN;
    END IF;
END
$$;

-- ----------------------------------------------------------------------------
-- 2. CREATE APPLICATION LOGIN ROLES
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'agenttrust_app_admin') THEN
        CREATE ROLE agenttrust_app_admin WITH LOGIN PASSWORD 'agenttrust_admin_pass';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'agenttrust_app_auditor') THEN
        CREATE ROLE agenttrust_app_auditor WITH LOGIN PASSWORD 'agenttrust_auditor_pass';
    END IF;
END
$$;

GRANT at_admin_role TO agenttrust_app_admin;
GRANT at_auditor_role TO agenttrust_app_auditor;

-- ----------------------------------------------------------------------------
-- 3. REVOKE DEFAULT PUBLIC PRIVILEGES (Defense in Depth)
-- ----------------------------------------------------------------------------
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON SCHEMA public FROM PUBLIC;

GRANT USAGE ON SCHEMA public TO at_admin_role, at_auditor_role;

-- ----------------------------------------------------------------------------
-- 4. PASSWORD HASH PROTECTION: SECURITY DEFINER LOGIN FUNCTION
-- Encapsulates authentication query without exposing users.password_hash to auditor
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_login_record(p_username VARCHAR)
RETURNS TABLE (
    user_id UUID,
    username VARCHAR(64),
    password_hash VARCHAR(255),
    role VARCHAR(20)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN QUERY
    SELECT u.user_id, u.username, u.password_hash, u.role
    FROM users u
    WHERE u.username = p_username;
END;
$$;

REVOKE EXECUTE ON FUNCTION get_login_record(VARCHAR) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_login_record(VARCHAR) TO at_auditor_role;
GRANT EXECUTE ON FUNCTION get_login_record(VARCHAR) TO at_admin_role;

-- ----------------------------------------------------------------------------
-- 5. AUDITOR PRIVILEGES: STRICTLY READ-ONLY (SELECT ONLY)
-- Column-level SELECT on users: excludes password_hash!
-- ----------------------------------------------------------------------------
GRANT SELECT ON agents, policies, interactions, violations, quarantine_events, risk_scores TO at_auditor_role;
GRANT SELECT ON active_violations_view TO at_auditor_role;
GRANT SELECT (user_id, username, role, created_at) ON users TO at_auditor_role;
-- Explicitly: NO INSERT, UPDATE, DELETE, TRUNCATE, or compute_risk_score execution!

-- ----------------------------------------------------------------------------
-- 6. ADMIN PRIVILEGES: DML READ/WRITE & PROCEDURE EXECUTION (NO DDL)
-- ----------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO at_admin_role;
GRANT SELECT ON active_violations_view TO at_admin_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO at_admin_role;
GRANT EXECUTE ON FUNCTION compute_risk_score(UUID) TO at_admin_role;

-- ----------------------------------------------------------------------------
-- 7. ALTER DEFAULT PRIVILEGES FOR FUTURE TABLES
-- ----------------------------------------------------------------------------
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT ON TABLES TO at_auditor_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO at_admin_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO at_admin_role;

-- ----------------------------------------------------------------------------
-- 8. SECURITY DEFINER PRIVILEGE ENFORCEMENT ON TRIGGERS & FUNCTIONS
-- ----------------------------------------------------------------------------
ALTER FUNCTION evaluate_interaction_policies() SECURITY DEFINER SET search_path = public, pg_temp;
ALTER FUNCTION auto_quarantine_on_critical_violation() SECURITY DEFINER SET search_path = public, pg_temp;
ALTER FUNCTION compute_risk_score(UUID) SECURITY DEFINER SET search_path = public, pg_temp;

