# JS Filesystem

PocketBase provides a filesystem abstraction for managing file uploads, downloads, and storage operations.

## Accessing the Filesystem

Get a filesystem instance via `$app.newFilesystem()`:

```js
var fs = $app.newFilesystem();
```

## File System Operations

### Upload Files

Upload files to storage:

```js
var fs = $app.newFilesystem();

// Upload from bytes
var file = new FileFromBytes([80, 68, 70], 'document.pdf');
fs.upload(file, 'documents/abc123/document.pdf');

// Upload from local path
var file = new FileFromPath('/path/to/local/file.pdf');
fs.upload(file, 'documents/abc123/file.pdf');
```

### Upload in Record Context

When saving records with file fields, PocketBase handles the filesystem automatically:

```js
var collection = $app.findCollectionByNameOrId('documents');
var record = new Record(collection);

var file = new FileFromBytes([80, 68, 70, 45, 99, 111, 110, 116, 101, 110, 116], 'document.pdf');

record.set('fileField', file);
record.set('title', 'My Document');
$app.save(record);
// File is automatically stored in the correct location
```

### Delete Files

```js
var fs = $app.newFilesystem();
fs.delete('documents/abc123/document.pdf');
```

### Check if File Exists

```js
var fs = $app.newFilesystem();

if (fs.exists('documents/abc123/document.pdf')) {
  console.log('File exists');
} else {
  console.log('File not found');
}
```

### Get File Info

```js
var fs = $app.newFilesystem();
var info = fs.fileInfo('documents/abc123/document.pdf');
console.log('Size:', info.size);
console.log('Modified:', info.modTime);
```

## File Object Types

### FileFromBytes

Create a file from a byte array:

```js
var bytes = [72, 101, 108, 108, 111]; // "Hello" in ASCII
var file = new FileFromBytes(bytes, 'hello.txt');
```

### FileFromPath

Create a file from a local filesystem path:

```js
var file = new FileFromPath('/absolute/path/to/file.pdf');
var file = new FileFromPath('relative/path/to/file.pdf');
```

## Working with Record Files

### Get File URLs

```js
var record = $app.findRecordById('documents', 'abc123');

// Get the file name
var fileName = record.get('fileField');

// Build the file URL
var fileUrl = '/api/files/' + record.collection.id + '/' + record.id + '/' + fileName;

// With thumb (for image fields)
var thumbUrl =
  '/api/files/' + record.collection.id + '/' + record.id + '/' + fileName + '?thumb=100x100';
```

### List Files for a Record

```js
var record = $app.findRecordById('documents', 'abc123');
var files = record.get('fileField'); // Returns array for multi-file fields

for (var i = 0; i < files.length; i++) {
  console.log('File:', files[i]);
}
```

### Delete Specific File from Record

```js
var record = $app.findRecordById('documents', 'abc123');

// Remove a specific file (use - suffix)
record.set('fileField-', 'old_file.pdf');

// Add a new file (use + suffix)
var newFile = new FileFromBytes(bytes, 'new_file.pdf');
record.set('fileField+', newFile);

$app.save(record);
```

## File Token Access

Generate tokens for secure file access:

```js
// Generate a file token for authenticated access
var token = $app.createFileToken();
```

### Using File Tokens

```js
routerAdd('GET', '/api/files/{collection}/{record}/{file}', function (e) {
  var collection = e.request.pathValue('collection');
  var recordId = e.request.pathValue('record');
  var fileName = e.request.pathValue('file');

  // Verify token
  var token = e.request.url.query.get('token');
  if (!token) {
    return e.error(401, 'Missing file token');
  }

  // Serve file
  var record = $app.findRecordById(collection, recordId);
  // ... file serving logic
});
```

## Filesystem in Routes

### Custom Upload Endpoint

