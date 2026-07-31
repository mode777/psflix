# Files Upload and Handling

### Uploading Files

To upload files, you must first add a `file` field to your collection.

Once added, you could create/update a Record and upload files by sending a `multipart/form-data` request using the Records create/update APIs.

Each uploaded file will be stored with the original filename (sanitized) and suffixed with a random part (usually 10 characters). For example `test_52iwbgds7l.png`.

All `file` fields by default have a max allowed file size up to **~5MB** (you can adjust it from the collection field options but keep in mind that allowing large file uploads could degrade performance).

**JavaScript:**

```javascript
import PocketBase from 'pocketbase';

const pb = new PocketBase('http://127.0.0.1:8090');
...

// create a new record and upload multiple files
// (files must be Blob or File instances)
const createdRecord = await pb.collection('example').create({
  title: 'Hello world!', // regular text field
  'documents': [
    new File(['content 1...'], 'file1.txt'),
    new File(['content 2...'], 'file2.txt'),
  ]
});

// -----------------------------------------------------------
// Alternative FormData + plain HTML file input example
// <input type="file" id="fileInput" />
// -----------------------------------------------------------
const fileInput = document.getElementById('fileInput');
const formData = new FormData();
formData.append('title', 'Hello world!');

fileInput.addEventListener('change', function () {
  for (let file of fileInput.files) {
    formData.append('documents', file);
  }
});

...
const createdRecord = await pb.collection('example').create(formData);
```

**Dart:**

```dart
import 'package:pocketbase/pocketbase.dart';
import 'package:http/http.dart' as http;

final pb = PocketBase('http://127.0.0.1:8090');
...

final record = await pb.collection('example').create(
  body: {
    'title': 'Hello world!',
  },
  files: [
    http.MultipartFile.fromString(
      'documents',
      'example content 1...',
      filename: 'file1.txt',
    ),
    http.MultipartFile.fromString(
      'documents',
      'example content 2...',
      filename: 'file2.txt',
    ),
  ],
);
```

If your `file` field supports uploading multiple files (Max Files >= 2), you can use the `+` prefix/suffix field name modifier to prepend/append new files alongside already uploaded ones:

**JavaScript:**

```javascript
const createdRecord = await pb.collection('example').update('RECORD_ID', {
  'documents+': new File(['content 3...'], 'file3.txt'),
});
```

**Dart:**

```dart
final record = await pb.collection('example').update(
  'RECORD_ID',
  files: [
    http.MultipartFile.fromString(
      'documents+',
      'example content 3...',
      filename: 'file3.txt',
    ),
  ],
);
```

### Deleting Files

To delete uploaded file(s), set the file field to a zero-value (empty string, `[]`).

To **delete individual file(s)** from a multiple file upload field, suffix the field name with `-` and specify the filename(s):

**JavaScript:**

```javascript
import PocketBase from 'pocketbase';
const pb = new PocketBase('http://127.0.0.1:8090');
...

// delete all "documents" files
await pb.collection('example').update('RECORD_ID', {
  'documents': [],
});

// delete individual files
await pb.collection('example').update('RECORD_ID', {
  'documents-': ["file1.pdf", "file2.txt"],
});
```

**Dart:**

```dart
// delete all "documents" files
await pb.collection('example').update('RECORD_ID', body: {
  'documents': [],
});

// delete individual files
await pb.collection('example').update('RECORD_ID', body: {
  'documents-': ["file1.pdf", "file2.txt"],
});
```

### File URL

Each uploaded file could be accessed by requesting:

```
http://127.0.0.1:8090/api/files/COLLECTION_ID_OR_NAME/RECORD_ID/FILENAME
```

To get a thumbnail, add the `thumb` query parameter:

```
http://127.0.0.1:8090/api/files/COLLECTION_ID_OR_NAME/RECORD_ID/FILENAME?thumb=100x300
```

_Currently limited to jpg, png, gif (first frame) and partially webp (stored as png)._

Supported thumb formats:

- **WxH** (e.g. 100x300) — crop to WxH viewbox (from center)
- **WxHt** (e.g. 100x300t) — crop to WxH viewbox (from top)
- **WxHb** (e.g. 100x300b) — crop to WxH viewbox (from bottom)
- **WxHf** (e.g. 100x300f) — fit inside a WxH viewbox (without cropping)
- **0xH** (e.g. 0x300) — resize to H height preserving aspect ratio
- **Wx0** (e.g. 100x0) — resize to W width preserving aspect ratio

The original file is returned if the requested thumb size is not found or the file is not an image.

**JavaScript:**

```javascript
import PocketBase from 'pocketbase';
const pb = new PocketBase('http://127.0.0.1:8090');
...

const record = await pb.collection('example').getOne('RECORD_ID');
const firstFilename = record.documents[0];
const url = pb.files.getURL(record, firstFilename, {'thumb': '100x250'});
```

**Dart:**

```dart
final record = await pb.collection('example').getOne('RECORD_ID');
final firstFilename = record.getListValue<String>('documents')[0];
final url = pb.files.getURL(record, firstFilename, thumb: '100x250');
```

To instruct the browser to always download the file instead of showing a preview, append `?download=1` to the file URL.

### Protected Files

By default all files are publicly accessible if you know their full URL.

To add extra security for sensitive files, mark the `file` field as _Protected_ from its field options in the Dashboard. Then request the file with a special **short-lived file token**.

Only requests that satisfy the **View API rule** of the record collection will be able to access or download protected files.

**JavaScript:**

```javascript
import PocketBase from 'pocketbase';
const pb = new PocketBase('http://127.0.0.1:8090');
...

// authenticate
await pb.collection('users').authWithPassword('test@example.com', '1234567890');

// generate a file token
const fileToken = await pb.files.getToken();

// retrieve an example protected file url (will be valid ~2min)
const record = await pb.collection('example').getOne('RECORD_ID');
const url = pb.files.getURL(record, record.myPrivateFile, {'token': fileToken});
```

**Dart:**

```dart
// authenticate
await pb.collection('users').authWithPassword('test@example.com', '1234567890');

// generate a file token
final fileToken = await pb.files.getToken();

// retrieve an example protected file url (will be valid ~2min)
final record = await pb.collection('example').getOne('RECORD_ID');
final url = pb.files.getURL(record, record.getStringValue('myPrivateFile'), token: fileToken);
```

### Storage Options

By default PocketBase stores uploaded files in the `pb_data/storage` directory on the local file system. For the majority of cases this is the recommended storage option because it is very fast, easy to work with and backup.

If you have limited disk space you could switch to an external S3 compatible storage (AWS S3, MinIO, Wasabi, DigitalOcean Spaces, Vultr Object Storage, etc.). Configure connection settings from _Dashboard > Settings > Files storage_.

---

**Navigation:** [← Authentication](05-authentication.md) | [Working with relations →](07-working-with-relations.md)

---

> **Source:** [pocketbase.io/docs/files-handling](https://pocketbase.io/docs/files-handling)
