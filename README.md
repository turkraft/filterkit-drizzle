# FilterKit Drizzle

Drizzle ORM integration for [FilterKit](https://github.com/turkraft/filterkit). Convert filter expressions to Drizzle where clauses.

```ts
import { toDrizzleWhere } from '@turkraft/filterkit-drizzle';
import { users } from './schema';

const where = toDrizzleWhere("age > 18 and status in ['active', 'pending']", {
  age: users.age,
  status: users.status,
});

const result = await db.select().from(users).where(where);
```

## Install

```bash
npm install @turkraft/filterkit-drizzle @turkraft/filterkit drizzle-orm
```

## Ecosystem

See the other FilterKit integrations:

- [TanStack](https://github.com/turkraft/filterkit-tanstack) — TanStack Table
- [QueryBuilder](https://github.com/turkraft/filterkit-querybuilder) — react-querybuilder
- [Prisma](https://github.com/turkraft/filterkit-prisma) — Prisma where clauses

## Usage

Define a column map from your filter field names to Drizzle column objects. The map
is the allowlist: only the fields you list can be filtered on.

```ts
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { toDrizzleWhere } from '@turkraft/filterkit-drizzle';

const users = sqliteTable('users', {
  name: text('name').notNull(),
  age: integer('age').notNull(),
});

const columnMap = {
  name: users.name,
  age: users.age,
};

const where = toDrizzleWhere("age > 18", columnMap);
const rows = await db.select().from(users).where(where);
```

### Unknown fields

A field that is not in the column map throws `UnknownFieldError` by default:

```ts
toDrizzleWhere("secret : 'x'", columnMap);
// UnknownFieldError: Unknown filter field `secret`. Known columns: name, age.
```

This is deliberate. The alternative is to drop the condition, which silently
*widens* an `and`, silently *narrows* an `or`, and — if it was the only condition —
leaves no `WHERE` clause at all, so `db.select().where(undefined)` returns the whole
table. A typo in a field name should not become a full table scan.

If you do want unmapped fields ignored, opt in explicitly:

```ts
toDrizzleWhere("secret : 'x'", columnMap, { onUnknownField: 'ignore' });
// => undefined
```

`toDrizzleWhere` returns `undefined` when there is nothing to filter on (an empty
expression, or `'ignore'` having dropped everything). Check for it before passing
the result to `.where()`.

### Value types

`toDrizzleWhere` also accepts an already-parsed `FilterNode`, and you should prefer
that whenever you build the filter yourself:

```ts
import { build } from '@turkraft/filterkit';

toDrizzleWhere(build().field('age').greaterThan(30).get(), columnMap);
// binds 30 as a number

toDrizzleWhere("age > '30'", columnMap);
// binds "30" as a string
```

Expression strings carry no type information — `stringify` quotes every value, and
this adapter passes values through to the driver unchanged. When the expression
comes from an HTTP request you will usually need to coerce the values to your
column types first.

## Operator mapping

| FilterKit expression | Drizzle |
|---|---|
| `field : 'val'` | `eq(column, value)` |
| `field ! 'val'` | `ne(column, value)` |
| `field > val` | `gt(column, value)` |
| `field >: val` | `gte(column, value)` |
| `field < val` | `lt(column, value)` |
| `field <: val` | `lte(column, value)` |
| `field ~ '%val%'` | `like(column, value)` |
| `field ~~ '%val%'` | `ilike(column, value)` |
| `field ~ ['%a%', '%b%']` | `or(like(column, '%a%'), like(column, '%b%'))` |
| `field in ['a', 'b']` | `inArray(column, values)` |
| `field not in ['a', 'b']` | `notInArray(column, values)` |
| `field is null` | `isNull(column)` |
| `field is not null` | `isNotNull(column)` |
| `field is empty` | `eq(column, '')` |
| `field is not empty` | `ne(column, '')` |
| `field between a and b` | `between(column, a, b)` |
| `a and b` | `and(a, b)` |
| `a or b` | `or(a, b)` |
| `not a` | `not(a)` |
| `a xor b` | `or(and(a, not(b)), and(not(a), b))` |

LIKE patterns are passed through to SQL untouched, so `%` and `_` behave exactly as
your database's `LIKE` defines them.

### Caveats

- `ilike` is **PostgreSQL only**. On MySQL and SQLite, case sensitivity follows the
  column collation; use `~` there.
- `is empty` / `is not empty` use scalar text semantics (`= ''`), matching
  `@turkraft/filterkit-prisma`. A to-many relation needs an `EXISTS` subquery,
  which a flat column map cannot express.
- Functions (`size(x)`, `today()`), placeholders, and field-to-field comparisons
  have no equivalent here and throw with an explanatory message.

## [Sponsors](https://github.com/sponsors/torshid)

Sponsor our project and have your issues prioritized.

<table>
<tr>
<td align="center"><a href="https://github.com/ixorbv"><img width="64" src="https://avatars.githubusercontent.com/u/127401397?v=4"/><br/>ixorbv</a></td>
<td align="center"><a href="https://github.com/marcopag90"><img width="64" src="https://avatars.githubusercontent.com/marcopag90"/><br/>marcopag90</a></td>
</tr>
</table>

## License

MIT
