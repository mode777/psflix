# Go Record Proxy

PocketBase provides a proxy system for creating typed, schema-aware record wrappers. This gives you type-safe field access instead of using string-based getters and setters.

## Why Use Record Proxies?

Standard record access uses string keys:

```go
title := record.GetString("title")
views := record.GetInt("views")
```

With proxies, you get compile-time type safety:

```go
title := post.Title()
views := post.Views()
```

## Using proxy.Record

The `proxy.Record` package provides a way to wrap records with typed access:

```go
import "github.com/pocketbase/pocketbase/tools/proxy"

// Create a proxy from an existing record
p := proxy.Record{Record: record}

// Access fields with type-safe methods (if available)
```

## Custom Record Models

Define your own record wrapper struct for a collection with known schema:

```go
type Post struct {
    *core.Record
}

func (p *Post) Title() string {
    return p.GetString("title")
}

func (p *Post) SetTitle(title string) {
    p.Set("title", title)
}

func (p *Post) Content() string {
    return p.GetString("content")
}

func (p *Post) Views() int {
    return p.GetInt("views")
}

func (p *Post) SetViews(views int) {
    p.Set("views", views)
}

func (p *Post) Published() bool {
    return p.GetBool("published")
}

func (p *Post) CreatedAt() types.DateTime {
    return p.GetDateTime("created")
}

// Factory function
func NewPost(collection *core.Collection) *Post {
    return &Post{Record: core.NewRecord(collection)}
}

// Wrap an existing record
func WrapPost(record *core.Record) *Post {
    return &Post{Record: record}
}
```

### Using the Custom Model

```go
se.Router.GET("/api/posts/{id}", func(e *core.RequestEvent) error {
    collection, err := app.FindCollectionByNameOrId("posts")
    if err != nil {
        return e.NotFoundError("Collection not found", err)
    }

    record, err := app.FindRecordById("posts", e.Request.PathValue("id"))
    if err != nil {
        return e.NotFoundError("Record not found", err)
    }

    post := WrapPost(record)

    return e.JSON(http.StatusOK, map[string]any{
        "id":        post.Id,
        "title":     post.Title(),
        "content":   post.Content(),
        "views":     post.Views(),
        "published": post.Published(),
        "created":   post.CreatedAt(),
    })
})
```

### Creating Records with Custom Models

```go
se.Router.POST("/api/posts", func(e *core.RequestEvent) error {
    collection, err := app.FindCollectionByNameOrId("posts")
    if err != nil {
        return e.NotFoundError("Collection not found", err)
    }

    data := struct {
        Title   string `json:"title"`
        Content string `json:"content"`
    }{}
    if err := e.BindBody(&data); err != nil {
        return e.BadRequestError("Invalid input", err)
    }

    post := NewPost(collection)
    post.SetTitle(data.Title)
    post.SetViews(0)

    // Use the standard Record Set for content
    post.Set("content", data.Content)

    if err := app.Save(post.Record); err != nil {
        return e.InternalServerError("Failed to save", err)
    }

    return e.JSON(201, map[string]any{
        "id":    post.Id,
        "title": post.Title(),
    })
})
```

## Auth Record Proxy

Define a proxy for auth collections:

```go
type User struct {
    *core.Record
}

func (u *User) Name() string {
    return u.GetString("name")
}

func (u *User) SetName(name string) {
    u.Set("name", name)
}

func (u *User) Email() string {
    return u.GetString("email")
}

func (u *User) Avatar() string {
    return u.GetString("avatar")
}

func (u *User) IsAdmin() bool {
    return u.GetBool("isAdmin")
}

func WrapUser(record *core.Record) *User {
    return &User{Record: record}
}
```

### Using Auth Proxy

```go
se.Router.GET("/api/me", func(e *core.RequestEvent) error {
    if e.Auth == nil {
        return e.UnauthorizedError("Not authenticated", nil)
    }

    user := WrapUser(e.Auth)

    return e.JSON(http.StatusOK, map[string]any{
        "id":    user.Id,
        "name":  user.Name(),
        "email": user.Email(),
        "admin": user.IsAdmin(),
    })
})
```

## Enriching Proxies with Relations

Preload and expose related records:

```go
type PostWithAuthor struct {
    *Post
    author *User
}

func (p *PostWithAuthor) Author() *User {
    if p.author == nil {
        authorId := p.GetString("author")
        authorRecord, _ := app.FindRecordById("users", authorId)
        if authorRecord != nil {
            p.author = WrapUser(authorRecord)
        }
    }
    return p.author
}

func (p *PostWithAuthor) AuthorName() string {
    if author := p.Author(); author != nil {
        return author.Name()
    }
    return ""
}
```

## Collection Schema Proxy

Access collection field definitions through a typed wrapper:

```go
type PostSchema struct {
    collection *core.Collection
}

func (s *PostSchema) TitleField() *core.TextField {
    return s.collection.Fields.GetByName("title").(*core.TextField)
}

func (s *PostSchema) ContentViewField() *core.EditorField {
    return s.collection.Fields.GetByName("content").(*core.EditorField)
}
```

## Full Example: Typed CRUD

```go
package models

import (
    "github.com/pocketbase/pocketbase/core"
    "github.com/pocketbase/pocketbase/tools/types"
)

type Post struct {
    *core.Record
}

func NewPost(collection *core.Collection) *Post {
    return &Post{Record: core.NewRecord(collection)}
}

func WrapPost(r *core.Record) *Post {
    return &Post{Record: r}
}

func (p *Post) Title() string       { return p.GetString("title") }
func (p *Post) SetTitle(v string)   { p.Set("title", v) }
func (p *Post) Slug() string        { return p.GetString("slug") }
func (p *Post) SetSlug(v string)    { p.Set("slug", v) }
func (p *Post) Content() string     { return p.GetString("content") }
func (p *Post) SetContent(v string) { p.Set("content", v) }
func (p *Post) Status() string         { return p.GetString("status") }
func (p *Post) SetStatus(v string)     { p.Set("status", v) }
func (p *Post) Views() int             { return p.GetInt("views") }
func (p *Post) SetViews(v int)         { p.Set("views", v) }
func (p *Post) Featured() bool         { return p.GetBool("featured") }
func (p *Post) SetFeatured(v bool)     { p.Set("featured", v) }
func (p *Post) AuthorId() string       { return p.GetString("author") }
func (p *Post) SetAuthorId(v string)   { p.Set("author", v) }
func (p *Post) CreatedAt() types.DateTime { return p.GetDateTime("created") }
func (p *Post) UpdatedAt() types.DateTime { return p.GetDateTime("updated") }
```

Usage:

```go
// Find and wrap
record, _ := app.FindRecordById("posts", postId)
post := models.WrapPost(record)
log.Printf("Title: %s, Views: %d", post.Title(), post.Views())

// Create
post := models.NewPost(collection)
post.SetTitle("New Post")
post.SetSlug("new-post")
post.SetStatus("draft")
post.SetAuthorId(userId)
app.Save(post.Record)
```

---

> **Source:** [pocketbase.io](https://pocketbase.io/docs/go-record-proxy/)
