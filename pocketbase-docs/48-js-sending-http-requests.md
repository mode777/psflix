# JS Sending HTTP Requests

Since PocketBase's JS engine (goja) is not Node.js, there is no native `fetch` API or `http` module. Instead, PocketBase exposes a Go-based HTTP client via `$http.send()`.

## Basic Usage

### Simple GET Request

```js
var result = $http.send({
  url: 'https://api.example.com/data',
  method: 'GET',
});

console.log('Status:', result.statusCode);
console.log('Body:', result.body);
console.log('JSON:', result.json);
```

### POST Request with JSON Body

```js
var result = $http.send({
  url: 'https://api.example.com/users',
  method: 'POST',
  body: JSON.stringify({
    name: 'John Doe',
    email: 'john@example.com',
  }),
  headers: {
    'Content-Type': 'application/json',
  },
});

if (result.statusCode === 201) {
  console.log('Created:', result.json.id);
} else {
  console.error('Error:', result.statusCode, result.body);
}
```

## Request Options

### Full Options Reference

```js
var result = $http.send({
  url: 'https://api.example.com/endpoint',
  method: 'GET', // GET, POST, PUT, PATCH, DELETE
  body: '', // request body (string)
  headers: {}, // request headers object
  timeout: 30, // timeout in seconds (default: 30)
  insecure: false, // allow insecure HTTPS (default: false)
});
```

### Headers

```js
var result = $http.send({
  url: 'https://api.example.com/data',
  method: 'GET',
  headers: {
    Authorization: 'Bearer your-api-key',
    Accept: 'application/json',
    'X-Custom': 'value',
  },
});
```

### Request Body Formats

```js
// JSON body
var result = $http.send({
  url: 'https://api.example.com/data',
  method: 'POST',
  body: JSON.stringify({ key: 'value' }),
  headers: { 'Content-Type': 'application/json' },
});

// Form URL-encoded body
var result = $http.send({
  url: 'https://api.example.com/login',
  method: 'POST',
  body: 'username=admin&password=secret',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
});

// Raw body
var result = $http.send({
  url: 'https://api.example.com/upload',
  method: 'POST',
  body: 'raw content here',
  headers: { 'Content-Type': 'text/plain' },
});
```

## Response Properties

### Available Properties

```js
var result = $http.send({
  url: 'https://api.example.com/data',
  method: 'GET',
});

// Status code
console.log(result.statusCode); // 200, 404, 500, etc.

// Response body as string
console.log(result.body);

// Response body parsed as JSON
console.log(result.json);

// Response headers
console.log(result.headers);
console.log(result.headers['Content-Type']);
```

### Handling JSON Responses

```js
var result = $http.send({
  url: 'https://api.github.com/users/octocat',
  method: 'GET',
});

if (result.statusCode === 200) {
  var user = result.json;
  console.log('Name:', user.name);
  console.log('Bio:', user.bio);
  console.log('Repos:', user.public_repos);
} else {
  console.error('Request failed:', result.statusCode);
}
```

## HTTP Methods

### GET

```js
var result = $http.send({
  url: 'https://api.example.com/items?page=1&limit=10',
  method: 'GET',
});
```

### POST

```js
var result = $http.send({
  url: 'https://api.example.com/items',
  method: 'POST',
  body: JSON.stringify({ name: 'New Item' }),
  headers: { 'Content-Type': 'application/json' },
});
```

### PUT

```js
var result = $http.send({
  url: 'https://api.example.com/items/123',
  method: 'PUT',
  body: JSON.stringify({ name: 'Updated Item' }),
  headers: { 'Content-Type': 'application/json' },
});
```

### PATCH

```js
var result = $http.send({
  url: 'https://api.example.com/items/123',
  method: 'PATCH',
  body: JSON.stringify({ name: 'Patched Item' }),
  headers: { 'Content-Type': 'application/json' },
});
```

### DELETE

```js
var result = $http.send({
  url: 'https://api.example.com/items/123',
  method: 'DELETE',
});

if (result.statusCode === 204) {
  console.log('Deleted successfully');
}
```

## Practical Examples

### Calling External APIs

```js
routerAdd('GET', '/api/weather', function (e) {
  var city = e.request.pathValue('city') || 'London';

  var result = $http.send({
    url: 'https://api.weatherapi.com/v1/current.json',
    method: 'GET',
    headers: {
      Key: 'your-api-key',
    },
    timeout: 10,
  });

  if (result.statusCode !== 200) {
    return e.error(502, 'Weather API error');
  }

  return e.json(200, {
    city: result.json.location.name,
    temperature: result.json.current.temp_c,
    condition: result.json.current.condition.text,
  });
});
```

### Webhook Integration

