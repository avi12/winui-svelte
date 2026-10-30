// SVG path data (`M 0 0 L 10 10 C ... Z`, as `path()` and an SVG `d` write it)
// as absolute commands: relative ones are made absolute, `H` and `V` become
// lines, and `S` and `T` get the control point they reflect.

/** One drawing command, with every coordinate absolute. */
export type PathCommand =
  | {
    readonly kind: "move";
    readonly x: number;
    readonly y: number;
  }
  | {
    readonly kind: "line";
    readonly x: number;
    readonly y: number;
  }
  | {
    readonly kind: "cubic";
    readonly x1: number;
    readonly y1: number;
    readonly x2: number;
    readonly y2: number;
    readonly x: number;
    readonly y: number;
  }
  | {
    readonly kind: "quadratic";
    readonly x1: number;
    readonly y1: number;
    readonly x: number;
    readonly y: number;
  }
  | {
    readonly kind: "arc";
    readonly radiusX: number;
    readonly radiusY: number;
    /** In degrees. */
    readonly rotation: number;
    readonly isLarge: boolean;
    readonly isSweep: boolean;
    readonly x: number;
    readonly y: number;
  }
  | {
    readonly kind: "close";
  };

interface Point {
  readonly x: number;
  readonly y: number;
}

// Where the pen is, where the figure began, and the control points `S` and `T` reflect.
interface Pen {
  current: Point;
  start: Point;
  cubic: Point | null;
  quadratic: Point | null;
}

