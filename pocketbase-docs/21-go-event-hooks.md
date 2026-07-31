# Go Event Hooks

Hooks allow you to react to and modify PocketBase's internal behavior. All hooks are registered using the `app.OnXxx().BindFunc(handler)` pattern. Triggering an error or not calling `e.Next()` stops the execution chain.

## Hook Registration

```go
app.OnRecordCreateRequest("posts").BindFunc(func(e *core.RecordRequestEvent) error {
    // Do something before the record is created
    if e.Record.GetString("title") == "" {
        return e.BadRequestError("Title is required", nil)
    }
    return e.Next() // Continue to the next handler in the chain
})
```

**Important:** Always call `e.Next()` at the end of your handler if you want the default PocketBase behavior (or other registered handlers) to execute. Returning an error or omitting `e.Next()` stops the chain.

## App Hooks

```go
app.OnBootstrap().BindFunc(func(e *core.BootstrapEvent) error {
    // Called once when the app is initialized
    log.Println("App bootstrapped!")
    return e.Next()
})

app.OnSettingsReload().BindFunc(func(e *core.SettingsReloadEvent) error {
    // Called when app settings are reloaded
    return e.Next()
})

app.OnBackupCreate().BindFunc(func(e *core.BackupCreateEvent) error {
    // Called before a backup is created
    return e.Next()
})

app.OnBackupRestore().BindFunc(func(e *core.BackupRestoreEvent) error {
    // Called before a backup is restored
    return e.Next()
})

app.OnTerminate().BindFunc(func(e *core.TerminateEvent) error {
    // Called when the app is shutting down
    return e.Next()
})
```

## Mailer Hooks

```go
app.OnMailerSend().BindFunc(func(e *core.MailerMessageEvent) error {
    // Intercept all outgoing emails
    log.Printf("Sending email to: %v", e.Message.To)
    return e.Next()
})

app.OnMailerRecordAuthAlertSend().BindFunc(func(e *core.MailerRecordEvent) error {
    return e.Next()
})

app.OnMailerRecordPasswordResetSend().BindFunc(func(e *core.MailerRecordEvent) error {
    return e.Next()
})

app.OnMailerRecordVerificationSend().BindFunc(func(e *core.MailerRecordEvent) error {
    return e.Next()
})

app.OnMailerRecordEmailChangeSend().BindFunc(func(e *core.MailerRecordEvent) error {
    return e.Next()
})

app.OnMailerRecordOTPSend().BindFunc(func(e *core.MailerRecordEvent) error {
    return e.Next()
})
```

## Realtime Hooks

```go
app.OnRealtimeConnectRequest().BindFunc(func(e *core.RealtimeConnectEvent) error {
    // Called when a client establishes an SSE connection
    return e.Next()
})

app.OnRealtimeSubscribeRequest().BindFunc(func(e *core.RealtimeSubscribeEvent) error {
    // Called when a client subscribes to a record/subscription
    log.Printf("Client subscribing to: %v", e.Subscriptions)
    return e.Next()
})

app.OnRealtimeMessageSend().BindFunc(func(e *core.RealtimeMessageEvent) error {
    // Called before a realtime message is sent to clients
    return e.Next()
})
```

## Record Model Hooks

```go
app.OnRecordEnrich("posts").BindFunc(func(e *core.RecordEnrichEvent) error {
    // Enrich/modify the record before it is serialized
    return e.Next()
})

app.OnRecordValidate("posts").BindFunc(func(e *core.RecordEvent) error {
    // Custom validation before saving
    return e.Next()
})

// --- Create ---
app.OnRecordCreate("posts").BindFunc(func(e *core.RecordEvent) error {
    // Before create (after validation)
    return e.Next()
})

app.OnRecordCreateExecute("posts").BindFunc(func(e *core.RecordEvent) error {
    // Before the actual DB insert
    return e.Next()
})

app.OnRecordAfterCreateSuccess("posts").BindFunc(func(e *core.RecordEvent) error {
    // After successful creation
    log.Printf("Created record: %s", e.Record.Id)
    return e.Next()
})

app.OnRecordAfterCreateError("posts").BindFunc(func(e *core.RecordErrorEvent) error {
    // After a failed creation
    return e.Next()
})

// --- Update ---
app.OnRecordUpdate("posts").BindFunc(func(e *core.RecordEvent) error {
    return e.Next()
})

app.OnRecordUpdateExecute("posts").BindFunc(func(e *core.RecordEvent) error {
    return e.Next()
})

app.OnRecordAfterUpdateSuccess("posts").BindFunc(func(e *core.RecordEvent) error {
    return e.Next()
})

app.OnRecordAfterUpdateError("posts").BindFunc(func(e *core.RecordErrorEvent) error {
    return e.Next()
})

// --- Delete ---
app.OnRecordDelete("posts").BindFunc(func(e *core.RecordEvent) error {
    return e.Next()
})

app.OnRecordDeleteExecute("posts").BindFunc(func(e *core.RecordEvent) error {
    return e.Next()
})

app.OnRecordAfterDeleteSuccess("posts").BindFunc(func(e *core.RecordEvent) error {
    return e.Next()
})

app.OnRecordAfterDeleteError("posts").BindFunc(func(e *core.RecordErrorEvent) error {
    return e.Next()
})
```

