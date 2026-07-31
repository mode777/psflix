# API Crons

The Crons API provides access to PocketBase's internal cron jobs. All endpoints require superuser authentication.

**Headers (required for all endpoints):**

| Header          | Value   | Description                          |
| --------------- | ------- | ------------------------------------ |
| `Authorization` | `TOKEN` | **Required.** A superuser auth token |

---

## List cron jobs

```http
GET /api/crons
```

Returns a list of all registered cron jobs with their schedules.

**Success response (200):**

```json
[
  {
    "id": "backup",
    "expression": "0 * * * *"
  },
  {
    "id": "logsCleanup",
    "expression": "0 0 * * *"
  }
]
```

---

## Run cron job

```http
POST /api/crons/{jobId}
```

Triggers a cron job to run immediately.

**Path parameters:**

| Parameter | Type   | Description                   |
| --------- | ------ | ----------------------------- |
| `jobId`   | string | **Required.** The cron job ID |

**Success response (200):**

```json
{
  "status": 200,
  "message": "Success."
}
```

---

> **Source:** [pocketbase.io/docs/api-crons](https://pocketbase.io/docs/api-crons)

---

**Navigation:**

- Previous: [API Backups](16-api-backups.md)
- Next: [API SQL](18-api-sql.md)
- Up: [Introduction](01-introduction.md)
