# Go Routing

PocketBase allows you to register custom routes using the `OnServe` hook. Routes are registered on the router available via `se.Router`.

## Registering Routes

```go
app.OnServe().BindFunc(func(se *core.ServeEvent) error {
    // GET route
    se.Router.GET("/hello", func(e *core.RequestEvent) error {
        return e.JSON(http.StatusOK, map[string]string{"message": "Hello!"})
    })

    // POST route
    se.Router.POST("/api/data", func(e *core.RequestEvent) error {
        // handle POST
        return e.JSON(http.StatusOK, map[string]bool{"ok": true})
    })

    // Other methods
    se.Router.PATCH("/api/data/{id}", handler)
    se.Router.PUT("/api/data/{id}", handler)
    se.Router.DELETE("/api/data/{id}", handler)

    return se.Next()
})
```

## Path Parameters

Named path parameters use `{paramName}` syntax:

```go
se.Router.GET("/api/users/{userId}", func(e *core.RequestEvent) error {
    userId := e.Request.PathValue("userId")
    return e.JSON(http.StatusOK, map[string]string{"userId": userId})
})
```

### Multi-Segment Parameters

Capture multiple path segments with `{path...}`:

```go
se.Router.GET("/files/{path...}", func(e *core.RequestEvent) error {
    path := e.Request.PathValue("path")
    return e.JSON(http.StatusOK, map[string]string{"path": path})
})
```

### Exact Match

Use `{$}` to match a route exactly (no additional trailing segments):

```go
se.Router.GET("/api/users/{$}", func(e *core.RequestEvent) error {
    // Matches /api/users/ but NOT /api/users/123
    return e.JSON(http.StatusOK, map[string]string{"exact": "match"})
})
```

## Reading Query Parameters

```go
se.Router.GET("/search", func(e *core.RequestEvent) error {
    query := e.Request.URL.Query()
    keyword := query.Get("q")
    page := query.Get("page")
    return e.JSON(http.StatusOK, map[string]string{
        "q":    keyword,
        "page": page,
    })
})
```

## Reading Headers

```go
se.Router.GET("/api/data", func(e *core.RequestEvent) error {
    contentType := e.Request.Header.Get("Content-Type")
    auth := e.Request.Header.Get("Authorization")
    return e.JSON(http.StatusOK, map[string]string{
        "content-type":  contentType,
        "authorization": auth,
    })
})
```

## Reading Request Body

For JSON request bodies, use `e.BindBody()`:

```go
se.Router.POST("/api/data", func(e *core.RequestEvent) error {
    data := struct {
        Name  string `json:"name"`
        Email string `json:"email"`
    }{}

    if err := e.BindBody(&data); err != nil {
        return e.BadRequestError("Invalid request body", err)
    }

    return e.JSON(http.StatusOK, data)
})
```

## Multipart Form / File Uploads

```go
se.Router.POST("/upload", func(e *core.RequestEvent) error {
    // Get uploaded files
    files, err := e.FindUploadedFiles("file")
    if err != nil {
        return e.BadRequestError("No file uploaded", err)
    }

    // Get form values
    name := e.Request.FormValue("name")

    // Process files...
    for _, f := range files {
        log.Printf("File: %s, Size: %d", f.Name, f.Size)
    }

    return e.JSON(http.StatusOK, map[string]string{"status": "uploaded"})
})
```

## Authentication State

```go
se.Router.GET("/api/me", func(e *core.RequestEvent) error {
    // Check if request has authenticated user
    if e.Auth == nil {
        return e.UnauthorizedError("Not authenticated", nil)
    }

    return e.JSON(http.StatusOK, map[string]string{
        "id":    e.Auth.Id,
        "email": e.Auth.GetString("email"),
    })
})
```

### Superuser Auth Check

```go
se.Router.DELETE("/api/admin/data", func(e *core.RequestEvent) error {
    if !e.HasSuperuserAuth() {
        return e.ForbiddenError("Superuser access required", nil)
    }
    // Proceed with admin-only logic
    return e.JSON(http.StatusOK, map[string]string{"status": "deleted"})
})
```

## Middlewares

PocketBase provides built-in middleware functions via the `apis` package:

### Require Auth

```go
import "github.com/pocketbase/pocketbase/apis"

se.Router.GET("/api/protected", func(e *core.RequestEvent) error {
    return e.JSON(http.StatusOK, map[string]string{"data": "secret"})
}, apis.RequireAuth())
```

### Require Superuser Auth

```go
se.Router.GET("/api/admin", func(e *core.RequestEvent) error {
    return e.JSON(http.StatusOK, map[string]string{"data": "admin"})
}, apis.RequireSuperuserAuth())
```

### Require Guest Only

```go
se.Router.POST("/api/register", func(e *core.RequestEvent) error {
    return e.JSON(http.StatusOK, map[string]string{"status": "ok"})
}, apis.RequireGuestOnly())
```

### Combining Middlewares

```go
se.Router.GET("/api/user-only", handler, apis.RequireAuth())
se.Router.GET("/api/admin-only", handler, apis.RequireSuperuserAuth())
```

### Custom Middleware

```go
func myMiddleware(next core.HandlerFunc) core.HandlerFunc {
    return func(e *core.RequestEvent) error {
        // Custom logic before handler
        log.Printf("Request: %s %s", e.Request.Method, e.Request.URL.Path)
        return next(e)
    }
}

se.Router.GET("/api/data", handler, myMiddleware)
```

## Custom Error Responses

```go
se.Router.GET("/api/resource", func(e *core.RequestEvent) error {
    // 400 Bad Request
    return e.BadRequestError("Invalid input", nil)

    // 401 Unauthorized
    return e.UnauthorizedError("Not logged in", nil)

    // 403 Forbidden
    return e.ForbiddenError("No access", nil)

    // 404 Not Found
    return e.NotFoundError("Resource not found", nil)

    // Custom status with error
    return e.Error(http.StatusUnprocessableEntity, "Validation failed", nil)

    // Generic JSON response
    return e.JSON(http.StatusOK, map[string]interface{}{"key": "value"})
})
```

---

> **Source:** [pocketbase.io](https://pocketbase.io/docs/go-routing/)
