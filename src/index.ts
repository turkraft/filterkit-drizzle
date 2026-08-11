import { parse } from '@turkraft/filterkit';
import {
  FilterNode,
  FieldNode,
  InputNode,
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
} from '@turkraft/filterkit';
import type { SQL } from 'drizzle-orm';
import { eq, ne, gt, gte, lt, lte, like, ilike, and, or, not, isNull, isNotNull, inArray, notInArray, between } from 'drizzle-orm';

type ColumnMap = Record<string, any>;

function toField(node: FilterNode): string {
  if (node instanceof FieldNode) return node.getName();
  throw new Error(`Expected FieldNode`);
}

function toValue(node: FilterNode): unknown {
  if (node instanceof InputNode) return node.getValue();
  throw new Error(`Expected InputNode`);
}

function toArray(node: FilterNode): unknown[] {
  if ('getItems' in node) return (node as any).getItems().map((i: FilterNode) => toValue(i));
  throw new Error(`Expected CollectionNode`);
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

function transform(node: FilterNode, cols: ColumnMap): SQL | undefined {
  if (node instanceof PriorityNode) {
    return transform(node.getNode(), cols);
  }

  if (node instanceof InfixOperationNode) {
    const op = node.getOperator();

    if (isBetweenPattern(node)) {
      const gteNode = node.getLeft() as InfixOperationNode;
      const col = cols[toField(gteNode.getLeft())];
      if (!col) return undefined;
      const lower = toValue(gteNode.getRight());
      const upper = toValue((node.getRight() as InfixOperationNode).getRight());
      return between(col, lower as number, upper as number);
    }

    if (op instanceof EqualOperator) {
      const field = toField(node.getLeft());
      const col = cols[field];
      if (!col) return undefined;
      return eq(col, toValue(node.getRight()));
    }

    if (op instanceof NotEqualOperator) {
      const field = toField(node.getLeft());
      const col = cols[field];
      if (!col) return undefined;
      return ne(col, toValue(node.getRight()));
    }

    if (op instanceof GreaterThanOperator) {
      const field = toField(node.getLeft());
      const col = cols[field];
      if (!col) return undefined;
      return gt(col, toValue(node.getRight()));
    }

    if (op instanceof GreaterThanOrEqualOperator) {
      const field = toField(node.getLeft());
      const col = cols[field];
      if (!col) return undefined;
      return gte(col, toValue(node.getRight()));
    }

    if (op instanceof LessThanOperator) {
      const field = toField(node.getLeft());
      const col = cols[field];
      if (!col) return undefined;
      return lt(col, toValue(node.getRight()));
    }

    if (op instanceof LessThanOrEqualOperator) {
      const field = toField(node.getLeft());
      const col = cols[field];
      if (!col) return undefined;
      return lte(col, toValue(node.getRight()));
    }

    if (op instanceof LikeOperator) {
      const field = toField(node.getLeft());
      const col = cols[field];
      if (!col) return undefined;
      return like(col, String(toValue(node.getRight())));
    }

    if (op instanceof InsensitiveLikeOperator) {
      const field = toField(node.getLeft());
      const col = cols[field];
      if (!col) return undefined;
      return ilike(col, String(toValue(node.getRight())));
    }

    if (op instanceof InOperator) {
      const field = toField(node.getLeft());
      const col = cols[field];
      if (!col) return undefined;
      return inArray(col, toArray(node.getRight()));
    }

    if (op instanceof NotInOperator) {
      const field = toField(node.getLeft());
      const col = cols[field];
      if (!col) return undefined;
      return notInArray(col, toArray(node.getRight()));
    }

    if (op instanceof AndOperator) {
      const left = transform(node.getLeft(), cols);
      const right = transform(node.getRight(), cols);
      if (!left && !right) return undefined;
      if (!left) return right;
      if (!right) return left;
      return and(left, right);
    }

    if (op instanceof OrOperator) {
      const left = transform(node.getLeft(), cols);
      const right = transform(node.getRight(), cols);
      if (!left && !right) return undefined;
      if (!left) return right;
      if (!right) return left;
      return or(left, right);
    }

    if (op instanceof XorOperator) {
      const left = transform(node.getLeft(), cols);
      const right = transform(node.getRight(), cols);
      if (!left && !right) return undefined;
      if (!left) return right;
      if (!right) return left;
      return or(and(left, not(right)), and(not(left), right));
    }

    throw new Error(`Unsupported infix operator: ${op.getToken()}`);
  }

  if (node instanceof PrefixOperationNode) {
    if (node.getOperator() instanceof NotOperator) {
      const inner = transform(node.getRight(), cols);
      return inner ? not(inner) : undefined;
    }
    throw new Error(`Unsupported prefix operator`);
  }

  if (node instanceof PostfixOperationNode) {
    const op = node.getOperator();
    const field = toField(node.getLeft());
    const col = cols[field];
    if (!col) return undefined;

    if (op instanceof IsNullOperator) return isNull(col);
    if (op instanceof IsNotNullOperator) return isNotNull(col);
    throw new Error(`Unsupported postfix operator`);
  }

  throw new Error(`Unsupported node`);
}

export function toDrizzleWhere(expression: string, columnMap: ColumnMap): SQL | undefined {
  if (!expression || !expression.trim()) return undefined;
  const node = parse(expression);
  return transform(node, columnMap);
}
