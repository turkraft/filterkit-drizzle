import {
  parse,
  FilterNode,
  FieldNode,
  InputNode,
  CollectionNode,
  CollectionLikeNode,
  InfixOperationNode,
  PrefixOperationNode,
  PostfixOperationNode,
  PriorityNode,
  EqualOperator,
  NotEqualOperator,
  GreaterThanOperator,
  GreaterThanOrEqualOperator,
  LessThanOperator,
  LessThanOrEqualOperator,
  LikeOperator,
  InsensitiveLikeOperator,
  InOperator,
  NotInOperator,
  AndOperator,
  OrOperator,
  XorOperator,
  NotOperator,
  IsNullOperator,
  IsNotNullOperator,
  IsEmptyOperator,
  IsNotEmptyOperator,
} from '@turkraft/filterkit';
import type { SQL } from 'drizzle-orm';
import { eq, ne, gt, gte, lt, lte, like, ilike, and, or, not, isNull, isNotNull, inArray, notInArray, between } from 'drizzle-orm';

type ColumnMap = Record<string, any>;

export interface ToDrizzleWhereOptions {
  onUnknownField?: 'throw' | 'ignore';
}

class UnknownFieldError extends Error {
  constructor(field: string, known: string[]) {
    super(
      `Unknown filter field \`${field}\`. Known columns: ${known.join(', ') || '(none)'}. ` +
      `Pass { onUnknownField: 'ignore' } to drop conditions on unmapped fields instead.`
    );
    this.name = 'UnknownFieldError';
  }
}

interface Context {
  cols: ColumnMap;
  onUnknownField: 'throw' | 'ignore';
}

function toField(node: FilterNode): string {
  if (node instanceof FieldNode) return node.getName();
  throw new Error(
    `Expected a column on the left-hand side, got ${describe(node)}. ` +
    `Drizzle where clauses can only filter on mapped columns.`
  );
}

function toValue(node: FilterNode): unknown {
  if (node instanceof InputNode) return node.getValue();
  throw new Error(
    `Expected a literal value on the right-hand side, got ${describe(node)}. ` +
    `Drizzle where clauses cannot compare two columns or call functions.`
  );
}

function toArray(node: FilterNode): unknown[] {
  if (node instanceof CollectionNode) return node.getItems().map(toValue);
  throw new Error(`Expected a collection like [1, 2], got ${describe(node)}`);
}

function describe(node: FilterNode): string {
  if (node instanceof FieldNode) return `field \`${node.getName()}\``;
  if (node instanceof InputNode) return `value \`${String(node.getValue())}\``;
  return node.constructor.name.replace(/Node$/, '');
}

function column(node: FilterNode, ctx: Context): any | undefined {
  const field = toField(node);
  const col = ctx.cols[field];
  if (col === undefined || col === null) {
    if (ctx.onUnknownField === 'ignore') return undefined;
    throw new UnknownFieldError(field, Object.keys(ctx.cols));
  }
  return col;
}

function isBetweenPattern(node: InfixOperationNode): boolean {
  if (!(node.getOperator() instanceof AndOperator)) return false;
  const left = node.getLeft();
  const right = node.getRight();
  if (!(left instanceof InfixOperationNode) || !(right instanceof InfixOperationNode)) return false;
  if (!(left.getOperator() instanceof GreaterThanOrEqualOperator) || !(right.getOperator() instanceof LessThanOrEqualOperator)) return false;
  const lf = left.getLeft();
  const rf = right.getLeft();
  if (!(lf instanceof FieldNode) || !(rf instanceof FieldNode)) return false;
  return lf.getName() === rf.getName();
}

function transform(node: FilterNode, ctx: Context): SQL | undefined {
  if (node instanceof PriorityNode) {
    return transform(node.getNode(), ctx);
  }

  if (node instanceof CollectionLikeNode) {
    const col = column(node.getLeft(), ctx);
    if (col === undefined) return undefined;
    const matcher = node.getOperator() instanceof InsensitiveLikeOperator ? ilike : like;
    const branches = node.getPatterns().map(p => matcher(col, String(toValue(p))));
    return branches.length === 1 ? branches[0] : or(...branches);
  }

  if (node instanceof InfixOperationNode) {
    const op = node.getOperator();

    if (isBetweenPattern(node)) {
      const gteNode = node.getLeft() as InfixOperationNode;
      const col = column(gteNode.getLeft(), ctx);
      if (col === undefined) return undefined;
      const lower = toValue(gteNode.getRight());
      const upper = toValue((node.getRight() as InfixOperationNode).getRight());
      return between(col, lower as number, upper as number);
    }

    if (op instanceof AndOperator || op instanceof OrOperator || op instanceof XorOperator) {
      const left = transform(node.getLeft(), ctx);
      const right = transform(node.getRight(), ctx);
      if (!left && !right) return undefined;
      if (!left) return right;
      if (!right) return left;
      if (op instanceof AndOperator) return and(left, right);
      if (op instanceof OrOperator) return or(left, right);
      return or(and(left, not(right)), and(not(left), right));
    }

    const col = column(node.getLeft(), ctx);
    if (col === undefined) return undefined;

    if (op instanceof EqualOperator) return eq(col, toValue(node.getRight()));
    if (op instanceof NotEqualOperator) return ne(col, toValue(node.getRight()));
    if (op instanceof GreaterThanOperator) return gt(col, toValue(node.getRight()));
    if (op instanceof GreaterThanOrEqualOperator) return gte(col, toValue(node.getRight()));
    if (op instanceof LessThanOperator) return lt(col, toValue(node.getRight()));
    if (op instanceof LessThanOrEqualOperator) return lte(col, toValue(node.getRight()));
    if (op instanceof LikeOperator) return like(col, String(toValue(node.getRight())));
    if (op instanceof InsensitiveLikeOperator) return ilike(col, String(toValue(node.getRight())));
    if (op instanceof InOperator) return inArray(col, toArray(node.getRight()));
    if (op instanceof NotInOperator) return notInArray(col, toArray(node.getRight()));

    throw new Error(`Unsupported infix operator: ${op.getToken()}`);
  }

  if (node instanceof PrefixOperationNode) {
    if (node.getOperator() instanceof NotOperator) {
      const inner = transform(node.getRight(), ctx);
      return inner ? not(inner) : undefined;
    }
    throw new Error(`Unsupported prefix operator: ${node.getOperator().getToken()}`);
  }

  if (node instanceof PostfixOperationNode) {
    const op = node.getOperator();
    const col = column(node.getLeft(), ctx);
    if (col === undefined) return undefined;

    if (op instanceof IsNullOperator) return isNull(col);
    if (op instanceof IsNotNullOperator) return isNotNull(col);
    if (op instanceof IsEmptyOperator) return eq(col, '');
    if (op instanceof IsNotEmptyOperator) return ne(col, '');
    throw new Error(`Unsupported postfix operator: ${op.getToken()}`);
  }

  throw new Error(`Unsupported node: ${describe(node)}`);
}

export function toDrizzleWhere(
  expression: string | FilterNode,
  columnMap: ColumnMap,
  options: ToDrizzleWhereOptions = {}
): SQL | undefined {
  const ctx: Context = {
    cols: columnMap,
    onUnknownField: options.onUnknownField ?? 'throw',
  };
  if (typeof expression === 'string') {
    if (!expression.trim()) return undefined;
    return transform(parse(expression), ctx);
  }
  return transform(expression, ctx);
}

export { UnknownFieldError };
