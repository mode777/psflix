# API Collections

The Collections API allows managing collection schemas and settings. All endpoints require superuser authentication.

**Headers (required for all endpoints):**

| Header          | Value   | Description                          |
| --------------- | ------- | ------------------------------------ |
| `Authorization` | `TOKEN` | **Required.** A superuser auth token |

---

## List collections

```http
GET /api/collections
```

Returns a paginated list of collections.

**Query parameters:**

| Parameter   | Type    | Description                                                  |
| ----------- | ------- | ------------------------------------------------------------ |
| `page`      | number  | The page number (default: `1`)                               |
| `perPage`   | number  | The max number of items per page (default: `30`, max: `500`) |
| `sort`      | string  | Attribute name to sort by. Use `-` prefix for descending     |
| `filter`    | string  | Filter expression                                            |
| `fields`    | string  | Comma-separated fields to return                             |
| `skipTotal` | boolean | If `true`, skips the total count for faster execution        |

**Success response (200):**

```json
{
  "page": 1,
  "perPage": 30,
  "totalItems": 5,
  "totalPages": 1,
  "items": [
    {
      "id": "abc123",
      "name": "posts",
      "type": "base",
      "system": false,
      "fields": [],
      "indexes": [],
      "created": "2022-01-01 10:00:00.000Z",
      "updated": "2022-01-01 10:00:00.000Z"
    }
  ]
}
```

---

## View collection

```http
GET /api/collections/{collectionIdOrName}
```

Returns a single collection by its ID or name.

**Path parameters:**

| Parameter            | Type   | Description                                    |
| -------------------- | ------ | ---------------------------------------------- |
| `collectionIdOrName` | string | **Required.** The ID or name of the collection |

**Query parameters:**

| Parameter | Type   | Description                      |
| --------- | ------ | -------------------------------- |
| `fields`  | string | Comma-separated fields to return |

**Success response (200):**

```json
{
  "id": "abc123",
  "name": "posts",
  "type": "base",
  "system": false,
  "fields": [
    {
      "id": "field_id",
      "name": "title",
      "type": "text",
      "system": false,
      "required": true,
      "options": {
        "min": 1,
        "max": 100,
        "pattern": ""
      }
    }
  ],
  "indexes": ["CREATE UNIQUE INDEX `idx_title` ON `posts` (`title`)"],
  "created": "2022-01-01 10:00:00.000Z",
  "updated": "2022-01-01 10:00:00.000Z"
}
```

---

## Create collection

```http
POST /api/collections
```

Creates a new collection.

**Query parameters:**

| Parameter | Type   | Description                      |
| --------- | ------ | -------------------------------- |
| `fields`  | string | Comma-separated fields to return |

**Body parameters:**

| Parameter    | Type    | Description                                                     |
| ------------ | ------- | --------------------------------------------------------------- |
| `name`       | string  | **Required.** The collection name (must be unique)              |
| `type`       | string  | **Required.** The collection type: `base`, `view`, or `auth`    |
| `fields`     | array   | **Required.** Array of field definitions                        |
| `indexes`    | array   | Array of index SQL statements                                   |
| `system`     | boolean | Whether the collection is a system collection                   |
| `listRule`   | string  | The rule for listing records (null = no access, empty = public) |
| `viewRule`   | string  | The rule for viewing records                                    |
| `createRule` | string  | The rule for creating records                                   |
| `updateRule` | string  | The rule for updating records                                   |
| `deleteRule` | string  | The rule for deleting records                                   |

Additional parameters for `auth` type collections:

| Parameter                    | Type   | Description                                                  |
| ---------------------------- | ------ | ------------------------------------------------------------ |
| `manageRule`                 | string | The rule for managing auth records                           |
| `authRule`                   | string | The rule for authenticating                                  |
| `authAlert`                  | object | Auth alert email settings (`enabled`, `emailTemplate`)       |
| `oauth2`                     | object | OAuth2 provider settings (`enabled`, `providers` array)      |
| `passwordAuth`               | object | Password auth settings (`enabled`, `identityFields`)         |
| `mfa`                        | object | MFA settings (`enabled`, `duration`)                         |
| `otp`                        | object | OTP settings (`enabled`, `duration`)                         |
| `token`                      | object | Token settings (`duration`, `secret`)                        |
| `verificationTemplate`       | object | Verification email template (`subject`, `body`, `actionUrl`) |
| `resetPasswordTemplate`      | object | Password reset email template                                |
| `confirmEmailChangeTemplate` | object | Email change confirmation template                           |

**Example request body:**

