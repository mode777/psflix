# JS Console Commands

PocketBase allows you to register custom CLI commands that integrate with the PocketBase command-line interface.

## Registering Commands

Use `$app.rootCmd.addCommand()` to register a new command:

```js
$app.rootCmd.addCommand(
  new Command({
    use: 'greet',
    short: 'Greet a user',
    run: function (cmd, args) {
      var name = args[0] || 'World';
      console.log('Hello, ' + name + '!');
    },
  }),
);
```

Run it:

```bash
./pocketbase greet
# Output: Hello, World!

./pocketbase greet Alice
# Output: Hello, Alice!
```

## Command Options

### Full Command Definition

```js
$app.rootCmd.addCommand(
  new Command({
    use: 'serve:custom',
    short: 'Start custom server',
    long: 'Start a custom server with additional configuration and routes',
    example: 'serve:custom --port 8080 --debug',
    args: [], // expected arguments
    run: function (cmd, args) {
      console.log('Starting custom server...');
      // Custom logic
    },
  }),
);
```

### Command with Flags

```js
$app.rootCmd.addCommand(
  new Command({
    use: 'seed',
    short: 'Seed the database with sample data',
    run: function (cmd, args) {
      console.log('Seeding database...');
      seedDatabase();
    },
  }),
);
```

## Practical Examples

### Database Seed Command

```js
$app.rootCmd.addCommand(
  new Command({
    use: 'db:seed',
    short: 'Seed database with sample data',
    run: function (cmd, args) {
      // Create sample users
      var usersCollection = $app.findCollectionByNameOrId('users');

      var sampleUsers = [
        { email: 'alice@example.com', name: 'Alice' },
        { email: 'bob@example.com', name: 'Bob' },
        { email: 'charlie@example.com', name: 'Charlie' },
      ];

      for (var i = 0; i < sampleUsers.length; i++) {
        try {
          $app.findRecordByEmail('users', sampleUsers[i].email);
          console.log('User already exists:', sampleUsers[i].email);
        } catch (err) {
          var user = new Record(usersCollection);
          user.set('email', sampleUsers[i].email);
          user.set('password', 'password123');
          user.set('passwordConfirm', 'password123');
          user.set('name', sampleUsers[i].name);
          user.set('verified', true);
          $app.save(user);
          console.log('Created user:', sampleUsers[i].email);
        }
      }

      // Create sample posts
      var postsCollection = $app.findCollectionByNameOrId('posts');
      var user = $app.findRecordByEmail('users', 'alice@example.com');

      for (var j = 0; j < 10; j++) {
        var post = new Record(postsCollection);
        post.set('title', 'Sample Post ' + (j + 1));
        post.set('content', 'This is the content of sample post ' + (j + 1));
        post.set('status', 'published');
        post.set('author', user.id);
        $app.save(post);
        console.log('Created post:', post.get('title'));
      }

      console.log('Seeding complete!');
    },
  }),
);
```

### Data Export Command

```js
$app.rootCmd.addCommand(
  new Command({
    use: 'export:json',
    short: 'Export collection data as JSON',
    run: function (cmd, args) {
      var collectionName = args[0];
      if (!collectionName) {
        console.error('Usage: export:json <collection>');
        return;
      }

      try {
        var records = $app.findAllRecords(collectionName);
        var data = [];

        for (var i = 0; i < records.length; i++) {
          data.push(records[i].publicExport());
        }

        var json = JSON.stringify(data, null, 2);
        var filename = collectionName + '_export.json';
        $os.writeFile(filename, json, 0644);
        console.log('Exported', data.length, 'records to', filename);
      } catch (err) {
        console.error('Export failed:', err.message);
      }
    },
  }),
);
```

### Health Check Command

```js
$app.rootCmd.addCommand(
  new Command({
    use: 'health',
    short: 'Check system health',
    run: function (cmd, args) {
      console.log('=== PocketBase Health Check ===');

      // Check database
      try {
        var result = new DynamicModel({ count: 0 });
        $app.db().newQuery('SELECT COUNT(*) as count FROM _collections').one(result);
        console.log('✓ Database: OK (' + result.count + ' collections)');
      } catch (err) {
        console.error('✗ Database: ERROR -', err.message);
      }

      // Check collections
      var collections = $app.findAllCollections();
      console.log('✓ Collections: ' + collections.length + ' registered');

      // Check filesystem
      try {
        var fs = $app.newFilesystem();
        console.log('✓ Filesystem: OK');
      } catch (err) {
        console.error('✗ Filesystem: ERROR -', err.message);
      }

      // Check settings
      var settings = $app.settings();
      console.log('✓ Settings: Loaded');
      console.log('  - App URL:', settings.meta.appUrl);
      console.log('  - SMTP configured:', settings.smtp.enabled);

      console.log('=== Health Check Complete ===');
    },
  }),
);
```

### Migration Status Command

```js
$app.rootCmd.addCommand(
  new Command({
    use: 'migrate:status',
    short: 'Show migration status',
    run: function (cmd, args) {
      console.log('=== Migration Status ===');

      var migrations = $app.findRecordsByFilter('_migrations', '', 'created', 0, 0);

      if (migrations.length === 0) {
        console.log('No migrations applied yet.');
      } else {
        for (var i = 0; i < migrations.length; i++) {
          var m = migrations[i];
          console.log('  ✓', m.get('name'), '-', m.get('created'));
        }
      }

      console.log('Total:', migrations.length, 'migrations applied');
    },
  }),
);
```

