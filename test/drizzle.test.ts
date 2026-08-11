import { describe, it, expect } from 'vitest';
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { toDrizzleWhere } from '../src/index.js';

const users = sqliteTable('users', {
  name: text().notNull(),
  age: integer().notNull(),
  active: integer({ mode: 'boolean' }).notNull(),
  email: text(),
  role: text().notNull(),
});

const cols = {
  name: users.name,
  age: users.age,
  active: users.active,
  email: users.email,
  role: users.role,
};

describe('toDrizzleWhere', () => {
  it('empty string returns undefined', () => {
    expect(toDrizzleWhere('', cols)).toBeUndefined();
  });

  it('equality', () => {
    expect(toDrizzleWhere("name : 'John'", cols)).toBeDefined();
  });

  it('not equals', () => {
    expect(toDrizzleWhere("name ! 'John'", cols)).toBeDefined();
  });

  it('greater than', () => {
    expect(toDrizzleWhere('age > 18', cols)).toBeDefined();
  });

  it('greater than or equal', () => {
    expect(toDrizzleWhere('age >: 18', cols)).toBeDefined();
  });

  it('less than', () => {
    expect(toDrizzleWhere('age < 65', cols)).toBeDefined();
  });

  it('less than or equal', () => {
    expect(toDrizzleWhere('age <: 65', cols)).toBeDefined();
  });

  it('like', () => {
    expect(toDrizzleWhere("name ~ '%John%'", cols)).toBeDefined();
  });

  it('case-insensitive like', () => {
    expect(toDrizzleWhere("name ~~ '%JOHN%'", cols)).toBeDefined();
  });

  it('is null', () => {
    expect(toDrizzleWhere('email is null', cols)).toBeDefined();
  });

  it('is not null', () => {
    expect(toDrizzleWhere('email is not null', cols)).toBeDefined();
  });

  it('in collection', () => {
    expect(toDrizzleWhere("role in ['admin', 'user']", cols)).toBeDefined();
  });

  it('not in collection', () => {
    expect(toDrizzleWhere("role not in ['deleted']", cols)).toBeDefined();
  });

  it('between', () => {
    expect(toDrizzleWhere('age between 18 and 65', cols)).toBeDefined();
  });

  it('AND', () => {
    expect(toDrizzleWhere("age > 18 and active : true", cols)).toBeDefined();
  });

  it('OR', () => {
    expect(toDrizzleWhere("name : 'John' or name : 'Jane'", cols)).toBeDefined();
  });

  it('NOT', () => {
    expect(toDrizzleWhere("not active : true", cols)).toBeDefined();
  });

  it('XOR', () => {
    expect(toDrizzleWhere("active : true xor role : 'admin'", cols)).toBeDefined();
  });

  it('complex nested', () => {
    expect(toDrizzleWhere("age > 18 and (name : 'John' or name : 'Jane')", cols)).toBeDefined();
  });

  it('unknown field returns undefined', () => {
    expect(toDrizzleWhere("unknown : 'val'", cols)).toBeUndefined();
  });
});
