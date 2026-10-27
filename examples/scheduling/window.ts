import { registerHooks } from "node:module";
import { parentPort, receiveMessageOnPort } from "node:worker_threads";
import { svelteHooks } from "winui-svelte/testing";
import { runOnUiThread } from "winui-svelte/thread";

// The UI thread of the scheduling experiment: the package's window start
// (startScheduled, then Application.create), a window holding probe.svelte, and
// three ways to change its state from outside Svelte.

const TIMER_TRIGGER_MILLISECONDS = 1000;
const IDLE_TICK_MILLISECONDS = 400;
const INBOX_MILLISECONDS = 30;
const AFTER_MILLISECONDS = 100;
const MESSAGE_COUNT = 200;
const TIMER_COUNT = 100;

await runOnUiThread(async () => {
  registerHooks(svelteHooks());
  await import("winui-svelte/components");
  const { createWindow, runWindow, startTimer } = await import("winui-svelte/window");
  const { default: Probe } = await import("./Probe.svelte");
  const { probe } = await import("./probe-state.svelte.ts");
  const { look, record, watch } = await import("./watch.ts");

  await runWindow({
    onStart() {
      createWindow({
        component: Probe,
        props: {},
        title: "scheduling-probe",
        isBackground: true
      });
      record("window shown", "");

      // Trigger B: a DispatcherQueue timer callback.
      startTimer({
        milliseconds: TIMER_TRIGGER_MILLISECONDS,
        isRepeating: false,
        onTick() {
          probe.count = TIMER_COUNT;
          watch("timer");
          startTimer({
            milliseconds: AFTER_MILLISECONDS,
            isRepeating: false,
            onTick: () => look("timer: +100ms (new timer)")
          });
        }
      });

      // Trigger C: a message from the host, taken off the port by a timer.
      startTimer({
        milliseconds: INBOX_MILLISECONDS,
        onTick() {
          const received = parentPort === null ? undefined : receiveMessageOnPort(parentPort);
          if (received !== undefined) {
            probe.count = MESSAGE_COUNT;
            watch("host message");
          }
        }
      });

      // What is on screen when nothing of ours is running.
      startTimer({
        milliseconds: IDLE_TICK_MILLISECONDS,
        onTick: () => look("idle tick")
      });
    }
  });
});