```js
routerAdd(
  'POST',
  '/api/upload',
  function (e) {
    if (!e.auth) {
      return e.json(401, { error: 'Unauthorized' });
    }

    var files = e.findUploadedFiles('file');
    if (files.length === 0) {
      return e.error(400, 'No file uploaded');
    }

    var file = files[0];

    // Validate file type
    var allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
    if (allowedTypes.indexOf(file.type) === -1) {
      return e.error(400, 'File type not allowed');
    }

    // Validate file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      return e.error(400, 'File too large');
    }

    // Save to collection
    var collection = $app.findCollectionByNameOrId('uploads');
    var record = new Record(collection);
    record.set('file', file);
    record.set('uploader', e.auth.id);
    $app.save(record);

    return e.json(200, {
      id: record.id,
      file: record.get('file'),
    });
  },
  $apis.requireAuth(),
);
```

### File Download Endpoint

```js
routerAdd('GET', '/api/download/{id}', function (e) {
  var record = $app.findRecordById('documents', e.request.pathValue('id'));

  var fileName = record.get('fileField');
  var fs = $app.newFilesystem();

  // Generate token for the file
  var token = $app.createFileToken();

  // Build download URL
  var url =
    '/api/files/' + record.collection.id + '/' + record.id + '/' + fileName + '?token=' + token;

  return e.redirect(302, url);
});
```

## Temporary Files

### Working with Temp Files

```js
// Write to temp location
$os.writeFile('/tmp/data.json', JSON.stringify(data), 0644);

// Read from temp location
var content = $os.readFile('/tmp/data.json');
```

## Complete Example: File Management API

```js
/// <reference path="../pb_data/types.d.ts" />

// Upload endpoint
routerAdd('POST', '/api/files/upload', function (e) {
  if (!e.auth) {
    return e.json(401, { error: 'Unauthorized' });
  }

  var files = e.findUploadedFiles('files');
  if (files.length === 0) {
    return e.error(400, 'No files uploaded');
  }

  var results = [];
  var collection = $app.findCollectionByNameOrId('files');

  for (var i = 0; i < files.length; i++) {
    var file = files[i];

    // Validate
    if (file.size > 50 * 1024 * 1024) {
      // 50MB
      results.push({
        name: file.name,
        error: 'File too large (max 50MB)',
        status: 'failed',
      });
      continue;
    }

    // Create record
    var record = new Record(collection);
    record.set('file', file);
    record.set('originalName', file.name);
    record.set('mimeType', file.type);
    record.set('size', file.size);
    record.set('uploader', e.auth.id);
    $app.save(record);

    results.push({
      id: record.id,
      name: file.name,
      url: '/api/files/' + collection.id + '/' + record.id + '/' + record.get('file'),
      status: 'success',
    });
  }

  return e.json(200, { files: results });
});

// List user files
routerAdd('GET', '/api/files/my', function (e) {
  if (!e.auth) {
    return e.json(401, { error: 'Unauthorized' });
  }

  var records = $app.findRecordsByFilter('files', 'uploader = {:userId}', '-created', 50, 0, {
    userId: e.auth.id,
  });

  var files = [];
  for (var i = 0; i < records.length; i++) {
    files.push({
      id: records[i].id,
      originalName: records[i].get('originalName'),
      mimeType: records[i].get('mimeType'),
      size: records[i].get('size'),
      url:
        '/api/files/' +
        records[i].collection.id +
        '/' +
        records[i].id +
        '/' +
        records[i].get('file'),
      created: records[i].get('created'),
    });
  }

  return e.json(200, { files: files });
});

// Delete file
routerAdd('DELETE', '/api/files/{id}', function (e) {
  if (!e.auth) {
    return e.json(401, { error: 'Unauthorized' });
  }

  var record = $app.findRecordById('files', e.request.pathValue('id'));

  if (record.get('uploader') !== e.auth.id) {
    return e.json(403, { error: 'Not the owner' });
  }

  // Delete the record (files are cleaned up automatically)
  $app.delete(record);

  return e.json(200, { deleted: true });
});
```

## File Storage Structure

PocketBase stores files in the following structure:

```
pb_data/
  storage/
    <collectionId>/
      <recordId>/
        <filename>
        <thumb1>
        <thumb2>
```

---

> **Source:** [pocketbase.io](https://pocketbase.io/docs/js-filesystem/)
