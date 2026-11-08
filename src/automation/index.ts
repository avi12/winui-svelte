export { withUiaClient } from "./with-client.ts";
export { HEADING_LEVEL_FIRST, HEADING_LEVEL_NONE, UiaControlType, UiaPatternName, UiaPropertyId } from "./ids.ts";
export { UiaElementUnavailableError } from "./backend.ts";
export type { UiaChild, UiaProperties } from "./backend.ts";
export { UiaScopeEndedError, UiaTimeout, UiaWalkEnd } from "./client.ts";
export type {
  UiaClient,
  UiaElement,
  UiaNode,
  UiaPatterns,
  UiaTextPattern,
  UiaTextRange,
  UiaValuePattern,
  UiaWalk,
  UiaWalkOptions
} from "./client.ts";

export { readWindowText, TextBlockKind, UIA_CHROME_CONTROL_TYPES } from "./text.ts";
export type { ReadWindowTextOptions, TextBlock, WindowText } from "./text.ts";
export { createUiaWorker } from "./worker.ts";
export type { UiaReadRequest, UiaWorker, UiaWorkerHandle } from "./worker.ts";
export { UiaTarget } from "./worker-job.ts";
export type { UiaTargetSpec } from "./worker-job.ts";
