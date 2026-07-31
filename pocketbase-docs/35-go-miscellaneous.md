# Go Miscellaneous

This section covers various utility functions, settings, and features available in PocketBase's Go API.

## App State

### Bootstrap Status

Check if the app has been bootstrapped:

```go
if app.IsBootstrapped() {
    log.Println("App is ready")
}
```

## Settings

Access app settings:

```go
settings := app.Settings()

// Meta settings
log.Printf("App Name: %s", settings.Meta.AppName)
log.Printf("Sender Address: %s", settings.Meta.SenderAddress)
log.Printf("Sender Name: %s", settings.Meta.SenderName)
log.Printf("Hide Controls: %v", settings.Meta.HideControls)

// SMTP settings
log.Printf("SMTP Host: %s", settings.SMTP.Host)
log.Printf("SMTP Port: %d", settings.SMTP.Port)
log.Printf("SMTP Enabled: %v", settings.SMTP.Enabled)

// Rate limiting
log.Printf("Rate Limit: %d", settings.RL.Rules)

// Backups
log.Printf("Backups Cron: %s", settings.Backups.Cron)
```

## Data Directory

The `app.DataDir()` method returns the path to PocketBase's data directory:

```go
dataDir := app.DataDir()
log.Printf("Data directory: %s", dataDir)

// Typically: "./pb_data" (configurable via --dir flag)
```

## Encryption Environment

Get the encryption environment key used for encrypting settings and other sensitive data:

```go
env := app.EncryptionEnv()
log.Printf("Encryption env: %s", env)
```

## OS Environment Variables

Access OS environment variables:

```go
import "os"

apiKey := os.Getenv("MY_API_KEY")
dbUrl := os.Getenv("DATABASE_URL")

// With default value
port := os.Getenv("PORT")
if port == "" {
    port = "8090"
}
```

## HTTP Client for External Requests

Use Go's standard `net/http` for making external HTTP requests:

```go
import (
    "io"
    "net/http"
)

se.Router.GET("/api/proxy", func(e *core.RequestEvent) error {
    resp, err := http.Get("https://api.example.com/data")
    if err != nil {
        return e.InternalServerError("External request failed", err)
    }
    defer resp.Body.Close()

    body, err := io.ReadAll(resp.Body)
    if err != nil {
        return e.InternalServerError("Failed to read response", err)
    }

    e.Response.Header().Set("Content-Type", "application/json")
    e.Response.WriteHeader(resp.StatusCode)
    _, err = e.Response.Write(body)
    return err
})
```

### HTTP Client with Timeout

```go
client := &http.Client{
    Timeout: 10 * time.Second,
}

req, err := http.NewRequest("POST", "https://api.example.com/webhook", strings.NewReader(payload))
if err != nil {
    return err
}
req.Header.Set("Content-Type", "application/json")
req.Header.Set("Authorization", "Bearer "+os.Getenv("API_KEY"))

resp, err := client.Do(req)
if err != nil {
    return err
}
defer resp.Body.Close()
```

## Random String Generation

Generate cryptographically secure random strings:

```go
import "github.com/pocketbase/pocketbase/tools/security"

// Generate random string (default length 32)
token := security.RandomString(32)

// Generate shorter token
code := security.RandomString(6)
```

## Hashing and Verification

```go
import "github.com/pocketbase/pocketbase/tools/security"

// MD5 hash
hash := security.MD5("Hello")

// SHA256
hash := security.SHA256("Hello")

// HMAC
hmac := security.HMACSHA256("message", "secret")

// Random token
token := security.RandomString(64)
```

## Date and Time Utilities

```go
import "time"

now := time.Now()
today := now.Format("2006-01-02")
timestamp := now.Unix()
```

## Type Conversion Utilities

```go
import "github.com/pocketbase/pocketbase/tools/types"

// Convert Go value to JSON string
jsonVal, _ := types.JSONConvert(map[string]string{"key": "value"})

// Nullable pointer
ptr := types.Pointer("value")
```

## String Utilities

```go
import (
    "strings"
    "regexp"
)

// Normalize string (trim spaces, collapse whitespace)
normalized := strings.TrimSpace(raw)

// Slugify
slug := strings.ToLower(strings.ReplaceAll(title, " ", "-"))

// Validate email with regex
emailRegex := regexp.MustCompile(`^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$`)
isValid := emailRegex.MatchString(email)
```

## Working with JSON

```go
import "encoding/json"

// Marshal to JSON
data := map[string]string{"key": "value"}
b, err := json.Marshal(data)

// Unmarshal from JSON
var result map[string]any
err = json.Unmarshal(b, &result)
```

## Error Handling Patterns

```go
// Return structured errors from routes
return e.BadRequestError("Invalid input", err)
return e.UnauthorizedError("Not authenticated", nil)
return e.ForbiddenError("No permission", nil)
return e.NotFoundError("Not found", nil)
return e.InternalServerError("Something broke", err)

// Generic error with custom status
return e.Error(http.StatusTeapot, "I'm a teapot", nil)
```

## Collection Type Constants

```go
import "github.com/pocketbase/pocketbase/core"

core.CollectionTypeBase   // "base"
core.CollectionTypeAuth   // "auth"
core.CollectionTypeView   // "view"
```

---

> **Source:** [pocketbase.io](https://pocketbase.io/docs/go-miscellaneous/)
