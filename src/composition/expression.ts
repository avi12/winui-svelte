import type { Vector3Value } from "#src/components/values.js";
import type { CompositionObject } from "#winui/microsoft/ui/composition/CompositionObject";

export type { Vector3Value } from "#src/components/values.js";

// Composition expressions built from typed parts, apart from WinUI so the text
// they make is tested under `node --test`: a reference's members, number and
// vector literals, arithmetic and the expression language's functions each
// know their kind (scalar, two or three components), so a member that does not
// exist or an operand of the wrong kind fails to compile, and the expression
// prints its own text with the fewest parentheses that keep its meaning.

/** The kinds of value an expression has, as the Composition expression language types them. */
export const ExpressionKind = {
  SCALAR: "scalar",
  VECTOR2: "vector2",
  VECTOR3: "vector3"
} as const;

/** One of the kinds in `ExpressionKind`. */
export type ExpressionKind = (typeof ExpressionKind)[keyof typeof ExpressionKind];

/** A two-component value: a size, an anchor point. */
export interface Vector2Value {
  readonly x: number;
  readonly y: number;
}

/** The plain value of each kind. */
export interface ValueOfKind {
  readonly scalar: number;
  readonly vector2: Vector2Value;
  readonly vector3: Vector3Value;
}

// How tightly a part binds, low to high: a part is put in parentheses where it
// sits in a part that binds tighter.
const Precedence = {
  ADDITIVE: 1,
  MULTIPLICATIVE: 2,
  UNARY: 3,
  ATOM: 4
} as const;

type Precedence = (typeof Precedence)[keyof typeof Precedence];

const Operator = {
  PLUS: "+",
  MINUS: "-",
  TIMES: "*",
  DIVIDED_BY: "/"
} as const;

type Operator = (typeof Operator)[keyof typeof Operator];

const OPERATOR_PRECEDENCE = new Map<Operator, Precedence>([
  [Operator.PLUS, Precedence.ADDITIVE],
  [Operator.MINUS, Precedence.ADDITIVE],
  [Operator.TIMES, Precedence.MULTIPLICATIVE],
  [Operator.DIVIDED_BY, Precedence.MULTIPLICATIVE]
]);

// The operators whose right operand of the same precedence changes the meaning without parentheses.
const NON_ASSOCIATIVE = new Set<Operator>([Operator.MINUS, Operator.DIVIDED_BY]);

const FRACTION_DIGITS = 6;

/** The objects an expression names, by the parameter name it gives each. */
export type ExpressionReferences = ReadonlyMap<string, CompositionObject>;

interface ExpressionNode {
  readonly text: string;
  readonly precedence: Precedence;
  readonly references: ExpressionReferences;
}

/**
 * A number as an expression spells it: six fraction digits at most, no
 * trailing zeros.
 */
export function numberText(value: number) {
  return String(Number(value.toFixed(FRACTION_DIGITS)));
}

function mergeReferences(nodes: readonly ExpressionNode[]) {
  const merged = new Map<string, CompositionObject>();
  for (const node of nodes) {
    for (const [name, source] of node.references) {
      const bound = merged.get(name);
      const isClash = bound !== undefined && bound !== source;
      if (isClash) {
        throw new Error(`two objects are named ${name} in one expression`);
      }

      merged.set(name, source);
    }
  }

  return merged;
}

function wrapped({ node, isWrapped }: {
  node: ExpressionNode;
  isWrapped: boolean;
}) {
  return isWrapped ? `(${node.text})` : node.text;
}

function binaryNode({ left, operator, right }: {
  left: ExpressionNode;
  operator: Operator;
  right: ExpressionNode;
}) {
  const precedence = OPERATOR_PRECEDENCE.get(operator) ?? Precedence.ADDITIVE;
  const isRightLoose = right.precedence < precedence || right.precedence === Precedence.UNARY;
  const isRightRegrouped = right.precedence === precedence && NON_ASSOCIATIVE.has(operator);
  const leftText = wrapped({
    node: left,
    isWrapped: left.precedence < precedence
  });
  const rightText = wrapped({
    node: right,
    isWrapped: isRightLoose || isRightRegrouped
  });
  return {
    text: `${leftText} ${operator} ${rightText}`,
    precedence,
    references: mergeReferences([left, right])
  };
}

function callNode({ name, nodes }: {
  name: string;
  nodes: readonly ExpressionNode[];
}) {
  return {
    text: `${name}(${nodes.map(node => node.text).join(", ")})`,
    precedence: Precedence.ATOM,
    references: mergeReferences(nodes)
  };
}

function negatedNode(node: ExpressionNode) {
  return {
    text: `-${wrapped({
      node,
      isWrapped: node.precedence <= Precedence.UNARY
    })}`,
    precedence: Precedence.UNARY,
    references: node.references
  };
}

