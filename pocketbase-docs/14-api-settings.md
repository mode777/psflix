# API Settings

The Settings API allows managing PocketBase application settings. All endpoints require superuser authentication.

**Headers (required for all endpoints):**

| Header          | Value   | Description                          |
| --------------- | ------- | ------------------------------------ |
| `Authorization` | `TOKEN` | **Required.** A superuser auth token |

---

## List settings

```http
GET /api/settings
```

Returns all application settings. Secret values are redacted.

**Success response (200):**

```json
{
  "meta": {
    "appName": "My App",
    "appUrl": "https://example.com",
    "hideControls": false,
    "senderName": "PocketBase",
    "senderAddress": "noreply@example.com"
  },
  "logs": {
    "maxDays": 7,
    "minLevel": 0,
    "logIP": true,
    "logAuthId": true
  },
  "backups": {
    "cron": "0 * * * *",
    "cronMaxKeep": 5,
    "s3": {
      "enabled": false,
      "bucket": "",
      "region": "",
      "endpoint": "",
      "accessKey": "",
      "secret": "******"
    }
  },
  "smtp": {
    "enabled": false,
    "host": "",
    "port": 465,
    "username": "",
    "password": "******",
    "tls": true,
    "authMethod": "PLAIN",
    "localName": ""
  },
  "s3": {
    "enabled": false,
    "bucket": "",
    "region": "",
    "endpoint": "",
    "accessKey": "",
    "secret": "******",
    "forcePathStyle": false
  },
  "batch": {
    "enabled": false,
    "maxRequests": 100,
    "timeout": 30,
    "maxBodySize": 5242880
  },
  "rateLimits": {
    "enabled": false,
    "rules": []
  },
  "trustedProxy": {
    "headers": ["X-Forwarded-For"],
    "useLeftmostIP": false
  }
}
```

---

## Update settings

```http
PATCH /api/settings
```

Updates application settings. Only the provided fields are updated.

### Meta settings

| Parameter            | Type    | Description                    |
| -------------------- | ------- | ------------------------------ |
| `meta.appName`       | string  | The application name           |
| `meta.appUrl`        | string  | The application URL            |
| `meta.hideControls`  | boolean | Hide the Dashboard UI controls |
| `meta.senderName`    | string  | The email sender name          |
| `meta.senderAddress` | string  | The email sender address       |

### Log settings

| Parameter        | Type    | Description                                          |
| ---------------- | ------- | ---------------------------------------------------- |
| `logs.maxDays`   | number  | Maximum days to keep logs                            |
| `logs.minLevel`  | number  | Minimum log level (0=debug, 1=info, 2=warn, 3=error) |
| `logs.logIP`     | boolean | Whether to log IP addresses                          |
| `logs.logAuthId` | boolean | Whether to log auth record IDs                       |

### Backup settings

| Parameter              | Type    | Description                                 |
| ---------------------- | ------- | ------------------------------------------- |
| `backups.cron`         | string  | Cron expression for automatic backups       |
| `backups.cronMaxKeep`  | number  | Maximum number of automatic backups to keep |
| `backups.s3.enabled`   | boolean | Enable S3 backup storage                    |
| `backups.s3.bucket`    | string  | S3 bucket name                              |
| `backups.s3.region`    | string  | S3 region                                   |
| `backups.s3.endpoint`  | string  | S3 endpoint URL                             |
| `backups.s3.accessKey` | string  | S3 access key                               |
| `backups.s3.secret`    | string  | S3 secret key                               |

### SMTP settings

| Parameter         | Type    | Description                                  |
| ----------------- | ------- | -------------------------------------------- |
| `smtp.enabled`    | boolean | Enable SMTP for sending emails               |
| `smtp.host`       | string  | SMTP server host                             |
| `smtp.port`       | number  | SMTP server port                             |
| `smtp.username`   | string  | SMTP username                                |
| `smtp.password`   | string  | SMTP password                                |
| `smtp.tls`        | boolean | Enable TLS                                   |
| `smtp.authMethod` | string  | Auth method: `PLAIN`, `LOGIN`, or `CRAM-MD5` |
| `smtp.localName`  | string  | The local hostname sent to the SMTP server   |