```js
function sendWebhook(url, event, data) {
    var result = $http.send({
        url:     url,
        method:  "POST",
        body:    JSON.stringify({
            event: event,
            data:  data,
            timestamp: new Date().toISOString()
        }),
        headers: {
            "Content-Type":   "application/json",
            "X-Webhook-Secret": "your-secret"
        },
        timeout: 10
    })

    if (result.statusCode >= 400) {
        console.error("Webhook failed:", result.statusCode, result.body)
        return false
    }
    return true
}

// Use in hooks
onRecordAfterCreateSuccess((e) {
    sendWebhook("https://example.com/webhook", "record.created", {
        collection: e.collection.name,
        id:         e.record.id,
        data:       e.record.publicExport()
    })
}).bind("posts")
```

### OAuth2 Token Exchange

```js
routerAdd('POST', '/api/auth/google', function (e) {
  var body = e.requestInfo().body;

  // Exchange authorization code for tokens
  var tokenResult = $http.send({
    url: 'https://oauth2.googleapis.com/token',
    method: 'POST',
    body:
      'code=' +
      body.code +
      '&client_id=your-client-id' +
      '&client_secret=your-client-secret' +
      '&redirect_uri=your-redirect-uri' +
      '&grant_type=authorization_code',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    timeout: 15,
  });

  if (tokenResult.statusCode !== 200) {
    return e.error(400, 'Token exchange failed');
  }

  var tokens = tokenResult.json;

  // Get user info
  var userResult = $http.send({
    url: 'https://www.googleapis.com/oauth2/v2/userinfo',
    method: 'GET',
    headers: {
      Authorization: 'Bearer ' + tokens.access_token,
    },
  });

  if (userResult.statusCode !== 200) {
    return e.error(400, 'Failed to get user info');
  }

  var googleUser = userResult.json;
  // Process login/registration...

  return e.json(200, { email: googleUser.email });
});
```

### Proxying Requests

```js
routerAdd('GET', '/api/proxy', function (e) {
  var targetUrl = e.request.url.query.get('url');

  if (!targetUrl) {
    return e.error(400, 'Missing url parameter');
  }

  var result = $http.send({
    url: targetUrl,
    method: e.request.method,
    timeout: 15,
  });

  // Forward response
  e.response.header.set('Content-Type', result.headers['Content-Type'] || 'text/plain');
  return e.string(result.statusCode, result.body);
});
```

### Batch API Calls

```js
function fetchMultipleUrls(urls) {
  var results = [];

  for (var i = 0; i < urls.length; i++) {
    try {
      var result = $http.send({
        url: urls[i],
        method: 'GET',
        timeout: 10,
      });
      results.push({
        url: urls[i],
        statusCode: result.statusCode,
        data: result.json,
      });
    } catch (err) {
      results.push({
        url: urls[i],
        error: err.message,
      });
    }
  }

  return results;
}

routerAdd('GET', '/api/aggregate', function (e) {
  var urls = [
    'https://api.example.com/stats/users',
    'https://api.example.com/stats/posts',
    'https://api.example.com/stats/comments',
  ];

  var results = fetchMultipleUrls(urls);
  return e.json(200, results);
});
```

### Health Check with HTTP

```js
cronAdd('externalHealthCheck', '*/5 * * * *', function (c) {
  $app.refreshApp();

  var endpoints = [
    { url: 'https://api.service1.com/health', name: 'Service 1' },
    { url: 'https://api.service2.com/health', name: 'Service 2' },
    { url: 'https://api.service3.com/health', name: 'Service 3' },
  ];

  for (var i = 0; i < endpoints.length; i++) {
    try {
      var result = $http.send({
        url: endpoints[i].url,
        method: 'GET',
        timeout: 10,
      });

      if (result.statusCode !== 200) {
        console.error(endpoints[i].name, 'is DOWN (status:', result.statusCode + ')');
        // Send alert
        $app.newMailClient().send({
          from: { address: 'alerts@example.com', name: 'Monitoring' },
          to: [{ address: 'admin@example.com' }],
          subject: 'Service Down: ' + endpoints[i].name,
          html: '<p>' + endpoints[i].name + ' returned status ' + result.statusCode + '</p>',
        });
      } else {
        console.log(endpoints[i].name, 'is UP');
      }
    } catch (err) {
      console.error(endpoints[i].name, 'is UNREACHABLE:', err.message);
    }
  }
});
```

## Error Handling

```js
try {
  var result = $http.send({
    url: 'https://api.example.com/data',
    method: 'GET',
    timeout: 5,
  });

  if (result.statusCode === 200) {
    console.log('Success:', result.json);
  } else if (result.statusCode >= 500) {
    console.error('Server error:', result.statusCode);
  } else if (result.statusCode === 404) {
    console.error('Not found');
  } else {
    console.error('Client error:', result.statusCode, result.body);
  }
} catch (err) {
  console.error('Request failed:', err.message);
  // Could be network error, timeout, etc.
}
```

## Performance Notes

- HTTP requests are synchronous and block the JS runtime
- Keep timeouts reasonable (5-30 seconds)
- For multiple requests, consider running them in parallel using separate cron jobs or async patterns
- The default timeout is 30 seconds
- Avoid making HTTP requests inside frequently called hooks (like `onRecordEnrich`) as it will slow down responses

---

> **Source:** [pocketbase.io](https://pocketbase.io/docs/js-sending-http-requests/)