```json
{
  "name": "posts",
  "type": "base",
  "fields": [
    {
      "name": "title",
      "type": "text",
      "required": true,
      "options": {
        "min": 1,
        "max": 100
      }
    },
    {
      "name": "body",
      "type": "text"
    },
    {
      "name": "status",
      "type": "select",
      "options": {
        "values": ["draft", "published", "archived"]
      }
    }
  ],
  "listRule": "",
  "viewRule": "",
  "createRule": "@request.auth.id != ''",
  "updateRule": "@request.auth.id = author",
  "deleteRule": "@request.auth.id = author"
}
```

**Success response (200):**

```json
{
  "id": "new_collection_id",
  "name": "posts",
  "type": "base",
  "system": false,
  "fields": [],
  "indexes": [],
  "created": "2022-06-25 10:00:00.000Z",
  "updated": "2022-06-25 10:00:00.000Z"
}
```

---

## Update collection

```http
PATCH /api/collections/{collectionIdOrName}
```

Updates an existing collection.

**Path parameters:**

| Parameter            | Type   | Description                                    |
| -------------------- | ------ | ---------------------------------------------- |
| `collectionIdOrName` | string | **Required.** The ID or name of the collection |

The body parameters are the same as **Create collection**.

**Success response (200):** Returns the updated collection object.

---

## Delete collection

```http
DELETE /api/collections/{collectionIdOrName}
```

Deletes a collection and all its records.

**Path parameters:**

| Parameter            | Type   | Description                                    |
| -------------------- | ------ | ---------------------------------------------- |
| `collectionIdOrName` | string | **Required.** The ID or name of the collection |

**Success response (204):** No content.

---

## Truncate collection

```http
DELETE /api/collections/{collectionIdOrName}/truncate
```

Deletes all records in a collection while keeping the collection schema intact.

**Path parameters:**

| Parameter            | Type   | Description                                    |
| -------------------- | ------ | ---------------------------------------------- |
| `collectionIdOrName` | string | **Required.** The ID or name of the collection |

**Success response (204):** No content.

---

## Import collections

```http
PUT /api/collections/import
```

Imports collections and their records. Useful for migrations and backups.

**Body parameters:**

| Parameter       | Type    | Description                                                    |
| --------------- | ------- | -------------------------------------------------------------- |
| `collections`   | array   | **Required.** Array of collection objects to import            |
| `deleteMissing` | boolean | If `true`, deletes collections that are not in the import list |

**Example request:**

```json
{
  "collections": [
    {
      "name": "posts",
      "type": "base",
      "fields": [{ "name": "title", "type": "text", "required": true }],
      "listRule": "",
      "viewRule": ""
    }
  ],
  "deleteMissing": false
}
```

**Success response (204):** No content.

---

## Scaffolds

```http
GET /api/collections/meta/scaffolds
```

Returns the default fields and configuration for each collection type.

**Success response (200):**

```json
[
  {
    "type": "base",
    "fields": [
      { "name": "id", "type": "text", "system": true },
      { "name": "created", "type": "autodate", "system": true },
      { "name": "updated", "type": "autodate", "system": true }
    ]
  },
  {
    "type": "auth",
    "fields": [
      { "name": "id", "type": "text", "system": true },
      { "name": "username", "type": "text", "system": true },
      { "name": "email", "type": "email", "system": true },
      { "name": "verified", "type": "bool", "system": true }
    ]
  },
  {
    "type": "view",
    "fields": []
  }
]
```

---

## Dry run view query

```http
POST /api/collections/meta/dry-run-view
```

Validates and executes a view query without saving it. Useful for testing view collection queries.

**Body parameters:**

| Parameter | Type   | Description                        |
| --------- | ------ | ---------------------------------- |
| `query`   | string | **Required.** The SQL query string |

**Example request:**

```json
{
  "query": "SELECT id, title, created FROM posts WHERE status = 'published'"
}
```

**Success response (200):**

```json
{
  "columns": ["id", "title", "created"],
  "rows": [["abc123", "Hello World", "2022-01-01 10:00:00.000Z"]]
}
```

---

## List OAuth2 providers

```http
GET /api/collections/meta/oauth2-providers
```

Returns a list of all configurable OAuth2 providers.

**Success response (200):**

```json
[
  {
    "name": "google",
    "displayName": "Google",
    "authUrl": "https://accounts.google.com/o/oauth2/auth",
    "tokenUrl": "https://oauth2.googleapis.com/token"
  },
  {
    "name": "github",
    "displayName": "GitHub",
    "authUrl": "https://github.com/login/oauth/authorize",
    "tokenUrl": "https://github.com/login/oauth/access_token"
  }
]
```

---

> **Source:** [pocketbase.io/docs/api-collections](https://pocketbase.io/docs/api-collections)

---

**Navigation:**

- Previous: [API Files](12-api-files.md)
- Next: [API Settings](14-api-settings.md)
- Up: [Introduction](01-introduction.md)
