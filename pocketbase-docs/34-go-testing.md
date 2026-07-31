# Go Testing

PocketBase provides testing utilities via the `tests` package. The main helper is `tests.NewTestApp()` which creates a temporary app instance for isolated testing.

## Test Setup

```go
package main_test

import (
    "testing"

    "github.com/pocketbase/pocketbase/tests"
    "github.com/pocketbase/pocketbase/core"
)

func TestSomething(t *testing.T) {
    app, err := tests.NewTestApp()
    if err != nil {
        t.Fatal(err)
    }
    defer app.Cleanup()

    // Use app instance for testing
    // ...
}
```

`tests.NewTestApp()` creates a temporary PocketBase instance with a fresh database. Call `app.Cleanup()` to remove test files and temp data.

## Testing Record Operations

```go
func TestCreatePost(t *testing.T) {
    app, err := tests.NewTestApp()
    if err != nil {
        t.Fatal(err)
    }
    defer app.Cleanup()

    collection, err := app.FindCollectionByNameOrId("posts")
    if err != nil {
        t.Fatal(err)
    }

    record := core.NewRecord(collection)
    record.Set("title", "Test Post")
    record.Set("status", "published")

    if err := app.Save(record); err != nil {
        t.Fatalf("Expected no error, got: %v", err)
    }

    // Verify the record was created
    if record.Id == "" {
        t.Fatal("Expected record to have an ID")
    }

    // Fetch and verify
    found, err := app.FindRecordById("posts", record.Id)
    if err != nil {
        t.Fatal(err)
    }
    if found.GetString("title") != "Test Post" {
        t.Errorf("Expected title 'Test Post', got '%s'", found.GetString("title"))
    }
}
```

## Testing API Requests with MakeRequest

Use `app.MakeRequest()` to test your custom routes and API endpoints:

```go
func TestHelloEndpoint(t *testing.T) {
    app, err := tests.NewTestApp()
    if err != nil {
        t.Fatal(err)
    }
    defer app.Cleanup()

    // Register the route
    app.OnServe().BindFunc(func(se *core.ServeEvent) error {
        se.Router.GET("/hello", func(e *core.RequestEvent) error {
            return e.JSON(200, map[string]string{"message": "Hello!"})
        })
        return se.Next()
    })

    // Make the request
    recorder := app.MakeRequest(t, "GET", "/hello", nil, nil)

    // Assert status code
    if recorder.Code != 200 {
        t.Errorf("Expected status 200, got %d", recorder.Code)
    }

    // Assert body
    body := recorder.Body.String()
    if !strings.Contains(body, `"Hello!"`) {
        t.Errorf("Expected body to contain 'Hello!', got: %s", body)
    }
}
```

### MakeRequest Signature

```go
func (app *TestApp) MakeRequest(t *testing.T, method, path string, body io.Reader, headers map[string]string) *httptest.ResponseRecorder
```

### With Headers

```go
recorder := app.MakeRequest(t, "POST", "/api/data",
    strings.NewReader(`{"name":"test"}`),
    map[string]string{
        "Content-Type":  "application/json",
        "Authorization": "Bearer TOKEN_HERE",
    },
)
```

## Testing with Authentication

```go
func TestAuthenticatedEndpoint(t *testing.T) {
    app, err := tests.NewTestApp()
    if err != nil {
        t.Fatal(err)
    }
    defer app.Cleanup()

    // Find an existing user (from test data)
    user, err := app.FindRecordByEmail("users", "test@example.com")
    if err != nil {
        t.Fatal(err)
    }

    // Generate a valid auth token
    token, err := user.NewAuthToken()
    if err != nil {
        t.Fatal(err)
    }

    // Make authenticated request
    recorder := app.MakeRequest(t, "GET", "/api/protected",
        nil,
        map[string]string{
            "Authorization": token,
        },
    )

    if recorder.Code != 200 {
        t.Errorf("Expected 200, got %d", recorder.Code)
    }
}
```

## Testing Hooks

```go
func TestRecordCreationHook(t *testing.T) {
    app, err := tests.NewTestApp()
    if err != nil {
        t.Fatal(err)
    }
    defer app.Cleanup()

    hookCalled := false

    app.OnRecordCreate("posts").BindFunc(func(e *core.RecordEvent) error {
        hookCalled = true
        // Set a default value
        e.Record.Set("status", "draft")
        return e.Next()
    })

    collection, _ := app.FindCollectionByNameOrId("posts")
    record := core.NewRecord(collection)
    record.Set("title", "Hook Test")

    if err := app.Save(record); err != nil {
        t.Fatal(err)
    }

    if !hookCalled {
        t.Error("Expected hook to be called")
    }
    if record.GetString("status") != "draft" {
        t.Errorf("Expected status 'draft', got '%s'", record.GetString("status"))
    }
}
```

## Testing Database Queries

```go
func TestCustomQuery(t *testing.T) {
    app, err := tests.NewTestApp()
    if err != nil {
        t.Fatal(err)
    }
    defer app.Cleanup()

    var count int
    err = app.DB().NewQuery("SELECT COUNT(*) FROM posts").Row(&count)
    if err != nil {
        t.Fatal(err)
    }

    if count < 0 {
        t.Error("Expected non-negative count")
    }
}
```

## Table-Driven Tests

```go
func TestValidation(t *testing.T) {
    app, err := tests.NewTestApp()
    if err != nil {
        t.Fatal(err)
    }
    defer app.Cleanup()

    tests := []struct {
        name    string
        title   string
        wantErr bool
    }{
        {"valid title", "Hello World", false},
        {"empty title", "", true},
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            collection, _ := app.FindCollectionByNameOrId("posts")
            record := core.NewRecord(collection)
            record.Set("title", tt.title)
            record.Set("status", "draft")

            err := app.Save(record)
            if (err != nil) != tt.wantErr {
                t.Errorf("Save() error = %v, wantErr %v", err, tt.wantErr)
            }
        })
    }
}
```

## Test Cleanup

```go
func TestWithCleanup(t *testing.T) {
    app, err := tests.NewTestApp()
    if err != nil {
        t.Fatal(err)
    }
    defer app.Cleanup() // Always clean up test artifacts

    // Test logic...
}
```

## Running Tests

```bash
go test ./...
go test -run TestHelloEndpoint -v
go test -run TestCreate -count=1
```

---

> **Source:** [pocketbase.io](https://pocketbase.io/docs/go-testing/)
