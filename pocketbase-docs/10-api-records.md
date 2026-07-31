# API Records

PocketBase provides a RESTful API for managing records in your collections. All record endpoints are accessible under `/api/collections/{collectionIdOrName}/records`.

## CRUD Actions

### List/Search records

```http
GET /api/collections/{collectionIdOrName}/records
```

Returns a paginated list of records with sorting and filtering.

**Path parameters:**

| Parameter            | Type   | Description                                    |
| -------------------- | ------ | ---------------------------------------------- |
| `collectionIdOrName` | string | **Required.** The ID or name of the collection |

**Query parameters:**

| Parameter   | Type    | Description                                                                                       |
| ----------- | ------- | ------------------------------------------------------------------------------------------------- |
| `page`      | number  | The page number (default: `1`)                                                                    |
| `perPage`   | number  | The max number of items per page (default: `30`, max: `500`)                                      |
| `sort`      | string  | Attribute name to sort by. Use `-` prefix for descending and `+` for ascending (e.g., `-created`) |
| `filter`    | string  | Filter expression (e.g., `status='active' && created>'2022-01-01'`)                               |
| `expand`    | string  | Relations to expand, up to 6-levels deep (e.g., `expand=author,comments.author`)                  |
| `fields`    | string  | Comma-separated fields to return in the JSON response                                             |
| `skipTotal` | boolean | If `true`, skips the `totalItems` and `totalPages` count for faster execution                     |

**Success response:**

```json
{
  "page": 1,
  "perPage": 30,
  "totalItems": 150,
  "totalPages": 5,
  "items": [
    {
      "id": "abc123",
      "collectionId": "xyz789",
      "collectionName": "posts",
      "title": "Hello World",
      "created": "2022-01-01 10:00:00.000Z",
      "updated": "2022-01-01 10:00:00.000Z"
    }
  ]
}
```

**Error response (400):**

```json
{
  "status": 400,
  "message": "Something went wrong while processing your request.",
  "data": {
    "filter": {
      "code": "validation_filter_invalid_expression",
      "message": "Invalid filter expression."
    }
  }
}
```

---

### View record

```http
GET /api/collections/{collectionIdOrName}/records/{recordId}
```

Returns a single record by its ID.

**Path parameters:**

| Parameter            | Type   | Description                                    |
| -------------------- | ------ | ---------------------------------------------- |
| `collectionIdOrName` | string | **Required.** The ID or name of the collection |
| `recordId`           | string | **Required.** The ID of the record             |

**Query parameters:**

| Parameter | Type   | Description                                           |
| --------- | ------ | ----------------------------------------------------- |
| `expand`  | string | Relations to expand, up to 6-levels deep              |
| `fields`  | string | Comma-separated fields to return in the JSON response |

**Success response:**

```json
{
  "id": "abc123",
  "collectionId": "xyz789",
  "collectionName": "posts",
  "title": "Hello World",
  "body": "This is a test post.",
  "created": "2022-01-01 10:00:00.000Z",
  "updated": "2022-01-01 10:00:00.000Z"
}
```

**Error response (404):**

```json
{
  "status": 404,
  "message": "The requested resource wasn't found.",
  "data": {}
}
```

---

### Create record

```http
POST /api/collections/{collectionIdOrName}/records
```

Creates a new record.

**Path parameters:**

| Parameter            | Type   | Description                                    |
| -------------------- | ------ | ---------------------------------------------- |
| `collectionIdOrName` | string | **Required.** The ID or name of the collection |

**Body parameters:**

| Parameter         | Type    | Description                                                                                                        |
| ----------------- | ------- | ------------------------------------------------------------------------------------------------------------------ |
| `id`              | string  | Optional custom record ID (must be exactly 15 characters, alphanumeric + dash/underscore). Auto-generated if empty |
| `{fieldName}`     | various | Each schema field can be set as a key-value pair                                                                   |
| `password`        | string  | Password field value (for auth collections)                                                                        |
| `passwordConfirm` | string  | Password confirmation (for auth collections)                                                                       |

