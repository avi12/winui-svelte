import { appendFileSync } from "node:fs";

// What the experiment saw, one line per observation, written with a plain
// synchronous append because a worker's stdout waits for the thread that
// WinUI is holding.
const LOG_PATH = process.env["SCHEDULING_LOG"] ?? "scheduling.log";
const CLOCK_START = performance.now();
const TIME_WIDTH = 6;
const LABEL_WIDTH = 28;
let readText = readNothing;

function readNothing() {
  return "";
}

export function record({ label, text }: {
  label: string;
  text: string;
}) {
  const elapsed = (performance.now() - CLOCK_START).toFixed(0).padStart(TIME_WIDTH);
  appendFileSync(LOG_PATH, `${elapsed}ms  ${label.padEnd(LABEL_WIDTH)} ${text}\n`);
}

// What the observed control shows right now.
export function observe(read: () => string) {
  readText = read;
}

export function look(label: string) {
  record({
    label,
    text: readText()
  });
}

// Called right after a state change made by `trigger`: records the control's
// text now, after the next microtask, and after a promise continuation.
export function watch(trigger: string) {
  record({
    label: `${trigger}: sync`,
    text: readText()
  });
  queueMicrotask(() => record({
    label: `${trigger}: queueMicrotask`,
    text: readText()
  }));
  void Promise.resolve().then(() => record({
    label: `${trigger}: promise.then`,
    text: readText()
  }));
}
