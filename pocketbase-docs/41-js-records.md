# JS Record Operations

Records are the primary data model in PocketBase. This guide covers CRUD operations, file handling, and advanced record features using the JavaScript API.

## Finding Records

### Find by ID

```js
var record = $app.findRecordById('posts', 'abc123');
console.log(record.get('title'));
```

### Find First by Filter

```js
var record = $app.findFirstRecordByFilter('posts', 'status = {:status} && featured = true', {
  status: 'published',
});
```

### Find All with Filter

```js
var records = $app.findRecordsByFilter(
  'posts', // collection name or ID
  'status = {:status}', // filter expression
  '-created', // sort (prefix with - for descending)
  20, // limit
  0, // offset
  { status: 'published' }, // filter params
);

for (var i = 0; i < records.length; i++) {
  console.log(records[i].get('title'));
}
```

### Find All Records

```js
var records = $app.findAllRecords('posts');
```

### Custom DB Query for Records

```js
var records = $app.findRecordsByCustomSql('SELECT * FROM posts WHERE views > {:views}', {
  views: 100,
});
```

## Creating Records

```js
var collection = $app.findCollectionByNameOrId('posts');
var record = new Record(collection);

// Set field values
record.set('title', 'My New Post');
record.set('content', 'This is the content of the post.');
record.set('status', 'draft');
record.set('featured', false);
record.set('views', 0);

// Save the record (with validation)
$app.save(record);

// Save without validation
$app.saveNoValidate(record);

console.log('Created record:', record.id);
```

### Setting Multiple Fields

```js
var collection = $app.findCollectionByNameOrId('posts');
var record = new Record(collection);

// set() accepts any field name defined in the collection schema
record.set('title', 'Hello World');
record.set('slug', 'hello-world');
record.set('tags', ['javascript', 'pocketbase']);
record.set('metadata', { author: 'John', version: 1 });

$app.save(record);
```

### Creating Auth Records

```js
var collection = $app.findCollectionByNameOrId('users');
var record = new Record(collection);

record.set('email', 'user@example.com');
record.set('password', 'securePassword123');
record.set('passwordConfirm', 'securePassword123');
record.set('name', 'John Doe');
record.set('verified', false);

$app.save(record);
```

## Updating Records

```js
var record = $app.findRecordById('posts', 'abc123');

record.set('title', 'Updated Title');
record.set('status', 'published');

$app.save(record);
```

### Increment a Counter

```js
var record = $app.findRecordById('posts', 'abc123');
var currentViews = record.get('views') || 0;
record.set('views', currentViews + 1);
$app.save(record);
```

## Deleting Records

```js
var record = $app.findRecordById('posts', 'abc123');
$app.delete(record);
```

### Delete with File Cleanup

When you delete a record that has file fields, PocketBase automatically cleans up the associated files.

## File Handling

### Uploading Files from Bytes

```js
var collection = $app.findCollectionByNameOrId('documents');
var record = new Record(collection);

var file = new FileFromBytes(
  [80, 68, 70, 45, 99, 111, 110, 116, 101, 110, 116], // file bytes
  'document.pdf', // filename
);

record.set('fileField', file);
record.set('title', 'My Document');
$app.save(record);
```

### Uploading Files from Path

```js
var collection = $app.findCollectionByNameOrId('documents');
var record = new Record(collection);

var file = new FileFromPath('/path/to/local/file.pdf');
record.set('fileField', file);
$app.save(record);
```

### Multiple File Uploads

```js
var collection = $app.findCollectionByNameOrId('gallery');
var record = new Record(collection);

var file1 = new FileFromBytes(bytes1, 'photo1.jpg');
var file2 = new FileFromBytes(bytes2, 'photo2.jpg');

// For multi-file fields, pass an array
record.set('images', [file1, file2]);
$app.save(record);
```

### Working with Existing Files

