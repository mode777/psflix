# API Files

PocketBase provides a file API for downloading and serving files attached to records.

## Download/Fetch file

```http
GET /api/files/{collectionIdOrName}/{recordId}/{filename}
```

Returns a single file by its filename.

**Path parameters:**

| Parameter            | Type   | Description                                    |
| -------------------- | ------ | ---------------------------------------------- |
| `collectionIdOrName` | string | **Required.** The ID or name of the collection |
| `recordId`           | string | **Required.** The ID of the record             |
| `filename`           | string | **Required.** The name of the file             |

**Query parameters:**

| Parameter  | Type   | Description                                                                 |
| ---------- | ------ | --------------------------------------------------------------------------- |
| `thumb`    | string | Optional thumbnail size specification (see formats below)                   |
| `token`    | string | A file token for accessing protected files                                  |
| `download` | string | If set, adds `Content-Disposition: attachment` header to trigger a download |

### Thumbnail formats

The `thumb` parameter accepts the following formats:

| Format | Description                                                                     |
| ------ | ------------------------------------------------------------------------------- |
| `WxH`  | Resize to exact width x height (e.g., `100x100`)                                |
| `WxHt` | Resize to exact width x height with top-crop alignment                          |
| `WxHb` | Resize to exact width x height with bottom-crop alignment                       |
| `WxHf` | Resize to exact width x height with focal-point crop                            |
| `0xH`  | Resize to height, auto-calculate width to preserve aspect ratio (e.g., `0x200`) |
| `Wx0`  | Resize to width, auto-calculate height to preserve aspect ratio (e.g., `200x0`) |

**Example:**

```
GET /api/files/posts/abc123/photo.jpg?thumb=100x100t
```

---

## Generate protected file token

```http
POST /api/files/token
```

Generates a short-lived token for accessing files in collections with `File` fields that require authentication.

**Headers:**

| Header          | Value   | Description                         |
| --------------- | ------- | ----------------------------------- |
| `Authorization` | `TOKEN` | **Required.** The user's auth token |

**Success response (200):**

```json
{
  "token": "generated_file_token"
}
```

**Usage:**

```
GET /api/files/posts/abc123/document.pdf?token=generated_file_token
```

---

## File access rules

- If the collection has no file field rule or the rule allows public access, files can be downloaded without authentication.
- If the file field rule requires authentication, include either the user's `Authorization` header or a file-specific `token` query parameter.

---

> **Source:** [pocketbase.io/docs/api-files](https://pocketbase.io/docs/api-files)

---

**Navigation:**

- Previous: [API Realtime](11-api-realtime.md)
- Next: [API Collections](13-api-collections.md)
- Up: [Introduction](01-introduction.md)
