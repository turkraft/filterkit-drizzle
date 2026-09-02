import { describe, it, expect } from 'vitest';
import { toDrizzleWhere, UnknownFieldError } from '../src/index.js';
import { build } from '@turkraft/filterkit';
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

const users = sqliteTable('users', {
  name: text('name').notNull(),
  age: integer('age').notNull(),
  status: text('status'),
  field: text('field'),
  a: integer('a'),
  b: integer('b'),
});

const columnMap = { name: users.name, age: users.age };

describe('README examples', () => {
  it('opening example', () => {
    const where = toDrizzleWhere("age > 18 and status in ['active', 'pending']", {
      age: users.age,
      status: users.status,
    });
    expect(where).toBeDefined();
  });

  it('usage example', () => {
    expect(toDrizzleWhere('age > 18', columnMap)).toBeDefined();
  });

  it('unknown fields throw by default', () => {
    expect(() => toDrizzleWhere("secret : 'x'", columnMap)).toThrow(UnknownFieldError);
    expect(() => toDrizzleWhere("secret : 'x'", columnMap))
      .toThrow(/Unknown filter field `secret`\. Known columns: name, age\./);
  });

  it('unknown fields can be ignored', () => {
    expect(toDrizzleWhere("secret : 'x'", columnMap, { onUnknownField: 'ignore' })).toBeUndefined();
  });

  it('empty expression yields undefined', () => {
    expect(toDrizzleWhere('', columnMap)).toBeUndefined();
  });

  it('value types', () => {
    expect(toDrizzleWhere(build().field('age').greaterThan(30).get(), columnMap)).toBeDefined();
    expect(toDrizzleWhere("age > '30'", columnMap)).toBeDefined();
  });

  it('every row of the operator table produces a condition', () => {
    const cols = { field: users.field, a: users.a, b: users.b };
    const expressions = [
      "field : 'val'",
      "field ! 'val'",
      'field > 1',
      'field >: 1',
      'field < 1',
      'field <: 1',
      "field ~ '%val%'",
      "field ~~ '%val%'",
      "field ~ ['%a%', '%b%']",
      "field in ['a', 'b']",
      "field not in ['a', 'b']",
      'field is null',
      'field is not null',
      'field is empty',
      'field is not empty',
      'field between 1 and 2',
      'a : 1 and b : 2',
      'a : 1 or b : 2',
      'not a : 1',
      'a : 1 xor b : 2',
    ];
    for (const expression of expressions) {
      expect(toDrizzleWhere(expression, cols), expression).toBeDefined();
    }
  });

  it('unsupported nodes throw with an explanation', () => {
    expect(() => toDrizzleWhere('size(name) > 1', columnMap)).toThrow(/Expected a column/);
    expect(() => toDrizzleWhere('name : `hello`', columnMap)).toThrow(/Expected a literal value/);
  });
});
