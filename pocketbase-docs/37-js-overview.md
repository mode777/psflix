# JS Overview

PocketBase v0.17+ comes with an embedded ES5 JavaScript engine ([goja](https://github.com/dop251/goja)) that allows you to extend PocketBase without recompiling.

## Getting Started

Create `*.pb.js` files in the `pb_hooks` directory located next to the PocketBase executable:

```
pb_hooks/
  ├── main.pb.js
  ├── routes.pb.js
  └── helpers.pb.js
```

Each file is loaded and executed on startup. Any exported function matching a hook or route signature is automatically registered.

## Handler Signature

All handlers follow the same signature pattern:

```js
function(e) {
    // handler logic
    e.next()
}
```

The `e` object contains context-specific properties and methods depending on the hook or route type.

## Auto-Restart on File Changes

On UNIX systems, PocketBase automatically watches for file changes in `pb_hooks/` and restarts the JS runtimes. This allows rapid development without manually restarting the server.

## Global Objects

The following global objects are available in every JS file:

| Object      | Description                                                              |
| ----------- | ------------------------------------------------------------------------ |
| `__hooks`   | Array of loaded hook file paths                                          |
| `$app`      | The current PocketBase `core.App` instance                               |
| `$apis`     | API helpers and middleware (`$apis.requireAuth()`, `$apis.gzip()`, etc.) |
| `$os`       | OS-level utilities (`$os.dir()`, `$os.getwd()`, `$os.exec()`, etc.)      |
| `$security` | Security helpers (`$security.randomString()`, `$security.hs256()`, etc.) |
| `$template` | Template rendering utilities                                             |
| `db`        | Database query builder helpers                                           |

## TypeScript Support

PocketBase generates TypeScript declarations in `pb_data/types.d.ts`. Reference them in your JS files for IDE autocompletion:

```js
/// <reference path="../pb_data/types.d.ts" />

// Now $app, $apis, etc. will have full type hints
```

## Important Caveats

### Isolated Contexts

Handlers execute in an isolated JS context. You cannot share variables across files using outer-scope references. Use `require()` to share modules:

```js
// helpers.pb.js
module.exports = {
  myHelper: function (name) {
    return 'Hello, ' + name + '!';
  },
};

// routes.pb.js
var helpers = require('./helpers.pb.js');

routerAdd('GET', '/hello', function (e) {
  return e.json(200, { message: helpers.myHelper('world') });
});
```

### Relative Paths

Relative paths are always resolved relative to the current working directory (the executable location), not the JS file location.

### CommonJS Only

Only CommonJS modules are supported. ES module syntax (`import`/`export`) is not available:

```js
// ✅ Valid
var utils = require('./utils');

// ❌ Invalid
import utils from './utils';
```

### Prewarmed Runtime Pool

PocketBase maintains a pool of 15 prewarmed JS runtimes for better performance. This means up to 15 handlers can execute concurrently without waiting for runtime initialization.

### ES6 Support

Most ES6 features work (arrow functions, template literals, `let`/`const`, destructuring, classes, etc.) but the following are **not available**:

- `setTimeout` / `setInterval` (use [cron jobs](44-js-jobs-scheduling.md) instead)
- `fetch` API (use [`$http.send()`](48-js-sending-http-requests.md) instead)
- Web APIs (DOM, WebSocket client, etc.)

### DB JSON Fields

Database JSON fields require using `get()` and `set()` accessors:

```js
var record = $app.findRecordById('posts', 'abc123');

// ❌ Wrong - direct property access
var value = record.data.myJsonField.key;

// ✅ Correct - use get()
var value = record.get('myJsonField').key;
```

### Method Name Convention

Go method names are automatically converted to camelCase in JavaScript:

- `FindById` → `findById`
- `SaveRecord` → `saveRecord`

Errors thrown in Go are surfaced as JavaScript exceptions:

```js
try {
  var record = $app.findRecordById('posts', 'nonexistent');
} catch (err) {
  console.log('Record not found:', err.message);
}
```

---

> **Source:** [pocketbase.io](https://pocketbase.io/docs/js-overview/)
