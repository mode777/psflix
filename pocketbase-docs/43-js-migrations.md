# JS Migrations

Migrations allow you to version control your database schema changes and apply them in a reproducible way. PocketBase JS migrations are stored as `*.pb.js` files in the `pb_migrations` directory.

## Directory Structure

```
pb_migrations/
  ├── 1700000000_create_users.js
  ├── 1700000001_create_posts.js
  └── 1700000002_add_posts_excerpt.js
```

## Creating Migrations

### Basic Migration

Use `migrations.use()` with a name, an `up` function, and an optional `down` function:

```js
migrations.use(
  'create_posts',
  function (app) {
    // Up migration - apply changes
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

    collection.listRule = "status = 'published'";
    collection.viewRule = "status = 'published'";
    collection.createRule = "@request.auth.id != ''";
    collection.updateRule = 'author = @request.auth.id';
    collection.deleteRule = 'author = @request.auth.id';

    app.save(collection);
  },
  function (app) {
    // Down migration - revert changes
    var collection = app.findCollectionByNameOrId('posts');
    app.delete(collection);
  },
);
```

### Migration Without Down

If you don't need a down migration, omit the third argument:

```js
migrations.use('seed_data', function (app) {
  var collection = app.findCollectionByNameOrId('settings');

  var record = new Record(collection);
  record.set('key', 'app_version');
  record.set('value', '1.0.0');
  app.save(record);
});
```

## Adding Fields

```js
migrations.use(
  'add_excerpt_to_posts',
  function (app) {
    var collection = app.findCollectionByNameOrId('posts');

    collection.fields.add(
      new SchemaField({
        name: 'excerpt',
        type: 'text',
        options: {
          max: 500,
        },
      }),
    );

    app.save(collection);
  },
  function (app) {
    var collection = app.findCollectionByNameOrId('posts');

    // Find and remove the field
    for (var i = 0; i < collection.fields.length; i++) {
      if (collection.fields[i].name === 'excerpt') {
        collection.fields.removeById(collection.fields[i].rawOptions().id);
        break;
      }
    }

    app.save(collection);
  },
);
```

## Removing Fields

```js
migrations.use(
  'remove_legacy_field',
  function (app) {
    var collection = app.findCollectionByNameOrId('posts');

    for (var i = 0; i < collection.fields.length; i++) {
      if (collection.fields[i].name === 'legacyField') {
        collection.fields.removeById(collection.fields[i].rawOptions().id);
        break;
      }
    }

    app.save(collection);
  },
  function (app) {
    var collection = app.findCollectionByNameOrId('posts');

    collection.fields.add(
      new SchemaField({
        name: 'legacyField',
        type: 'text',
      }),
    );

    app.save(collection);
  },
);
```

## Modifying Field Options

```js
migrations.use(
  'expand_title_max_length',
  function (app) {
    var collection = app.findCollectionByNameOrId('posts');

    for (var i = 0; i < collection.fields.length; i++) {
      if (collection.fields[i].name === 'title') {
        collection.fields[i].options.max = 500;
        break;
      }
    }

    app.save(collection);
  },
  function (app) {
    var collection = app.findCollectionByNameOrId('posts');

    for (var i = 0; i < collection.fields.length; i++) {
      if (collection.fields[i].name === 'title') {
        collection.fields[i].options.max = 200;
        break;
      }
    }

    app.save(collection);
  },
);
```

## Updating API Rules

```js
migrations.use(
  'make_posts_public',
  function (app) {
    var collection = app.findCollectionByNameOrId('posts');

    collection.listRule = '';
    collection.viewRule = '';

    app.save(collection);
  },
  function (app) {
    var collection = app.findCollectionByNameOrId('posts');

    collection.listRule = "status = 'published'";
    collection.viewRule = "status = 'published'";

    app.save(collection);
  },
);
```

## Creating Auth Collections

```js
migrations.use(
  'create_users',
  function (app) {
    var collection = new Collection({
      name: 'users',
      type: 'auth',
    });

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

    collection.options = {
      allowEmailAuth: true,
      allowUsernameAuth: false,
      allowOAuth2Auth: false,
      requireEmail: true,
      minPasswordLength: 8,
    };

    collection.listRule = 'id = @request.auth.id';
    collection.viewRule = 'id = @request.auth.id';
    collection.createRule = '';
    collection.updateRule = 'id = @request.auth.id';

    app.save(collection);
  },
  function (app) {
    var collection = app.findCollectionByNameOrId('users');
    app.delete(collection);
  },
);
```

## Creating View Collections

```js
migrations.use(
  'create_post_stats_view',
  function (app) {
    var collection = new Collection({
      name: 'postStats',
      type: 'view',
      options: {
        query:
          'SELECT p.id, p.title, COUNT(c.id) as comment_count FROM posts p LEFT JOIN comments c ON c.post = p.id GROUP BY p.id',
      },
    });

    collection.listRule = '';
    collection.viewRule = '';

    app.save(collection);
  },
  function (app) {
    var collection = app.findCollectionByNameOrId('postStats');
    app.delete(collection);
  },
);
```

## Data Migrations

Migrations aren't limited to schema changes. You can also migrate data:

