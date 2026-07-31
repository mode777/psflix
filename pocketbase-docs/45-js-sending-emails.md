# JS Sending Emails

PocketBase provides a mail client for sending emails programmatically from your JavaScript hooks and routes.

## Basic Usage

Use `$app.newMailClient().send()` to send an email:

```js
$app.newMailClient().send({
  from: { address: 'noreply@example.com', name: 'My App' },
  to: [{ address: 'user@example.com', name: 'John Doe' }],
  subject: 'Welcome!',
  html: '<h1>Welcome to My App</h1><p>Thanks for signing up.</p>',
});
```

## Email Options

### Full Options Reference

```js
$app.newMailClient().send({
  from: { address: 'sender@example.com', name: 'Sender Name' },
  to: [
    { address: 'user1@example.com', name: 'User One' },
    { address: 'user2@example.com', name: 'User Two' },
  ],
  cc: [{ address: 'cc@example.com', name: 'CC User' }],
  bcc: [{ address: 'bcc@example.com', name: 'BCC User' }],
  subject: 'Email Subject',
  html: '<h1>HTML content</h1>',
  text: 'Plain text fallback',
  headers: {
    'X-Custom-Header': 'value',
  },
});
```

### From Address

```js
// With name
from: { address: "noreply@example.com", name: "My App" }

// Without name
from: { address: "noreply@example.com" }
```

### Recipients

```js
// Single recipient
to: [{ address: "user@example.com" }]

// Multiple recipients
to: [
    { address: "user1@example.com", name: "User One" },
    { address: "user2@example.com", name: "User Two" }
]

// With CC and BCC
cc:  [{ address: "manager@example.com" }],
bcc: [{ address: "archive@example.com" }]
```

### HTML and Text Content

```js
// HTML only
html: "<h1>Hello</h1><p>World</p>"

// Text only
text: "Hello World"

// Both (text is fallback for clients that don't render HTML)
html: "<h1>Hello</h1><p>World</p>",
text: "Hello World"
```

### Custom Headers

```js
headers: {
    "X-Priority":       "1",
    "X-Custom-Header":  "value",
    "List-Unsubscribe": "<mailto:unsubscribe@example.com>"
}
```

## Using with Hooks

### Send on Record Creation

```js
onRecordAfterCreateSuccess((e) => {
  $app.newMailClient().send({
    from: { address: 'noreply@example.com', name: 'My App' },
    to: [{ address: e.record.get('email') }],
    subject: 'Welcome to My App!',
    html: '<h1>Welcome, ' + e.record.get('name') + '!</h1>',
  });
}).bind('users');
```

### Send on Status Change

```js
onRecordAfterUpdateSuccess((e) => {
  // Check if status changed to "approved"
  var original = e.record.original(); // previous state
  if (original.get('status') !== 'approved' && e.record.get('status') === 'approved') {
    $app.newMailClient().send({
      from: { address: 'noreply@example.com', name: 'My App' },
      to: [{ address: e.record.get('email') }],
      subject: 'Your account has been approved!',
      html: '<p>Great news! Your account is now approved.</p>',
    });
  }
}).bind('applications');
```

### Custom Route for Sending Emails

```js
routerAdd(
  'POST',
  '/api/send-notification',
  function (e) {
    if (!e.hasSuperuserAuth()) {
      return e.json(403, { error: 'Admin only' });
    }

    var body = e.requestInfo().body;

    var users = $app.findRecordsByFilter('users', 'subscribed = true && verified = true');

    for (var i = 0; i < users.length; i++) {
      $app.newMailClient().send({
        from: { address: 'noreply@example.com', name: 'My App' },
        to: [{ address: users[i].get('email') }],
        subject: body.subject,
        html: body.html,
      });
    }

    return e.json(200, { sent: users.length });
  },
  $apis.requireSuperuserAuth(),
);
```

## Using Templates

Combine with `$template` for email templates:

