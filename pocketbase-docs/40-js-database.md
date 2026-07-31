# JS Database

PocketBase provides direct access to the underlying SQLite database through the JS API. You can execute raw SQL queries or use the builder-style query helpers.

## Accessing the Database

Get the database instance via `$app.db()`:

```js
var db = $app.db();
```

## Raw SQL Queries

### Select All Records

```js
var results = []
$app.db().newQuery("SELECT * FROM posts").all(&results)
// Note: The & syntax is Go-style; in PocketBase JS, use .all() differently
```

In PocketBase JS, raw queries work like this:

```js
// Execute a raw query and collect results
var results = new DynamicModel({
  id: '',
  title: '',
  status: '',
});

$app
  .db()
  .newQuery('SELECT id, title, status FROM posts WHERE status = {:status}')
  .bind({ status: 'published' })
  .all(results);

// Access results
for (var i = 0; i < results.length; i++) {
  console.log(results[i].id, results[i].title);
}
```

### Select a Single Record

```js
var result = new DynamicModel({
  id: '',
  title: '',
});

$app
  .db()
  .newQuery('SELECT id, title FROM posts WHERE id = {:id}')
  .bind({ id: 'abc123' })
  .one(result);
```

### Execute (INSERT, UPDATE, DELETE)

```js
$app
  .db()
  .newQuery('DELETE FROM tmp_data WHERE created < {:date}')
  .bind({ date: '2024-01-01' })
  .execute();
```

### Using Parameters

Always use named parameters (`{:paramName}`) to prevent SQL injection:

```js
// ✅ Safe - parameterized
$app
  .db()
  .newQuery('SELECT * FROM posts WHERE title LIKE {:title}')
  .bind({ title: '%' + searchTerm + '%' })
  .all(results);

// ❌ Dangerous - string concatenation
$app
  .db()
  .newQuery("SELECT * FROM posts WHERE title LIKE '%" + searchTerm + "%'")
  .all(results);
```

## Builder-Style Queries

PocketBase provides a `dbx` query builder for constructing queries programmatically:

### Select

```js
var records = $app
  .db()
  .select('id', 'title', 'created')
  .from('posts')
  .where(dbx.hashExp({ status: 'published' }))
  .limit(10)
  .orderBy('created DESC')
  .all();
```

### Where Conditions

```js
// Equality
.where(dbx.hashExp({ status: "active" }))

// Comparison
.where(dbx.exp("created > {:date}", { date: "2024-01-01" }))

// AND conditions
.where(dbx.and(
    dbx.hashExp({ status: "published" }),
    dbx.exp("views > {:views}", { views: 100 })
))

// OR conditions
.where(dbx.or(
    dbx.hashExp({ status: "featured" }),
    dbx.exp("likes > {:likes}", { likes: 50 })
))

// IN clause
.where(dbx.in("category", "tech", "science", "news"))

// LIKE
.where(dbx.like("title", "pocketbase"))
```

### Insert

```js
$app
  .db()
  .insert(
    'tmp_logs',
    dbx.Params({
      message: 'User logged in',
      level: 'info',
      created: new Date().toISOString(),
    }),
  )
  .execute();
```

### Update

```js
$app
  .db()
  .update(
    'posts',
    dbx.Params({
      status: 'archived',
    }),
    dbx.hashExp({ id: 'abc123' }),
  )
  .execute();
```

### Delete

```js
$app
  .db()
  .delete('tmp_data', dbx.hashExp({ expired: true }))
  .execute();
```

## Transactions

Wrap multiple operations in a transaction. If any operation fails, all changes are rolled back:

```js
$app.runInTransaction(function (txApp) {
  var collection = txApp.findCollectionByNameOrId('posts');
  var record = new Record(collection);
  record.set('title', 'New Post');
  record.set('status', 'draft');
  txApp.save(record);

  var logCollection = txApp.findCollectionByNameOrId('logs');
  var log = new Record(logCollection);
  log.set('action', 'post_created');
  log.set('postId', record.id);
  txApp.save(log);
});
```

If an error is thrown inside the transaction, it will automatically rollback:

```js
$app.runInTransaction(function (txApp) {
  // This will cause a rollback if the record doesn't exist
  var record = txApp.findRecordById('posts', 'nonexistent');
  record.set('title', 'Updated');
  txApp.save(record);
});
```

## DynamicModel

`DynamicModel` is used for mapping raw SQL results to JavaScript objects:

```js
// Define the shape of expected results
var stats = new DynamicModel({
  total: 0, // numeric default
  avgScore: 0.0, // float default
  name: '', // string default
  active: false, // boolean default
});

$app
  .db()
  .newQuery(
    `
        SELECT 
            COUNT(*) as total,
            AVG(score) as avgScore,
            name,
            active
        FROM users 
        GROUP BY active
    `,
  )
  .all(stats);

for (var i = 0; i < stats.length; i++) {
  console.log(stats[i].name, stats[i].total, stats[i].avgScore);
}
```

## Working with Record Tables

PocketBase stores records in tables named after the collection. Auth collections have additional fields:

```js
// Query auth collection records directly
var users = new DynamicModel({
  id: '',
  email: '',
  verified: false,
  created: '',
});

$app
  .db()
  .newQuery('SELECT id, email, verified, created FROM users WHERE verified = true')
  .all(users);
```

## Schema Helpers

```js
// Check if a table exists
var exists = new DynamicModel({ count: 0 });
$app
  .db()
  .newQuery("SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name={:name}")
  .bind({ name: 'my_table' })
  .one(exists);

if (exists.count > 0) {
  console.log('Table exists');
}
```

## Complete Example

```js
/// <reference path="../pb_data/types.d.ts" />

routerAdd('GET', '/api/stats', function (e) {
  var stats = new DynamicModel({
    totalPosts: 0,
    totalUsers: 0,
    publishedToday: 0,
  });

  // Multiple queries
  var postStats = new DynamicModel({ count: 0 });
  $app.db().newQuery('SELECT COUNT(*) as count FROM posts').one(postStats);
  stats.totalPosts = postStats.count;

  var userStats = new DynamicModel({ count: 0 });
  $app.db().newQuery('SELECT COUNT(*) as count FROM users').one(userStats);
  stats.totalUsers = userStats.count;

  var todayStats = new DynamicModel({ count: 0 });
  $app
    .db()
    .newQuery('SELECT COUNT(*) as count FROM posts WHERE created >= {:today}')
    .bind({ today: new Date().toISOString().split('T')[0] })
    .one(todayStats);
  stats.publishedToday = todayStats.count;

  return e.json(200, stats);
});
```

---

> **Source:** [pocketbase.io](https://pocketbase.io/docs/js-database/)
