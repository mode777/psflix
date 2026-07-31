# Go Record Operations

PocketBase records represent individual entries in a collection. The Go SDK provides methods to find, create, update, delete, and manipulate records.

## Finding Records

### Find by ID

```go
record, err := app.FindRecordById("posts", "RECORD_ID")
if err != nil {
    return err
}
```

### Find First by Filter

```go
record, err := app.FindFirstRecordByFilter("posts", "status = 'published' && slug = 'hello-world'")
if err != nil {
    // Record not found or error
    return err
}
```

### Find Many by Filter

```go
records, err := app.FindRecordsByFilter("posts", "status = 'published'", "-created", 10, 0)
// args: collection, filter, sort, limit, offset
if err != nil {
    return err
}

for _, record := range records {
    log.Printf("Post: %s", record.GetString("title"))
}
```

### Find All Records in a Collection

```go
records, err := app.FindAllRecords("posts")
if err != nil {
    return err
}
```

### Find Records by IDs

```go
records, err := app.FindRecordsByIds("posts", []string{"id1", "id2", "id3"})
if err != nil {
    return err
}
```

## Getting Field Values

Records provide typed getters:

```go
// String values
title := record.GetString("title")
status := record.GetString("status")

// Numeric values
views := record.GetInt("views")
price := record.GetFloat("price")

// Boolean
published := record.GetBool("published")

// DateTime
created := record.GetDateTime("created")

// Slice of strings (e.g., for select fields)
tags := record.GetStringSlice("tags")

// JSON map
metadata := record.GetMap("metadata")

// File URLs
avatar := record.GetString("avatar")
avatarURLs := record.GetStringSlice("avatar") // multiple files
```

## Setting Field Values

```go
record.Set("title", "New Title")
record.Set("views", 42)
record.Set("published", true)
record.Set("tags", []string{"go", "pocketbase"})
```

## Saving Records

### Create a New Record

```go
collection, err := app.FindCollectionByNameOrId("posts")
if err != nil {
    return err
}

record := core.NewRecord(collection)
record.Set("title", "My First Post")
record.Set("status", "published")
record.Set("content", "Hello world!")

if err := app.Save(record); err != nil {
    return err
}

log.Printf("Created record with ID: %s", record.Id)
```

### Update an Existing Record

```go
record, err := app.FindRecordById("posts", "RECORD_ID")
if err != nil {
    return err
}

record.Set("title", "Updated Title")
record.Set("views", record.GetInt("views")+1)

if err := app.Save(record); err != nil {
    return err
}
```

### Save Without Validation

Skip validation (useful in background tasks or migrations):

```go
if err := app.SaveNoValidate(record); err != nil {
    return err
}
```

## Deleting Records

```go
record, err := app.FindRecordById("posts", "RECORD_ID")
if err != nil {
    return err
}

if err := app.Delete(record); err != nil {
    return err
}
```

### Delete with Filter

```go
record, err := app.FindFirstRecordByFilter("posts", "status = 'draft'")
if err != nil {
    return err
}
app.Delete(record)
```

## File Handling

### Generating File URLs

```go
// Single file
fileURL := core.NewFileURL(record, record.GetString("avatar"))
// Returns: /api/files/COLLECTION_ID/RECORD_ID/avatar.jpg

// With absolute URL (for emails, external use)
fileURL := core.NewFileURL(record, record.GetString("avatar"))
fullURL := "https://example.com" + fileURL
```

### Uploading Files

```go
import "github.com/pocketbase/pocketbase/tools/filesystem"

// From bytes
f, err := filesystem.NewFileFromBytes(fileBytes, "image.jpg")
if err != nil {
    return err
}
record.Set("avatar", f)

// From path
f, err := filesystem.NewFileFromPath("/path/to/image.jpg")
if err != nil {
    return err
}
record.Set("avatar", f)

// Multiple files
record.Set("images", []*filesystem.File{f1, f2})

app.Save(record)
```

### Removing Files

```go
// Remove a specific file from a multi-file field
record.Set("images", record.GetStringSlice("images")) // keep existing
// Or clear all:
record.Set("images", []string{})

app.Save(record)
```

## Enriching Records with Relations

When you retrieve records, relations are not automatically expanded. Fetch them manually:

```go
post, err := app.FindRecordById("posts", "RECORD_ID")
if err != nil {
    return err
}

// Single relation
authorId := post.GetString("author")
author, err := app.FindRecordById("users", authorId)
if err != nil {
    return err
}

// Multiple relations
categoryIds := post.GetStringSlice("categories")
categories, err := app.FindRecordsByIds("categories", categoryIds)
if err != nil {
    return err
}

// Build enriched response
result := map[string]any{
    "id":       post.Id,
    "title":    post.GetString("title"),
    "author":   author.PublicExport(),
    "categories": func() []map[string]any {
        cats := make([]map[string]any, len(categories))
        for i, c := range categories {
            cats[i] = c.PublicExport()
        }
        return cats
    }(),
}

return e.JSON(http.StatusOK, result)
```

## Pagination

```go
page := 1    // default
perPage := 20 // default

// Get page/limit from query params
if p := e.Request.URL.Query().Get("page"); p != "" {
    page, _ = strconv.Atoi(p)
}
if pp := e.Request.URL.Query().Get("perPage"); pp != "" {
    perPage, _ = strconv.Atoi(pp)
}

offset := (page - 1) * perPage
records, err := app.FindRecordsByFilter("posts", "status = 'published'", "-created", perPage, offset)
```

## Record Public Export

Export record data safe for API responses (strips internal fields):

```go
exported := record.PublicExport()
// Returns map[string]any with public fields
```

---

> **Source:** [pocketbase.io](https://pocketbase.io/docs/go-records/)
