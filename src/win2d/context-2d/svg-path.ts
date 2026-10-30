import type { Path2D } from "./path.ts";
import type { Vector2 } from "#winui/microsoft/graphics/canvas/CanvasDrawingSession";

// The `d` attribute of an SVG <path>, read into Path2D calls. Like SVG, it
// draws what precedes an error and stops there.

const NUMBER = /[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/iuy;
const SEPARATORS = /[\s,]*/uy;
const COMMANDS = "MmLlHhVvCcSsQqTtAaZz";
const ARC_FLAGS = "01";
const DEGREES_PER_HALF_TURN = 180;
const HALF_TURN = Math.PI;
const LINE_ARGUMENTS = 2;
const SINGLE_ARGUMENTS = 1;
const SMOOTH_ARGUMENTS = 4;
const CUBIC_ARGUMENTS = 6;
const ARC_ARGUMENTS = 7;
const ARC_LARGE_FLAG = 3;
const ARC_SWEEP_FLAG = 4;
const ARC_END = 5;
// After a moveto, the pairs that follow are linetos.
const IMPLICIT_LINES = new Map<string, string>([
  ["M", "L"],
  ["m", "l"]
]);

/** Where the pen is, and what the last command left for a smooth one to reflect. */
interface Pen {
  current: Vector2;
  start: Vector2;
  previousControl: Vector2 | undefined;
  previousCommand: string;
}

/** What a command is run with: the numbers read, as absolute points when the command was relative. */
interface Step {
  path: Path2D;
  pen: Pen;
  args: number[];
  isRelative: boolean;
}

/** What a command does: it draws, then says where the pen is and which control point a smooth curve may reflect. */
interface Outcome {
  end: Vector2;
  control?: Vector2;
}

class Scanner {
  private position = 0;
  private readonly text: string;

  constructor(text: string) {
    this.text = text;
  }

  skipSeparators() {
    SEPARATORS.lastIndex = this.position;
    SEPARATORS.exec(this.text);
    this.position = SEPARATORS.lastIndex;
  }

  get isDone() {
    return this.position >= this.text.length;
  }

  nextCommand() {
    const letter = this.text.charAt(this.position);
    const isCommand = letter !== "" && COMMANDS.includes(letter);
    if (isCommand) {
      this.position++;
    }

    return isCommand ? letter : undefined;
  }

  number() {
    this.skipSeparators();
    NUMBER.lastIndex = this.position;
    const match = NUMBER.exec(this.text);
    const isNumber = match !== null;
    if (!isNumber) {
      return undefined;
    }

    this.position = NUMBER.lastIndex;
    return Number(match[0]);
  }

  flag() {
    this.skipSeparators();
    const letter = this.text.charAt(this.position);
    const isFlag = letter !== "" && ARC_FLAGS.includes(letter);
    if (isFlag) {
      this.position++;
    }

    return isFlag ? Number(letter) : undefined;
  }
}

function pointsOf({ args, pen, isRelative }: Pick<Step, "args" | "pen" | "isRelative">) {
  const points: Vector2[] = [];
  for (let i = 0; i + 1 < args.length; i += LINE_ARGUMENTS) {
    points.push({
      x: (args[i] ?? 0) + (isRelative ? pen.current.x : 0),
      y: (args[i + 1] ?? 0) + (isRelative ? pen.current.y : 0)
    });
  }

  return points;
}

function reflected({ pen, kinds }: {
  pen: Pen;
  kinds: string;
}) {
  const control = pen.previousControl;
  const isChained = control !== undefined && kinds.includes(pen.previousCommand.toLowerCase());
  return isChained ? {
    x: 2 * pen.current.x - control.x,
    y: 2 * pen.current.y - control.y
  } : pen.current;
}

function moveTo(step: Step) {
  const [end = step.pen.current] = pointsOf(step);
  step.path.moveTo(end.x, end.y);
  step.pen.start = end;
  return { end } satisfies Outcome;
}

function lineTo(step: Step) {
  const [end = step.pen.current] = pointsOf(step);
  step.path.lineTo(end.x, end.y);
  return { end } satisfies Outcome;
}

function horizontalTo(step: Step) {
  const [value = 0] = step.args;
  const end = {
    x: value + (step.isRelative ? step.pen.current.x : 0),
    y: step.pen.current.y
  };
  step.path.lineTo(end.x, end.y);
  return { end } satisfies Outcome;
}

function verticalTo(step: Step) {
  const [value = 0] = step.args;
  const end = {
    x: step.pen.current.x,
    y: value + (step.isRelative ? step.pen.current.y : 0)
  };
  step.path.lineTo(end.x, end.y);
  return { end } satisfies Outcome;
}

function cubicTo(step: Step) {
  const [first = step.pen.current, control = step.pen.current, end = step.pen.current] = pointsOf(step);
  step.path.bezierCurveTo(first.x, first.y, control.x, control.y, end.x, end.y);
  return {
    end,
    control
  } satisfies Outcome;
}

function smoothCubicTo(step: Step) {
  const first = reflected({
    pen: step.pen,
    kinds: "cs"
  });
  const [control = step.pen.current, end = step.pen.current] = pointsOf(step);
  step.path.bezierCurveTo(first.x, first.y, control.x, control.y, end.x, end.y);
  return {
    end,
    control
  } satisfies Outcome;
}

function quadraticTo(step: Step) {
  const [control = step.pen.current, end = step.pen.current] = pointsOf(step);
  step.path.quadraticCurveTo(control.x, control.y, end.x, end.y);
  return {
    end,
    control
  } satisfies Outcome;
}

function smoothQuadraticTo(step: Step) {
  const control = reflected({
    pen: step.pen,
    kinds: "qt"
  });
  const [end = step.pen.current] = pointsOf(step);
  step.path.quadraticCurveTo(control.x, control.y, end.x, end.y);
  return {
    end,
    control
  } satisfies Outcome;
}

// The endpoint form of an SVG arc, as the center form of an ellipse (SVG 1.1, F.6.5).
function arcTo(step: Step) {
  const [rawRadiusX = 0, rawRadiusY = 0, degrees = 0, isLarge = 0, isSweep = 0] = step.args;
  const [end = step.pen.current] = pointsOf({
    ...step,
    args: step.args.slice(ARC_END)
  });
  const from = step.pen.current;
  const radiusInputX = Math.abs(rawRadiusX);
  const radiusInputY = Math.abs(rawRadiusY);
  const isSamePoint = from.x === end.x && from.y === end.y;
  const isDegenerate = radiusInputX === 0 || radiusInputY === 0 || isSamePoint;
  if (isDegenerate) {
    step.path.lineTo(end.x, end.y);
    return { end } satisfies Outcome;
  }

  const rotation = degrees * HALF_TURN / DEGREES_PER_HALF_TURN;
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  const halfX = (from.x - end.x) / 2;
  const halfY = (from.y - end.y) / 2;
  const rotatedX = cosine * halfX + sine * halfY;
  const rotatedY = -sine * halfX + cosine * halfY;
  const growth = Math.max(1, Math.sqrt(rotatedX ** 2 / radiusInputX ** 2 + rotatedY ** 2 / radiusInputY ** 2));
  const radiusX = radiusInputX * growth;
  const radiusY = radiusInputY * growth;
  const numerator = radiusX ** 2 * radiusY ** 2 - radiusX ** 2 * rotatedY ** 2 - radiusY ** 2 * rotatedX ** 2;
  const denominator = radiusX ** 2 * rotatedY ** 2 + radiusY ** 2 * rotatedX ** 2;
  const sign = isLarge === isSweep ? -1 : 1;
  const factor = sign * Math.sqrt(Math.max(0, numerator / denominator));
  const centerPrimeX = factor * radiusX * rotatedY / radiusY;
  const centerPrimeY = -factor * radiusY * rotatedX / radiusX;
  const centerX = cosine * centerPrimeX - sine * centerPrimeY + (from.x + end.x) / 2;
  const centerY = sine * centerPrimeX + cosine * centerPrimeY + (from.y + end.y) / 2;
  const startAngle = Math.atan2((rotatedY - centerPrimeY) / radiusY, (rotatedX - centerPrimeX) / radiusX);
  const endAngle = Math.atan2((-rotatedY - centerPrimeY) / radiusY, (-rotatedX - centerPrimeX) / radiusX);
  const sweepAngle = endAngle - startAngle;
  const isSweepingBackwards = isSweep === 0 && sweepAngle > 0;
  const isSweepingForwards = isSweep === 1 && sweepAngle < 0;
  let sweep = sweepAngle;
  if (isSweepingBackwards) {
    sweep -= 2 * HALF_TURN;
  } else if (isSweepingForwards) {
    sweep += 2 * HALF_TURN;
  }

  step.path.ellipse(centerX, centerY, radiusX, radiusY, rotation, startAngle, startAngle + sweep, sweep < 0);
  return { end } satisfies Outcome;
}

/** Each command by its lowercase letter: how many numbers it reads, and what it does. */
const COMMAND_TABLE = new Map<string, {
  count: number;
  run: (step: Step) => Outcome;
}>([
  ["m", {
    count: LINE_ARGUMENTS,
    run: moveTo
  }],
  ["l", {
    count: LINE_ARGUMENTS,
    run: lineTo
  }],
  ["h", {
    count: SINGLE_ARGUMENTS,
    run: horizontalTo
  }],
  ["v", {
    count: SINGLE_ARGUMENTS,
    run: verticalTo
  }],
  ["c", {
    count: CUBIC_ARGUMENTS,
    run: cubicTo
  }],
  ["s", {
    count: SMOOTH_ARGUMENTS,
    run: smoothCubicTo
  }],
  ["q", {
    count: SMOOTH_ARGUMENTS,
    run: quadraticTo
  }],
  ["t", {
    count: LINE_ARGUMENTS,
    run: smoothQuadraticTo
  }],
  ["a", {
    count: ARC_ARGUMENTS,
    run: arcTo
  }]
]);

function readArguments({ scanner, command }: {
  scanner: Scanner;
  command: string;
}) {
  const count = COMMAND_TABLE.get(command.toLowerCase())?.count ?? 0;
  const args: number[] = [];
  for (let i = 0; i < count; i++) {
    const isArcFlag = command.toLowerCase() === "a" && (i === ARC_LARGE_FLAG || i === ARC_SWEEP_FLAG);
    const value = isArcFlag ? scanner.flag() : scanner.number();
    const isMissing = value === undefined;
    if (isMissing) {
      return undefined;
    }

    args.push(value);
  }

  return args;
}

/** Adds the steps an SVG path string describes to a path. */
export function appendSvgPath({ path, data }: {
  path: Path2D;
  data: string;
}) {
  const scanner = new Scanner(data);
  const origin = {
    x: 0,
    y: 0
  };
  const pen: Pen = {
    current: origin,
    start: origin,
    previousControl: undefined,
    previousCommand: ""
  };
  let command = "";
  scanner.skipSeparators();
  while (!scanner.isDone) {
    command = scanner.nextCommand() ?? command;
    const isMissingCommand = command === "";
    if (isMissingCommand) {
      return;
    }

    const isClose = command.toLowerCase() === "z";
    if (isClose) {
      path.closePath();
      pen.current = pen.start;
      pen.previousControl = undefined;
      pen.previousCommand = command;
      scanner.skipSeparators();
      continue;
    }

    const args = readArguments({
      scanner,
      command
    });
    const isTruncated = args === undefined;
    if (isTruncated) {
      return;
    }

    const outcome = COMMAND_TABLE.get(command.toLowerCase())?.run({
      path,
      pen,
      args,
      isRelative: command !== command.toUpperCase()
    });
    pen.current = outcome?.end ?? pen.current;
    pen.previousControl = outcome?.control;
    pen.previousCommand = command;
    command = IMPLICIT_LINES.get(command) ?? command;
    scanner.skipSeparators();
  }
}
