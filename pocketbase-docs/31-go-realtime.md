# Go Realtime Messaging

PocketBase supports realtime messaging via Server-Sent Events (SSE). You can broadcast messages to connected clients that have subscribed to specific records, collections, or custom subscription channels.

## Sending Realtime Messages

Broadcast data to all subscribers of a specific topic:

```go
app.OnServe().BindFunc(func(se *core.ServeEvent) error {
    se.Router.POST("/api/broadcast", func(e *core.RequestEvent) error {
        data := map[string]string{
            "message": "Hello subscribers!",
            "from":    "server",
        }

        // Broadcast to all clients subscribed to "custom-topic"
        app.SubscriptionsBroker().Broadcast("custom-topic", &core.MessageData{
            Name: "custom-event",
            Data: data,
        })

        return e.JSON(http.StatusOK, map[string]string{"status": "broadcasted"})
    })
    return se.Next()
})
```

## Sending to Specific Clients

Send a message to a single connected client:

```go
se.Router.POST("/api/send-to-user", func(e *core.RequestEvent) error {
    var targetClientId string
    data := map[string]string{"message": "Hello specific user!"}

    for _, client := range app.SubscriptionsBroker().Clients() {
        // Find client by some identifier (e.g., user ID in their subscriptions)
        if client.HasSubscription("user:" + targetClientId) {
            client.Send(&core.MessageData{
                Name: "direct-message",
                Data: data,
            })
        }
    }

    return e.JSON(http.StatusOK, map[string]string{"status": "sent"})
})
```

## Listing Connected Clients

```go
clients := app.SubscriptionsBroker().Clients()
log.Printf("Connected clients: %d", len(clients))

for _, client := range clients {
    log.Printf("Client ID: %s", client.Id())
    subs := client.Subscriptions()
    log.Printf("  Subscriptions: %v", subs)
}
```

## Unsubscribing a Client

```go
for _, client := range app.SubscriptionsBroker().Clients() {
    if client.Id() == targetClientId {
        app.SubscriptionsBroker().Unsubscribe(client)
    }
}
```

## The MessageData Struct

```go
&core.MessageData{
    Name: "event-name",       // The event name clients listen for
    Data: map[string]any{     // Arbitrary data payload
        "id":      "123",
        "title":   "New Post",
        "message": "Something happened!",
    },
}
```

## Broadcasting Record Changes

Broadcast when a record is updated:

```go
app.OnRecordAfterUpdateSuccess("posts").BindFunc(func(e *core.RecordEvent) error {
    data := map[string]any{
        "id":     e.Record.Id,
        "title":  e.Record.GetString("title"),
        "status": e.Record.GetString("status"),
    }

    app.SubscriptionsBroker().Broadcast("posts", &core.MessageData{
        Name: "post-update",
        Data: data,
    })

    return e.Next()
})
```

## Custom Subscription Topics

Clients subscribe using the PocketBase SDK. On the server side, you can broadcast to any topic:

```go
// Client subscribes via JS SDK:
// pb.collection("posts").subscribe("*", (e) => { ... })
// pb.subscribe("custom-topic", (e) => { ... })

// Server broadcasts to that topic
app.SubscriptionsBroker().Broadcast("custom-topic", &core.MessageData{
    Name: "notification",
    Data: map[string]string{"alert": "New activity!"},
})
```

## Broadcasting to Record Subscribers

When broadcasting to a record ID, all clients subscribed to that record receive the message:

```go
app.OnRecordAfterCreateSuccess("messages").BindFunc(func(e *core.RecordEvent) error {
    // Broadcast to subscribers of the chat room (another record)
    roomId := e.Record.GetString("room")

    app.SubscriptionsBroker().Broadcast(roomId, &core.MessageData{
        Name: "new-message",
        Data: map[string]any{
            "id":      e.Record.Id,
            "content": e.Record.GetString("content"),
            "author":  e.Record.GetString("author"),
            "created": e.Record.GetDateTime("created").Time(),
        },
    })

    return e.Next()
})
```

## Realtime Hooks

Control realtime behavior:

```go
// Control SSE connections
app.OnRealtimeConnectRequest().BindFunc(func(e *core.RealtimeConnectEvent) error {
    // Log connection
    app.Logger().Info("Client connected", "id", e.Client.Id())
    return e.Next()
})

// Control subscriptions
app.OnRealtimeSubscribeRequest().BindFunc(func(e *core.RealtimeSubscribeEvent) error {
    // Allow or deny subscriptions
    // e.Auth, e.Subscriptions, e.Client are available

    // Example: block subscription to admin topics for non-admins
    for _, sub := range e.Subscriptions {
        if sub == "admin-events" && (e.Auth == nil || !e.Auth.GetBool("isAdmin")) {
            return e.ForbiddenError("Cannot subscribe to admin events", nil)
        }
    }

    return e.Next()
})

// Intercept outgoing messages
app.OnRealtimeMessageSend().BindFunc(func(e *core.RealtimeMessageEvent) error {
    // Modify or filter messages before sending
    log.Printf("Sending message to client: %s", e.Message.Name)
    return e.Next()
})
```

## Example: Live Notification System

```go
app.OnBootstrap().BindFunc(func(e *core.BootstrapEvent) error {
    // Send heartbeat to all connected clients every 30 seconds
    app.Cron().MustAdd("heartbeat", "*/1 * * * *", func(cronJob core.CronJob) {
        cronJob.App().SubscriptionsBroker().Broadcast("*", &core.MessageData{
            Name: "heartbeat",
            Data: map[string]string{"status": "alive"},
        })
    })
    return e.Next()
})
```

---

> **Source:** [pocketbase.io](https://pocketbase.io/docs/go-realtime/)
