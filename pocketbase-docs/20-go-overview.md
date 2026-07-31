# Go Overview

PocketBase can be used as a traditional Go framework, allowing you to extend its functionality with custom Go code. This approach gives you full access to the PocketBase internals, letting you register custom routes, hooks, commands, and more.

## Setup

Create a `main.go` file in your project root alongside a `go.mod` file:

```go
package main

import (
    "log"
    "net/http"

    "github.com/pocketbase/pocketbase"
    "github.com/pocketbase/pocketbase/core"
)

func main() {
    app := pocketbase.New()

    // Register custom routes, hooks, etc. before starting the app
    app.OnServe().BindFunc(func(se *core.ServeEvent) error {
        se.Router.GET("/hello", func(e *core.RequestEvent) error {
            return e.JSON(http.StatusOK, map[string]string{"message": "Hello world!"})
        })
        return se.Next()
    })

    if err := app.Start(); err != nil {
        log.Fatal(err)
    }
}
```

Initialize your Go module:

```bash
go mod init myapp
go get github.com/pocketbase/pocketbase@latest
go mod tidy
```

## Building

Build your application into a single executable:

```bash
go build -o myapp
```

The resulting binary includes the PocketBase server, migrations, and all your custom code. Run it with:

```bash
./myapp serve
```

## Key Packages

| Package      | Description                                                         |
| ------------ | ------------------------------------------------------------------- |
| `core`       | App instance, request events, hooks, models, and core functionality |
| `apis`       | API helpers, middleware functions, and authentication utilities     |
| `models`     | Record, Collection, and other database model types                  |
| `daos`       | Data Access Objects for database operations                         |
| `tools`      | Utility functions for security, types, and configuration            |
| `migrations` | Migration registration and management                               |

## Global Objects

The main application object (`pocketbase.New()`) provides:

- **`app.On*()`** — Register lifecycle and event hooks
- **`app.Serve()`** — Start the HTTP server
- **`app.Start()`** — Full application start (bootstrap + serve)
- **`app.RootCmd`** — Access to the root Cobra command for CLI integration
- **`app.DB()`** — Database access
- **`app.Dao()`** — Data access object for record/collection operations

## Custom Commands

PocketBase uses Cobra for CLI. Add custom commands via `app.RootCmd`:

```go
app.RootCmd.AddCommand(&cobra.Command{
    Use: "hello",
    Short: "A custom command",
    Run: func(cmd *cobra.Command, args []string) {
        fmt.Println("Hello from custom command!")
    },
})
```

## Record Hook Example

```go
app.OnRecordCreateRequest("posts").BindFunc(func(e *core.RecordRequestEvent) error {
    // Modify the record before creation
    e.Record.Set("status", "draft")
    return e.Next()
})
```

---

> **Source:** [pocketbase.io](https://pocketbase.io/docs/go-overview/)
