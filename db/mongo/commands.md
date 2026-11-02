# AgentTrust: MongoDB Raw mongosh Commands & Telemetry Reference

This document provides the raw `mongosh` command equivalents for all NoSQL CRUD, indexing, validation, and aggregation pipeline operations implemented in the AgentTrust governance platform.

---

## 1. Collection Creation with JSON Schema Validation ($jsonSchema)

Creates the `log_annotations` collection enforcing strict schema validation (required fields, types, and constraints):

```javascript
use agenttrust;

db.createCollection("log_annotations", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["annotation_id", "interaction_id", "author", "note", "created_at"],
      properties: {
        annotation_id: {
          bsonType: "string",
          description: "UUID v4 unique identifier - required string"
        },
        interaction_id: {
          bsonType: "string",
          description: "Foreign key reference to interaction - required string"
        },
        author: {
          bsonType: "string",
          description: "Username of the author - required string"
        },
        note: {
          bsonType: "string",
          minLength: 1,
          description: "Annotation content - required string with minLength 1"
        },
        created_at: {
          bsonType: "date",
          description: "Timestamp of annotation creation - required date"
        },
        updated_at: {
          bsonType: "date",
          description: "Timestamp of last update - optional date"
        }
      }
    }
  }
});
```

---

## 2. Index Creation (createIndex)

### `interaction_logs` Indexes
```javascript
// 1. Unique index on interaction_id (1-to-1 linkage with PostgreSQL interactions table)
db.interaction_logs.createIndex({ interaction_id: 1 }, { unique: true, name: "idx_interaction_id" });

// 2. Single index on agent_id (for agent-specific log retrieval)
db.interaction_logs.createIndex({ agent_id: 1 }, { name: "idx_agent_id" });

// 3. Descending time-series index on timestamp
db.interaction_logs.createIndex({ timestamp: -1 }, { name: "idx_timestamp_desc" });

// 4. Compound index on (agent_id, timestamp) for filtered chronological browsing
db.interaction_logs.createIndex({ agent_id: 1, timestamp: -1 }, { name: "idx_agent_timestamp" });
```

### `log_annotations` Indexes
```javascript
// 1. Unique index on annotation_id
db.log_annotations.createIndex({ annotation_id: 1 }, { unique: true, name: "idx_annotation_id" });

// 2. Foreign key lookup index on interaction_id
db.log_annotations.createIndex({ interaction_id: 1 }, { name: "idx_annotation_interaction_id" });

// 3. Descending time-series index on created_at
db.log_annotations.createIndex({ created_at: -1 }, { name: "idx_annotation_created_at_desc" });
```

---

## 3. Read Operations (find)

### Query Telemetry Logs (Filtered & Paginated)
```javascript
db.interaction_logs.find({
  agent_id: "b0000000-0000-0000-0000-000000000008"
})
.sort({ timestamp: -1 })
.skip(0)
.limit(10);
```

### Query Annotations by Interaction
```javascript
db.log_annotations.find({
  interaction_id: "d0000000-0000-0000-0000-000000000009"
})
.sort({ created_at: -1 });
```

---

## 4. Update Operations (updateOne)

### Admin Review Marking (`PATCH /api/logs/review`)
```javascript
db.interaction_logs.updateOne(
  { interaction_id: "d0000000-0000-0000-0000-000000000009" },
  {
    $set: {
      review: {
        status: "flagged",
        reviewed_by: "admin",
        reviewed_at: new Date(),
        note: "Suspicious payload command detected during compliance audit."
      }
    }
  }
);
```

### Update Log Annotation (`PATCH /api/logs/annotations`)
```javascript
db.log_annotations.updateOne(
  { annotation_id: "e0000000-0000-0000-0000-000000000001" },
  {
    $set: {
      note: "Updated auditor verification note: escalated to SecOps team.",
      updated_at: new Date()
    }
  }
);
```

---

## 5. Delete Operations (deleteOne)

### Delete Annotation (`DELETE /api/logs/annotations`)
```javascript
db.log_annotations.deleteOne({
  annotation_id: "e0000000-0000-0000-0000-000000000001"
});
```

> **Academic Architectural Note**: Deletion is intentionally supported on `log_annotations` (auditor notes), but strictly prohibited on `interaction_logs`. Deleting raw interaction logs would violate referential integrity between PostgreSQL `interactions` and MongoDB `interaction_logs`, failing the cross-database consistency validation (`verify-consistency.mjs`).

---

## 6. Anomaly Detection Aggregation Pipeline (aggregate)

Groups polymorphic logs by agent and calculates composite anomaly score:

```javascript
db.interaction_logs.aggregate([
  {
    $project: {
      agent_id: 1,
      interaction_id: 1,
      timestamp: 1,
      headers: 1,
      raw_payload: 1,
      has_bypass_header: { $cond: [{ $ifNull: ["$headers.x-bypass-governance", false] }, 1, 0] },
      has_large_payload: {
        $cond: [
          {
            $or: [
              { $gt: [{ $ifNull: ["$raw_payload.anomalous_payload_bytes", 0] }, 50000] },
              { $gt: [{ $ifNull: ["$raw_payload.payload_bytes", 0] }, 50000] }
            ]
          },
          1,
          0
        ]
      },
      has_suspicious_command: {
        $cond: [
          { $gt: [{ $size: { $ifNull: ["$raw_payload.suspicious_commands", []] } }, 0] },
          1,
          0
        ]
      },
      has_error: { $cond: [{ $ifNull: ["$raw_payload.error", false] }, 1, 0] }
    }
  },
  {
    $group: {
      _id: "$agent_id",
      total_interactions: { $sum: 1 },
      bypass_attempts: { $sum: "$has_bypass_header" },
      large_payload_events: { $sum: "$has_large_payload" },
      suspicious_commands_detected: { $sum: "$has_suspicious_command" },
      error_events: { $sum: "$has_error" },
      sample_interaction_ids: { $push: "$interaction_id" },
      latest_event_time: { $max: "$timestamp" }
    }
  },
  {
    $project: {
      agent_id: "$_id",
      total_interactions: 1,
      bypass_attempts: 1,
      large_payload_events: 1,
      suspicious_commands_detected: 1,
      error_events: 1,
      latest_event_time: 1,
      sample_interaction_ids: { $slice: ["$sample_interaction_ids", 3] },
      computed_anomaly_score: {
        $add: [
          { $multiply: ["$suspicious_commands_detected", 40] },
          { $multiply: ["$bypass_attempts", 30] },
          { $multiply: ["$large_payload_events", 20] },
          { $multiply: ["$error_events", 10] }
        ]
      }
    }
  },
  {
    $sort: { computed_anomaly_score: -1, total_interactions: -1 }
  }
]);
```

