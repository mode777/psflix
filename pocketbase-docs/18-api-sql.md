# API SQL

The SQL API allows executing raw SQL queries against the database. This endpoint requires superuser authentication and is intended for one-off analytic queries only.

> **Warning:** The SQL API is designed for one-off analytic queries only. It should not be used as the primary data interface for your application. Use the [Records API](10-api-records.md) for regular data operations.

**Headers (required):**

| Header          | Value   | Description                          |
| --------------- | ------- | ------------------------------------ |
| `Authorization` | `TOKEN` | **Required.** A superuser auth token |

---

## Run raw SQL query

```http
POST /api/sql
```

Executes a raw SQL query.

**Body parameters:**

| Parameter | Type   | Description                            |
| --------- | ------ | -------------------------------------- |
| `query`   | string | **Required.** The SQL query to execute |

**Example request:**

```json
{
  "query": "SELECT id, title, created FROM posts WHERE status = 'published' ORDER BY created DESC LIMIT 10"
}
```

**Success response (200):**

```json
{
  "execTime": 12.34,
  "affectedRows": 0,
  "columns": ["id", "title", "created"],
  "rows": [
    ["abc123", "Hello World", "2022-01-01 10:00:00.000Z"],
    ["def456", "Another Post", "2022-01-02 10:00:00.000Z"]
  ]
}
```

**Response fields:**

| Field          | Type   | Description                                        |
| -------------- | ------ | -------------------------------------------------- |
| `execTime`     | number | Query execution time in milliseconds               |
| `affectedRows` | number | Number of affected rows (for INSERT/UPDATE/DELETE) |
| `columns`      | array  | Column names returned by the query                 |
| `rows`         | array  | Array of row arrays                                |

**Error response (400):**

```json
{
  "status": 400,
  "message": "SQL error near 'SELEC': syntax error"
}
```

---

> **Source:** [pocketbase.io/docs/api-sql](https://pocketbase.io/docs/api-sql)

---

**Navigation:**

- Previous: [API Crons](17-api-crons.md)
- Next: [API Health](19-api-health.md)
- Up: [Introduction](01-introduction.md)
