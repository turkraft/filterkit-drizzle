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

## Usage

Define a column map from your filter field names to Drizzle column objects:

```ts
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { toDrizzleWhere } from '@turkraft/filterkit-drizzle';

const users = sqliteTable('users', {
  name: text().notNull(),
  age: integer().notNull(),
});

const columnMap = {
  name: users.name,
  age: users.age,
};

const where = toDrizzleWhere("age > 18", columnMap);
const rows = await db.select().from(users).where(where);
```

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
| `field in ['a', 'b']` | `inArray(column, values)` |
| `field not in ['a', 'b']` | `notInArray(column, values)` |
| `field is null` | `isNull(column)` |
| `field is not null` | `isNotNull(column)` |
| `field between a and b` | `between(column, a, b)` |
| `a and b` | `and(a, b)` |
| `a or b` | `or(a, b)` |
| `not a` | `not(a)` |
| `a xor b` | `or(and(a, not(b)), and(not(a), b))` |

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
