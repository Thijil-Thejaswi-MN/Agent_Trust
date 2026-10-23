# AgentTrust: SQL Index Optimization Benchmark Results

This document presents empirical execution plan benchmarks evaluated on PostgreSQL 16 comparing unindexed sequential scan versus B-Tree index scan performance on a high-throughput dataset of **200,000 interactions**.

---

## 1. Benchmark Query

The benchmark evaluates the most frequent governance query: retrieving an agent's recent interactions ordered by time (used by dashboard timelines and the risk score engine):

```sql
SELECT * 
FROM interactions 
WHERE source_agent_id = 'b0000000-0000-0000-0000-000000000001' 
ORDER BY initiated_at DESC 
LIMIT 50;
```

---

## 2. Execution Plans & Timings Comparison (200,000 Rows)

Tested inside an isolated transaction (`BEGIN ... ROLLBACK` in `db/tests.sql`) after generating 200,000 synthetic rows and executing `ANALYZE interactions;`.

### Plan A: Without Composite Index (Full Table Scan + Heapsort)
```text
 Limit  (cost=5672.94..5678.77 rows=50 width=97) (actual time=9.031..11.106 rows=50 loops=1)
   ->  Gather Merge  (cost=5672.94..8138.51 rows=21132 width=97) (actual time=9.029..11.100 rows=50 loops=1)
         Workers Planned: 2
         Workers Launched: 2
         ->  Sort  (cost=4672.91..4699.33 rows=10566 width=97) (actual time=4.519..4.521 rows=50 loops=3)
               Sort Key: initiated_at DESC
               Sort Method: top-N heapsort  Memory: 32kB
               Worker 0:  Sort Method: top-N heapsort  Memory: 31kB
               Worker 1:  Sort Method: top-N heapsort  Memory: 31kB
               ->  Parallel Seq Scan on interactions  (cost=0.00..4321.92 rows=10566 width=97) (actual time=0.009..3.726 rows=8336 loops=3)
                     Filter: (source_agent_id = 'b0000000-0000-0000-0000-000000000001'::uuid)
                     Rows Removed by Filter: 58347
 Planning Time: 0.283 ms
 Execution Time: 11.261 ms
```

### Plan B: With Composite Index (`idx_interactions_source_time` on `(source_agent_id, initiated_at DESC)`)
```text
 Limit  (cost=0.42..28.97 rows=50 width=97) (actual time=0.023..0.034 rows=50 loops=1)
   ->  Index Scan using idx_interactions_source_time on interactions  (cost=0.42..13913.69 rows=24366 width=97) (actual time=0.022..0.031 rows=50 loops=1)
         Index Cond: (source_agent_id = 'b0000000-0000-0000-0000-000000000001'::uuid)
 Planning Time: 0.229 ms
 Execution Time: 0.048 ms
```

---

## 3. Performance Analysis

| Metric | Without Composite Index | With Composite Index (`idx_interactions_source_time`) | Improvement |
| :--- | :--- | :--- | :--- |
| **Execution Time** | `11.261 ms` | `0.048 ms` | **~234x Faster** |
| **Access Method** | Parallel Sequential Scan (2 workers) | B-Tree Direct Index Scan | Direct traversal |
| **Sort Technique** | Top-N heapsort in memory | Pre-sorted B-Tree leaf order | Zero sort overhead |
| **Rows Examined** | 175,041 discarded rows | Exactly 50 index tuples read | Minimal I/O |

---

## 4. MongoDB Seed Anomaly Note

The MongoDB seed script (`db/mongo/seed.mjs`) deliberately plants anomalous payloads for agent **Theta-Threat-Scanner** (`b0000000-0000-0000-0000-000000000008`):
- `x-bypass-governance: true` HTTP headers.
- Oversized payload buffers exceeding 140KB.
- Suspicious shell commands (`sh -c 'curl ... | bash'`).
- Legacy disallowed protocol overrides.

This enables immediate demonstration of the MongoDB anomaly aggregation pipeline, which ranks Theta-Threat-Scanner at the top with an anomaly score of **150**.
