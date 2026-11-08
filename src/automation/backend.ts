import type { UiaControlType } from "./ids.ts";

/** An element, or a text range, inside the scope of one `withUiaClient` call. */
export type UiaHandle = number;

/** The properties of an element, read in one cross-process call. */
export interface UiaProperties {
  readonly name: string;
  readonly className: string;
  readonly automationId: string;
  readonly controlType: UiaControlType;
  readonly processId: number;
  readonly isOffscreen: boolean;
  readonly boundingRectangle: {
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly height: number;
  };

  /** 1 to 9 for a heading, 0 for an element that is not one. */
  readonly headingLevel: number;
  readonly hasTextPattern: boolean;
  readonly hasValuePattern: boolean;
}

/** A child found by the walk: its handle and its properties. */
export interface UiaChild {
  readonly handle: UiaHandle;
  readonly properties: UiaProperties;
}

/**
 * The calls the client makes of UI Automation, over opaque handles. The real
 * one is `createUiaNativeBackend`; a test passes a fake. Every handle lives
 * until `dispose`.
 */
export interface UiaBackend {
  elementFromHandle(hwnd: bigint): UiaHandle | null;
  focusedElement(): UiaHandle | null;
  properties(handle: UiaHandle): UiaProperties;
  children(handle: UiaHandle): readonly UiaChild[];
  visibleRanges(handle: UiaHandle): readonly UiaHandle[] | null;
  documentRange(handle: UiaHandle): UiaHandle | null;
  rangeText(options: {
    readonly range: UiaHandle;
    readonly maxLength: number;
  }): string;
  value(handle: UiaHandle): string | null;
  dispose(): void;
}

/** The element went away (or never answered) while the client was reading it. */
export class UiaElementUnavailableError extends Error {
  override name = "UiaElementUnavailableError";
}
