# API Backups

The Backups API allows creating, managing, and restoring database backups. All endpoints require superuser authentication.

**Headers (required for all endpoints):**

| Header          | Value   | Description                          |
| --------------- | ------- | ------------------------------------ |
| `Authorization` | `TOKEN` | **Required.** A superuser auth token |

---

## List backups

```http
GET /api/backups
```

Returns a list of all available backups.

**Success response (200):**

```json
[
  {
    "key": "backup-2022-06-25.zip",
    "modified": "2022-06-25 10:00:00.000Z",
    "size": 1048576
  },
  {
    "key": "backup-2022-06-24.zip",
    "modified": "2022-06-24 10:00:00.000Z",
    "size": 1024000
  }
]
```

---

## Create backup

```http
POST /api/backups
```

Creates a new backup of the database.

**Body parameters:**

| Parameter | Type   | Description                                                                                |
| --------- | ------ | ------------------------------------------------------------------------------------------ |
| `name`    | string | Optional backup name. Must match `[a-z0-9_-]` and end with `.zip`. Auto-generated if empty |

**Example request:**

```json
{
  "name": "before-migration.zip"
}
```

**Success response (200):**

```json
{
  "status": 200,
  "message": "Success."
}
```

---

## Upload backup

```http
POST /api/backups/upload
```

Uploads an existing backup file.

**Content-Type:** `multipart/form-data`

**Form fields:**

| Field  | Type | Description                       |
| ------ | ---- | --------------------------------- |
| `file` | file | **Required.** The backup ZIP file |

**Success response (200):**

```json
{
  "status": 200,
  "message": "Success."
}
```

---

## Delete backup

```http
DELETE /api/backups/{key}
```

Deletes a backup.

**Path parameters:**

| Parameter | Type   | Description                           |
| --------- | ------ | ------------------------------------- |
| `key`     | string | **Required.** The backup key/filename |

**Success response (204):** No content.

---

## Restore backup

```http
POST /api/backups/{key}/restore
```

Restores the application from a backup. The application will be restarted after the restore completes.

**Path parameters:**

| Parameter | Type   | Description                           |
| --------- | ------ | ------------------------------------- |
| `key`     | string | **Required.** The backup key/filename |

**Success response (200):**

```json
{
  "status": 200,
  "message": "Success."
}
```

---

## Download backup

```http
GET /api/backups/{key}?token=TOKEN
```

Downloads a backup file.

**Path parameters:**

| Parameter | Type   | Description                           |
| --------- | ------ | ------------------------------------- |
| `key`     | string | **Required.** The backup key/filename |

**Query parameters:**

| Parameter | Type   | Description                            |
| --------- | ------ | -------------------------------------- |
| `token`   | string | **Required.** The superuser auth token |

**Response:** The backup ZIP file as a binary download.

---

> **Source:** [pocketbase.io/docs/api-backups](https://pocketbase.io/docs/api-backups)

---

**Navigation:**

- Previous: [API Logs](15-api-logs.md)
- Next: [API Crons](17-api-crons.md)
- Up: [Introduction](01-introduction.md)
