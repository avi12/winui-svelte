import {
  clear,
  drawBitmap,
  drawCircle,
  drawEllipse,
  drawGeometry,
  drawImage,
  drawLine,
  drawRectangle,
  drawText,
  fillCircle,
  fillEllipse,
  fillGeometry,
  fillRectangle,
  fillRoundedRectangle,
  setTransform
} from "./draw.ts";
import { multiply } from "./matrix.ts";
import type { Color, Matrix3x2 } from "#winui/microsoft/graphics/canvas/CanvasDrawingSession";
import type { CanvasDrawingSession } from "#winui/microsoft/graphics/canvas/CanvasDrawingSession";

/** One drawing step, ready to run on a session. */
export type Command = (session: CanvasDrawingSession) => void;

// What a draw function of draw.ts takes besides the session.
type Options<Draw extends (options: never) => unknown> = Omit<Parameters<Draw>[0], "session">;

/**
 * The drawing calls of draw.ts without the session: each call hands a command
 * to `run`, which either runs it on a session at once (drawingPainter) or
 * keeps it to run on every redraw (Recording).
 */
export class Painter {
  private readonly run: (command: Command) => void;

  constructor(run: (command: Command) => void) {
    this.run = run;
  }

  /** Clears the whole surface with a color. */
  clear(options: { color: Color }) {
    this.run(session => clear({
      session,
      ...options
    }));
  }

  /** Fills a rectangle. */
  fillRectangle(options: Options<typeof fillRectangle>) {
    this.run(session => fillRectangle({
      session,
      ...options
    }));
  }

  /** Strokes the outline of a rectangle. */
  drawRectangle(options: Options<typeof drawRectangle>) {
    this.run(session => drawRectangle({
      session,
      ...options
    }));
  }

  /** Fills a rectangle with rounded corners. */
  fillRoundedRectangle(options: Options<typeof fillRoundedRectangle>) {
    this.run(session => fillRoundedRectangle({
      session,
      ...options
    }));
  }

  /** Fills an ellipse around its center. */
  fillEllipse(options: Options<typeof fillEllipse>) {
    this.run(session => fillEllipse({
      session,
      ...options
    }));
  }

  /** Strokes the outline of an ellipse around its center. */
  drawEllipse(options: Options<typeof drawEllipse>) {
    this.run(session => drawEllipse({
      session,
      ...options
    }));
  }

  /** Fills a circle around its center. */
  fillCircle(options: Options<typeof fillCircle>) {
    this.run(session => fillCircle({
      session,
      ...options
    }));
  }

  /** Strokes the outline of a circle around its center. */
  drawCircle(options: Options<typeof drawCircle>) {
    this.run(session => drawCircle({
      session,
      ...options
    }));
  }

  /** Draws a line between two points. */
  drawLine(options: Options<typeof drawLine>) {
    this.run(session => drawLine({
      session,
      ...options
    }));
  }

  /** Draws a text, in a box when a width and a height are given. */
  drawText(options: Options<typeof drawText>) {
    this.run(session => drawText({
      session,
      ...options
    }));
  }

  /** Fills a geometry. */
  fillGeometry(options: Options<typeof fillGeometry>) {
    this.run(session => fillGeometry({
      session,
      ...options
    }));
  }

  /** Strokes the outline of a geometry. */
  drawGeometry(options: Options<typeof drawGeometry>) {
    this.run(session => drawGeometry({
      session,
      ...options
    }));
  }

  /** Draws an image (a bitmap, an effect or a command list) with its corner at a point. */
  drawImage(options: Options<typeof drawImage>) {
    this.run(session => drawImage({
      session,
      ...options
    }));
  }

  /** Draws a bitmap stretched to a rectangle. */
  drawBitmap(options: Options<typeof drawBitmap>) {
    this.run(session => drawBitmap({
      session,
      ...options
    }));
  }

  /**
   * Runs `draw` with `matrix` applied before the transform already in force,
   * and puts that transform back after.
   */
  transformed({ matrix, draw }: {
    matrix: Matrix3x2;
    draw: (painter: Painter) => void;
  }) {
    let previous: Matrix3x2 | undefined;
    this.run(session => {
      previous = setTransform({
        session,
        matrix: multiply({
          first: matrix,
          then: session.transform
        })
      });
    });
    draw(this);
    this.run(session => {
      if (previous !== undefined) {
        setTransform({
          session,
          matrix: previous
        });
      }
    });
  }
}

/** A painter that draws on the session at once. */
export function drawingPainter(session: CanvasDrawingSession) {
  return new Painter(command => command(session));
}

/**
 * Draw calls kept to run again: a draw function that reads reactive state runs
 * inside an `$effect` against a recording, so the effect tracks what it reads,
 * and each Draw event of the control replays the commands on its session.
 */
export class Recording {
  private commands: Command[] = [];
  readonly painter = new Painter(command => {
    this.commands.push(command);
  });

  /** Forgets the commands, for the next run of the draw function. */
  reset() {
    this.commands = [];
  }

  /** Runs every command on the session. */
  replay(session: CanvasDrawingSession) {
    for (const command of this.commands) {
      command(session);
    }
  }
}