## Collection Model Hooks

```go
app.OnCollectionValidate().BindFunc(func(e *core.CollectionEvent) error {
    return e.Next()
})

app.OnCollectionCreate().BindFunc(func(e *core.CollectionEvent) error {
    return e.Next()
})

app.OnCollectionCreateExecute().BindFunc(func(e *core.CollectionEvent) error {
    return e.Next()
})

app.OnCollectionAfterCreateSuccess().BindFunc(func(e *core.CollectionEvent) error {
    return e.Next()
})

app.OnCollectionAfterCreateError().BindFunc(func(e *core.CollectionErrorEvent) error {
    return e.Next()
})

// Same pattern for Update and Delete:
// app.OnCollectionUpdate(), OnCollectionUpdateExecute(), OnCollectionAfterUpdateSuccess(), OnCollectionAfterUpdateError()
// app.OnCollectionDelete(), OnCollectionDeleteExecute(), OnCollectionAfterDeleteSuccess(), OnCollectionAfterDeleteError()
```

## Request Hooks

```go
app.OnRecordsListRequest("posts").BindFunc(func(e *core.RecordsListRequestEvent) error {
    // Intercept the list request for a collection
    return e.Next()
})

app.OnRecordViewRequest("posts").BindFunc(func(e *core.RecordRequestEvent) error {
    return e.Next()
})

app.OnRecordCreateRequest("posts").BindFunc(func(e *core.RecordRequestEvent) error {
    return e.Next()
})

app.OnRecordUpdateRequest("posts").BindFunc(func(e *core.RecordRequestEvent) error {
    return e.Next()
})

app.OnRecordDeleteRequest("posts").BindFunc(func(e *core.RecordRequestEvent) error {
    return e.Next()
})

// Auth-related request hooks
app.OnRecordAuthRequest("users").BindFunc(func(e *core.RecordAuthRequestEvent) error {
    return e.Next()
})

app.OnRecordAuthWithPasswordRequest("users").BindFunc(func(e *core.RecordAuthWithPasswordRequestEvent) error {
    return e.Next()
})

app.OnRecordAuthWithOAuth2Request("users").BindFunc(func(e *core.RecordAuthWithOAuth2RequestEvent) error {
    return e.Next()
})

app.OnRecordAuthRefreshRequest("users").BindFunc(func(e *core.RecordAuthRefreshRequestEvent) error {
    return e.Next()
})
```

## File Hooks

```go
app.OnFileDownloadRequest("posts").BindFunc(func(e *core.FileDownloadRequestEvent) error {
    // Intercept file download requests
    return e.Next()
})

app.OnFileTokenRequest("posts").BindFunc(func(e *core.FileTokenRequestEvent) error {
    return e.Next()
})
```

## Collection Request Hooks

```go
app.OnCollectionsListRequest().BindFunc(func(e *core.CollectionsListRequestEvent) error {
    return e.Next()
})

app.OnCollectionViewRequest().BindFunc(func(e *core.CollectionRequestEvent) error {
    return e.Next()
})

app.OnCollectionCreateRequest().BindFunc(func(e *core.CollectionRequestEvent) error {
    return e.Next()
})

app.OnCollectionUpdateRequest().BindFunc(func(e *core.CollectionRequestEvent) error {
    return e.Next()
})

app.OnCollectionDeleteRequest().BindFunc(func(e *core.CollectionRequestEvent) error {
    return e.Next()
})
```

## Settings Request Hooks

```go
app.OnSettingsListRequest().BindFunc(func(e *core.SettingsListRequestEvent) error {
    return e.Next()
})

app.OnSettingsUpdateRequest().BindFunc(func(e *core.SettingsUpdateRequestEvent) error {
    return e.Next()
})
```

## Batch Request Hooks

```go
app.OnBatchRequest().BindFunc(func(e *core.BatchRequestEvent) error {
    return e.Next()
})
```

## Filtering by Collection

Most record hooks accept an optional collection name or ID filter:

```go
// Only for "posts" collection
app.OnRecordCreate("posts").BindFunc(func(e *core.RecordEvent) error {
    return e.Next()
})

// For multiple collections
app.OnRecordCreate("posts", "comments").BindFunc(func(e *core.RecordEvent) error {
    return e.Next()
})

// For all collections (no filter)
app.OnRecordCreate().BindFunc(func(e *core.RecordEvent) error {
    return e.Next()
})
```

---

> **Source:** [pocketbase.io](https://pocketbase.io/docs/go-event-hooks/)
