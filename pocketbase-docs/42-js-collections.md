# JS Collection Operations

Collections define the schema and rules for records in PocketBase. You can create, modify, and manage collections programmatically using the JavaScript API.

## Finding Collections

```js
// By name
var collection = $app.findCollectionByNameOrId('posts');

// By ID
var collection = $app.findCollectionByNameOrId('abc123');

console.log(collection.name); // "posts"
console.log(collection.type); // "base", "auth", or "view"
console.log(collection.id); // the collection ID
```

### Listing All Collections

```js
var collections = $app.findAllCollections();
for (var i = 0; i < collections.length; i++) {
  console.log(collections[i].name, collections[i].type);
}
```

### Finding Collections by Type

```js
// Find all auth collections
var authCollections = $app.findAllCollections('auth');

// Find all base collections
var baseCollections = $app.findAllCollections('base');

// Find all view collections
var viewCollections = $app.findAllCollections('view');
```

## Creating Collections

### Base Collection

```js
var collection = new Collection({
  name: 'posts',
  type: 'base',
});

// Add schema fields
collection.fields.add(
  new SchemaField({
    name: 'title',
    type: 'text',
    required: true,
    options: {
      min: 1,
      max: 200,
    },
  }),
);

collection.fields.add(
  new SchemaField({
    name: 'content',
    type: 'text',
    required: false,
  }),
);

collection.fields.add(
  new SchemaField({
    name: 'status',
    type: 'select',
    options: {
      values: ['draft', 'published', 'archived'],
      maxSelect: 1,
    },
  }),
);

collection.fields.add(
  new SchemaField({
    name: 'views',
    type: 'number',
    options: {
      min: 0,
    },
  }),
);

collection.fields.add(
  new SchemaField({
    name: 'featured',
    type: 'bool',
  }),
);

// Set API rules
collection.listRule = "status = 'published'";
collection.viewRule = "status = 'published'";
collection.createRule = "@request.auth.id != ''";
collection.updateRule = 'author = @request.auth.id';
collection.deleteRule = 'author = @request.auth.id';

$app.save(collection);
console.log('Created collection:', collection.id);
```

### Auth Collection

```js
var collection = new Collection({
  name: 'users',
  type: 'auth',
});

// Auth collections have built-in fields (email, password, etc.)
// Add custom fields
collection.fields.add(
  new SchemaField({
    name: 'name',
    type: 'text',
    required: true,
  }),
);

collection.fields.add(
  new SchemaField({
    name: 'avatar',
    type: 'file',
    options: {
      maxSelect: 1,
      maxSize: 5242880,
      mimeTypes: ['image/jpeg', 'image/png', 'image/gif'],
    },
  }),
);

// Auth options
collection.options = {
  allowEmailAuth: true,
  allowUsernameAuth: false,
  allowOAuth2Auth: true,
  requireEmail: true,
  exceptEmailDomains: [],
  onlyEmailDomains: [],
  minPasswordLength: 8,
};

collection.listRule = 'id = @request.auth.id';
collection.viewRule = 'id = @request.auth.id';
collection.createRule = '';
collection.updateRule = 'id = @request.auth.id';
collection.deleteRule = '';

$app.save(collection);
```

### View Collection

```js
var collection = new Collection({
  name: 'postStats',
  type: 'view',
  options: {
    query:
      'SELECT id, title, (SELECT COUNT(*) FROM comments WHERE comments.post = posts.id) as commentCount FROM posts',
  },
});

collection.listRule = '';
collection.viewRule = '';

$app.save(collection);
```

## Field Types

### Text Field

```js
new SchemaField({
  name: 'title',
  type: 'text',
  required: true,
  options: {
    min: 1,
    max: 500,
    pattern: '',
  },
});
```

### Number Field

```js
new SchemaField({
  name: 'price',
  type: 'number',
  required: true,
  options: {
    min: 0,
    max: 999999,
    noDecimal: false,
  },
});
```

### Bool Field

```js
new SchemaField({
  name: 'active',
  type: 'bool',
});
```

### Email Field

```js
new SchemaField({
  name: 'email',
  type: 'email',
  required: true,
  options: {
    exceptDomains: [],
    onlyDomains: [],
  },
});
```

### URL Field

```js
new SchemaField({
  name: 'website',
  type: 'url',
  options: {
    exceptDomains: [],
    onlyDomains: [],
  },
});
```

### Date Field

```js
new SchemaField({
  name: 'birthday',
  type: 'date',
  options: {
    min: '1900-01-01',
    max: '2030-12-31',
  },
});
```

### Select Field

```js
new SchemaField({
  name: 'category',
  type: 'select',
  required: true,
  options: {
    values: ['news', 'tutorial', 'announcement'],
    maxSelect: 1,
  },
});

// Multi-select
new SchemaField({
  name: 'tags',
  type: 'select',
  options: {
    values: ['javascript', 'go', 'python', 'rust'],
    maxSelect: 5,
  },
});
```

### File Field

