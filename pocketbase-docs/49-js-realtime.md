# JS Realtime Messaging

PocketBase supports realtime subscriptions via Server-Sent Events (SSE). You can send messages to subscribed clients programmatically and manage realtime connections.

## Sending Realtime Messages

### Broadcast to All Subscribers

Send a message to all clients subscribed to a specific topic (record or collection):

```js
var record = $app.findRecordById('posts', 'abc123');

$app
  .subscriptionsBroker()
  .clients('posts')
  .send(
    JSON.stringify({
      action: 'custom_event',
      record: record.publicExport(),
    }),
  );
```

### Send to Specific Client

```js
var record = $app.findRecordById('posts', 'abc123');

$app
  .subscriptionsBroker()
  .client(clientId)
  .send(
    JSON.stringify({
      action: 'notification',
      message: 'New comment on your post',
    }),
  );
```

### Message Format

PocketBase realtime messages follow this structure:

```js
{
    action: "create",  // create, update, delete, or custom
    record: {
        id: "abc123",
        collectionId: "xyz",
        collectionName: "posts",
        // ... other fields
    }
}
```

## Realtime Hooks

### On Client Connect

```js
onRealtimeConnectRequest((e) {
    console.log("Client connecting:", e.client.id())
    e.next()
})
```

### On Client Subscribe

```js
onRealtimeSubscribeRequest((e) {
    console.log("Client subscribing to:", e.client.subscriptions())
    e.next()
})

// Restrict subscriptions
onRealtimeSubscribeRequest((e) {
    // Only allow authenticated users to subscribe
    if (!e.client.record() && !e.client.isSuperuser()) {
        throw new Error("Authentication required")
    }
    e.next()
})
```

### On Message Send

```js
onRealtimeMessageSend((e) {
    // Log all realtime messages
    console.log("Sending message:", e.message)
    e.next()
})

// Enrich messages with additional data
onRealtimeMessageSend((e) {
    // Add custom data to messages
    var msg = JSON.parse(e.message)
    msg.serverTime = new Date().toISOString()
    e.message = JSON.stringify(msg)
    e.next()
})
```

## Programmatic Subscriptions

### Subscribe Client to Record

```js
// Subscribe a client to a specific record
$app.subscriptionsBroker().client(clientId).subscribe('posts/abc123');
```

### Subscribe Client to Collection

```js
// Subscribe to all records in a collection
$app.subscriptionsBroker().client(clientId).subscribe('posts');
```

### Unsubscribe

```js
$app.subscriptionsBroker().client(clientId).unsubscribe('posts/abc123');
```

## Realtime in Routes

### Custom Notification Endpoint

```js
routerAdd(
  'POST',
  '/api/notify',
  function (e) {
    if (!e.hasSuperuserAuth()) {
      return e.json(403, { error: 'Admin only' });
    }

    var body = e.requestInfo().body;

    // Send to all subscribers of the topic
    $app
      .subscriptionsBroker()
      .clients(body.topic)
      .send(
        JSON.stringify({
          action: 'notification',
          title: body.title,
          message: body.message,
          time: new Date().toISOString(),
        }),
      );

    return e.json(200, { sent: true });
  },
  $apis.requireSuperuserAuth(),
);
```

### Live Updates on Record Changes

```js
onRecordAfterCreateSuccess((e) {
    // Send custom realtime event
    $app.subscriptionsBroker().clients(e.collection.name).send(JSON.stringify({
        action: "new_record",
        record: e.record.publicExport(),
        stats: {
            total: $app.findAllRecords(e.collection.name).length
        }
    }))
}).bind("posts")
```

### Chat Messages