```js
migrations.use('migrate_user_roles', function (app) {
  var records = app.findAllRecords('users');
  var rolesCollection = app.findCollectionByNameOrId('roles');

  for (var i = 0; i < records.length; i++) {
    var record = records[i];
    var legacyRole = record.get('legacyRole');

    if (legacyRole === 'admin') {
      record.set('role', 'administrator');
    } else if (legacyRole === 'mod') {
      record.set('role', 'moderator');
    } else {
      record.set('role', 'member');
    }

    app.save(record);
  }

  // Remove the legacy field
  var collection = app.findCollectionByNameOrId('users');
  for (var i = 0; i < collection.fields.length; i++) {
    if (collection.fields[i].name === 'legacyRole') {
      collection.fields.removeById(collection.fields[i].rawOptions().id);
      break;
    }
  }
  app.save(collection);
});
```

## Renaming Collections

PocketBase doesn't have a direct rename method. You need to create a new collection and migrate data:

```js
migrations.use('rename_articles_to_posts', function (app) {
  // Find old collection
  var oldCollection = app.findCollectionByNameOrId('articles');

  // Create new collection with same schema
  var newCollection = new Collection({
    name: 'posts',
    type: 'base',
  });

  // Copy fields
  for (var i = 0; i < oldCollection.fields.length; i++) {
    var field = oldCollection.fields[i];
    newCollection.fields.add(
      new SchemaField({
        name: field.name,
        type: field.type,
        required: field.required,
        options: field.rawOptions(),
      }),
    );
  }

  // Copy rules
  newCollection.listRule = oldCollection.listRule;
  newCollection.viewRule = oldCollection.viewRule;
  newCollection.createRule = oldCollection.createRule;
  newCollection.updateRule = oldCollection.updateRule;
  newCollection.deleteRule = oldCollection.deleteRule;

  app.save(newCollection);

  // Migrate data
  var records = app.findAllRecords('articles');
  for (var i = 0; i < records.length; i++) {
    var oldRecord = records[i];
    var newRecord = new Record(newCollection);

    for (var j = 0; j < oldCollection.fields.length; j++) {
      var fieldName = oldCollection.fields[j].name;
      newRecord.set(fieldName, oldRecord.get(fieldName));
    }

    app.save(newRecord);
  }

  // Delete old collection
  app.delete(oldCollection);
});
```

## Auto-Generation from Dashboard

PocketBase can auto-generate migrations from changes made in the Admin Dashboard:

1. Make changes in the Admin Dashboard (Settings > Migrations)
2. Click "Generate migration"
3. The migration file is created in `pb_migrations/`

This is useful for quickly scaffolding migrations that you can later refine.

## Migration Naming Conventions

Use timestamps or sequential numbers as prefixes for ordering:

```
pb_migrations/
  ├── 1700000000_create_users.js
  ├── 1700000001_create_posts.js
  ├── 1700000002_create_comments.js
  └── 1700000003_add_excerpt_to_posts.js
```

## Complete Example

```js
/// <reference path="../pb_data/types.d.ts" />

// Migration 1: Create base collections
migrations.use(
  '1700000000_create_base',
  function (app) {
    // Categories
    var categories = new Collection({
      name: 'categories',
      type: 'base',
    });

    categories.fields.add(
      new SchemaField({
        name: 'name',
        type: 'text',
        required: true,
        options: { min: 1, max: 100 },
      }),
    );

    categories.fields.add(
      new SchemaField({
        name: 'slug',
        type: 'text',
        required: true,
        options: { min: 1, max: 100 },
      }),
    );

    categories.listRule = '';
    categories.viewRule = '';
    categories.createRule = "@request.auth.role = 'admin'";
    categories.updateRule = "@request.auth.role = 'admin'";
    categories.deleteRule = "@request.auth.role = 'admin'";

    app.save(categories);

    // Posts
    var posts = new Collection({
      name: 'posts',
      type: 'base',
    });

    posts.fields.add(
      new SchemaField({
        name: 'title',
        type: 'text',
        required: true,
        options: { min: 1, max: 200 },
      }),
    );

    posts.fields.add(
      new SchemaField({
        name: 'slug',
        type: 'text',
        required: true,
        options: { min: 1, max: 200 },
      }),
    );

    posts.fields.add(
      new SchemaField({
        name: 'content',
        type: 'text',
      }),
    );

    posts.fields.add(
      new SchemaField({
        name: 'category',
        type: 'relation',
        options: {
          collectionId: categories.id,
          maxSelect: 1,
        },
      }),
    );

    posts.fields.add(
      new SchemaField({
        name: 'published',
        type: 'bool',
      }),
    );

    posts.listRule = 'published = true';
    posts.viewRule = 'published = true';
    posts.createRule = "@request.auth.id != ''";
    posts.updateRule = "@request.auth.id != ''";
    posts.deleteRule = "@request.auth.role = 'admin'";

    app.save(posts);
  },
  function (app) {
    var posts = app.findCollectionByNameOrId('posts');
    app.delete(posts);

    var categories = app.findCollectionByNameOrId('categories');
    app.delete(categories);
  },
);

// Migration 2: Add excerpt field
migrations.use(
  '1700000001_add_excerpt',
  function (app) {
    var collection = app.findCollectionByNameOrId('posts');

    collection.fields.add(
      new SchemaField({
        name: 'excerpt',
        type: 'text',
        options: { max: 500 },
      }),
    );

    app.save(collection);
  },
  function (app) {
    var collection = app.findCollectionByNameOrId('posts');

    for (var i = 0; i < collection.fields.length; i++) {
      if (collection.fields[i].name === 'excerpt') {
        collection.fields.removeById(collection.fields[i].rawOptions().id);
        break;
      }
    }

    app.save(collection);
  },
);
```

---

> **Source:** [pocketbase.io](https://pocketbase.io/docs/js-migrations/)