function literalNode(value: number) {
  return {
    text: numberText(value),
    precedence: value < 0 ? Precedence.UNARY : Precedence.ATOM,
    references: new Map()
  };
}

function memberNode({ node, member }: {
  node: ExpressionNode;
  member: string;
}) {
  return {
    text: `${node.text}.${member}`,
    precedence: Precedence.ATOM,
    references: node.references
  };
}

/** A scalar operand: an expression or a number. */
export type ScalarOperand = ScalarExpression | number;

/** A two-component operand: an expression or a plain `{ x, y }`. */
export type Vector2Operand = Vector2Expression | Vector2Value;

/** A three-component operand: an expression or a plain `{ x, y, z }`. */
export type Vector3Operand = Vector3Expression | Vector3Value;

function scalarNode(operand: ScalarOperand) {
  return typeof operand === "number" ? literalNode(operand) : operand;
}

function vector2Node(operand: Vector2Operand) {
  return operand instanceof Vector2Expression ? operand : callNode({
    name: "Vector2",
    nodes: [literalNode(operand.x), literalNode(operand.y)]
  });
}

function vector3Node(operand: Vector3Operand) {
  return operand instanceof Vector3Expression ? operand : callNode({
    name: "Vector3",
    nodes: [literalNode(operand.x), literalNode(operand.y), literalNode(operand.z)]
  });
}

// What every kind does: add and subtract its own kind, scale by a scalar,
// negate, and interpolate. `Operand` is what it takes, `Result` what it gives.
abstract class TypedExpression<Operand, Result> implements ExpressionNode {
  readonly text: string;
  readonly precedence: Precedence;
  readonly references: ExpressionReferences;

  constructor(node: ExpressionNode) {
    this.text = node.text;
    this.precedence = node.precedence;
    this.references = node.references;
  }

  /** This plus another value of its kind, component by component. */
  plus(other: Operand) {
    return this.combined({
      operator: Operator.PLUS,
      right: this.operandNode(other)
    });
  }

  /** This minus another value of its kind, component by component. */
  minus(other: Operand) {
    return this.combined({
      operator: Operator.MINUS,
      right: this.operandNode(other)
    });
  }

  /** This, each component, times a scalar. */
  times(factor: ScalarOperand) {
    return this.combined({
      operator: Operator.TIMES,
      right: scalarNode(factor)
    });
  }

  /** This, each component, divided by a scalar. */
  dividedBy(divisor: ScalarOperand) {
    return this.combined({
      operator: Operator.DIVIDED_BY,
      right: scalarNode(divisor)
    });
  }

  /** The negative of this. */
  negated() {
    return this.made(negatedNode(this));
  }

  /** The value `amount` of the way from this to `to` (`Lerp`), 0 giving this and 1 giving `to`. */
  lerp({ to, amount }: {
    to: Operand;
    amount: ScalarOperand;
  }) {
    return this.made(
      callNode({
        name: "Lerp",
        nodes: [this, this.operandNode(to), scalarNode(amount)]
      })
    );
  }

  toString() {
    return this.text;
  }

  protected abstract operandNode(operand: Operand): ExpressionNode;

  protected abstract made(node: ExpressionNode): Result;

  private combined({ operator, right }: {
    operator: Operator;
    right: ExpressionNode;
  }) {
    return this.made(
      binaryNode({
        left: this,
        operator,
        right
      })
    );
  }
}

/** An expression whose value is a number: an opacity, an angle, a progress. */
export class ScalarExpression extends TypedExpression<ScalarOperand, ScalarExpression> {
  readonly kind = ExpressionKind.SCALAR;

  /** This held between `min` and `max` (`Clamp`). */
  clamped({ min, max }: {
    min: ScalarOperand;
    max: ScalarOperand;
  }) {
    return this.made(
      callNode({
        name: "Clamp",
        nodes: [this, scalarNode(min), scalarNode(max)]
      })
    );
  }

  protected override operandNode(operand: ScalarOperand) {
    return scalarNode(operand);
  }

  protected override made(node: ExpressionNode) {
    return new ScalarExpression(node);
  }
}

/** An expression whose value has two components: a size, an anchor point. */
export class Vector2Expression extends TypedExpression<Vector2Operand, Vector2Expression> {
  readonly kind = ExpressionKind.VECTOR2;

  protected override operandNode(operand: Vector2Operand) {
    return vector2Node(operand);
  }

  protected override made(node: ExpressionNode) {
    return new Vector2Expression(node);
  }
}

/** An expression whose value has three components: an offset, a scale, a translation. */
export class Vector3Expression extends TypedExpression<Vector3Operand, Vector3Expression> {
  readonly kind = ExpressionKind.VECTOR3;

  protected override operandNode(operand: Vector3Operand) {
    return vector3Node(operand);
  }

