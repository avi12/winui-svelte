import { jsonSchema } from "#src/messaging/json.js";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { z } from "zod";

// What a test does to an example's window the way a user does, through UI
// Automation (examples/harness/uia.ps1): the control is found by its
// AutomationId, and what comes back is what the control itself reports.

const SCRIPT = path.join(import.meta.dirname, "..", "examples", "harness", "uia.ps1");
const UIA_TIMEOUT_MILLISECONDS = 60_000;

const stateSchema = z.object({
  name: z.string(),
  enabled: z.boolean(),
  toggle: z.string().optional(),
  range: z.number().optional(),
  value: z.string().optional(),
  selected: z.boolean().optional()
});

/** What `uia.ps1` is asked: the window's process, the action, and its target. */
export interface UiaRequest {
  pid: number;
  action: string;
  id?: string;
  name?: string;
  value?: string;
  item?: string;
}

function run({ pid, action, id = "", name = "", value = "", item = "" }: UiaRequest) {
  const result = spawnSync("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    SCRIPT,
    "-ProcessId",
    String(pid),
    "-Action",
    action,
    "-Id",
    id,
    "-Name",
    name,
    "-Value",
    value,
    "-Item",
    item
  ], {
    encoding: "utf8",
    timeout: UIA_TIMEOUT_MILLISECONDS
  });
  const isFailed = result.status !== 0;
  if (isFailed) {
    throw new Error(`uia ${action} ${id || name} failed: ${result.stderr.trim() || result.stdout.trim()}`);
  }

  const isEmpty = result.stdout.trim() === "";
  return jsonSchema.parse(isEmpty ? [] : JSON.parse(result.stdout));
}

/**
 * Does `action` to a control (invoke, toggle, set-value, set-range, select,
 * select-item, focus) and returns what the control reports after.
 */
export function act(request: UiaRequest) {
  return stateSchema.parse(run(request));
}

/** What a control reports now. */
export function read(request: Omit<UiaRequest, "action">) {
  return act({
    ...request,
    action: "read"
  });
}

/** Whether the window holds a control with this AutomationId. */
export function exists({ pid, id }: {
  pid: number;
  id: string;
}) {
  return run({
    pid,
    id,
    action: "exists"
  }) === true;
}

/**
 * The names of what the window holds, in order, that match `pattern` (a panel
 * is no control to UI Automation, so its children are told apart by name).
 */
export function names({ pid, pattern }: {
  pid: number;
  pattern: RegExp;
}) {
  const found = run({
    pid,
    action: "names"
  });
  const listed = z.union([z.array(z.string()), z.string().transform(single => [single])]).parse(found);
  return listed.filter(name => pattern.test(name));
}

const NOTIFICATIONS_SCRIPT = path.join(import.meta.dirname, "..", "examples", "harness", "uia-notifications.ps1");
const READY_LINE = "ready";

const notificationSchema = z.array(
  z.object({
    kind: z.number(),
    processing: z.number(),
    text: z.string(),
    activityId: z.string()
  })
);

/**
 * Listens on the example's window for UI Automation notifications with this activity id
 * (what Narrator hears from `RaiseNotificationEvent`) for a while. `ready`
 * settles once the listener is subscribed: make the example announce after it.
 */
export function listenForNotifications({ pid, activityId, milliseconds }: {
  pid: number;
  activityId: string;
  milliseconds: number;
}) {
  const child = spawn("powershell.exe", [
    "-MTA",
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    NOTIFICATIONS_SCRIPT,
    "-ProcessId",
    String(pid),
    "-ActivityId",
    activityId,
    "-Milliseconds",
    String(milliseconds)
  ], {
    stdio: ["ignore", "pipe", "pipe"]
  });
  let output = "";
  let errors = "";
  const ready = new Promise<void>(resolve => {
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
      const isReady = output.includes(READY_LINE);
      if (isReady) {
        resolve();
      }
    });
  });
  child.stderr.on("data", (chunk: Buffer) => {
    errors += chunk.toString("utf8");
  });
  const notifications = new Promise<z.infer<typeof notificationSchema>>((resolve, reject) => {
    child.on("close", code => {
      const isFailed = code !== 0;
      if (isFailed) {
        reject(new Error(`uia notifications failed: ${errors.trim() || output.trim()}`));
        return;
      }

      const json = output.slice(output.indexOf(READY_LINE) + READY_LINE.length).trim();
      resolve(notificationSchema.parse(JSON.parse(json)));
    });
  });
  return {
    ready,
    notifications
  };
}
