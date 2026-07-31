# JS Routing

PocketBase allows you to register custom API routes from JavaScript. Routes are defined in `*.pb.js` files in the `pb_hooks` directory.

## Registering Routes

### Basic Route

```js
routerAdd('GET', '/hello', function (e) {
  return e.json(200, { message: 'Hello!' });
});
```

### HTTP Methods

```js
routerAdd('GET', '/items', function (e) {
  return e.json(200, {});
});
routerAdd('POST', '/items', function (e) {
  return e.json(200, {});
});
routerAdd('PUT', '/items/:id', function (e) {
  return e.json(200, {});
});
routerAdd('PATCH', '/items/:id', function (e) {
  return e.json(200, {});
});
routerAdd('DELETE', '/items/:id', function (e) {
  return e.json(200, {});
});
```

### Global Middleware

Register middleware that runs on all routes:

```js
routerUse(function (e) {
  console.log('Request:', e.request.method, e.request.url);
  e.next();
});
```

## Path Parameters

### Named Parameters

```js
routerAdd('GET', '/users/{userId}', function (e) {
  var userId = e.request.pathValue('userId');
  return e.json(200, { userId: userId });
});
```

### Wildcard Parameters

```js
routerAdd('GET', '/files/{path...}', function (e) {
  var path = e.request.pathValue('path');
  return e.json(200, { path: path });
});
```

### Catch-All Route

The `{$}` pattern matches the remaining path:

```js
routerAdd('GET', '/static/{$}', function (e) {
  return e.json(200, { catchAll: true });
});
```

## Reading Request Data

### Query Parameters

```js
routerAdd('GET', '/search', function (e) {
  var query = e.request.url.query; // URLSearchParams-like object
  var q = query.get('q');
  var page = query.get('page') || '1';

  return e.json(200, {
    query: q,
    page: parseInt(page),
  });
});
```

### Headers

```js
routerAdd('GET', '/info', function (e) {
  var userAgent = e.request.header.get('User-Agent');
  var auth = e.request.header.get('Authorization');

  return e.json(200, {
    userAgent: userAgent,
  });
});
```

### Request Body

```js
routerAdd('POST', '/data', function (e) {
  var body = e.requestInfo().body;

  // Or bind directly to an object
  var data = {};
  e.bindBody(data);
  console.log(data.name, data.email);

  return e.json(200, { received: body });
});
```

### Uploaded Files

```js
routerAdd('POST', '/upload', function (e) {
  var files = e.findUploadedFiles('document');
  // files is an array of *filesystem.File

  for (var i = 0; i < files.length; i++) {
    console.log('File:', files[i].name, 'Size:', files[i].size);
  }

  return e.json(200, { uploaded: files.length });
});
```

## Auth State

```js
routerAdd('GET', '/me', function (e) {
  // Check if authenticated
  if (!e.auth) {
    return e.json(401, { error: 'Not authenticated' });
  }

  return e.json(200, {
    id: e.auth.id,
    email: e.auth.email,
  });
});

routerAdd('GET', '/admin-only', function (e) {
  if (!e.hasSuperuserAuth()) {
    return e.json(403, { error: 'Forbidden' });
  }
  return e.json(200, { message: 'Welcome, admin!' });
});
```

## Response Headers

```js
routerAdd('GET', '/custom-headers', function (e) {
  e.response.header.set('X-Custom-Header', 'myValue');
  e.response.header.set('Cache-Control', 'max-age=3600');

  return e.json(200, { ok: true });
});
```

## Built-in Middleware

### Require Authentication

```js
routerAdd(
  'GET',
  '/protected',
  function (e) {
    return e.json(200, { message: 'Secret data' });
  },
  $apis.requireAuth(),
);
```

### Require Guest Only

```js
routerAdd(
  'POST',
  '/register',
  function (e) {
    return e.json(200, { message: 'Register' });
  },
  $apis.requireGuestOnly(),
);
```