The body can be sent as `application/json` or `multipart/form-data` (required when uploading files).

**Query parameters:**

| Parameter | Type   | Description                      |
| --------- | ------ | -------------------------------- |
| `expand`  | string | Relations to expand              |
| `fields`  | string | Comma-separated fields to return |

**Success response (200):**

```json
{
  "id": "newrecord001",
  "collectionId": "xyz789",
  "collectionName": "posts",
  "title": "New Post",
  "created": "2022-06-25 10:00:00.000Z",
  "updated": "2022-06-25 10:00:00.000Z"
}
```

**Error response (400):**

```json
{
  "status": 400,
  "message": "Failed to create record.",
  "data": {
    "title": {
      "code": "validation_required",
      "message": "Missing required value."
    }
  }
}
```

---

### Update record

```http
PATCH /api/collections/{collectionIdOrName}/records/{recordId}
```

Updates an existing record.

**Path parameters:**

| Parameter            | Type   | Description                                    |
| -------------------- | ------ | ---------------------------------------------- |
| `collectionIdOrName` | string | **Required.** The ID or name of the collection |
| `recordId`           | string | **Required.** The ID of the record             |

**Body parameters:**

| Parameter         | Type    | Description                                               |
| ----------------- | ------- | --------------------------------------------------------- |
| `{fieldName}`     | various | Each schema field can be updated as a key-value pair      |
| `oldPassword`     | string  | Old password (required for changing auth record password) |
| `password`        | string  | New password value                                        |
| `passwordConfirm` | string  | New password confirmation                                 |

**Query parameters:**

| Parameter | Type   | Description                      |
| --------- | ------ | -------------------------------- |
| `expand`  | string | Relations to expand              |
| `fields`  | string | Comma-separated fields to return |

**Success response (200):**

```json
{
  "id": "abc123",
  "collectionId": "xyz789",
  "collectionName": "posts",
  "title": "Updated Title",
  "created": "2022-01-01 10:00:00.000Z",
  "updated": "2022-06-25 12:00:00.000Z"
}
```

**Error response (400):**

```json
{
  "status": 400,
  "message": "Failed to update record.",
  "data": {
    "title": {
      "code": "validation_required",
      "message": "Missing required value."
    }
  }
}
```

---

### Delete record

```http
DELETE /api/collections/{collectionIdOrName}/records/{recordId}
```

Deletes a single record by its ID.

**Path parameters:**

| Parameter            | Type   | Description                                    |
| -------------------- | ------ | ---------------------------------------------- |
| `collectionIdOrName` | string | **Required.** The ID or name of the collection |
| `recordId`           | string | **Required.** The ID of the record             |

**Success response (204):** No content.

**Error response (404):**

```json
{
  "status": 404,
  "message": "The requested resource wasn't found.",
  "data": {}
}
```

---

### Batch create/update/upsert/delete

```http
POST /api/batch
```

Allows performing multiple create, update, upsert, or delete operations in a single request as a transaction.

> **Note:** The batch endpoint must be enabled in the Dashboard > Settings.

**Body parameters (JSON):**

| Parameter  | Type  | Description                    |
| ---------- | ----- | ------------------------------ |
| `requests` | array | Array of batch request objects |

Each request object:

| Field     | Type   | Description                                                    |
| --------- | ------ | -------------------------------------------------------------- |
| `url`     | string | The API endpoint path (e.g., `/api/collections/posts/records`) |
| `method`  | string | HTTP method: `POST`, `PATCH`, `PUT`, or `DELETE`               |
| `headers` | object | Request headers (e.g., `{"Content-Type": "application/json"}`) |
| `body`    | object | The request body                                               |

For `multipart/form-data`, use the `@jsonPayload` field to specify the batch requests as JSON within a multipart form.

