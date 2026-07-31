# API Health

The Health API provides a simple endpoint for monitoring the application's status.

---

## Health check

```http
GET /api/health
HEAD /api/health
```

Returns the current health status of the application. Can be used for uptime monitoring and load balancer health checks.

**Query parameters:**

| Parameter | Type   | Description                      |
| --------- | ------ | -------------------------------- |
| `fields`  | string | Comma-separated fields to return |

**Success response (200):**

```json
{
  "status": 200,
  "message": "API is healthy.",
  "data": {
    "canBackup": true
  }
}
```

**Response fields:**

| Field            | Type    | Description                                   |
| ---------------- | ------- | --------------------------------------------- |
| `status`         | number  | HTTP status code                              |
| `message`        | string  | Health status message                         |
| `data.canBackup` | boolean | Whether the backup functionality is available |

---

> **Source:** [pocketbase.io/docs/api-health](https://pocketbase.io/docs/api-health)

---

**Navigation:**

- Previous: [API SQL](18-api-sql.md)
- Up: [Introduction](01-introduction.md)