### Require Superuser Auth

```js
routerAdd(
  'GET',
  '/admin',
  function (e) {
    return e.json(200, { message: 'Admin area' });
  },
  $apis.requireSuperuserAuth(),
);
```

### Require Record Auth by Collection

```js
routerAdd(
  'GET',
  '/member-area',
  function (e) {
    return e.json(200, { message: 'Member content' });
  },
  $apis.requireRecordAuth('users'),
);
```

### Gzip Compression

```js
routerAdd(
  'GET',
  '/compressed',
  function (e) {
    return e.json(200, { data: '...' });
  },
  $apis.gzip(),
);
```

### Activity Logger

```js
routerAdd(
  'POST',
  '/tracked',
  function (e) {
    return e.json(200, { ok: true });
  },
  $apis.activityLogger(),
);
```

### Rate Limiting

```js
routerAdd(
  'POST',
  '/limited',
  function (e) {
    return e.json(200, { ok: true });
  },
  $apis.rateLimit(/* optional: requests per second */),
);
```

### Chaining Middleware

```js
routerAdd(
  'GET',
  '/secure-gzip',
  function (e) {
    return e.json(200, { data: 'compressed and authenticated' });
  },
  $apis.requireAuth(),
  $apis.gzip(),
);
```

## Return Types

### JSON Response

```js
routerAdd('GET', '/json', function (e) {
  return e.json(200, {
    name: 'PocketBase',
    version: '0.22',
  });
});
```

### HTML Response

```js
routerAdd('GET', '/page', function (e) {
  return e.html(200, '<h1>Hello, World!</h1>');
});
```

### Plain Text Response

```js
routerAdd('GET', '/text', function (e) {
  return e.string(200, 'Plain text response');
});
```

### Binary Response

```js
routerAdd('GET', '/download', function (e) {
  var bytes = [80, 111, 99, 107, 101, 116, 66, 97, 115, 101];
  return e.blob(200, 'application/octet-stream', bytes);
});
```

### Redirect

```js
routerAdd('GET', '/old-path', function (e) {
  return e.redirect(301, '/new-path');
});
```

### Error Response

```js
routerAdd('GET', '/fail', function (e) {
  return e.error(400, 'Something went wrong', { detail: 'Invalid input' });
});
```

## Serving Static Files

```js
routerAdd('GET', '/static/{$}', $apis.staticDirectoryHandler('/path/to/static/files'));
```

Or with the `ui` subdirectory:

```js
routerAdd('GET', '{$}', $apis.staticDirectoryHandler(os.dir() + '/pb_public'));
```

## Complete Example

```js
/// <reference path="../pb_data/types.d.ts" />

// Global logging middleware
routerUse(function (e) {
  var start = new Date().getTime();
  e.next();
  var duration = new Date().getTime() - start;
  console.log(e.request.method, e.request.url, duration + 'ms');
});

// Public API
routerAdd('GET', '/api/health', function (e) {
  return e.json(200, { status: 'ok' });
});

// Protected route with auth
routerAdd(
  'GET',
  '/api/profile',
  function (e) {
    if (!e.auth) {
      return e.json(401, { error: 'Unauthorized' });
    }

    var record = $app.findRecordById('users', e.auth.id);
    return e.json(200, record.publicExport());
  },
  $apis.requireAuth(),
);

// File upload
routerAdd(
  'POST',
  '/api/upload',
  function (e) {
    var files = e.findUploadedFiles('file');
    if (files.length === 0) {
      return e.error(400, 'No file uploaded');
    }

    var collection = $app.findCollectionByNameOrId('files');
    var record = new Record(collection);
    record.set('file', files[0]);
    $app.save(record);

    return e.json(200, { id: record.id });
  },
  $apis.requireAuth(),
);
```

---

> **Source:** [pocketbase.io](https://pocketbase.io/docs/js-routing/)