**Example request:**

```json
{
  "requests": [
    {
      "url": "/api/collections/posts/records",
      "method": "POST",
      "headers": {
        "Content-Type": "application/json"
      },
      "body": {
        "title": "Post 1"
      }
    },
    {
      "url": "/api/collections/posts/records/existing_id",
      "method": "PATCH",
      "headers": {
        "Content-Type": "application/json"
      },
      "body": {
        "title": "Updated Post"
      }
    },
    {
      "url": "/api/collections/posts/records/existing_id",
      "method": "DELETE",
      "headers": {},
      "body": null
    }
  ]
}
```

**Success response (200):**

```json
[
  {
    "status": 200,
    "body": { "id": "new_id", "title": "Post 1" }
  },
  {
    "status": 200,
    "body": { "id": "existing_id", "title": "Updated Post" }
  },
  {
    "status": 204,
    "body": null
  }
]
```

---

## Auth Record Actions

### List auth methods

```http
GET /api/collections/{collectionIdOrName}/auth-methods
```

Returns the available authentication methods for a collection.

**Path parameters:**

| Parameter            | Type   | Description                                         |
| -------------------- | ------ | --------------------------------------------------- |
| `collectionIdOrName` | string | **Required.** The ID or name of the auth collection |

**Success response (200):**

```json
{
  "password": {
    "enabled": true
  },
  "oauth2": {
    "enabled": true,
    "providers": [
      { "name": "google", "displayName": "Google", "state": "1" },
      { "name": "github", "displayName": "GitHub", "state": "1" }
    ]
  },
  "mfa": {
    "enabled": true,
    "duration": 1800
  },
  "otp": {
    "enabled": true,
    "duration": 1800
  }
}
```

---

### Auth with password

```http
POST /api/collections/{collectionIdOrName}/auth-with-password
```

Authenticates a user with identity (email/username) and password.

**Path parameters:**

| Parameter            | Type   | Description                                         |
| -------------------- | ------ | --------------------------------------------------- |
| `collectionIdOrName` | string | **Required.** The ID or name of the auth collection |

**Body parameters:**

| Parameter       | Type   | Description                                                                             |
| --------------- | ------ | --------------------------------------------------------------------------------------- |
| `identity`      | string | **Required.** The login identity (email, username, etc.)                                |
| `password`      | string | **Required.** The login password                                                        |
| `identityField` | string | The name of the identity field (default: the first unique index field, usually `email`) |

**Success response (200):**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "record": {
    "id": "abc123",
    "collectionId": "xyz789",
    "collectionName": "users",
    "email": "user@example.com",
    "verified": true,
    "created": "2022-01-01 10:00:00.000Z",
    "updated": "2022-01-01 10:00:00.000Z"
  }
}
```

**Error response (400):**

```json
{
  "status": 400,
  "message": "Failed to authenticate.",
  "data": {
    "identity": {
      "code": "validation_invalid_email",
      "message": "Must be a valid email address."
    },
    "password": {
      "code": "validation_length_out_of_range",
      "message": "Must be between 8 and 72 characters."
    }
  }
}
```

---

### Auth with OAuth2

```http
POST /api/collections/{collectionIdOrName}/auth-with-oauth2
```

Authenticates a user via an OAuth2 provider.

**Path parameters:**

| Parameter            | Type   | Description                                         |
| -------------------- | ------ | --------------------------------------------------- |
| `collectionIdOrName` | string | **Required.** The ID or name of the auth collection |

**Body parameters:**

| Parameter      | Type   | Description                                                              |
| -------------- | ------ | ------------------------------------------------------------------------ |
| `provider`     | string | **Required.** The name of the OAuth2 provider (e.g., `google`, `github`) |
| `code`         | string | **Required.** The authorization code returned from the provider          |
| `codeVerifier` | string | The PKCE code verifier (required if the provider uses PKCE)              |
| `redirectUrl`  | string | The redirect URL used in the OAuth2 flow                                 |
| `createData`   | object | Optional data for creating a new user on first login                     |

**Success response (200):**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "record": {
    "id": "abc123",
    "collectionId": "xyz789",
    "collectionName": "users",
    "email": "user@example.com"
  },
  "meta": {
    "id": "provider_user_id",
    "name": "John Doe",
    "email": "user@example.com",
    "avatarUrl": "https://example.com/avatar.png",
    "isNew": false,
    "rawUser": {},
    "accessToken": "provider_access_token",
    "refreshToken": "provider_refresh_token",
    "expiry": "2022-06-25T10:00:00.000Z"
  }
}
```