const CUBIC_COUNT = 6;
const QUADRATIC_COUNT = 4;
const ARC_COUNT = 7;
const ARC_FLAG_FIRST = 3;
const ARC_FLAG_SECOND = 4;
const NUMBER = /[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/iuy;
const SEPARATORS = /[\s,]*/uy;
const FLAG = /[01]/uy;
const COMMAND_LETTERS = "mlhvcsqtaz";
// How many numbers one repetition of a command takes.
const ARITY = new Map([
  ["m", 2],
  ["l", 2],
  ["h", 1],
  ["v", 1],
  ["c", CUBIC_COUNT],
  ["s", QUADRATIC_COUNT],
  ["q", QUADRATIC_COUNT],
  ["t", 2],
  ["a", ARC_COUNT],
  ["z", 0]
]);
const ORIGIN: Point = {
  x: 0,
  y: 0
};

class Scanner {
  position = 0;
  private readonly text: string;

  constructor(text: string) {
    this.text = text;
  }

  get isDone() {
    this.match(SEPARATORS);
    return this.position >= this.text.length;
  }

  peekCommand() {
    this.match(SEPARATORS);
    const letter = this.text.charAt(this.position);
    const isCommand = letter !== "" && COMMAND_LETTERS.includes(letter.toLowerCase());
    return isCommand ? letter : null;
  }

  take() {
    return this.text.charAt(this.position++);
  }

  number() {
    this.match(SEPARATORS);
    const text = this.match(NUMBER);
    return text === null ? null : Number(text);
  }

  flag() {
    this.match(SEPARATORS);
    const text = this.match(FLAG);
    return text === null ? null : Number(text);
  }

  private match(pattern: RegExp) {
    pattern.lastIndex = this.position;
    const found = pattern.exec(this.text);
    const isMissing = found === null;
    if (isMissing) {
      return null;
    }

    this.position = pattern.lastIndex;
    return found[0];
  }
}

function readArguments({ scanner, letter }: {
  scanner: Scanner;
  letter: string;
}) {
  const count = ARITY.get(letter.toLowerCase()) ?? 0;
  const isArc = letter.toLowerCase() === "a";
  const values: number[] = [];
  for (let iArgument = 0; iArgument < count; iArgument++) {
    const isFlag = isArc && (iArgument === ARC_FLAG_FIRST || iArgument === ARC_FLAG_SECOND);
    const value = isFlag ? scanner.flag() : scanner.number();
    const isMissing = value === null;
    if (isMissing) {
      return null;
    }

    values.push(value);
  }

  return values;
}

function reflected({ control, around }: {
  control: Point | null;
  around: Point;
}) {
  return control === null ? around : {
    x: 2 * around.x - control.x,
    y: 2 * around.y - control.y
  };
}

// One repetition of a command: its numbers, and what they are measured from.
interface Step {
  pen: Pen;
  values: readonly number[];
  origin: Point;
  isRelative: boolean;
}

function lineTo({ pen, values: [x = 0, y = 0], origin }: Step) {
  pen.current = {
    x: origin.x + x,
    y: origin.y + y
  };
  return {
    kind: "line",
    ...pen.current
  } as const;
}

function moveTo(step: Step) {
  const command = lineTo(step);
  step.pen.start = step.pen.current;
  return {
    ...command,
    kind: "move"
  } as const;
}

function horizontalTo({ pen, values: [x = 0], origin }: Step) {
  pen.current = {
    x: origin.x + x,
    y: pen.current.y
  };
  return {
    kind: "line",
    ...pen.current
  } as const;
}

function verticalTo({ pen, values: [y = 0], isRelative }: Step) {
  pen.current = {
    x: pen.current.x,
    y: (isRelative ? pen.current.y : 0) + y
  };
  return {
    kind: "line",
    ...pen.current
  } as const;
}

function cubicTo({ pen, values: [x1 = 0, y1 = 0, x2 = 0, y2 = 0, x = 0, y = 0], origin }: Step) {
  const second = {
    x: origin.x + x2,
    y: origin.y + y2
  };
  pen.cubic = second;
  pen.current = {
    x: origin.x + x,
    y: origin.y + y
  };
  return {
    kind: "cubic",
    x1: origin.x + x1,
    y1: origin.y + y1,
    x2: second.x,
    y2: second.y,
    ...pen.current
  } as const;
}

function smoothCubicTo({ pen, values: [x2 = 0, y2 = 0, x = 0, y = 0], origin }: Step) {
  const first = reflected({
    control: pen.cubic,
    around: pen.current
  });
  const second = {
    x: origin.x + x2,
    y: origin.y + y2
  };
  pen.cubic = second;
  pen.current = {
    x: origin.x + x,
    y: origin.y + y
  };
  return {
    kind: "cubic",
    x1: first.x,
    y1: first.y,
    x2: second.x,
    y2: second.y,
    ...pen.current
  } as const;
}

function quadraticTo({ pen, values: [x1 = 0, y1 = 0, x = 0, y = 0], origin }: Step) {
  const control = {
    x: origin.x + x1,
    y: origin.y + y1
  };
  pen.quadratic = control;
  pen.current = {
    x: origin.x + x,
    y: origin.y + y
  };
  return {
    kind: "quadratic",
    x1: control.x,
    y1: control.y,
    ...pen.current
  } as const;
}

function smoothQuadraticTo({ pen, values: [x = 0, y = 0], origin }: Step) {
  const control = reflected({
    control: pen.quadratic,
    around: pen.current
  });
  pen.quadratic = control;
  pen.current = {
    x: origin.x + x,
    y: origin.y + y
  };
  return {
    kind: "quadratic",
    x1: control.x,
    y1: control.y,
    ...pen.current
  } as const;
}

function arcTo({ pen, values, origin }: Step) {
  const [radiusX = 0, radiusY = 0, rotation = 0, large = 0, sweep = 0, x = 0, y = 0] = values;
  pen.current = {
    x: origin.x + x,
    y: origin.y + y
  };
  return {
    kind: "arc",
    radiusX,
    radiusY,
    rotation,
    isLarge: large === 1,
    isSweep: sweep === 1,
    ...pen.current
  } as const;
}

const DRAWERS = new Map<string, (step: Step) => PathCommand>([
  ["m", moveTo],
  ["l", lineTo],
  ["h", horizontalTo],
  ["v", verticalTo],
  ["c", cubicTo],
  ["s", smoothCubicTo],
  ["q", quadraticTo],
  ["t", smoothQuadraticTo],
  ["a", arcTo]
]);
const CUBIC_LETTERS = "cs";
const QUADRATIC_LETTERS = "qt";

function failure(reason: string) {
  return {
    isValid: false,
    reason
  } as const;
}

// What `S` and `T` may reflect: the control point of the command just drawn, when it was of their family.
function keepReflection({ pen, letter }: {
  pen: Pen;
  letter: string;
}) {
  const isCubic = CUBIC_LETTERS.includes(letter.toLowerCase());
  const isQuadratic = QUADRATIC_LETTERS.includes(letter.toLowerCase());
  pen.cubic = isCubic ? pen.cubic : null;
  pen.quadratic = isQuadratic ? pen.quadratic : null;
}

/**
 * Reads SVG path data into absolute commands. The data must start with a move;
 * a number list after `M` is lines (as SVG says), and a repeated command may
 * drop its letter. `isValid` is false, with a `reason`, for anything else.
 */
export function parsePathData(text: string) {
  const scanner = new Scanner(text);
  const commands: PathCommand[] = [];
  const pen: Pen = {
    current: ORIGIN,
    start: ORIGIN,
    cubic: null,
    quadratic: null
  };
  let letter = "";
  while (!scanner.isDone) {
    const next = scanner.peekCommand();
    const isNewCommand = next !== null;
    if (isNewCommand) {
      letter = scanner.take();
    }

    const isMoveMissing = commands.length === 0 && letter.toLowerCase() !== "m";
    if (isMoveMissing) {
      return failure("path data starts with a move (M)");
    }

    const isClose = letter.toLowerCase() === "z";
    if (isClose) {
      commands.push({ kind: "close" });
      pen.current = pen.start;
      keepReflection({
        pen,
        letter: ""
      });
      letter = "";
      continue;
    }

    const values = readArguments({
      scanner,
      letter
    });
    const draw = DRAWERS.get(letter.toLowerCase());
    const isUnreadable = values === null || draw === undefined;
    if (isUnreadable) {
      return failure(`expected the numbers of ${letter === "" ? "a command" : letter} at position ${scanner.position}`);
    }

    const isRelative = letter === letter.toLowerCase();
    const command = draw({
      pen,
      values,
      origin: isRelative ? pen.current : ORIGIN,
      isRelative
    });
    keepReflection({
      pen,
      letter
    });
    commands.push(command);
    const isMove = command.kind === "move";
    if (isMove) {
      letter = isRelative ? "l" : "L";
    }
  }

  const isEmpty = commands.length === 0;
  return isEmpty ? failure("path data is empty") : {
    isValid: true,
    commands
  } as const;
}
