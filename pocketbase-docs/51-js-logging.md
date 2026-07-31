# JS Logging

PocketBase provides logging capabilities through the JavaScript console object and the app logger for structured logging.

## Console Logging

### Basic Logging

```js
console.log('Hello, World!');
console.log('User:', user.name, 'Email:', user.email);
```

### Log Levels

```js
// Standard output
console.log('This is a regular log message');

// Informational
console.info('Server started on port 8090');

// Warnings
console.warn('Deprecated API usage detected');

// Errors
console.error('Failed to connect to database:', err.message);
```

### Formatting

```js
// Multiple arguments are joined with spaces
console.log('User', userId, 'performed action', action);

// Objects are automatically serialized
console.log('Request:', { method: 'GET', path: '/api/test' });

// Template literals (ES6)
console.log(`Processing ${items.length} items for user ${userId}`);
```

## App Logger

PocketBase provides a structured logger via `$app.logger()`:

### Basic Usage

```js
$app.logger().info('User logged in', 'userId', userId);
$app.logger().warn('Rate limit approaching', 'ip', clientIp);
$app.logger().error('Database query failed', 'error', err.message);
$app.logger().debug('Debug information', 'data', someData);
```

### Logger Methods

```js
// Debug level (only shown in debug mode)
$app.logger().debug('message', 'key1', value1, 'key2', value2);

// Info level
$app.logger().info('message', 'key1', value1);

// Warn level
$app.logger().warn('message', 'key1', value1);

// Error level
$app.logger().error('message', 'key1', value1);
```

### Structured Logging

The logger accepts key-value pairs for structured logging:

```js
$app
  .logger()
  .info(
    'Record created',
    'collection',
    collection.name,
    'recordId',
    record.id,
    'userId',
    e.auth ? e.auth.id : 'anonymous',
  );

$app
  .logger()
  .error(
    'Email send failed',
    'to',
    user.get('email'),
    'subject',
    subject,
    'error',
    err.message,
    'duration',
    duration + 'ms',
  );
```

## Logging in Hooks

### Log Record Operations

```js
onRecordAfterCreateSuccess((e) {
    $app.logger().info("Record created",
        "collection", e.collection.name,
        "recordId", e.record.id
    )
    console.log("Created record:", e.record.id, "in", e.collection.name)
})

onRecordAfterUpdateSuccess((e) {
    $app.logger().info("Record updated",
        "collection", e.collection.name,
        "recordId", e.record.id
    )
})

onRecordAfterDeleteSuccess((e) {
    $app.logger().warn("Record deleted",
        "collection", e.collection.name,
        "recordId", e.record.id
    )
})

onRecordAfterCreateError((e) {
    $app.logger().error("Record creation failed",
        "collection", e.collection.name,
        "error", e.error.message
    )
    console.error("Failed to create record:", e.error)
})
```

### Log Auth Events

```js
onRecordAuthWithPasswordRequest((e) {
    console.log("Password auth attempt:", e.record.get("email"))
    e.next()
})

onRecordAfterCreateSuccess((e) {
    $app.logger().info("New user registered",
        "userId", e.record.id,
        "email", e.record.get("email")
    )
}).bind("users")
```

## Logging in Routes

### Request Logging Middleware

```js
routerUse(function (e) {
  var start = new Date().getTime();

  console.log('→', e.request.method, e.request.url);

  e.next();

  var duration = new Date().getTime() - start;
  console.log('←', e.request.method, e.request.url, e.response.status, duration + 'ms');
});
```

### Error Logging in Routes

```js
routerAdd('POST', '/api/process', function (e) {
  try {
    var body = e.requestInfo().body;

    console.log('Processing request:', body.type);

    // Process logic...

    console.log('Processing complete');
    return e.json(200, { success: true });
  } catch (err) {
    $app.logger().error('Processing failed', 'error', err.message, 'stack', err.stack);
    console.error('Processing error:', err);
    return e.error(500, 'Processing failed');
  }
});
```

## Logging in Cron Jobs