---

### Auth with OTP

Two-step authentication using a one-time password.

**Step 1 — Request OTP:**

```http
POST /api/collections/{collectionIdOrName}/request-otp
```

**Path parameters:**

| Parameter            | Type   | Description                                         |
| -------------------- | ------ | --------------------------------------------------- |
| `collectionIdOrName` | string | **Required.** The ID or name of the auth collection |

**Body parameters:**

| Parameter | Type   | Description                            |
| --------- | ------ | -------------------------------------- |
| `email`   | string | **Required.** The user's email address |

**Success response (200):**

```json
{
  "otpId": "generated_otp_id"
}
```

**Step 2 — Authenticate with OTP:**

```http
POST /api/collections/{collectionIdOrName}/auth-with-otp
```

**Body parameters:**

| Parameter  | Type   | Description                                          |
| ---------- | ------ | ---------------------------------------------------- |
| `otpId`    | string | **Required.** The OTP ID from step 1                 |
| `password` | string | **Required.** The one-time password sent to the user |

**Success response (200):**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "record": {
    "id": "abc123",
    "collectionId": "xyz789",
    "collectionName": "users",
    "email": "user@example.com"
  }
}
```

---

### Auth refresh

```http
POST /api/collections/{collectionIdOrName}/auth-refresh
```

Refreshes the current authenticated user's token. Requires the `Authorization` header.

**Path parameters:**

| Parameter            | Type   | Description                                         |
| -------------------- | ------ | --------------------------------------------------- |
| `collectionIdOrName` | string | **Required.** The ID or name of the auth collection |

**Headers:**

| Header          | Value   | Description                         |
| --------------- | ------- | ----------------------------------- |
| `Authorization` | `TOKEN` | **Required.** The user's auth token |

**Success response (200):**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "record": {
    "id": "abc123",
    "collectionId": "xyz789",
    "collectionName": "users",
    "email": "user@example.com"
  }
}
```

---

### Verification

**Request verification:**

```http
POST /api/collections/{collectionIdOrName}/request-verification
```

Sends a verification email to the user.

**Path parameters:**

| Parameter            | Type   | Description                                         |
| -------------------- | ------ | --------------------------------------------------- |
| `collectionIdOrName` | string | **Required.** The ID or name of the auth collection |

**Body parameters:**

| Parameter | Type   | Description                               |
| --------- | ------ | ----------------------------------------- |
| `email`   | string | **Required.** The email address to verify |

**Success response (200):**

```json
{
  "status": 200,
  "message": "Verification email sent."
}
```

**Confirm verification:**

```http
POST /api/collections/{collectionIdOrName}/confirm-verification
```

**Body parameters:**

| Parameter | Type   | Description                                         |
| --------- | ------ | --------------------------------------------------- |
| `token`   | string | **Required.** The verification token from the email |

**Success response (200):**

```json
{
  "status": 200,
  "message": "Email verification successful."
}
```

---

### Password reset

**Request password reset:**

```http
POST /api/collections/{collectionIdOrName}/request-password-reset
```

Sends a password reset email.

**Path parameters:**

