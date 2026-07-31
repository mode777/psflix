# JS Jobs & Scheduling

PocketBase supports scheduling recurring tasks using cron expressions via the JavaScript API.

## Registering Cron Jobs

Use `cronAdd()` to register a new scheduled job:

```js
cronAdd('cleanupJob', '0 * * * *', function (c) {
  console.log('Running cleanup every hour');
  // Cleanup logic here
});
```

### Cron Expression Format

```
┌───────────── minute (0 - 59)
│ ┌───────────── hour (0 - 23)
│ │ ┌───────────── day of month (1 - 31)
│ │ │ ┌───────────── month (1 - 12)
│ │ │ │ ┌───────────── day of week (0 - 6) (Sunday to Saturday)
│ │ │ │ │
* * * * *
```

### Common Cron Patterns

```js
// Every minute
cronAdd('everyMinute', '* * * * *', function (c) {
  /* ... */
});

// Every 5 minutes
cronAdd('every5Min', '*/5 * * * *', function (c) {
  /* ... */
});

// Every hour
cronAdd('everyHour', '0 * * * *', function (c) {
  /* ... */
});

// Every day at midnight
cronAdd('dailyMidnight', '0 0 * * *', function (c) {
  /* ... */
});

// Every day at 2:30 AM
cronAdd('daily230', '30 2 * * *', function (c) {
  /* ... */
});

// Every Monday at 9 AM
cronAdd('weeklyMonday', '0 9 * * 1', function (c) {
  /* ... */
});

// First day of every month
cronAdd('monthlyFirst', '0 0 1 * *', function (c) {
  /* ... */
});

// Every 15 minutes between 9 AM and 5 PM
cronAdd('businessHours', '*/15 9-17 * * *', function (c) {
  /* ... */
});
```

## Refreshing App State

Inside cron jobs, use `$app.refreshApp()` to get a fresh copy of the app state (cached settings, collections, etc.):

```js
cronAdd('syncJob', '0 * * * *', function (c) {
  // Refresh app state for latest settings/collections
  $app.refreshApp();

  // Now use fresh state
  var settings = $app.settings();
  console.log('App URL:', settings.meta.appUrl);
});
```

## Removing Cron Jobs

Remove a previously registered cron job by its ID:

```js
cronRemove('cleanupJob');
```

## Listing Cron Jobs

Get all registered cron jobs:

```js
var jobs = cronJobs();
for (var i = 0; i < jobs.length; i++) {
  console.log('Job:', jobs[i].id, 'Cron:', jobs[i].cron);
}
```

## Running Cron Jobs Immediately

Trigger a cron job to run immediately (outside its schedule):

```js
cronRun('cleanupJob');
```

## Practical Examples

### Database Cleanup

```js
cronAdd('cleanupExpiredTokens', '0 2 * * *', function (c) {
  $app.refreshApp();

  // Delete expired tokens
  $app
    .db()
    .newQuery('DELETE FROM _tokens WHERE updated < {:expiry}')
    .bind({
      expiry: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    })
    .execute();

  console.log('Cleaned up expired tokens');
});
```

### Sending Scheduled Emails

```js
cronAdd('sendDigestEmails', '0 8 * * 1', function (c) {
  $app.refreshApp();

  // Get users subscribed to weekly digest
  var users = $app.findRecordsByFilter('users', 'subscribed = true && verified = true');

  for (var i = 0; i < users.length; i++) {
    var user = users[i];
    // Build digest content
    var recentPosts = $app.findRecordsByFilter(
      'posts',
      "status = 'published' && created >= {:since}",
      '-created',
      5,
      0,
      { since: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString() },
    );

    // Send email
    $app.newMailClient().send({
      from: { address: 'noreply@example.com', name: 'PocketBase' },
      to: [{ address: user.get('email'), name: user.get('name') }],
      subject: 'Your Weekly Digest',
      html: buildDigestHtml(recentPosts),
    });
  }

  console.log('Sent digest to', users.length, 'users');
});
```

### Syncing External Data