```js
routerAdd('POST', '/api/chat/send', function (e) {
  if (!e.auth) {
    return e.json(401, { error: 'Unauthorized' });
  }

  var body = e.requestInfo().body;
  var roomId = body.roomId;

  // Save message to database
  var collection = $app.findCollectionByNameOrId('messages');
  var message = new Record(collection);
  message.set('text', body.text);
  message.set('user', e.auth.id);
  message.set('room', roomId);
  $app.save(message);

  // Broadcast to room subscribers
  $app
    .subscriptionsBroker()
    .clients('chat/' + roomId)
    .send(
      JSON.stringify({
        action: 'new_message',
        message: {
          id: message.id,
          text: message.get('text'),
          userId: e.auth.id,
          userName: e.auth.get('name'),
          created: message.get('created'),
        },
      }),
    );

  return e.json(200, { sent: true });
});
```

## Client Information

### Get Connected Clients Count

```js
var count = $app.subscriptionsBroker().clients('posts').length;
console.log('Active subscribers:', count);
```

### Client Properties

```js
onRealtimeSubscribeRequest((e) {
    var client = e.client

    console.log("Client ID:", client.id())
    console.log("Is Superuser:", client.isSuperuser())
    console.log("Record:", client.record())
    console.log("Subscriptions:", client.subscriptions())

    e.next()
})
```

## Realtime Events in Hooks

### Notify on Record Updates

```js
onRecordAfterUpdateSuccess((e) {
    // Notify subscribers about the update
    var record = e.record

    // Send to record-specific subscribers
    $app.subscriptionsBroker().clients(
        e.collection.name + "/" + record.id
    ).send(JSON.stringify({
        action: "update",
        record: record.publicExport()
    }))

    // Also send to collection subscribers
    $app.subscriptionsBroker().clients(e.collection.name).send(JSON.stringify({
        action: "update",
        record: record.publicExport()
    }))
}).bind("posts")
```

### Notify on Record Deletion

```js
onRecordAfterDeleteSuccess((e) {
    $app.subscriptionsBroker().clients(e.collection.name).send(JSON.stringify({
        action: "delete",
        recordId: e.record.id,
        collectionName: e.collection.name
    }))
}).bind("posts")
```

## Presence and Status

### Track User Presence

```js
var onlineUsers = {}

onRealtimeConnectRequest((e) {
    var userId = e.client.record() ? e.client.record().id : null
    if (userId) {
        onlineUsers[e.client.id()] = userId

        // Broadcast user online status
        $app.subscriptionsBroker().clients("presence").send(JSON.stringify({
            action: "user_online",
            userId: userId
        }))
    }
    e.next()
})

// Note: Handling disconnections requires additional tracking
```

## Complete Example: Live Dashboard

```js
/// <reference path="../pb_data/types.d.ts" />

// Track live stats
var liveStats = {
    activeUsers: 0,
    totalViews: 0
}

onRealtimeConnectRequest((e) {
    liveStats.activeUsers++
    e.next()
})

// Send stats every 5 seconds
cronAdd("liveStatsUpdate", "*/5 * * * * *", function(c) {
    $app.subscriptionsBroker().clients("dashboard").send(JSON.stringify({
        action: "stats_update",
        stats: liveStats
    }))
})

// Custom endpoint for dashboard subscription
routerAdd("GET", "/api/dashboard/subscribe", function(e) {
    if (!e.hasSuperuserAuth()) {
        return e.error(403, "Admin only")
    }

    // Client will connect via SSE to this topic
    return e.json(200, {
        topic: "dashboard",
        message: "Connect via SSE to /api/realtime"
    })
}, $apis.requireSuperuserAuth())

// Broadcast new registrations
onRecordAfterCreateSuccess((e) {
    $app.subscriptionsBroker().clients("dashboard").send(JSON.stringify({
        action: "new_registration",
        user: {
            id:    e.record.id,
            email: e.record.get("email"),
            name:  e.record.get("name")
        }
    }))
}).bind("users")

// Broadcast new posts
onRecordAfterCreateSuccess((e) {
    liveStats.totalViews++

    $app.subscriptionsBroker().clients("dashboard").send(JSON.stringify({
        action: "new_post",
        post: e.record.publicExport()
    }))
}).bind("posts")
```

---

> **Source:** [pocketbase.io](https://pocketbase.io/docs/js-realtime/)
