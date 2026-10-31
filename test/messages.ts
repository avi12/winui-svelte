import { jsonSchema } from "#src/messaging/json.js";
import { spawnSync } from "node:child_process";
import path from "node:path";

// What a test does to an example's window the way the keyboard does, by
// posting window messages to that window's content
// (examples/harness/post-messages.ps1): only the process the test started is
// written to, and nothing goes to the system's input.

const SCRIPT = path.join(import.meta.dirname, "..", "examples", "harness", "post-messages.ps1");
const POST_TIMEOUT_MILLISECONDS = 60_000;

/**
 * Posts the steps (see post-messages.ps1 for the vocabulary, separated by
 * `;`) to the window of the process `pid`, and returns what the script
 * reported.
 */
export function post({ pid, steps }: {
  pid: number;
  steps: string;
}) {
  const result = spawnSync("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    SCRIPT,
    "-ProcessId",
    String(pid),
    "-Steps",
    steps
  ], {
    encoding: "utf8",
    timeout: POST_TIMEOUT_MILLISECONDS
  });
  const isFailed = result.status !== 0;
  if (isFailed) {
    throw new Error(`post ${steps} failed: ${result.stderr.trim() || result.stdout.trim()}`);
  }

  return jsonSchema.parse(JSON.parse(result.stdout));
}