```js
cronAdd('cleanup', '0 * * * *', function (c) {
  console.log('Starting cleanup job...');

  try {
    // Cleanup logic
    var deleted = 0;
    // ... deletion logic ...

    console.log('Cleanup complete. Deleted', deleted, 'records');
    $app.logger().info('Cleanup job completed', 'deleted', deleted);
  } catch (err) {
    console.error('Cleanup job failed:', err.message);
    $app.logger().error('Cleanup job failed', 'error', err.message);
  }
});
```

## Debug Logging

### Conditional Debug Logging

```js
var DEBUG = true;

function debugLog() {
  if (DEBUG) {
    var args = ['[DEBUG]'];
    for (var i = 0; i < arguments.length; i++) {
      args.push(arguments[i]);
    }
    console.log.apply(console, args);
  }
}

// Usage
debugLog('Processing item', itemId, 'of type', itemType);
```

### Performance Logging

```js
function logPerformance(label, fn) {
  var start = new Date().getTime();
  var result = fn();
  var duration = new Date().getTime() - start;
  console.log(label + ':', duration + 'ms');
  return result;
}

// Usage
var users = logPerformance('Fetch users', function () {
  return $app.findAllRecords('users');
});
```

## Complete Example: Logging Service

```js
/// <reference path="../pb_data/types.d.ts" />

var logger = {
    _level: "info",  // debug, info, warn, error

    _shouldLog: function(level) {
        var levels = { "debug": 0, "info": 1, "warn": 2, "error": 3 }
        return levels[level] >= levels[this._level]
    },

    _formatMessage: function(level, message, meta) {
        var timestamp = new Date().toISOString()
        var logEntry = {
            timestamp: timestamp,
            level:     level,
            message:   message
        }

        if (meta) {
            logEntry.meta = meta
        }

        return JSON.stringify(logEntry)
    },

    debug: function(message, meta) {
        if (this._shouldLog("debug")) {
            console.log(this._formatMessage("debug", message, meta))
        }
    },

    info: function(message, meta) {
        if (this._shouldLog("info")) {
            console.info(this._formatMessage("info", message, meta))
            $app.logger().info(message, "meta", meta ? JSON.stringify(meta) : "")
        }
    },

    warn: function(message, meta) {
        if (this._shouldLog("warn")) {
            console.warn(this._formatMessage("warn", message, meta))
            $app.logger().warn(message, "meta", meta ? JSON.stringify(meta) : "")
        }
    },

    error: function(message, meta) {
        if (this._shouldLog("error")) {
            console.error(this._formatMessage("error", message, meta))
            $app.logger().error(message, "meta", meta ? JSON.stringify(meta) : "")
        }
    },

    logRequest: function(method, path, status, duration) {
        this.info("HTTP Request", {
            method:   method,
            path:     path,
            status:   status,
            duration: duration + "ms"
        })
    },

    logRecordAction: function(action, collection, recordId, userId) {
        this.info("Record " + action, {
            collection: collection,
            recordId:   recordId,
            userId:     userId || "system"
        })
    },

    logError: function(err, context) {
        this.error(err.message, {
            context: context,
            stack:   err.stack
        })
    }
}

// Use the logger
routerUse(function(e) {
    var start = new Date().getTime()
    e.next()
    var duration = new Date().getTime() - start
    logger.logRequest(e.request.method, e.request.url, 200, duration)
})

onRecordAfterCreateSuccess((e) {
    logger.logRecordAction("create", e.collection.name, e.record.id, e.auth ? e.auth.id : null)
})

onRecordAfterUpdateSuccess((e) {
    logger.logRecordAction("update", e.collection.name, e.record.id, e.auth ? e.auth.id : null)
})

onRecordAfterDeleteSuccess((e) {
    logger.logRecordAction("delete", e.collection.name, e.record.id, e.auth ? e.auth.id : null)
})
```

## Log Output Location

PocketBase logs are output to stdout/stderr and captured in:

- Console output when running in foreground
- Log files in `pb_data/logs/` directory
- System journal if running as a service

---

> **Source:** [pocketbase.io](https://pocketbase.io/docs/js-logging/)
