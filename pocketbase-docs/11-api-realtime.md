# API Realtime

PocketBase provides realtime subscriptions via Server-Sent Events (SSE). This allows clients to listen for record changes (create, update, delete) in real time.

## Connect

```http
GET /api/realtime
```

Establishes a Server-Sent Events (SSE) connection. Upon successful connection, the server sends a `PB_CONNECT` event containing the client ID.

**Headers:**

| Header          | Value   | Description                                                 |
| --------------- | ------- | ----------------------------------------------------------- |
| `Authorization` | `TOKEN` | Optional. Required for subscribing to protected collections |

**Event: PB_CONNECT**

```json
{
  "clientId": "unique_client_id"
}
```

> **Note:** The SSE connection is automatically disconnected after 5 minutes of idle time (no active subscriptions or no events). Clients should implement reconnection logic.

---

## Set subscriptions

```http
POST /api/realtime
```

Registers or updates the client's subscriptions.

**Body parameters:**

| Parameter       | Type   | Description                                                      |
| --------------- | ------ | ---------------------------------------------------------------- |
| `clientId`      | string | **Required.** The client ID received from the `PB_CONNECT` event |
| `subscriptions` | array  | **Required.** Array of subscription strings                      |

**Subscription format:**

- Subscribe to all records in a collection: `COLLECTION_ID_OR_NAME/*`
- Subscribe to a specific record: `COLLECTION_ID_OR_NAME/RECORD_ID`

**Query parameters:**

| Parameter | Type   | Description                                                                |
| --------- | ------ | -------------------------------------------------------------------------- |
| `options` | string | Optional JSON string with additional subscription options (query, headers) |

**Example request:**

```json
{
  "clientId": "unique_client_id",
  "subscriptions": ["posts/*", "users/abc123"]
}
```

### Access rules

- Subscribing to a specific record (e.g., `posts/abc123`) uses the collection's **ViewRule**
- Subscribing to all records in a collection (e.g., `posts/*`) uses the collection's **ListRule**

If the collection requires authentication, include the `Authorization` header when establishing the SSE connection or provide a valid token.

---

## SDK examples

### JavaScript

```javascript
import PocketBase from 'pocketbase';

const pb = new PocketBase('http://127.0.0.1:8090');

// Subscribe to changes in the "posts" collection
pb.collection('posts').subscribe('*', (e) => {
  console.log(e.action); // "create", "update", or "delete"
  console.log(e.record);
});

// Subscribe to a specific record
pb.collection('posts').subscribe('RECORD_ID', (e) => {
  console.log(e.action);
  console.log(e.record);
});

// Unsubscribe
pb.collection('posts').unsubscribe('RECORD_ID');

// Unsubscribe from all subscriptions in the collection
pb.collection('posts').unsubscribe('*');
```

### Dart

```dart
import 'package:pocketbase/pocketbase.dart';

final pb = PocketBase('http://127.0.0.1:8090');

// Subscribe to changes in the "posts" collection
pb.collection('posts').subscribe('*', (e) {
  print(e.action); // "create", "update", or "delete"
  print(e.record);
});

// Subscribe to a specific record
pb.collection('posts').subscribe('RECORD_ID', (e) {
  print(e.action);
  print(e.record);
});

// Unsubscribe from a specific record
pb.collection('posts').unsubscribe('RECORD_ID');

// Unsubscribe from all subscriptions in the collection
pb.collection('posts').unsubscribe('*');
```

---

## Record change events

When a subscribed record changes, the server sends an SSE event with:

| Field    | Type   | Description                                                                                    |
| -------- | ------ | ---------------------------------------------------------------------------------------------- |
| `action` | string | The action that occurred: `create`, `update`, or `delete`                                      |
| `record` | object | The full record data (not included for `delete` actions if the record is no longer accessible) |

---

> **Source:** [pocketbase.io/docs/api-realtime](https://pocketbase.io/docs/api-realtime)

---

**Navigation:**

- Previous: [API Records](10-api-records.md)
- Next: [API Files](12-api-files.md)
- Up: [Introduction](01-introduction.md)