```js
var record = $app.findRecordById('documents', 'abc123');

// Get current file names
var files = record.get('fileField');
console.log('Current files:', files);

// Remove a specific file
record.set('fileField-', 'old_file.pdf');

// Add a new file while keeping existing ones
record.set('fileField+', newFile);
```

## Enriching Records with Expand

PocketBase supports expanding relations:

```js
var record = $app.findRecordById('comments', 'abc123');

// Expand the "post" relation
$app.expandRecord(record, ['post'], null);

// Access expanded record
var post = record.expandedOne('post');
console.log('Post title:', post.get('title'));

// Expand with multiple relations
$app.expandRecord(record, ['post', 'post.author'], null);

// Expand with custom filter
$app.expandRecord(record, ['post'], function (collectionId, ids) {
  return $app.findRecordsByIds(collectionId, ids);
});
```

### Expand for Lists

```js
var records = $app.findRecordsByFilter('comments', 'approved = true', '-created', 50);

$app.expandRecords(records, ['post', 'user'], null);

for (var i = 0; i < records.length; i++) {
  var post = records[i].expandedOne('post');
  var user = records[i].expandedOne('user');
  console.log(user.get('name'), 'commented on', post.get('title'));
}
```

## Public Export

Export a record with all its public fields:

```js
var record = $app.findRecordById('posts', 'abc123');
var exported = record.publicExport();
return e.json(200, exported);
```

With expand:

```js
$app.expandRecord(record, ['author'], null);
var exported = record.publicExport();
// exported will include expanded.author
```

## Record Collections

### Finding Related Records

```js
var post = $app.findRecordById('posts', 'abc123');

// Get all comments for this post
var comments = $app.findRecordsByFilter('comments', 'post = {:postId}', '-created', 0, 0, {
  postId: post.id,
});
```

## Validation

Records are validated automatically when calling `$app.save()`. To validate without saving:

```js
var record = $app.findRecordById('posts', 'abc123');
record.set('title', '');

// Validate
var validator = $app.validate();
// ... custom validation logic
```

## Complete CRUD Example

```js
/// <reference path="../pb_data/types.d.ts" />

// Create
routerAdd('POST', '/api/posts', function (e) {
  if (!e.auth) {
    return e.json(401, { error: 'Unauthorized' });
  }

  var collection = $app.findCollectionByNameOrId('posts');
  var record = new Record(collection);

  var body = e.requestInfo().body;
  record.set('title', body.title);
  record.set('content', body.content);
  record.set('author', e.auth.id);
  record.set('status', 'draft');

  $app.save(record);

  return e.json(201, record.publicExport());
});

// Read
routerAdd('GET', '/api/posts/{id}', function (e) {
  var record = $app.findRecordById('posts', e.request.pathValue('id'));
  $app.expandRecord(record, ['author'], null);

  return e.json(200, record.publicExport());
});

// Update
routerAdd('PATCH', '/api/posts/{id}', function (e) {
  if (!e.auth) {
    return e.json(401, { error: 'Unauthorized' });
  }

  var record = $app.findRecordById('posts', e.request.pathValue('id'));

  if (record.get('author') !== e.auth.id) {
    return e.json(403, { error: 'Not the author' });
  }

  var body = e.requestInfo().body;
  if (body.title) record.set('title', body.title);
  if (body.content) record.set('content', body.content);
  if (body.status) record.set('status', body.status);

  $app.save(record);

  return e.json(200, record.publicExport());
});

// Delete
routerAdd('DELETE', '/api/posts/{id}', function (e) {
  if (!e.auth) {
    return e.json(401, { error: 'Unauthorized' });
  }

  var record = $app.findRecordById('posts', e.request.pathValue('id'));

  if (record.get('author') !== e.auth.id) {
    return e.json(403, { error: 'Not the author' });
  }

  $app.delete(record);

  return e.json(200, { deleted: true });
});
```

---

> **Source:** [pocketbase.io](https://pocketbase.io/docs/js-records/)