```js
cronAdd('weeklyDigest', '0 9 * * 1', function (c) {
  $app.refreshApp();

  var users = $app.findRecordsByFilter('users', 'subscribed = true');

  for (var i = 0; i < users.length; i++) {
    var html = $template.loadFiles('views/digest.html').render({
      name: users[i].get('name'),
      posts: $app.findRecordsByFilter('posts', "status = 'published'", '-created', 5),
    });

    $app.newMailClient().send({
      from: { address: 'noreply@example.com', name: 'My App' },
      to: [{ address: users[i].get('email') }],
      subject: 'Your Weekly Digest',
      html: html,
    });
  }
});
```

## Error Handling

```js
try {
  $app.newMailClient().send({
    from: { address: 'noreply@example.com', name: 'My App' },
    to: [{ address: 'user@example.com' }],
    subject: 'Test',
    html: '<p>Test email</p>',
  });
  console.log('Email sent successfully');
} catch (err) {
  console.error('Failed to send email:', err.message);
}
```

## Mailer Hooks

You can customize or intercept all outgoing emails using mailer hooks:

```js
onMailerSend((e) {
    // Log all outgoing emails
    console.log("Sending email to:", e.to)
    console.log("Subject:", e.subject)

    // Add custom headers
    e.headers["X-App-Id"] = "my-app"

    // Continue sending
    e.next()
})

// Block specific emails
onMailerSend((e) {
    // Don't send to blacklisted addresses
    for (var i = 0; i < e.to.length; i++) {
        if (e.to[i].address === "blocked@example.com") {
            e.to.splice(i, 1)
            i--
        }
    }
    e.next()
})
```

## Complete Example: Email Service

```js
/// <reference path="../pb_data/types.d.ts" />

// Email service module
var emailService = {
    sendWelcome: function(user) {
        $app.newMailClient().send({
            from:    { address: "noreply@example.com", name: "My App" },
            to:      [{ address: user.get("email"), name: user.get("name") }],
            subject: "Welcome to My App!",
            html:    '<h1>Welcome, ' + user.get("name") + '!</h1>' +
                     '<p>Thanks for joining. Get started by exploring our features.</p>' +
                     '<a href="https://example.com/getting-started">Get Started</a>'
        })
    },

    sendPasswordReset: function(user, token) {
        $app.newMailClient().send({
            from:    { address: "noreply@example.com", name: "My App" },
            to:      [{ address: user.get("email") }],
            subject: "Reset Your Password",
            html:    '<h1>Password Reset</h1>' +
                     '<p>Click the link below to reset your password:</p>' +
                     '<a href="https://example.com/reset-password?token=' + token + '">Reset Password</a>' +
                     '<p>This link will expire in 1 hour.</p>'
        })
    },

    sendNotification: function(user, title, message) {
        $app.newMailClient().send({
            from:    { address: "notifications@example.com", name: "My App" },
            to:      [{ address: user.get("email") }],
            subject: title,
            html:    '<h1>' + title + '</h1><p>' + message + '</p>'
        })
    },

    sendBulkEmail: function(users, subject, html) {
        var sent = 0
        var failed = 0

        for (var i = 0; i < users.length; i++) {
            try {
                $app.newMailClient().send({
                    from:    { address: "noreply@example.com", name: "My App" },
                    to:      [{ address: users[i].get("email") }],
                    subject: subject,
                    html:    html
                })
                sent++
            } catch (err) {
                console.error("Failed to send to:", users[i].get("email"), err.message)
                failed++
            }
        }

        return { sent: sent, failed: failed }
    }
}

// Use in hooks
onRecordAfterCreateSuccess((e) {
    emailService.sendWelcome(e.record)
}).bind("users")

// Use in routes
routerAdd("POST", "/api/notify", function(e) {
    var body = e.requestInfo().body
    var users = $app.findRecordsByFilter("users", "subscribed = true")
    var result = emailService.sendBulkEmail(users, body.subject, body.html)
    return e.json(200, result)
}, $apis.requireSuperuserAuth())
```

---

> **Source:** [pocketbase.io](https://pocketbase.io/docs/js-sending-emails/)
