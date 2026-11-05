import { bind, numberOf, pointerOf, withMemory } from "#src/win32-calls.js";

// Windows.UI.Composition.Compositor (the system's, which the transparent
// backdrop needs) refuses to be created on a thread with no
// Windows.System.DispatcherQueue (0x80070005). WinUI's own queue
// (Microsoft.UI.Dispatching, made by xaml-thread.ts) is another class, and
// nothing else gives this thread the system one: a window opened right at
// startup has none yet. CreateDispatcherQueueController of CoreMessaging.dll
// makes it, as Microsoft's own MicaController samples do.

const OPTIONS_BYTES = 12;
const POINTER_BYTES = 8;
const ALIGNMENT = 8;
const THREAD_CURRENT = 2;
const APARTMENT_NONE = 0;
const THREAD_TYPE_OFFSET = 4;
const APARTMENT_TYPE_OFFSET = 8;

const createDispatcherQueueController = bind({
  dll: "coremessaging.dll",
  entryPoint: "CreateDispatcherQueueController",
  parameters: ["pointer", "pointer"],
  returnType: "i32"
});

let isEnsured = false;

/**
 * Gives the calling thread a `Windows.System.DispatcherQueue` if it has none.
 * The controller is kept for the life of the thread (the process ends with
 * it), so a second call, or a thread that already has a queue, changes nothing.
 */
export function ensureSystemDispatcherQueue() {
  if (isEnsured) {
    return;
  }

  isEnsured = true;
  withMemory({
    size: OPTIONS_BYTES,
    alignment: ALIGNMENT,
    use(options) {
      const bytes = Buffer.alloc(OPTIONS_BYTES);
      bytes.writeUInt32LE(OPTIONS_BYTES, 0);
      bytes.writeInt32LE(THREAD_CURRENT, THREAD_TYPE_OFFSET);
      bytes.writeInt32LE(APARTMENT_NONE, APARTMENT_TYPE_OFFSET);
      options.writeBytes(0, bytes);
      return withMemory({
        size: POINTER_BYTES,
        alignment: ALIGNMENT,
        use(controller) {
          // A thread that already has a queue answers with an error and keeps
          // the one it has; either way the compositor is the next call's to
          // report on.
          const call = createDispatcherQueueController.invoke([pointerOf(options), pointerOf(controller)]);
          return numberOf(call.returnValue);
        }
      });
    }
  });
}