### User Management Command

```js
$app.rootCmd.addCommand(
  new Command({
    use: 'user:create',
    short: 'Create a new user',
    run: function (cmd, args) {
      if (args.length < 2) {
        console.error('Usage: user:create <email> <password>');
        return;
      }

      var email = args[0];
      var password = args[1];

      try {
        $app.findRecordByEmail('users', email);
        console.error('User already exists:', email);
        return;
      } catch (err) {
        // User doesn't exist, continue
      }

      var collection = $app.findCollectionByNameOrId('users');
      var user = new Record(collection);
      user.set('email', email);
      user.set('password', password);
      user.set('passwordConfirm', password);
      user.set('verified', true);

      $app.save(user);
      console.log('Created user:', email, '(ID:', user.id + ')');
    },
  }),
);

$app.rootCmd.addCommand(
  new Command({
    use: 'user:make-admin',
    short: 'Grant admin role to a user',
    run: function (cmd, args) {
      if (args.length < 1) {
        console.error('Usage: user:make-admin <email>');
        return;
      }

      try {
        var user = $app.findRecordByEmail('users', args[0]);
        user.set('role', 'admin');
        $app.save(user);
        console.log('User', args[0], 'is now an admin');
      } catch (err) {
        console.error('User not found:', args[0]);
      }
    },
  }),
);
```

### Cleanup Command

```js
$app.rootCmd.addCommand(
  new Command({
    use: 'cleanup',
    short: 'Clean up temporary data and orphaned files',
    run: function (cmd, args) {
      console.log('Starting cleanup...');

      // Clean expired tokens
      var deleted = $app
        .db()
        .newQuery('DELETE FROM _tokens WHERE updated < {:expiry}')
        .bind({
          expiry: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        })
        .execute();
      console.log('Cleaned expired tokens');

      // Clean temp uploads
      try {
        var tempRecords = $app.findRecordsByFilter(
          'temp_uploads',
          'created < {:expiry}',
          '',
          0,
          0,
          { expiry: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() },
        );

        for (var i = 0; i < tempRecords.length; i++) {
          $app.delete(tempRecords[i]);
        }
        console.log('Cleaned', tempRecords.length, 'temp uploads');
      } catch (err) {
        // Collection might not exist
      }

      console.log('Cleanup complete!');
    },
  }),
);
```

## Command with Subcommands

```js
// Parent command
var dbCmd = new Command({
  use: 'db',
  short: 'Database operations',
});

// Subcommands
dbCmd.addCommand(
  new Command({
    use: 'seed',
    short: 'Seed database',
    run: function (cmd, args) {
      console.log('Seeding database...');
    },
  }),
);

dbCmd.addCommand(
  new Command({
    use: 'reset',
    short: 'Reset database',
    run: function (cmd, args) {
      console.log('Resetting database...');
    },
  }),
);

dbCmd.addCommand(
  new Command({
    use: 'stats',
    short: 'Show database statistics',
    run: function (cmd, args) {
      var collections = $app.findAllCollections();
      for (var i = 0; i < collections.length; i++) {
        var count = new DynamicModel({ count: 0 });
        $app
          .db()
          .newQuery('SELECT COUNT(*) as count FROM ' + collections[i].name)
          .one(count);
        console.log(collections[i].name + ':', count.count, 'records');
      }
    },
  }),
);

$app.rootCmd.addCommand(dbCmd);
```

Run subcommands:

```bash
./pocketbase db seed
./pocketbase db reset
./pocketbase db stats
```

## Complete Example

```js
/// <reference path="../pb_data/types.d.ts" />

// Seed command
$app.rootCmd.addCommand(
  new Command({
    use: 'seed',
    short: 'Seed database with sample data',
    run: function (cmd, args) {
      console.log('Seeding database...');

      var users = $app.findCollectionByNameOrId('users');
      var user = new Record(users);
      user.set('email', 'admin@example.com');
      user.set('password', 'admin123456');
      user.set('passwordConfirm', 'admin123456');
      user.set('name', 'Admin');
      user.set('role', 'admin');
      user.set('verified', true);
      $app.save(user);

      console.log('Created admin user: admin@example.com');
      console.log('Seeding complete!');
    },
  }),
);

// Stats command
$app.rootCmd.addCommand(
  new Command({
    use: 'stats',
    short: 'Show application statistics',
    run: function (cmd, args) {
      console.log('=== Application Statistics ===');

      var collections = $app.findAllCollections();
      for (var i = 0; i < collections.length; i++) {
        try {
          var count = new DynamicModel({ count: 0 });
          $app
            .db()
            .newQuery('SELECT COUNT(*) as count FROM ' + collections[i].name)
            .one(count);
          console.log('  ' + collections[i].name + ': ' + count.count + ' records');
        } catch (err) {
          console.log('  ' + collections[i].name + ': error');
        }
      }

      console.log('=============================');
    },
  }),
);
```

---

> **Source:** [pocketbase.io](https://pocketbase.io/docs/js-console-commands/)
