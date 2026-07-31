# Go Logging

PocketBase uses [zerolog](https://github.com/rs/zerolog) for structured, leveled logging. Access the logger via `app.Logger()`.

## Basic Logging

```go
app.Logger().Debug().Msg("Debug message")
app.Logger().Info().Msg("Info message")
app.Logger().Warn().Msg("Warning message")
app.Logger().Error().Msg("Error message")
```

## Logging with Fields

Add context with structured fields:

```go
app.Logger().Info().
    Str("user_id", "abc123").
    Str("action", "login").
    Msg("User logged in")

app.Logger().Error().
    Str("error", err.Error()).
    Str("collection", "posts").
    Msg("Failed to save record")
```

## Logging with Error

```go
if err := app.Save(record); err != nil {
    app.Logger().Error().
        Err(err).
        Str("record_id", record.Id).
        Msg("Failed to save record")
}
```

## Logger Levels

```go
// Always logged (fatal/panic will terminate the program)
app.Logger().Fatal().Msg("Fatal error - app will exit")
app.Logger().Panic().Msg("Panic error - app will panic")

// Error level
app.Logger().Error().Msg("Something went wrong")

// Warn level
app.Logger().Warn().Msg("Deprecated API usage")

// Info level (default)
app.Logger().Info().Msg("Server started")

// Debug level (disabled by default, enable in dev)
app.Logger().Debug().Msg("Processing request")
```

## Logging in Hooks

```go
app.OnRecordAfterCreateSuccess("posts").BindFunc(func(e *core.RecordEvent) error {
    app.Logger().Info().
        Str("record_id", e.Record.Id).
        Str("title", e.Record.GetString("title")).
        Msg("New post created")
    return e.Next()
})

app.OnRecordAfterCreateError("posts").BindFunc(func(e *core.RecordErrorEvent) error {
    app.Logger().Error().
        Str("record_id", e.Record.Id).
        Err(e.Err).
        Msg("Failed to create post")
    return e.Next()
})
```

## Logging in Routes

```go
se.Router.GET("/api/data", func(e *core.RequestEvent) error {
    app.Logger().Debug().
        Str("method", e.Request.Method).
        Str("path", e.Request.URL.Path).
        Str("remote_addr", e.Request.RemoteAddr).
        Msg("Incoming request")

    // Process request...

    app.Logger().Info().
        Str("path", "/api/data").
        Int("status", 200).
        Msg("Request completed")

    return e.JSON(http.StatusOK, data)
})
```

## Logging in Cron Jobs

```go
app.Cron().MustAdd("cleanup", "0 * * * *", func(cronJob core.CronJob) {
    app.Logger().Info().Msg("Starting cleanup job")

    // Job logic...

    app.Logger().Info().
        Int("deleted", count).
        Duration("took", elapsed).
        Msg("Cleanup completed")
})
```

## Request Logging Middleware

PocketBase automatically logs API requests. You can add custom request logging:

```go
func requestLogger(next core.HandlerFunc) core.HandlerFunc {
    return func(e *core.RequestEvent) error {
        start := time.Now()

        err := next(e)

        app.Logger().Info().
            Str("method", e.Request.Method).
            Str("path", e.Request.URL.Path).
            Str("remote_addr", e.Request.RemoteAddr).
            Duration("duration", time.Since(start)).
            Err(err).
            Msg("HTTP request")

        return err
    }
}
```

## String Formatting

Use `Msgf()` for printf-style formatting:

```go
app.Logger().Info().Msgf("Processing %d records in batch %d", len(records), batchNum)
app.Logger().Warn().Msgf("Rate limit approaching: %d/%d requests", current, limit)
```

## Conditional Logging

Check log level before expensive operations:

```go
if app.Logger().Debug().Enabled() {
    // Only compute expensive debug info if debug level is active
    debugData := computeExpensiveDebugData()
    app.Logger().Debug().Interface("data", debugData).Msg("Debug info")
}
```

---

> **Source:** [pocketbase.io](https://pocketbase.io/docs/go-logging/)
