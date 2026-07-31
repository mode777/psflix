# Go Rendering Templates

PocketBase supports Go's standard `html/template` and `text/template` packages for rendering dynamic HTML content in routes and emails.

## Using html/template

```go
import (
    "html/template"
    "net/http"

    "github.com/pocketbase/pocketbase/core"
)

app.OnServe().BindFunc(func(se *core.ServeEvent) error {
    se.Router.GET("/hello", func(e *core.RequestEvent) error {
        tmpl := template.Must(template.New("hello").Parse(`
            <!DOCTYPE html>
            <html>
            <head><title>Hello</title></head>
            <body>
                <h1>Hello, {{.Name}}!</h1>
                <p>Welcome to PocketBase.</p>
            </body>
            </html>
        `))

        var buf bytes.Buffer
        if err := tmpl.Execute(&buf, map[string]string{"Name": "World"}); err != nil {
            return e.InternalServerError("Template error", err)
        }

        e.Response.Header().Set("Content-Type", "text/html; charset=utf-8")
        e.Response.WriteHeader(http.StatusOK)
        _, err := e.Response.Write(buf.Bytes())
        return err
    })
    return se.Next()
})
```

## Using ParseFiles

Load templates from files on disk:

```go
se.Router.GET("/page", func(e *core.RequestEvent) error {
    tmpl, err := template.ParseFiles(
        "templates/layout.html",
        "templates/page.html",
    )
    if err != nil {
        return e.InternalServerError("Template parse error", err)
    }

    var buf bytes.Buffer
    if err := tmpl.Execute(&buf, map[string]any{
        "Title":   "My Page",
        "Content": "Welcome to my page!",
        "Items":   []string{"Item 1", "Item 2", "Item 3"},
    }); err != nil {
        return e.InternalServerError("Template execution error", err)
    }

    e.Response.Header().Set("Content-Type", "text/html; charset=utf-8")
    e.Response.WriteHeader(http.StatusOK)
    _, err = e.Response.Write(buf.Bytes())
    return err
})
```

## Using ParseGlob

Load multiple templates matching a glob pattern:

```go
tmpl := template.Must(template.ParseGlob("templates/*.html"))
```

## Template Functions

Register custom template functions:

```go
funcMap := template.FuncMap{
    "upper":     strings.ToUpper,
    "lower":     strings.ToLower,
    "truncate": func(s string, maxLen int) string {
        if len(s) <= maxLen {
            return s
        }
        return s[:maxLen] + "..."
    },
    "formatDate": func(t time.Time) string {
        return t.Format("January 2, 2006")
    },
}

tmpl := template.Must(template.New("page").Funcs(funcMap).Parse(`
    <h1>{{.Title | upper}}</h1>
    <p>{{.Content | truncate 100}}</p>
    <time>{{formatDate .Created}}</time>
`))
```

Template usage:

```html
<!-- Use function -->
<p>{{.Title | upper}}</p>
<p>{{.Name | lower}}</p>
<p>{{.Content | truncate 50}}</p>

<!-- If/else -->
{{if .IsAdmin}}
<p>Welcome, admin!</p>
{{else}}
<p>Welcome, user!</p>
{{end}}

<!-- Range/loop -->
<ul>
  {{range .Items}}
  <li>{{.}}</li>
  {{end}}
</ul>

<!-- With -->
{{with .User}}
<p>Hello, {{.Name}}!</p>
{{end}}
```

## Nested Templates

Define reusable template blocks:

```go
tmpl := template.Must(template.New("").Parse(`
    {{define "header"}}
    <header><h1>{{.Title}}</h1></header>
    {{end}}

    {{define "footer"}}
    <footer><p>&copy; 2025 My App</p></footer>
    {{end}}

    {{define "page"}}
    <!DOCTYPE html>
    <html>
    <body>
        {{template "header" .}}
        <main>{{.Content}}</main>
        {{template "footer" .}}
    </body>
    </html>
    {{end}}
`))

// Execute the "page" template
var buf bytes.Buffer
tmpl.ExecuteTemplate(&buf, "page", data)
```

## Using the RequestEvent HTML Helper

PocketBase provides a convenient `e.HTML()` method on the `RequestEvent`:

```go
se.Router.GET("/greeting", func(e *core.RequestEvent) error {
    tmplStr := `<h1>Hello, {{.Name}}!</h1>`
    return e.HTML(http.StatusOK, tmplStr, map[string]string{"Name": "World"})
})
```

## Embedded Templates

Embed templates in your Go binary using `//go:embed`:

```go
import "embed"

//go:embed templates/*
var templateFS embed.FS

se.Router.GET("/", func(e *core.RequestEvent) error {
    tmpl, err := template.ParseFS(templateFS, "templates/index.html")
    if err != nil {
        return e.InternalServerError("Template error", err)
    }

    var buf bytes.Buffer
    if err := tmpl.Execute(&buf, data); err != nil {
        return e.InternalServerError("Template error", err)
    }

    e.Response.Header().Set("Content-Type", "text/html; charset=utf-8")
    e.Response.WriteHeader(http.StatusOK)
    _, err = e.Response.Write(buf.Bytes())
    return err
})
```

## Pre-Loading Templates

For performance, parse templates once at startup rather than on each request:

```go
var templates *template.Template

func init() {
    funcMap := template.FuncMap{
        "upper": strings.ToUpper,
    }
    templates = template.Must(
        template.New("").Funcs(funcMap).ParseGlob("templates/*.html"),
    )
}

app.OnServe().BindFunc(func(se *core.ServeEvent) error {
    se.Router.GET("/", func(e *core.RequestEvent) error {
        var buf bytes.Buffer
        if err := templates.ExecuteTemplate(&buf, "index.html", data); err != nil {
            return e.InternalServerError("Template error", err)
        }

        e.Response.Header().Set("Content-Type", "text/html; charset=utf-8")
        e.Response.WriteHeader(http.StatusOK)
        _, err := e.Response.Write(buf.Bytes())
        return err
    })
    return se.Next()
})
```

---

> **Source:** [pocketbase.io](https://pocketbase.io/docs/go-rendering-templates/)
