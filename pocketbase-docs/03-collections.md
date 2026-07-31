# Collections

### Overview

**Collections** represent your application data. Under the hood they are backed by plain SQLite tables that are generated automatically with the collection **name** and **fields** (columns).

Single entry of a collection is called **record** (a single row in the SQL table).

You can manage your **collections** from the Dashboard, with the Web APIs using the client-side SDKs (superusers only) or programmatically via the Go/JavaScript migrations.

Similarly, you can manage your **records** from the Dashboard, with the Web APIs using the client-side SDKs or programmatically via the Go/JavaScript Record operations.

Currently there are 3 collection types: **Base**, **View** and **Auth**.

### Base Collection

**Base collection** is the default collection type and it could be used to store any application data (articles, products, posts, etc.).

### View Collection

**View collection** is a read-only collection type where the data is populated from a plain SQL `SELECT` statement, allowing users to perform aggregations or any other custom queries in general.

For example, the following query will create a read-only collection with 3 _posts_ fields - _id_, _name_ and _totalComments_:

```sql
SELECT posts.id, posts.name, count(comments.id) as totalComments
FROM posts
LEFT JOIN comments on comments.postId = posts.id
GROUP BY posts.id
```

View collections don't receive realtime events because they don't have create/update/delete operations.

### Auth Collection

**Auth collection** has everything from the **Base collection** but with some additional special fields to help you manage your app users and also provide various authentication options.

Each Auth collection has the following special system fields: `email`, `emailVisibility`, `verified`, `password` and `tokenKey`.
They cannot be renamed or deleted but can be configured using their specific field options. For example you can make the user email required or optional.

You can have as many Auth collections as you want (users, managers, staffs, members, clients, etc.) each with their own set of fields, separate login and records managing endpoints.

### Access Controls

You can build all sorts of different access controls:

- **Role (Group):** You could attach a "role" `select` field to your Auth collection with options like "employee" and "staff", then use a rule like `@request.auth.role = "staff"`.

- **Relation (Ownership):** Use a `relation` field pointing to your Auth collection and allow access only to the author with `@request.auth.id != "" && author = @request.auth.id`. Nested relation field lookups, including back-relations, are also supported.

- **Managed:** Auth collections have a special "Manage" API rule that allows one user (even from a different collection) to fully manage another user's data.

- **Mixed:** Build a mixed approach using parenthesis `()` and `&&`/`||` operators:
  `@request.auth.id != "" && (@request.auth.role = "staff" || author = @request.auth.id)`

### Fields

All collection fields _(with exception of the `JSONField`)_ are **non-nullable and use a zero-default** for their respective type as fallback value when missing (empty string for `text`, 0 for `number`, etc.).

#### BoolField

Defines `bool` type field to store a single `false` (default) or `true` value.

#### NumberField

Defines `number` type field for storing numeric/float64 value: `0` (default), `2`, `-1`, `1.5`.

Set modifiers:

- `fieldName**+**` adds number to the already existing record value.
- `fieldName**-**` subtracts number from the already existing record value.

#### TextField

Defines `text` type field for storing string values: `""` (default), `"example"`.

Set modifiers:

- `fieldName**:autogenerate**` autogenerate a field value if the `AutogeneratePattern` field option is set. For example, submitting `{"slug:autogenerate":"abc-"}` will result in `"abc-[random]"` `slug` field value.

#### EmailField

Defines `email` type field for storing a single email string address: `""` (default), `"john@example.com"`.

#### URLField

Defines `url` type field for storing a single URL string value: `""` (default), `"https://example.com"`.

#### EditorField

Defines `editor` type field to store HTML formatted text: `""` (default), `<p>example</p>`.

#### DateField

Defines `date` type field to store a single datetime string value: `""` (default), `"2022-01-01 00:00:00.000Z"`.

All PocketBase dates follow the RFC3399 format `Y-m-d H:i:s.uZ` (e.g. `2024-11-10 18:45:27.123Z`).

Dates are compared as strings, meaning that when using the filters with a date field you'll have to specify the full datetime string format. For example to target a single day (e.g. November 19, 2024): `created >= '2024-11-19 00:00:00.000Z' && created <= '2024-11-19 23:59:59.999Z'`

#### AutodateField

Defines an `autodate` type field similar to DateField but its value is auto set on record create/update. This field is usually used for defining timestamp fields like "created" and "updated".

#### SelectField

Defines `select` type field for storing single or multiple string values from a predefined list. Usually intended for handling enums-like values such as statuses or roles.

For **single** `select` _(MaxSelect <= 1)_ the field value is a string: `""`, `"optionA"`.

For **multiple** `select` _(MaxSelect >= 2)_ the field value is an array: `[]`, `["optionA", "optionB"]`.

Set modifiers:

- `fieldName**+**` appends one or more values to the existing one.
- `**+**fieldName` prepends one or more values to the existing one.
- `fieldName**-**` subtracts/removes one or more values from the existing one.

Example: `{"permissions+": "optionA", "roles-": ["staff", "editor"]}`

#### FileField

Defines `file` type field for managing record file(s). PocketBase stores in the database only the file name. The file itself is stored either on the local disk or in S3.

For **single** `file` _(MaxSelect <= 1)_ the stored value is a string: `""`, `"file1_Ab24ZjL.png"`.

For **multiple** `file` _(MaxSelect >= 2)_ the stored value is an array: `[]`, `["file1_Ab24ZjL.png", "file2_Frq24ZjL.txt"]`.

Set modifiers:

- `fieldName**+**` appends one or more files to the existing field value.
- `**+**fieldName` prepends one or more files to the existing field value.
- `fieldName**-**` deletes one or more files from the existing field value.

Example: `{"documents+": new File(...), "documents-": ["file1_Ab24ZjL.txt", "file2_Frq24ZjL.txt"]}`

For more details see [Files upload and handling](06-files-handling.md).

#### RelationField

Defines `relation` type field for storing single or multiple collection record references.

For **single** `relation` _(MaxSelect <= 1)_ the field value is a string: `""`, `"RECORD_ID"`.

For **multiple** `relation` _(MaxSelect >= 2)_ the field value is an array: `[]`, `["RECORD_ID1", "RECORD_ID2"]`.

Set modifiers:

- `fieldName**+**` appends one or more ids to the existing one.
- `**+**fieldName` prepends one or more ids to the existing one.
- `fieldName**-**` subtracts/removes one or more ids from the existing one.

Example: `{"users+": "USER_ID", "categories-": ["CAT_ID1", "CAT_ID2"]}`

#### JSONField

Defines `json` type field for storing any serialized JSON value, including `null` (default).

#### GeoPoint

Defines `geoPoint` type field for storing geographic coordinates (longitude, latitude) as a serialized json object: `{"lon":12.34,"lat":56.78}`.

The default/zero value of a `geoPoint` is the "Null Island": `{"lon":0,"lat":0}`.

---

**Navigation:** [← How to use PocketBase](02-how-to-use.md) | [API rules and filters →](04-api-rules-and-filters.md)

---

> **Source:** [pocketbase.io/docs/collections](https://pocketbase.io/docs/collections)
