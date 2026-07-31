# JS Rendering Templates

PocketBase provides template rendering capabilities using Go's `html/template` engine. You can load templates from files and render them with dynamic data.

## Loading Templates

### Load from Files

```js
var html = $template.loadFiles('views/layout.html', 'views/index.html').render({
  title: 'Home Page',
  items: ['Item 1', 'Item 2', 'Item 3'],
});
```

### Load from Directory

```js
var html = $template.loadDir('views/pages', '.html').render({
  page: 'about',
});
```

### Load from String

```js
var html = $template.loadString('<h1>Hello, {{.name}}!</h1>').render({
  name: 'World',
});
```

## Template Syntax

PocketBase uses Go's `html/template` syntax:

### Variables

```html
<h1>{{.title}}</h1>
<p>{{.description}}</p>
```

### Conditionals

```html
{{if .loggedIn}}
<p>Welcome back, {{.username}}!</p>
{{else}}
<p>Please log in.</p>
{{end}}
```

### Loops

```html
<ul>
  {{range .items}}
  <li>{{.}}</li>
  {{end}}
</ul>

<!-- With index -->
{{range $index, $item := .items}}
<li>{{$index}}: {{$item}}</li>
{{end}}
```

### Nested Access

```html
<p>{{.user.name}}</p>
<p>{{.user.email}}</p>
```

### Template Functions

PocketBase templates support built-in template functions:

```html
<!-- Safe HTML (unescaped) -->
{{.content | safeHTML}}

<!-- Date formatting -->
{{.created | date "2006-01-02"}}

<!-- JSON -->
{{.data | json}}

<!-- Truncate -->
{{.longText | truncate 100}}
```

## Using in Routes

### Render HTML Page

```js
routerAdd('GET', '/', function (e) {
  var posts = $app.findRecordsByFilter('posts', "status = 'published'", '-created', 10);

  var html = $template.loadFiles('views/layout.html', 'views/home.html').render({
    title: 'My Blog',
    posts: posts,
  });

  return e.html(200, html);
});
```

### Render with Layout

```js
routerAdd('GET', '/about', function (e) {
  var html = $template.loadFiles('views/layout.html', 'views/about.html').render({
    title: 'About Us',
    activePage: 'about',
  });

  return e.html(200, html);
});
```

## Email Templates

### Basic Email Template

```js
// views/email/welcome.html
// <h1>Welcome, {{.name}}!</h1>
// <p>Thanks for joining {{.appName}}.</p>
// <a href="{{.appUrl}}/dashboard">Go to Dashboard</a>

function sendWelcomeEmail(user) {
  var html = $template.loadFiles('views/email/welcome.html').render({
    name: user.get('name'),
    appName: 'My App',
    appUrl: 'https://example.com',
  });

  $app.newMailClient().send({
    from: { address: 'noreply@example.com', name: 'My App' },
    to: [{ address: user.get('email') }],
    subject: 'Welcome to My App!',
    html: html,
  });
}
```

### Email with Conditional Content

```js
// views/email/notification.html
// <h1>{{.title}}</h1>
// <p>{{.message}}</p>
// {{if .actionUrl}}
// <a href="{{.actionUrl}}" style="...">{{.actionText}}</a>
// {{end}}

function sendNotification(user, data) {
  var html = $template.loadFiles('views/email/notification.html').render({
    title: data.title,
    message: data.message,
    actionUrl: data.actionUrl || null,
    actionText: data.actionText || 'View Details',
  });

  $app.newMailClient().send({
    from: { address: 'noreply@example.com', name: 'My App' },
    to: [{ address: user.get('email') }],
    subject: data.title,
    html: html,
  });
}
```

## Dynamic Templates

### Render from Database

```js
routerAdd('GET', '/pages/{slug}', function (e) {
  var slug = e.request.pathValue('slug');

  try {
    var page = $app.findFirstRecordByFilter('pages', 'slug = {:slug} && published = true', {
      slug: slug,
    });
  } catch (err) {
    return e.html(404, '<h1>Page not found</h1>');
  }

  var html = $template.loadFiles('views/layout.html', 'views/page.html').render({
    title: page.get('title'),
    content: page.get('content'),
    author: page.get('author'),
    created: page.get('created'),
  });

  return e.html(200, html);
});
```

## Helper Functions

Register custom template functions:

```js
// Note: Custom functions are registered via the Go API.
// In PocketBase JS, you can use the built-in functions
// and pass pre-processed data to templates.

routerAdd('GET', '/blog', function (e) {
  var posts = $app.findRecordsByFilter('posts', "status = 'published'", '-created', 20);

  // Pre-process data before passing to template
  var processedPosts = [];
  for (var i = 0; i < posts.length; i++) {
    processedPosts.push({
      title: posts[i].get('title'),
      excerpt: posts[i].get('excerpt') || posts[i].get('content').substring(0, 200),
      date: posts[i].get('created').split('T')[0],
      url: '/posts/' + posts[i].get('slug'),
      authorUrl: '/authors/' + posts[i].get('author'),
    });
  }

  var html = $template.loadFiles('views/layout.html', 'views/blog.html').render({
    title: 'Blog',
    posts: processedPosts,
  });

  return e.html(200, html);
});
```

## Complete Example: Blog with Templates

```js
/// <reference path="../pb_data/types.d.ts" />

// Home page
routerAdd('GET', '/', function (e) {
  var featured = $app.findRecordsByFilter(
    'posts',
    "status = 'published' && featured = true",
    '-created',
    3,
  );

  var recent = $app.findRecordsByFilter('posts', "status = 'published'", '-created', 10);

  var html = $template.loadFiles('views/layout.html', 'views/home.html').render({
    title: 'My Blog',
    featured: featured,
    recent: recent,
  });

  return e.html(200, html);
});

// Post page
routerAdd('GET', '/posts/{slug}', function (e) {
  var slug = e.request.pathValue('slug');

  try {
    var post = $app.findFirstRecordByFilter('posts', "slug = {:slug} && status = 'published'", {
      slug: slug,
    });
  } catch (err) {
    var notFoundHtml = $template
      .loadFiles('views/layout.html', 'views/404.html')
      .render({ title: 'Not Found' });

    return e.html(404, notFoundHtml);
  }

  // Increment view count
  var views = post.get('views') || 0;
  post.set('views', views + 1);
  $app.saveNoValidate(post);

  // Get comments
  var comments = $app.findRecordsByFilter(
    'comments',
    'post = {:postId} && approved = true',
    'created',
    0,
    0,
    { postId: post.id },
  );

  var html = $template.loadFiles('views/layout.html', 'views/post.html').render({
    title: post.get('title'),
    post: post,
    comments: comments,
  });

  return e.html(200, html);
});

// RSS feed
routerAdd('GET', '/feed.xml', function (e) {
  var posts = $app.findRecordsByFilter('posts', "status = 'published'", '-created', 20);

  var xml = $template.loadFiles('views/feed.xml').render({
    title: 'My Blog',
    link: 'https://example.com',
    description: 'Latest posts from My Blog',
    posts: posts,
  });

  e.response.header.set('Content-Type', 'application/rss+xml');
  return e.string(200, xml);
});
```

## Template File Structure

```
views/
  ├── layout.html       (base layout with {{.content}})
  ├── home.html         (home page content)
  ├── post.html         (single post)
  ├── 404.html          (not found page)
  ├── feed.xml          (RSS feed)
  └── email/
      ├── welcome.html   (welcome email)
      └── notification.html (notification email)
```

---

> **Source:** [pocketbase.io](https://pocketbase.io/docs/js-rendering-templates/)
