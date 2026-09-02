import { describe, it, expect } from 'vitest';
import { toDrizzleWhere, UnknownFieldError } from '../src/index.js';
import { build, stringify } from '@turkraft/filterkit';
import { pgTable, integer, text } from 'drizzle-orm/pg-core';

const t = pgTable('t', { a: integer('a'), b: integer('b'), n: text('n') });
const cols = { a: t.a, b: t.b, n: t.n, 'x.y': t.a };

function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 0x100000000; };
}

const FIELDS = ['a', 'b', 'n', 'x.y', 'unmapped', 'a.b'];
const VALUES: any[] = [1, 0, -1, 1.5, 'x', '%x%', 'x%', '%x', true, false, "o'brien"];

function randomStep(rand: () => number, depth: number): any {
  const pick = <T,>(xs: T[]): T => xs[Math.floor(rand() * xs.length)];
  if (depth <= 0) {
    const field = build().field(pick(FIELDS));
    return pick([
      () => field.equal(pick(VALUES)),
      () => field.notEqual(pick(VALUES)),
      () => field.greaterThan(pick(VALUES)),
      () => field.lessThanOrEqual(pick(VALUES)),
      () => field.like(pick(VALUES)),
      () => field.insensitiveLike(pick(VALUES)),
      () => field.in([pick(VALUES), pick(VALUES)]),
      () => field.notIn([pick(VALUES), pick(VALUES)]),
      () => field.isNull(),
      () => field.isNotNull(),
      () => field.isEmpty(),
      () => field.isNotEmpty(),
      () => field.between(pick(VALUES), pick(VALUES)),
      () => field.likeCollection(pick(VALUES), pick(VALUES)),
    ])();
  }
  const left = randomStep(rand, depth - 1);
  const roll = rand();
  if (roll < 0.3) return left.and(randomStep(rand, depth - 1));
  if (roll < 0.55) return left.or(randomStep(rand, depth - 1));
  if (roll < 0.7) return left.xor(randomStep(rand, depth - 1));
  if (roll < 0.85) return left.not();
  return build().priority(left);
}

function classify(fn: () => unknown): 'ok' | 'unknown-field' | 'explained' | string {
  try { fn(); return 'ok'; } catch (e: any) {
    if (e instanceof UnknownFieldError) return 'unknown-field';
    if (e instanceof RangeError) return `RangeError: ${e.message.slice(0, 60)}`;
    if (e instanceof TypeError) return `TypeError: ${e.message.slice(0, 60)}`;
    if (e instanceof Error && e.message.length > 0) return 'explained';
    return `unexpected: ${String(e)}`;
  }
}

describe('drizzle fuzzing', () => {
  it('never throws an unexpected error type', () => {
    const rand = rng(0xD812);
    const bad: string[] = [];
    const seen: Record<string, number> = { ok: 0, 'unknown-field': 0, explained: 0 };
    for (let i = 0; i < 20000; i++) {
      const expression = stringify(randomStep(rand, 2).get());
      const result = classify(() => toDrizzleWhere(expression, cols));
      if (result in seen) seen[result]++;
      else if (bad.length < 10) bad.push(`  ${expression}\n      ${result}`);
    }
    console.log(`  20000: ${seen.ok} converted, ${seen['unknown-field']} unknown-field, ${seen.explained} explained, ${bad.length} unexpected`);
    bad.forEach(b => console.log(b));
    expect(bad).toEqual([]);
    expect(seen.ok).toBeGreaterThan(2000);
  }, 60000);

  it('the default mode never silently yields an empty WHERE', () => {
    const rand = rng(0xE0F);
    const bad: string[] = [];
    for (let i = 0; i < 20000; i++) {
      const expression = stringify(randomStep(rand, 2).get());
      let where: unknown;
      try { where = toDrizzleWhere(expression, cols); } catch { continue; }
      if (where === undefined && bad.length < 10) {
        bad.push(`  non-empty expression produced no WHERE clause: ${expression}`);
      }
    }
    console.log(`  ${bad.length} silent empty WHERE clause(s)`);
    bad.forEach(b => console.log(b));
    expect(bad).toEqual([]);
  }, 60000);

  it('ignore mode only ever drops conditions on unmapped fields', () => {
    const rand = rng(0x1670);
    const bad: string[] = [];
    let dropped = 0, kept = 0;
    for (let i = 0; i < 20000; i++) {
      const expression = stringify(randomStep(rand, 2).get());
      const strictResult = classify(() => toDrizzleWhere(expression, cols));
      let lenientWhere: unknown;
      try { lenientWhere = toDrizzleWhere(expression, cols, { onUnknownField: 'ignore' }); }
      catch { continue; }
      if (lenientWhere === undefined) dropped++; else kept++;
      if (strictResult === 'ok' && lenientWhere === undefined && bad.length < 10) {
        bad.push(`  ignore mode dropped a fully mapped expression: ${expression}`);
      }
    }
    console.log(`  ignore mode: ${kept} kept, ${dropped} fully dropped, ${bad.length} problem(s)`);
    bad.forEach(b => console.log(b));
    expect(bad).toEqual([]);
  }, 60000);
});