```js
new SchemaField({
  name: 'image',
  type: 'file',
  options: {
    maxSelect: 1,
    maxSize: 10485760, // 10MB
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    thumbs: ['100x100', '300x300'],
  },
});

// Multiple files
new SchemaField({
  name: 'attachments',
  type: 'file',
  options: {
    maxSelect: 5,
    maxSize: 52428800, // 50MB
    mimeTypes: [],
  },
});
```

### Relation Field

```js
new SchemaField({
  name: 'author',
  type: 'relation',
  required: true,
  options: {
    collectionId: 'users_collection_id',
    maxSelect: 1,
    cascadeDelete: false,
  },
});

// Multiple relations
new SchemaField({
  name: 'tags',
  type: 'relation',
  options: {
    collectionId: 'tags_collection_id',
    maxSelect: 10,
    cascadeDelete: false,
  },
});
```

### JSON Field

```js
new SchemaField({
  name: 'metadata',
  type: 'json',
  options: {
    maxSize: 2000000,
  },
});
```

### GeoPoint Field

```js
new SchemaField({
  name: 'location',
  type: 'geoPoint',
  options: {},
});
```

## Modifying Collections

### Add a New Field

```js
var collection = $app.findCollectionByNameOrId('posts');

collection.fields.add(
  new SchemaField({
    name: 'excerpt',
    type: 'text',
    options: {
      max: 500,
    },
  }),
);

$app.save(collection);
```

### Remove a Field

```js
var collection = $app.findCollectionByNameOrId('posts');

// Remove the field at index 3
collection.fields.removeById(collection.fields[3].rawOptions().id);

$app.save(collection);
```

### Update Field Options

```js
var collection = $app.findCollectionByNameOrId('posts');

// Find and modify a field
for (var i = 0; i < collection.fields.length; i++) {
  if (collection.fields[i].name === 'title') {
    collection.fields[i].options.max = 300;
    break;
  }
}

$app.save(collection);
```

### Update API Rules

```js
var collection = $app.findCollectionByNameOrId('posts');

// Make list public
collection.listRule = '';
// Restrict create to authenticated users
collection.createRule = "@request.auth.id != ''";
// Only author can update
collection.updateRule = 'author = @request.auth.id';

$app.save(collection);
```

## Deleting Collections

```js
var collection = $app.findCollectionByNameOrId('posts');
$app.delete(collection);
```

**Warning:** Deleting a collection also deletes all its records and associated files.

## Indestructible Collections

System collections (like `_mfa`, `_otps`, `_externalAuths`, `_authOrigins`) are protected and cannot be deleted:

```js
var collection = $app.findCollectionByNameOrId('_mfa');
// collection.indestructible returns true
```

## Schema Migrations Example

```js
/// <reference path="../pb_data/types.d.ts" />

migrations.use(
  'create_posts_collection',
  function (app) {
    var collection = new Collection({
      name: 'posts',
      type: 'base',
    });

    collection.fields.add(
      new SchemaField({
        name: 'title',
        type: 'text',
        required: true,
        options: { min: 1, max: 200 },
      }),
    );

    collection.fields.add(
      new SchemaField({
        name: 'content',
        type: 'text',
      }),
    );

    collection.fields.add(
      new SchemaField({
        name: 'status',
        type: 'select',
        options: {
          values: ['draft', 'published'],
          maxSelect: 1,
        },
      }),
    );

    collection.fields.add(
      new SchemaField({
        name: 'author',
        type: 'relation',
        required: true,
        options: {
          collectionId: 'users',
          maxSelect: 1,
        },
      }),
    );

    collection.listRule = "status = 'published'";
    collection.viewRule = "status = 'published'";
    collection.createRule = "@request.auth.id != ''";
    collection.updateRule = 'author = @request.auth.id';
    collection.deleteRule = 'author = @request.auth.id';

    app.save(collection);
  },
  function (app) {
    // Down migration
    var collection = app.findCollectionByNameOrId('posts');
    app.delete(collection);
  },
);
```

## Complete Example: Dynamic Collection Creation

```js
/// <reference path="../pb_data/types.d.ts" />

routerAdd(
  'POST',
  '/api/collections/create',
  function (e) {
    if (!e.hasSuperuserAuth()) {
      return e.json(403, { error: 'Admin only' });
    }

    var body = e.requestInfo().body;

    var collection = new Collection({
      name: body.name,
      type: body.type || 'base',
    });

    // Add fields from request
    if (body.fields) {
      for (var i = 0; i < body.fields.length; i++) {
        var fieldDef = body.fields[i];
        collection.fields.add(
          new SchemaField({
            name: fieldDef.name,
            type: fieldDef.type,
            required: fieldDef.required || false,
            options: fieldDef.options || {},
          }),
        );
      }
    }

    // Set default rules
    collection.listRule = '';
    collection.viewRule = '';
    collection.createRule = "@request.auth.id != ''";
    collection.updateRule = "@request.auth.id != ''";
    collection.deleteRule = "@request.auth.id != ''";

    $app.save(collection);

    return e.json(201, {
      id: collection.id,
      name: collection.name,
      type: collection.type,
    });
  },
  $apis.requireSuperuserAuth(),
);
```

---

> **Source:** [pocketbase.io](https://pocketbase.io/docs/js-collections/)
