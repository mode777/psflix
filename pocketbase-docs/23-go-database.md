# Go Database

PocketBase provides direct database access through the `app.DB()` method and also supports building queries programmatically using the query builder or the DAO (Data Access Object) layer.

## Raw SQL Queries

Execute raw SQL using `app.DB().NewQuery()`:

```go
// SELECT query
app.OnServe().BindFunc(func(se *core.ServeEvent) error {
    se.Router.GET("/api/stats", func(e *core.RequestEvent) error {
        var total int

        err := app.DB().NewQuery("SELECT COUNT(*) as total FROM posts").Row(&total)
        if err != nil {
            return e.InternalServerError("Failed to query", err)
        }

        return e.JSON(http.StatusOK, map[string]int{"total": total})
    })
    return se.Next()
})
```

### Multiple Rows

```go
rows := []struct {
    Id    string `db:"id"`
    Title string `db:"title"`
    Views int    `db:"views"`
}{}

err := app.DB().NewQuery("SELECT id, title, views FROM posts ORDER BY views DESC LIMIT 10").All(&rows)
if err != nil {
    return err
}
```

### Binding Parameters

Use named parameters to prevent SQL injection:

```go
rows := []map[string]any{}

err := app.DB().NewQuery("SELECT id, title FROM posts WHERE status = {:status} AND views > {:minViews}").
    Bind(map[string]any{
        "status":   "published",
        "minViews": 100,
    }).
    All(&rows)
```

## Query Builder

PocketBase includes a programmatic query builder for constructing SQL without writing raw strings:

```go
import "github.com/pocketbase/dbx"

// Build a SELECT query
query := app.DB().
    Select("id", "title", "created").
    From("posts").
    Where(dbx.HashExp{"status": "published"}).
    OrderBy("created DESC").
    Limit(10)

var results []map[string]any
err := query.All(&results)
```

### Where Clauses

```go
// Equal (HashExp)
Where(dbx.HashExp{"status": "published"})

// Multiple conditions
Where(dbx.HashExp{"status": "published", "featured": true})

// Comparison operators
Where(dbx.NewExp("views > {:views}", dbx.Params{"views": 100}))

// AND / OR
Where(dbx.And(
    dbx.HashExp{"status": "published"},
    dbx.NewExp("created > {:date}", dbx.Params{"date": "2024-01-01"}),
))

// IN clause
Where(dbx.In("status", dbx.NewExp("SELECT status FROM valid_statuses")))

// LIKE
Where(dbx.Like("title", "pocket"))
```

### Joins

```go
query := app.DB().
    Select("posts.*", "users.name as author_name").
    From("posts").
    LeftJoin("users", dbx.NewExp("posts.author = users.id")).
    Where(dbx.HashExp{"posts.status": "published"})
```

## Using the DAO

The DAO provides higher-level methods and is available via `app.Dao()`:

```go
// Inside a route or hook
records, err := app.Dao().FindCollectionByNameOrId("posts")
```

For transactional DAOs:

```go
app.RunInTransaction(func(txDao *daos.Dao) error {
    // Use txDao for all operations within the transaction
    record, err := txDao.FindRecordById("posts", "RECORD_ID")
    if err != nil {
        return err
    }
    record.Set("views", record.GetInt("views")+1)
    return txDao.SaveRecord(record)
})
```

## Database Transactions

Wrap multiple operations in a transaction for atomicity:

```go
se.Router.POST("/api/transfer", func(e *core.RequestEvent) error {
    err := app.RunInTransaction(func(txApp core.App) error {
        // All operations inside here are in a single transaction
        record1, err := txApp.FindRecordById("accounts", "ACC1")
        if err != nil {
            return err
        }
        record2, err := txApp.FindRecordById("accounts", "ACC2")
        if err != nil {
            return err
        }

        amount := 100
        record1.Set("balance", record1.GetFloat("balance")-float64(amount))
        record2.Set("balance", record2.GetFloat("balance")+float64(amount))

        if err := txApp.Save(record1); err != nil {
            return err
        }
        if err := txApp.Save(record2); err != nil {
            return err
        }

        return nil
    })

    if err != nil {
        return e.InternalServerError("Transfer failed", err)
    }

    return e.JSON(http.StatusOK, map[string]string{"status": "ok"})
})
```

## Converting Results to Models

Raw SQL results can be mapped to PocketBase records:

```go
// Using FindRecordsByFilter for model-based queries (preferred)
records, err := app.FindRecordsByFilter("posts", "status = 'published'", "-created", 10, 0)

// Manual mapping from raw result
var results []map[string]any
app.DB().NewQuery("SELECT id, title FROM posts").All(&results)

for _, row := range results {
    if record, ok := row["id"]; ok {
        // Use record data as needed
        log.Printf("Record ID: %v", record)
    }
}
```

## Table Management

```go
// Check if table exists
exists, _ := app.DB().NewQuery(
    "SELECT COUNT(*) FROM information_schema.tables WHERE table_name = {:name}",
).Bind(dbx.Params{"name": "my_table"}).Row(&exists)

// Create table
app.DB().NewQuery(`CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`).Execute()
```

---

> **Source:** [pocketbase.io](https://pocketbase.io/docs/go-database/)
