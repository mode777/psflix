# API Rules and Filters

### API Rules

**API Rules** are your collection access controls and data filters.

Each collection has **5 rules**, corresponding to the specific API action:

- `listRule`
- `viewRule`
- `createRule`
- `updateRule`
- `deleteRule`

Auth collections have an additional `options.manageRule` used to allow one user (even from a different collection) to fully manage another user's data (e.g. changing their email, password, etc.).

Each rule could be set to:

- **"locked"** - `null`, meaning the action could be performed only by an authorized superuser (**this is the default**)
- **Empty string** - anyone can perform the action (superusers, authorized users and guests)
- **Non-empty string** - only users (authorized or not) that satisfy the rule filter expression can perform this action

> **PocketBase API Rules act also as records filter!** For example, you could allow listing only "active" records with: `status = "active"`

Because of the above, the API will return:

- 200 empty items for unsatisfied `listRule`
- 400 for unsatisfied `createRule`
- 404 for unsatisfied `viewRule`, `updateRule` and `deleteRule`
- 403 when "locked" and client is not a superuser

The API Rules are ignored when the action is performed by an authorized superuser.

### Filters Syntax

You have access to **3 groups of fields**:

- **Your Collection schema fields** — all nested relation fields too, e.g. `someRelField.status != "pending"`
- **`@request.*`** — current request data:
  - `@request.context` — the context where the rule is used (values: `default`, `oauth2`, `otp`, `password`, `realtime`, `protectedFile`)
  - `@request.method` — the HTTP request method
  - `@request.headers.*` — request headers as string values (all header keys normalized to lowercase, "-" replaced with "_")
  - `@request.query.*` — query parameters as string values
  - `@request.auth.*` — the current authenticated model
  - `@request.body.*` — submitted body parameters (uploaded files are not part of `@request.body`)
- **`@collection.*`** — target other collections that share a common field value. Use `:alias` suffix to join the same collection multiple times.

### Operators

The syntax follows `OPERAND OPERATOR OPERAND` format:

- `=` Equal
- `!=` NOT equal
- `>` Greater than
- `>=` Greater than or equal
- `<` Less than
- `<=` Less than or equal
- `~` Like/Contains (auto wraps right string in `%` for wildcard)
- `!~` NOT Like/Contains
- `?=` _Any/At least one of_ Equal
- `?!=` _Any/At least one of_ NOT equal
- `?>` _Any/At least one of_ Greater than
- `?>=` _Any/At least one of_ Greater than or equal
- `?<` _Any/At least one of_ Less than
- `?<=` _Any/At least one of_ Less than or equal
- `?~` _Any/At least one of_ Like/Contains
- `?!~` _Any/At least one of_ NOT Like/Contains

To group expressions use `(...)` with `&&` (AND) and `||` (OR). Single line comments are supported: `// Example comment`.

Field expressions with array-like value or nested fields from multiple records apply a **match-all** constraint by default. Use `?` prefix for **any/at-least-one-of** (e.g. `multiRelation.title ?= "test"`).

### Special Identifiers and Modifiers

#### @ Macros

The following datetime macros are available (all UTC based):

```
@now         - the current datetime as string
@second      - @now second number (0-59)
@minute      - @now minute number (0-59)
@hour        - @now hour number (0-23)
@weekday     - @now weekday number (0-6)
@day         - @now day number
@month       - @now month number
@year        - @now year number
@yesterday   - the yesterday datetime relative to @now as string
@tomorrow    - the tomorrow datetime relative to @now as string
@todayStart  - beginning of the current day as datetime string
@todayEnd    - end of the current day as datetime string
@monthStart  - beginning of the current month as datetime string
@monthEnd    - end of the current month as datetime string
@yearStart   - beginning of the current year as datetime string
@yearEnd     - end of the current year as datetime string
```

Example: `@request.body.publicDate >= @now`

#### :isset Modifier

Available only for `@request.*` fields. Checks whether the client submitted specific data.

Example (disallow submitting a "role" field): `@request.body.role:isset = false`

#### :changed Modifier

Available only for `@request.body.*` fields. Checks whether the client submitted AND changed a specific record field.

Example: `@request.body.role:changed = false`

#### :length Modifier

Checks the number of items in an array field (multiple `file`, `select`, `relation`). Works with collection schema fields and `@request.body.*`.

Example: `@request.body.someSelectField:length > 1`

#### :each Modifier

Works with multiple `select`, `file` and `relation` fields. Applies a condition on each item from the field array.

Example: `@request.body.someSelectField:each ~ "create"`

#### :lower Modifier

Performs lower-case string comparisons using SQLite `LOWER` (works for ASCII by default; ICU extension needed for full Unicode).

Example: `@request.body.title:lower = "test"` matches "Test", "tEsT", etc.

#### geoDistance(lonA, latA, lonB, latB)

Calculates Haversine distance between 2 geographic points in kilometres.

Example: `geoDistance(address.lon, address.lat, 23.32, 42.69) < 25`

#### strftime(format, [time-value, modifiers...])

Returns a date string formatted according to the specified format. Similar to SQLite `strftime` but normalizes NULL results for consistency with non-nullable PocketBase fields.

Accepts 1, 2 or 3+ arguments:

1. **format** — formatting string with valid substitution characters
2. **time-value** (optional) — date string, number, or collection field identifier
3. **modifiers** (optional) — up to 8 string literal modifiers

Example: `strftime('%Y-%m', multiRel.created) = "2026-01"`

### Examples

- Allow only registered users:
  `@request.auth.id != ""`

- Allow only registered users, return "active" or "pending" records:
  `@request.auth.id != "" && (status = "active" || status = "pending")`

- Allow registered users listed in an _allowed_users_ multi-relation field:
  `@request.auth.id != "" && allowed_users.id ?= @request.auth.id`

- Allow access by anyone, return records where _title_ starts with "Lorem":
  `title ~ "Lorem%"`

---

**Navigation:** [← Collections](03-collections.md) | [Authentication →](05-authentication.md)

---

> **Source:** [pocketbase.io/docs/api-rules-and-filters](https://pocketbase.io/docs/api-rules-and-filters)
