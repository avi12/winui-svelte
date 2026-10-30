import type { DataTransfer } from "./data-transfer.ts";
import { DragDropModifiers } from "#winui/windows/application-model/data-transfer/drag-drop/DragDropModifiers";

/** The part of WinUI's `DragUIOverride` the event drives. */
export interface DragFeedback {
  caption: string;
  isCaptionVisible: boolean;
  isGlyphVisible: boolean;
  isContentVisible: boolean;
}

/** A point in device-independent pixels. */
export interface Position {
  x: number;
  y: number;
}

/** What a `DragEvent` is made from. */
export interface DragEventInit {
  type: string;
  /** The control the event is about. */
  target: object;
  dataTransfer: DataTransfer;
  /** Relative to the window's content. */
  client: Position;
  /** Relative to the control. */
  offset: Position;
  /** The `DragDropModifiers` flags. */
  modifiers: number;
  /** WinUI's drag visual, when the event has one to drive. */
  feedback?: DragFeedback;
}

/**
 * The event of a drag, shaped like the web's `DragEvent`: `dataTransfer`,
 * `clientX` and `clientY`, `offsetX` and `offsetY`, the modifier keys,
 * `preventDefault()` (a target calls it in `ondragenter` and `ondragover` to
 * accept, a source in `ondragstart` to cancel) and `stopPropagation()`.
 */
export class DragEvent {
  readonly type: string;
  readonly target: object;
  readonly currentTarget: object;
  /** Always null: WinUI does not say where the drag came from. */
  readonly relatedTarget = null;
  readonly dataTransfer: DataTransfer;
  readonly clientX: number;
  readonly clientY: number;
  readonly offsetX: number;
  readonly offsetY: number;
  // eslint-disable-next-line @typescript-eslint/naming-convention -- the web's DragEvent member
  readonly altKey: boolean;
  // eslint-disable-next-line @typescript-eslint/naming-convention -- the web's DragEvent member
  readonly ctrlKey: boolean;
  // eslint-disable-next-line @typescript-eslint/naming-convention -- the web's DragEvent member
  readonly shiftKey: boolean;
  private isDefaultPrevented = false;
  private isPropagationStopped = false;
  private readonly feedback: DragFeedback | undefined;

  constructor(init: DragEventInit) {
    this.type = init.type;
    this.target = init.target;
    this.currentTarget = init.target;
    this.dataTransfer = init.dataTransfer;
    this.clientX = init.client.x;
    this.clientY = init.client.y;
    this.offsetX = init.offset.x;
    this.offsetY = init.offset.y;
    this.altKey = (init.modifiers & DragDropModifiers.Alt) !== 0;
    this.ctrlKey = (init.modifiers & DragDropModifiers.Control) !== 0;
    this.shiftKey = (init.modifiers & DragDropModifiers.Shift) !== 0;
    this.feedback = init.feedback;
  }

  /** True once a handler called `preventDefault()`. */
  get defaultPrevented() {
    return this.isDefaultPrevented;
  }

  /** True once a handler called `stopPropagation()`. */
  get isStopped() {
    return this.isPropagationStopped;
  }

  /** On a target's `dragenter` and `dragover`: accept the drop. On a source's `dragstart`: cancel the drag. */
  preventDefault() {
    this.isDefaultPrevented = true;
  }

  /** Keeps the event from reaching the drop targets above this one. */
  stopPropagation() {
    this.isPropagationStopped = true;
  }

  /**
   * Changes what the system draws beside the cursor while the drag is over a
   * target (WinUI's drag visual): a caption such as "Copy to Pictures", and
   * whether the glyph (the copy or move icon) and the dragged content show.
   * Does nothing in events that have no drag visual.
   */
  setFeedback(options: {
    caption?: string;
    isGlyphVisible?: boolean;
    isContentVisible?: boolean;
  }) {
    const { feedback } = this;
    if (!feedback) {
      return;
    }

    const { caption } = options;
    const hasCaption = caption !== undefined;
    if (hasCaption) {
      feedback.caption = caption;
      feedback.isCaptionVisible = true;
    }

    feedback.isGlyphVisible = options.isGlyphVisible ?? feedback.isGlyphVisible;
    feedback.isContentVisible = options.isContentVisible ?? feedback.isContentVisible;
  }
}

/** A handler written as `ondragover={...}` or given to `dropzone`. */
export type DragEventHandler = (event: DragEvent) => unknown;