| Parameter            | Type   | Description                                         |
| -------------------- | ------ | --------------------------------------------------- |
| `collectionIdOrName` | string | **Required.** The ID or name of the auth collection |

**Body parameters:**

| Parameter | Type   | Description                            |
| --------- | ------ | -------------------------------------- |
| `email`   | string | **Required.** The user's email address |

**Success response (200):**

```json
{
  "status": 200,
  "message": "Password reset email sent."
}
```

**Confirm password reset:**

```http
POST /api/collections/{collectionIdOrName}/confirm-password-reset
```

**Body parameters:**

| Parameter         | Type   | Description                                           |
| ----------------- | ------ | ----------------------------------------------------- |
| `token`           | string | **Required.** The password reset token from the email |
| `password`        | string | **Required.** The new password                        |
| `passwordConfirm` | string | **Required.** The new password confirmation           |

> **Note:** Confirming a password reset invalidates all previously issued tokens for the user.

**Success response (200):**

```json
{
  "status": 200,
  "message": "Password successfully reset."
}
```

---

### Email change

**Request email change:**

```http
POST /api/collections/{collectionIdOrName}/request-email-change
```

Sends an email change confirmation. Requires authentication.

**Path parameters:**

| Parameter            | Type   | Description                                         |
| -------------------- | ------ | --------------------------------------------------- |
| `collectionIdOrName` | string | **Required.** The ID or name of the auth collection |

**Body parameters:**

| Parameter  | Type   | Description                         |
| ---------- | ------ | ----------------------------------- |
| `newEmail` | string | **Required.** The new email address |

**Headers:**

| Header          | Value   | Description                         |
| --------------- | ------- | ----------------------------------- |
| `Authorization` | `TOKEN` | **Required.** The user's auth token |

**Success response (200):**

```json
{
  "status": 200,
  "message": "Confirm your new email by pressing on the link sent to newEmail@example.com."
}
```

**Confirm email change:**

```http
POST /api/collections/{collectionIdOrName}/confirm-email-change
```

**Body parameters:**

| Parameter  | Type   | Description                                                      |
| ---------- | ------ | ---------------------------------------------------------------- |
| `token`    | string | **Required.** The email change token from the confirmation email |
| `password` | string | **Required.** The user's current password                        |

> **Note:** Confirming an email change invalidates all previously issued tokens for the user.

**Success response (200):**

```json
{
  "status": 200,
  "message": "Email successfully changed."
}
```

---

### Impersonate

```http
POST /api/collections/{collectionIdOrName}/impersonate/{id}
```

Allows a superuser to generate an auth token for another user (impersonation).

**Path parameters:**

| Parameter            | Type   | Description                                         |
| -------------------- | ------ | --------------------------------------------------- |
| `collectionIdOrName` | string | **Required.** The ID or name of the auth collection |
| `id`                 | string | **Required.** The ID of the user to impersonate     |

**Body parameters:**

| Parameter  | Type   | Description                                                                       |
| ---------- | ------ | --------------------------------------------------------------------------------- |
| `duration` | number | Optional token duration in seconds (default depends on collection token settings) |

**Query parameters:**

| Parameter | Type   | Description                      |
| --------- | ------ | -------------------------------- |
| `expand`  | string | Relations to expand              |
| `fields`  | string | Comma-separated fields to return |

**Headers:**

| Header          | Value   | Description                              |
| --------------- | ------- | ---------------------------------------- |
| `Authorization` | `TOKEN` | **Required.** The superuser's auth token |

**Success response (200):**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "record": {
    "id": "target_user_id",
    "collectionId": "xyz789",
    "collectionName": "users",
    "email": "impersonated@example.com"
  }
}
```

---

> **Source:** [pocketbase.io/docs/api-records](https://pocketbase.io/docs/api-records)

---

**Navigation:**

- Previous: [API Realtime](11-api-realtime.md)
- Next: [API Files](12-api-files.md)
- Up: [Introduction](01-introduction.md)
