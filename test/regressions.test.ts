import { describe, it, expect } from 'vitest';
import { toDrizzleWhere, UnknownFieldError } from '../src/index.js';
import { build } from '@turkraft/filterkit';
import { pgTable, integer, text, boolean } from 'drizzle-orm/pg-core';

const users = pgTable('users', {
  id: integer('id'),
  name: text('name'),
  age: integer('age'),
  active: boolean('active'),
});

const cols = { id: users.id, name: users.name, age: users.age, active: users.active };

function render(sql: any): string {
  if (sql === undefined || sql === null) return '<undefined>';
  if (typeof sql === 'string') return JSON.stringify(sql);
  if (Array.isArray(sql.queryChunks)) return sql.queryChunks.map(render).join('');
  if (Array.isArray(sql.value)) return sql.value.join('');
  if ('name' in sql && 'table' in sql) return `"${sql.name}"`;
  if ('value' in sql) return JSON.stringify(sql.value);
  return '';
}

describe('unknown columns are not silently dropped', () => {
  it('throws by default, naming the field and the known columns', () => {
    expect(() => toDrizzleWhere("secret : 'x'", cols)).toThrow(UnknownFieldError);
    expect(() => toDrizzleWhere("secret : 'x'", cols)).toThrow(/Unknown filter field `secret`/);
    expect(() => toDrizzleWhere("secret : 'x'", cols)).toThrow(/Known columns: id, name, age, active/);
  });

  it('catches a typo that would otherwise return the whole table', () => {
    expect(() => toDrizzleWhere("nmae : 'john'", cols)).toThrow(/Unknown filter field `nmae`/);
  });

  it('throws for an unknown field inside a conjunction', () => {
    expect(() => toDrizzleWhere("name : 'john' and secret : 'x'", cols)).toThrow(UnknownFieldError);
  });

  it('throws for an unknown field under a negation', () => {
    expect(() => toDrizzleWhere("not secret : 'x'", cols)).toThrow(UnknownFieldError);
  });

  it('ignore mode keeps the previous lenient behaviour', () => {
    const opts = { onUnknownField: 'ignore' as const };
    expect(toDrizzleWhere("secret : 'x'", cols, opts)).toBeUndefined();
    expect(render(toDrizzleWhere("name : 'john' and secret : 'x'", cols, opts)))
      .toBe('"name" = "john"');
  });
});

describe('is empty / is not empty', () => {
  it('are supported, matching the Prisma adapter', () => {
    expect(render(toDrizzleWhere('name is empty', cols))).toBe('"name" = ""');
    expect(render(toDrizzleWhere('name is not empty', cols))).toBe('"name" <> ""');
  });
});

describe('like against a collection of patterns', () => {
  it('becomes an OR of likes', () => {
    expect(render(toDrizzleWhere("name ~ ['%a%', '%b%']", cols)))
      .toBe('("name" like "%a%" or "name" like "%b%")');
  });

  it('uses ilike for the insensitive operator', () => {
    expect(render(toDrizzleWhere("name ~~ ['%a%']", cols))).toBe('"name" ilike "%a%"');
  });
});

describe('accepting a built AST preserves value types', () => {
  it('keeps a number as a number', () => {
    expect(render(toDrizzleWhere(build().field('age').greaterThan(30).get(), cols)))
      .toBe('"age" > 30');
    expect(render(toDrizzleWhere("age > '30'", cols))).toBe('"age" > "30"');
  });
});

describe('postfix operators combine with logic', () => {
  it('handles is null followed by and', () => {
    expect(render(toDrizzleWhere('name is null and age > 1', cols)))
      .toBe('("name" is null and "age" > 1)');
  });
});

describe('unsupported input fails with an explanation', () => {
  it('names the offending node', () => {
    expect(() => toDrizzleWhere('size(name) > 2', cols)).toThrow(/Expected a column/);
    expect(() => toDrizzleWhere('name : `hello`', cols)).toThrow(/Expected a literal value/);
  });

  it('an empty expression yields no condition', () => {
    expect(toDrizzleWhere('', cols)).toBeUndefined();
  });
});
