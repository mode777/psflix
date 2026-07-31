# Go Migrations

Migrations allow you to manage database schema changes and data transformations in a version-controlled way. PocketBase migrations are regular Go files located in the `pb_migrations` directory.

## Creating Migrations

Create a Go file in the `pb_migrations` directory. The filename must be unique (PocketBase sorts migrations alphabetically by filename):

```
pb_migrations/
  1709000000_create_posts.go
  1709000001_create_comments.go
  1709000002_add_status_to_posts.go
```

## Anatomy of a Migration

```go
package migrations

import (
    "github.com/pocketbase/pocketbase/core"
    "github.com/pocketbase/pocketbase/migrations"
)

func init() {
    migrations.Register(func(app core.App) error {
        // UP migration - apply changes
        collection := core.NewBaseCollection("posts")
        collection.Fields.Add(
            core.NewTextField("title").SetRequired(true),
            core.NewEditorField("content"),
            core.NewSelectField("status", []string{"draft", "published"}).
                SetDefault("draft"),
        )

        return app.Save(collection)
    }, func(app core.App) error {
        // DOWN migration - rollback changes
        collection, err := app.FindCollectionByNameOrId("posts")
        if err != nil {
            return err
        }
        return app.Delete(collection)
    })
}
```

## Migration Patterns

### Creating a Collection

```go
migrations.Register(func(app core.App) error {
    collection := core.NewBaseCollection("products")
    collection.Fields.Add(
        core.NewTextField("name").SetRequired(true),
        core.NewNumberField("price").SetMin(0),
        core.NewTextField("description"),
        core.NewFileField("images").SetMaxSelect(5).SetMimeTypes("image/*"),
    )
    return app.Save(collection)
}, func(app core.App) error {
    collection, err := app.FindCollectionByNameOrId("products")
    if err != nil {
        return err
    }
    return app.Delete(collection)
})
```

### Adding a Field

```go
migrations.Register(func(app core.App) error {
    collection, err := app.FindCollectionByNameOrId("posts")
    if err != nil {
        return err
    }

    collection.Fields.Add(
        core.NewTextField("subtitle").SetMax(300),
    )

    return app.Save(collection)
}, func(app core.App) error {
    collection, err := app.FindCollectionByNameOrId("posts")
    if err != nil {
        return err
    }

    collection.Fields.RemoveByName("subtitle")
    return app.Save(collection)
})
```

### Modifying a Field

```go
migrations.Register(func(app core.App) error {
    collection, err := app.FindCollectionByNameOrId("posts")
    if err != nil {
        return err
    }

    field := collection.Fields.GetByName("title")
    if field, ok := field.(*core.TextField); ok {
        field.SetMax(500) // Increase max length
    }

    return app.Save(collection)
}, func(app core.App) error {
    // Rollback
    collection, err := app.FindCollectionByNameOrId("posts")
    if err != nil {
        return err
    }

    field := collection.Fields.GetByName("title")
    if field, ok := field.(*core.TextField); ok {
        field.SetMax(200) // Restore original max
    }

    return app.Save(collection)
})
```

### Removing a Field

```go
migrations.Register(func(app core.App) error {
    collection, err := app.FindCollectionByNameOrId("posts")
    if err != nil {
        return err
    }

    collection.Fields.RemoveByName("legacy_field")
    return app.Save(collection)
}, func(app core.App) error {
    // Rollback: re-add the field
    collection, err := app.FindCollectionByNameOrId("posts")
    if err != nil {
        return err
    }

    collection.Fields.Add(core.NewTextField("legacy_field"))
    return app.Save(collection)
})
```

### Creating an Auth Collection

```go
migrations.Register(func(app core.App) error {
    collection := core.NewAuthCollection("users")
    collection.Fields.Add(
        core.NewTextField("name").SetRequired(true),
        core.NewFileField("avatar").SetMaxSelect(1).SetMimeTypes("image/*"),
    )
    collection.PasswordAuth.Enabled = true
    collection.PasswordAuth.IdentityFields = []string{"email"}
    collection.ListRule = types.Pointer("id != ''")
    collection.ViewRule = types.Pointer("id != ''")
    collection.CreateRule = types.Pointer("")
    collection.UpdateRule = types.Pointer("id != ''")
    collection.DeleteRule = types.Pointer("")

    return app.Save(collection)
}, func(app core.App) error {
    collection, err := app.FindCollectionByNameOrId("users")
    if err != nil {
        return err
    }
    return app.Delete(collection)
})
```

### Creating a View Collection

```go
migrations.Register(func(app core.App) error {
    collection := core.NewViewCollection("post_stats")
    collection.ViewQuery = `
        SELECT
            posts.id,
            posts.title,
            COUNT(comments.id) as comment_count
        FROM posts
        LEFT JOIN comments ON comments.post = posts.id
        GROUP BY posts.id
    `
    return app.Save(collection)
}, func(app core.App) error {
    collection, err := app.FindCollectionByNameOrId("post_stats")
    if err != nil {
        return err
    }
    return app.Delete(collection)
})
```

### Data Migrations

Transform existing data:

```go
migrations.Register(func(app core.App) error {
    // Backfill the "slug" field from "title"
    records, err := app.FindAllRecords("posts")
    if err != nil {
        return err
    }

    for _, record := range records {
        slug := strings.ToLower(strings.ReplaceAll(record.GetString("title"), " ", "-"))
        record.Set("slug", slug)

        if err := app.SaveNoValidate(record); err != nil {
            return err
        }
    }

    return nil
}, func(app core.App) error {
    // Clear the slug field on rollback
    records, err := app.FindAllRecords("posts")
    if err != nil {
        return err
    }

    for _, record := range records {
        record.Set("slug", "")
        app.SaveNoValidate(record)
    }

    return nil
})
```

### Raw SQL Migrations

For operations that aren't supported by the collection API:

```go
migrations.Register(func(app core.App) error {
    return app.DB().NewQuery(`
        CREATE TABLE IF NOT EXISTS logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            message TEXT NOT NULL,
            level TEXT DEFAULT 'info',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `).Execute()
}, func(app core.App) error {
    return app.DB().NewQuery("DROP TABLE IF EXISTS logs").Execute()
})
```

## Transaction Safety

All migrations run inside a transaction by default. If any migration fails, all changes are rolled back.

---

> **Source:** [pocketbase.io](https://pocketbase.io/docs/go-migrations/)