```js
cronAdd('syncExternalData', '*/30 * * * *', function (c) {
  $app.refreshApp();

  // Fetch data from external API
  var result = $http.send({
    url: 'https://api.example.com/data',
    method: 'GET',
    headers: {
      Authorization: 'Bearer ' + $app.settings().meta.externalApiKey,
    },
    timeout: 30,
  });

  if (result.statusCode !== 200) {
    console.error('Sync failed:', result.statusCode);
    return;
  }

  var data = result.json.items;
  var collection = $app.findCollectionByNameOrId('external_data');

  for (var i = 0; i < data.length; i++) {
    var existing = $app.findFirstRecordByFilter('external_data', 'externalId = {:id}', {
      id: data[i].id,
    });

    if (existing) {
      existing.set('data', data[i]);
      $app.save(existing);
    } else {
      var record = new Record(collection);
      record.set('externalId', data[i].id);
      record.set('data', data[i]);
      $app.save(record);
    }
  }

  console.log('Synced', data.length, 'records');
});
```

### Generating Reports

```js
cronAdd('generateDailyReport', '0 6 * * *', function (c) {
  $app.refreshApp();

  var yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  var dateStr = yesterday.toISOString().split('T')[0];

  // Count new registrations
  var newUsers = new DynamicModel({ count: 0 });
  $app
    .db()
    .newQuery('SELECT COUNT(*) as count FROM users WHERE created >= {:start} AND created < {:end}')
    .bind({
      start: dateStr + 'T00:00:00Z',
      end: dateStr + 'T23:59:59Z',
    })
    .one(newUsers);

  // Count new posts
  var newPosts = new DynamicModel({ count: 0 });
  $app
    .db()
    .newQuery('SELECT COUNT(*) as count FROM posts WHERE created >= {:start} AND created < {:end}')
    .bind({
      start: dateStr + 'T00:00:00Z',
      end: dateStr + 'T23:59:59Z',
    })
    .one(newPosts);

  // Save report
  var collection = $app.findCollectionByNameOrId('reports');
  var report = new Record(collection);
  report.set('date', dateStr);
  report.set('newUsers', newUsers.count);
  report.set('newPosts', newPosts.count);
  $app.save(report);

  console.log('Generated report for', dateStr);
});
```

### Health Check

```js
cronAdd('healthCheck', '*/5 * * * *', function (c) {
  $app.refreshApp();

  var result = $http.send({
    url: 'https://example.com/api/health',
    method: 'GET',
    timeout: 10,
  });

  if (result.statusCode !== 200) {
    console.error('Health check failed! Status:', result.statusCode);

    // Alert admin
    $app.newMailClient().send({
      from: { address: 'alerts@example.com', name: 'PocketBase Alert' },
      to: [{ address: 'admin@example.com' }],
      subject: 'Health Check Failed',
      html: '<p>Health check returned status: ' + result.statusCode + '</p>',
    });
  }
});
```

## Complete Example

```js
/// <reference path="../pb_data/types.d.ts" />

// Cleanup expired sessions every hour
cronAdd('sessionCleanup', '0 * * * *', function (c) {
  $app.refreshApp();

  $app
    .db()
    .newQuery('DELETE FROM _tokens WHERE updated < {:expiry}')
    .bind({
      expiry: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    })
    .execute();

  console.log('Session cleanup completed');
});

// Generate sitemap daily
cronAdd('sitemapGeneration', '0 3 * * *', function (c) {
  $app.refreshApp();

  var posts = $app.findRecordsByFilter('posts', "status = 'published'", '-created', 1000, 0);

  var xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

  for (var i = 0; i < posts.length; i++) {
    xml += '  <url>\n';
    xml += '    <loc>https://example.com/posts/' + posts[i].get('slug') + '</loc>\n';
    xml += '    <lastmod>' + posts[i].get('updated').split('T')[0] + '</lastmod>\n';
    xml += '  </url>\n';
  }

  xml += '</urlset>';

  // Save sitemap
  $os.writeFile('/pb_public/sitemap.xml', xml, 0644);

  console.log('Sitemap generated with', posts.length, 'urls');
});

// List all jobs
var jobs = cronJobs();
console.log('Registered', jobs.length, 'cron jobs');
```

---

> **Source:** [pocketbase.io](https://pocketbase.io/docs/js-jobs-scheduling/)
