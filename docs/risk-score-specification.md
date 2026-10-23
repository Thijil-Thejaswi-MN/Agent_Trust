# AgentTrust: Risk Score Calculation Specification

This document details the mathematical model and algorithm implemented in the PostgreSQL stored function [`compute_risk_score(p_agent_id UUID)`](file:///c:/Users/thiji/OneDrive/Documents/Projects/DBMS/db/03_functions.sql).

---

## 1. Governance Objective

In a multi-agent system (A2A), an agent's trust posture cannot be measured purely by binary status (`active` vs `quarantined`). A continuous risk metric ($[0.00, 100.00]$) is required to:
- Dynamically detect anomalous agents before catastrophic SLA failure.
- Trigger tiered remediation (rate-limiting, enhanced audit logging, or quarantine).
- Provide auditors with an empirical leaderboard of operational reliability.

---

## 2. Mathematical Model

For an agent $A$, the risk score $R(A)$ is computed across all interactions $I_A$ initiated by $A$ ($source\_agent\_id = A$) within an active 30-day sliding window ($T_{\text{window}} = 30 \text{ days}$):

$$R(A) = \text{clamp}_{[0, 100]}\left( \sum_{v \in V_A} W(v) + \sum_{f \in F_A} P_{\text{failure}} \right)$$

### Where:

1. **Severity Penalty Weights $W(v)$:**
   $$\begin{cases} 
   35.00 & \text{if } v.\text{severity} = \text{'critical'} \quad (\text{e.g. Critical SLA spike } > 800\text{ms, Prohibited protocol}) \\ 
   20.00 & \text{if } v.\text{severity} = \text{'high'} \quad (\text{e.g. Broker latency breach } > 250\text{ms}) \\ 
   10.00 & \text{if } v.\text{severity} = \text{'medium'} \quad (\text{e.g. Reviewer latency breach } > 600\text{ms}) \\ 
   5.00  & \text{if } v.\text{severity} = \text{'low'} \quad (\text{minor operational latency deviations}) 
   \end{cases}$$

2. **Operational Reliability Penalty $P_{\text{failure}}$:**
   $$P_{\text{failure}} = 10.00 \text{ points for each interaction where } status = \text{'failed'}$$

3. **Clamping & Normalization Function:**
   $$\text{clamp}_{[0, 100]}(S) = \min(100.00, \max(0.00, S))$$
   Enforces compliance with the database constraint:
   ```sql
   CHECK (score_value >= 0.0 AND score_value <= 100.0)
   ```

4. **Rolling Time Window:**
   Only interactions initiated within recent history are counted:
   ```sql
   WHERE i.source_agent_id = p_agent_id 
     AND i.initiated_at >= (NOW() - INTERVAL '30 days')
   ```

---

## 3. Database Persistence & Immutability

Each call to `compute_risk_score(agent_id)`:
1. Performs the weighted calculation inside PostgreSQL.
2. Inserts an immutable assessment event into `risk_scores`:
   ```sql
   INSERT INTO risk_scores (score_id, agent_id, score_value, computed_at)
   VALUES (gen_random_uuid(), p_agent_id, v_final_score, NOW());
   ```
3. Returns the computed numeric value (`NUMERIC(5,2)`).
