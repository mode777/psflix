# Go Collection Operations

Collections define the structure (schema) and rules for your records. PocketBase supports three collection types: base, auth, and view.

## Finding Collections

```go
// By name or ID
collection, err := app.FindCollectionByNameOrId("posts")
if err != nil {
    return err
}

// Get all collections
collections, err := app.FindAllCollections()
if err != nil {
    return err
}

// Filter collections by name
collections, err := app.FindCollectionsByNameFilter("name = 'posts'")
if err != nil {
    return err
}
```

## Creating Collections

### Base Collection

A standard collection with custom fields:

```go
collection := core.NewBaseCollection("posts")

// Add fields
collection.Fields.Add(
    core.NewTextField("title").
        SetRequired(true).
        SetMin(1).
        SetMax(200),
    core.NewEditorField("content"),
    core.NewBoolField("featured").SetDefault(false),
    core.NewNumberField("views").SetDefault(0),
    core.NewSelectField("status", []string{"draft", "published"}).
        SetDefault("draft"),
)

if err := app.Save(collection); err != nil {
    return err
}
```

### Auth Collection

A collection with authentication capabilities:

```go
collection := core.NewAuthCollection("users")

// Auth collection automatically has email, password, and token fields
// Add custom fields
collection.Fields.Add(
    core.NewTextField("name").SetRequired(true),
    core.NewFileField("avatar").SetMaxSelect(1).SetMimeTypes("image/png", "image/jpeg"),
)

// Set auth options
collection.PasswordAuth.Enabled = true
collection.PasswordAuth.IdentityFields = []string{"email"}
collection.MFA.Enabled = false
collection.OAuth2.Enabled = true

// Set list/view rule to only show to authenticated users
collection.ListRule = types.Pointer("id != ''")
collection.ViewRule = types.Pointer("id != ''")

if err := app.Save(collection); err != nil {
    return err
}
```

### View Collection

A read-only collection backed by a SQL view:

```go
collection := core.NewViewCollection("post_stats")
collection.ViewQuery = `
    SELECT
        p.id,
        p.title,
        p.created,
        COUNT(c.id) as comment_count
    FROM posts p
    LEFT JOIN comments c ON c.post = p.id
    GROUP BY p.id
`

if err := app.Save(collection); err != nil {
    return err
}
```

## Schema Fields

PocketBase provides a rich set of field types:

### Text Field

```go
core.NewTextField("title").
    SetRequired(true).
    SetMin(1).
    SetMax(200).
    SetPattern("^[a-zA-Z0-9 ]+$")
```

### Number Field

```go
core.NewNumberField("views").
    SetDefault(0).
    SetMin(0).
    SetMax(999999)
```

### Bool Field

```go
core.NewBoolField("featured").
    SetDefault(false)
```

### Email Field

```go
core.NewEmailField("email").
    SetRequired(true).
    SetExceptDomains("freemail.com")
```

### URL Field

```go
core.NewURLField("website").
    SetOnlyDomains("example.com", "github.com")
```

### Date Field

```go
core.NewDateField("birthday").
    SetMin("1900-01-01").
    SetMax("2025-12-31")
```

### Select Field

```go
// Single select
core.NewSelectField("status", []string{"draft", "published", "archived"}).
    SetDefault("draft")

// Multi select
core.NewSelectField("tags", []string{"go", "js", "rust"}).
    SetMaxSelect(5)
```

### File Field

```go
core.NewFileField("avatar").
    SetMaxSelect(1).
    SetMaxSize(5242880). // 5MB
    SetMimeTypes("image/png", "image/jpeg").
    SetThumbs("100x100", "300x300")

// Multiple files
core.NewFileField("images").
    SetMaxSelect(10).
    SetMimeTypes("image/*")
```

### Relation Field

```go
// Single relation
core.NewRelationField("author", "users").
    SetMaxSelect(1)

// Multiple relations
core.NewRelationField("categories", "categories").
    SetMaxSelect(5).
    SetCascadeDelete(true)
```

### JSON Field

```go
core.NewJSONField("metadata").
    SetMaxSize(10000)
```

### GeoPoint Field

```go
core.NewGeoPointField("location")
```

### Autodate Field

```go
// Auto-set on creation
core.NewAutodateField("created").SetOnCreate(true)

// Auto-set on update
core.NewAutodateField("updated").SetOnUpdate(true)
```

### Editor Field

```go
// Rich text editor (stores HTML)
core.NewEditorField("content").
    SetConvertURLs(true)
```

### Password Field

```go
core.NewPasswordField("secret").
    SetMin(8).
    SetMax(72)
```

## Setting Field Options

Common field modifiers:

```go
field := core.NewTextField("name").
    SetRequired(true).     // Field must be provided
    SetHidden(true).       // Hidden from API responses
    SetSystem(true).       // System field (cannot be deleted)
    SetMin(1).             // Min length/value
    SetMax(100).           // Max length/value
    SetDefault("default")  // Default value
```

## Updating Collections

```go
collection, err := app.FindCollectionByNameOrId("posts")
if err != nil {
    return err
}

// Add a new field
collection.Fields.Add(core.NewTextField("subtitle").SetMax(500))

// Modify existing field
titleField := collection.Fields.GetByName("title")
if titleField != nil {
    titleField.SetRequired(true)
}

// Remove a field
collection.Fields.RemoveByName("old_field")

if err := app.Save(collection); err != nil {
    return err
}
```

## Deleting Collections

```go
collection, err := app.FindCollectionByNameOrId("posts")
if err != nil {
    return err
}

if err := app.Delete(collection); err != nil {
    return err
}
```

## Accessing Collection Info

```go
collection, _ := app.FindCollectionByNameOrId("posts")

// Collection properties
log.Printf("Name: %s", collection.Name)
log.Printf("Type: %s", collection.Type)
log.Printf("ID: %s", collection.Id)
log.Printf("System: %v", collection.System)

// Fields
fields := collection.Fields.List()
for _, f := range fields {
    log.Printf("Field: %s (%s)", f.Name, f.Type)
}

// Rules (for auth/base collections)
log.Printf("ListRule: %s", *collection.ListRule)
log.Printf("CreateRule: %s", *collection.CreateRule)
log.Printf("ViewRule: %s", *collection.ViewRule)
log.Printf("UpdateRule: %s", *collection.UpdateRule)
log.Printf("DeleteRule: %s", *collection.DeleteRule)
```

---

> **Source:** [pocketbase.io](https://pocketbase.io/docs/go-collections/)