### S3 storage settings

| Parameter           | Type    | Description                        |
| ------------------- | ------- | ---------------------------------- |
| `s3.enabled`        | boolean | Enable S3 storage for file uploads |
| `s3.bucket`         | string  | S3 bucket name                     |
| `s3.region`         | string  | S3 region                          |
| `s3.endpoint`       | string  | S3 endpoint URL                    |
| `s3.accessKey`      | string  | S3 access key                      |
| `s3.secret`         | string  | S3 secret key                      |
| `s3.forcePathStyle` | boolean | Use path-style addressing          |

### Batch settings

| Parameter           | Type    | Description                          |
| ------------------- | ------- | ------------------------------------ |
| `batch.enabled`     | boolean | Enable the batch API endpoint        |
| `batch.maxRequests` | number  | Maximum number of requests per batch |
| `batch.timeout`     | number  | Batch request timeout in seconds     |
| `batch.maxBodySize` | number  | Maximum batch body size in bytes     |

### Rate limit settings

| Parameter            | Type    | Description               |
| -------------------- | ------- | ------------------------- |
| `rateLimits.enabled` | boolean | Enable rate limiting      |
| `rateLimits.rules`   | array   | Array of rate limit rules |

Each rule:

| Field         | Type   | Description                                  |
| ------------- | ------ | -------------------------------------------- |
| `label`       | string | The rule label (e.g., `rules:auth:password`) |
| `maxRequests` | number | Maximum requests per duration                |
| `duration`    | number | Duration in seconds                          |

### Trusted proxy settings

| Parameter                    | Type    | Description                              |
| ---------------------------- | ------- | ---------------------------------------- |
| `trustedProxy.headers`       | array   | Header names to check for real client IP |
| `trustedProxy.useLeftmostIP` | boolean | Use the leftmost IP in X-Forwarded-For   |

**Success response (200):** Returns the updated settings object.

---

## Test S3

```http
POST /api/settings/test/s3
```

Tests the S3 connection with the provided settings.

**Body parameters:**

| Parameter    | Type   | Description                                    |
| ------------ | ------ | ---------------------------------------------- |
| `filesystem` | string | The filesystem to test: `storage` or `backups` |

**Success response (200):**

```json
{
  "status": 200,
  "message": "Success."
}
```

---

## Test email

```http
POST /api/settings/test/email
```

Sends a test email.

**Body parameters:**

| Parameter    | Type   | Description                                                                           |
| ------------ | ------ | ------------------------------------------------------------------------------------- |
| `collection` | string | The auth collection name or ID                                                        |
| `email`      | string | **Required.** The recipient email address                                             |
| `template`   | string | **Required.** The email template: `verification`, `password-reset`, or `email-change` |

**Success response (200):**

```json
{
  "status": 200,
  "message": "Success."
}
```

---

## Generate Apple client secret

```http
POST /api/settings/apple/generate-client-secret
```

Generates an Apple client secret for OAuth2 authentication.

**Body parameters:**

| Parameter    | Type   | Description                                                |
| ------------ | ------ | ---------------------------------------------------------- |
| `clientId`   | string | **Required.** The Apple service ID                         |
| `teamId`     | string | **Required.** The Apple team ID                            |
| `keyId`      | string | **Required.** The Apple key ID                             |
| `privateKey` | string | **Required.** The Apple private key (p8 format)            |
| `duration`   | number | Token duration in seconds (default: `15780000` ≈ 6 months) |

**Success response (200):**

```json
{
  "secret": "eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6..."
}
```

---

> **Source:** [pocketbase.io/docs/api-settings](https://pocketbase.io/docs/api-settings)

---

**Navigation:**

- Previous: [API Collections](13-api-collections.md)
- Next: [API Logs](15-api-logs.md)
- Up: [Introduction](01-introduction.md)
