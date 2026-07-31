# Working with Relations

### Overview

The `relation` fields follow the same rules as any other collection field and can be set/modified by directly updating the field value — with a record id or array of ids, in case a multiple relation is used.

**JavaScript:**

```javascript
import PocketBase from 'pocketbase';
const pb = new PocketBase('http://127.0.0.1:8090');
...

const post = await pb.collection('posts').create({
  'title': 'Lorem ipsum...',
  'tags': ['TAG_ID1', 'TAG_ID2'],
});
```

**Dart:**

```dart
import 'package:pocketbase/pocketbase.dart';

final pb = PocketBase('http://127.0.0.1:8090');
...

final post = await pb.collection('posts').create(body: {
  'title': 'Lorem ipsum...',
  'tags': ['TAG_ID1', 'TAG_ID2'],
});
```

### Prepend/Append to Multiple Relation

To prepend/append a single or multiple relation id(s) to an existing value, use the `+` field modifier:

**JavaScript:**

```javascript
import PocketBase from 'pocketbase';
const pb = new PocketBase('http://127.0.0.1:8090');
...

const post = await pb.collection('posts').update('POST_ID', {
  // prepend single tag
  '+tags': 'TAG_ID1',
  // append multiple tags at once
  'tags+': ['TAG_ID1', 'TAG_ID2'],
})
```

**Dart:**

```dart
import 'package:pocketbase/pocketbase.dart';

final pb = PocketBase('http://127.0.0.1:8090');
...

final post = await pb.collection('posts').update('POST_ID', body: {
  // prepend single tag
  '+tags': 'TAG_ID1',
  // append multiple tags at once
  'tags+': ['TAG_ID1', 'TAG_ID2'],
})
```

### Remove from Multiple Relation

To remove a single or multiple relation id(s) from an existing value, use the `-` field modifier:

**JavaScript:**

```javascript
import PocketBase from 'pocketbase';
const pb = new PocketBase('http://127.0.0.1:8090');
...

const post = await pb.collection('posts').update('POST_ID', {
  // remove single tag
  'tags-': 'TAG_ID1',
  // remove multiple tags at once
  'tags-': ['TAG_ID1', 'TAG_ID2'],
})
```

**Dart:**

```dart
import 'package:pocketbase/pocketbase.dart';

final pb = PocketBase('http://127.0.0.1:8090');
...

final post = await pb.collection('posts').update('POST_ID', body: {
  // remove single tag
  'tags-': 'TAG_ID1',
  // remove multiple tags at once
  'tags-': ['TAG_ID1', 'TAG_ID2'],
})
```

### Expanding Relations

You can expand record relation fields directly in the returned response without making additional requests by using the `expand` query parameter, e.g. `?expand=user,post.tags`.

Only the relations that the request client can **View** (satisfies the relation collection's **View API Rule**) will be expanded.

Nested relation references in `expand`, `filter` or `sort` are supported via dot-notation and **up to 6 levels depth**.

**JavaScript:**

```javascript
await pb.collection('comments').getList(1, 30, {
  expand: 'user',
});
```

**Dart:**

```dart
await pb.collection("comments").getList(perPage: 30, expand: "user")
```

Example response:

```json
{
  "page": 1,
  "perPage": 30,
  "totalPages": 1,
  "totalItems": 20,
  "items": [
    {
      "id": "lmPJt4Z9CkLW36z",
      "collectionId": "BHKW36mJl3ZPt6z",
      "collectionName": "comments",
      "created": "2022-01-01 01:00:00.456Z",
      "updated": "2022-01-01 02:15:00.456Z",
      "post": "WyAw4bDrvws6gGl",
      "user": "FtHAW9feB5rze7D",
      "message": "Example message...",
      "expand": {
        "user": {
          "id": "FtHAW9feB5rze7D",
          "collectionId": "srmAo0hLxEqYF7F",
          "collectionName": "users",
          "created": "2022-01-01 00:00:00.000Z",
          "updated": "2022-01-01 00:00:00.000Z",
          "username": "users54126",
          "verified": false,
          "emailVisibility": false,
          "name": "John Doe"
        }
      }
    }
  ]
}
```

### Back-Relations

PocketBase supports `filter`, `sort` and `expand` for **back-relations** — relations where the associated `relation` field is not in the main collection.

The notation is: `referenceCollection_via_relField` (e.g. `comments_via_post`).

For example, to list **posts** that have at least one **comments** record containing the word "hello":

**JavaScript:**

```javascript
await pb.collection('posts').getList(1, 30, {
  filter: "comments_via_post.message ?~ 'hello'",
  expand: 'comments_via_post.user',
});
```

**Dart:**

```dart
await pb.collection("posts").getList(
  perPage: 30,
  filter: "comments_via_post.message ?~ 'hello'",
  expand: "comments_via_post.user",
)
```

#### Back-relation Caveats

- By default the back-relation reference is resolved as a dynamic _multiple_ relation field, even when the back-relation field itself is marked as _single_. This is because the main record could have more than one _single_ back-relation reference. The only case where the back-relation will be treated as a _single_ relation field is when there is a `UNIQUE` index constraint defined on the relation field.

- Back-relation `expand` is limited to max 1000 records per relation field. If you need to fetch a larger number of back-related records, a better approach is to send a separate paginated `getList()` request to the back-related collection.

---

**Navigation:** [← Files upload and handling](06-files-handling.md) | [Extending PocketBase →](08-use-as-framework.md)

---

> **Source:** [pocketbase.io/docs/working-with-relations](https://pocketbase.io/docs/working-with-relations)
