import { activateOrLaunch } from "./activate.ts";
import { currentUserSid, openPipe, pipeNameFor } from "./instance-pipe.ts";
import { encodeRedirect } from "./redirect.ts";
import { parseTrayManifestFile, processGuidOf, TRAY_BUNDLE_FILE, TRAY_MANIFEST_FILE } from "#src/tray/tray-manifest.js";
import { readFileSync } from "node:fs";
import path from "node:path";

const KEY_PREFIX = "tray:";

/**
 * The single-instance key of the tray process that `guid` names; the one
 * place it is derived, for the tray that claims it and the app that starts it.
 *
 * @param guid - The `guid` of `defineTray`.
 * @returns The key.
 */
export function trayInstanceKey(guid: string) {
  return `${KEY_PREFIX}${guid}`;
}

/**
 * Claims the right to be the one tray process for `guid` (the first tray's,
 * when the entrypoint defines several): the built `tray.js` calls it first.
 * A second copy finds the first and gets false, and exits.
 * Needs no window or UI thread.
 *
 * @param options - The tray's guid.
 * @returns True when this process is the tray.
 */
export function claimTrayInstance({ guid }: { guid: string }) {
  const pipe = openPipe({
    pipeName: pipeNameFor({
      key: trayInstanceKey(guid),
      sid: currentUserSid()
    }),
    payload: encodeRedirect({
      arguments: [],
      workingDirectory: process.cwd()
    })
  });
  return pipe.isPrimary;
}

/** What `startTray` takes. */
export interface StartTrayOptions {
  /** The built app's folder, where `tray.js` and `tray.json` are; `process.cwd()` by default. */
  readonly directory?: string;

  /** The call that starts or signals; `activateOrLaunch` by default. A test stands in for it. */
  readonly activate?: typeof activateOrLaunch;
}

/**
 * Starts the built `tray.js` as a process of its own, once: when one runs for
 * the same process guid nothing starts. Optional, and never needed by the app's
 * code: an installer, a launcher or the app's own `main` may call it.
 *
 * @param options - The folder of the build.
 * @returns A promise of true when a tray was already running, false when one was started.
 * @throws {Error} When `tray.json` is missing or is not a tray manifest.
 */
export function startTray({ directory = process.cwd(), activate = activateOrLaunch }: StartTrayOptions = {}) {
  const manifest = JSON.parse(readFileSync(path.join(directory, TRAY_MANIFEST_FILE), "utf8"));
  const guid = processGuidOf(parseTrayManifestFile(manifest));
  return activate({
    key: trayInstanceKey(guid),
    activation: {
      arguments: [],
      workingDirectory: directory
    },
    launch: {
      command: process.execPath,
      arguments: [path.join(directory, TRAY_BUNDLE_FILE)],
      workingDirectory: directory
    }
  });
}
