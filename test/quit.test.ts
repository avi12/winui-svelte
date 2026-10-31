import { IS_WINDOWS_APP_SDK_RESTORED } from "./example-process.ts";
import { buildRelay, RelayProcess } from "./relay-process.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

// A normal quit of a sidecar ends the process with exit code 0 and nothing
// said about a callback: the relay example (a window with a tray icon, Mica,
// the system settings, a file watcher and a MessagePort to the host's stdio)
// quits by the message of a core's quit action, and by its pipes closing,
// where the host calls process.exit while the window still runs. Without the
// exit guard (src/window/host-exit.ts) that second path printed "Cannot invoke
// a callback while the Node environment is closing" and could end with
// 0xC000027B. Skipped where the Windows App SDK was not restored.

const TIMEOUT_MILLISECONDS = 600_000;
const RUNS = 3;
const CALLBACK_ERROR = "Cannot invoke a callback while the Node environment is closing";

const quits = [
  {
    name: "a quit message",
    quit: (relay: RelayProcess) => relay.requestQuit()
  },
  {
    name: "the host's pipes closing (process.exit under a running window)",
    quit: (relay: RelayProcess) => relay.closePipes()
  }
];

for (const { name, quit } of quits) {
  test(`${name} ends the process with exit code 0`, {
    skip: !IS_WINDOWS_APP_SDK_RESTORED,
    timeout: TIMEOUT_MILLISECONDS
  }, async () => {
    const built = await buildRelay();
    try {
      for (let iRun = 0; iRun < RUNS; iRun += 1) {
        const relay = RelayProcess.start(built.outDirectory);
        try {
          await relay.ready;
          quit(relay);
          const exit = await relay.waitForExit();
          assert.equal(exit.code, 0, `run ${iRun} ended with ${exit.code} (${exit.signal})\n${exit.stderr}`);
          assert.ok(!exit.stderr.includes(CALLBACK_ERROR), `run ${iRun}: ${exit.stderr}`);
        } finally {
          relay.kill();
        }
      }
    } finally {
      built.remove();
    }
  });
}