  protected override made(node: ExpressionNode) {
    return new Vector3Expression(node);
  }
}

/** A two-component member of a reference, whose components are scalars of their own. */
export class Vector2Member extends Vector2Expression {
  /** The first component. */
  get x() {
    return new ScalarExpression(memberNode({
      node: this,
      member: "X"
    }));
  }

  /** The second component. */
  get y() {
    return new ScalarExpression(memberNode({
      node: this,
      member: "Y"
    }));
  }
}

/** A three-component member of a reference, whose components are scalars of their own. */
export class Vector3Member extends Vector3Expression {
  /** The first component. */
  get x() {
    return new ScalarExpression(memberNode({
      node: this,
      member: "X"
    }));
  }

  /** The second component. */
  get y() {
    return new ScalarExpression(memberNode({
      node: this,
      member: "Y"
    }));
  }

  /** The third component. */
  // oxlint-disable-next-line id-length -- the component's name in Vector3, as x and y are
  get z() {
    return new ScalarExpression(memberNode({
      node: this,
      member: "Z"
    }));
  }
}

/** The expression class of each kind. */
export interface ExpressionOfKind {
  readonly scalar: ScalarExpression;
  readonly vector2: Vector2Expression;
  readonly vector3: Vector3Expression;
}

/** An expression of any kind. */
export type Expression = ExpressionOfKind[ExpressionKind];

/** The member class of each kind: a vector member also gives its components. */
export interface MemberOfKind {
  readonly scalar: ScalarExpression;
  readonly vector2: Vector2Member;
  readonly vector3: Vector3Member;
}

const EXPRESSION_OF_KIND: { readonly [Kind in ExpressionKind]: (node: ExpressionNode) => ExpressionOfKind[Kind] } = {
  scalar: node => new ScalarExpression(node),
  vector2: node => new Vector2Expression(node),
  vector3: node => new Vector3Expression(node)
};

const MEMBER_OF_KIND: { readonly [Kind in ExpressionKind]: (node: ExpressionNode) => MemberOfKind[Kind] } = {
  scalar: node => new ScalarExpression(node),
  vector2: node => new Vector2Member(node),
  vector3: node => new Vector3Member(node)
};

/** The members a reference declares: each member's name and the kind of its value. */
export type ReferenceMembers = Readonly<Record<string, ExpressionKind>>;

/** A reference with typed members: `reference.offset.x` is a scalar expression, a missing member fails to compile. */
export type Reference<Members extends ReferenceMembers> = {
  readonly [Name in keyof Members]: MemberOfKind[Members[Name]];
};

/**
 * The Composition spelling of a member name or a dotted path: each part with a
 * capital first letter, as `offset.x` is `Offset.X`.
 */
export function compositionPath(path: string) {
  return path.split(".").map(part => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(".");
}

/**
 * A named object for expressions to read: `members` declares the members it
 * has and the kind of each, by the camel-case name the reference gives it
 * (spelled with a capital first letter in the expression). The source is bound
 * to `name` wherever an expression uses one of its members; without a source
 * the caller binds the parameter itself.
 */
export function reference<const Members extends ReferenceMembers>({ name, members, source }: {
  name: string;
  members: Members;
  source?: CompositionObject;
}) {
  const references = new Map<string, CompositionObject>();
  const hasSource = source !== undefined;
  if (hasSource) {
    references.set(name, source);
  }

  const root = {
    text: name,
    precedence: Precedence.ATOM,
    references
  };
  const entries = Object.entries(members).map(([member, kind]) => [member, MEMBER_OF_KIND[kind](
    memberNode({
      node: root,
      member: compositionPath(member)
    })
  )]);
  // oxlint-disable-next-line typescript/consistent-type-assertions -- Object.fromEntries loses each member's kind
  return Object.fromEntries(entries) as Reference<Members>;
}

/** A number as an expression. */
export function scalar(value: number) {
  return new ScalarExpression(literalNode(value));
}

/** A two-component literal as an expression (`Vector2(x, y)`). */
export function vector2(value: Vector2Value) {
  return new Vector2Expression(vector2Node(value));
}

/** A three-component literal as an expression (`Vector3(x, y, z)`). */
export function vector3(value: Vector3Value) {
  return new Vector3Expression(vector3Node(value));
}

/**
 * The escape hatch: an expression written as text, for what the typed parts
 * do not cover. `kind` says what it gives; `references` binds the names it
 * uses. Its text is taken as it is, in parentheses where it is an operand.
 */
export function rawExpression<Kind extends ExpressionKind>({ kind, text, references = new Map() }: {
  kind: Kind;
  text: string;
  references?: ExpressionReferences;
}) {
  return EXPRESSION_OF_KIND[kind]({
    text,
    precedence: Precedence.ADDITIVE,
    references
  });
}
