# API Logs

The Logs API provides access to application logs and statistics. All endpoints require superuser authentication.

**Headers (required for all endpoints):**

| Header          | Value   | Description                          |
| --------------- | ------- | ------------------------------------ |
| `Authorization` | `TOKEN` | **Required.** A superuser auth token |

---

## List logs

```http
GET /api/logs
```

Returns a paginated list of logs.

**Query parameters:**

| Parameter | Type   | Description                                                  |
| --------- | ------ | ------------------------------------------------------------ |
| `page`    | number | The page number (default: `1`)                               |
| `perPage` | number | The max number of items per page (default: `30`, max: `500`) |
| `sort`    | string | Attribute name to sort by. Use `-` prefix for descending     |
| `filter`  | string | Filter expression                                            |
| `fields`  | string | Comma-separated fields to return                             |

You can filter by `data.*` attributes, for example:

- `data.status >= 400`
- `data.type = "request"`
- `data.url ~ "/api/users"`

**Success response (200):**

```json
{
  "page": 1,
  "perPage": 30,
  "totalItems": 500,
  "totalPages": 17,
  "items": [
    {
      "id": "log_id",
      "created": "2022-06-25 10:00:00.000Z",
      "data": {
        "type": "request",
        "url": "/api/collections/posts/records",
        "method": "GET",
        "status": 200,
        "authId": "",
        "remoteIP": "127.0.0.1",
        "userAgent": "Mozilla/5.0",
        "referer": "",
        "execTime": 12.34
      }
    }
  ]
}
```

---

## View log

```http
GET /api/logs/{id}
```

Returns a single log entry by its ID.

**Path parameters:**

| Parameter | Type   | Description                    |
| --------- | ------ | ------------------------------ |
| `id`      | string | **Required.** The log entry ID |

**Query parameters:**

| Parameter | Type   | Description                      |
| --------- | ------ | -------------------------------- |
| `fields`  | string | Comma-separated fields to return |

**Success response (200):**

```json
{
  "id": "log_id",
  "created": "2022-06-25 10:00:00.000Z",
  "data": {
    "type": "request",
    "url": "/api/collections/posts/records",
    "method": "GET",
    "status": 200,
    "authId": "user_id",
    "remoteIP": "127.0.0.1",
    "userAgent": "Mozilla/5.0",
    "referer": "",
    "execTime": 12.34,
    "details": {}
  }
}
```

---

## Logs statistics

```http
GET /api/logs/stats
```

Returns aggregated log statistics grouped by hour.

**Query parameters:**

| Parameter | Type   | Description       |
| --------- | ------ | ----------------- |
| `filter`  | string | Filter expression |

**Success response (200):**

```json
{
  "total": 1000,
  "items": [
    {
      "date": "2022-06-25 10:00:00.000Z",
      "total": 50
    },
    {
      "date": "2022-06-25 09:00:00.000Z",
      "total": 75
    }
  ]
}
```

---

> **Source:** [pocketbase.io/docs/api-logs](https://pocketbase.io/docs/api-logs)

---

**Navigation:**

- Previous: [API Settings](14-api-settings.md)
- Next: [API Backups](16-api-backups.md)
- Up: [Introduction](01-introduction.md)
