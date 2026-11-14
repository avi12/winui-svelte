import { Worker } from "node:worker_threads";
import { createRequire } from "node:module";

const WS_POPUP = 0x80000000;
const WM_NULL = 0;
const ASFW_ANY = 0xFFFFFFFF;

/** What the thread is told at start. */
interface MenuThreadData {
  readonly moduleUnsafe: string;
  readonly windowStyle: number;
  readonly nullMessage: number;
  readonly anyProcess: number;
}

/** What the thread asks of the host, and what it answers. */
export type MenuThreadMessage =
  | {
    readonly type: "owner";
    readonly owner: bigint;
  }
  | {
    readonly type: "closed";
    readonly command: number;
  };

/** What the host tells the thread once it has seen the owner window. */
export type MenuThreadCommand =
  | {
    readonly type: "track";
    readonly menu: bigint;
    readonly flags: number;
    readonly x: number;
    readonly y: number;
  }
  | { readonly type: "abandon" };

/** The part of a thread the menu uses; a test passes a fake. */
export interface MenuThreadHandle {
  postMessage(command: MenuThreadCommand): void;

  /** Starts listening: `message` for what the thread says, `failure` when it errors or ends. */
  listen(listeners: {
    readonly message: (message: MenuThreadMessage) => void;
    readonly failure: (error: unknown) => void;
  }): void;
  terminate(): void;
}

// Runs on a thread of its own, so it is stringified: it may use nothing outside its body. The thread is
// the menu's: it makes the owner window, shows the menu on it and ends, so no queue left over from an
// earlier menu, a click that dismissed it or the thread of the app reaches the menu's own loop.
function runMenuThread(data: MenuThreadData) {
  const { parentPort } = process.getBuiltinModule("node:worker_threads");
  const { DynWin32: win32, DynWin32Unsafe: unsafe } = process.getBuiltinModule("node:module")
    .createRequire(data.moduleUnsafe)(data.moduleUnsafe);
  function bind({ entryPoint, parameters, returnType }: {
    entryPoint: string;
    parameters: string[];
    returnType: string;
  }) {
    return unsafe.bind({
      dll: "user32.dll",
      entryPoint,
      parameters: parameters.map(type => ({
        type,
        direction: "in",
        nullable: type === "pointer"
      })),
      returnType
    });
  }

  const createWindow = bind({
    entryPoint: "CreateWindowExW",
    parameters: ["u32", "pointer", "pointer", "u32", "i32", "i32", "i32", "i32", "pointer", "pointer", "pointer", "pointer"],
    returnType: "pointer"
  });
  const destroyWindow = bind({
    entryPoint: "DestroyWindow",
    parameters: ["pointer"],
    returnType: "i32"
  });
  const trackPopup = bind({
    entryPoint: "TrackPopupMenuEx",
    parameters: ["pointer", "u32", "i32", "i32", "pointer", "pointer"],
    returnType: "i32"
  });
  const postMessage = bind({
    entryPoint: "PostMessageW",
    parameters: ["pointer", "u32", "pointer", "pointer"],
    returnType: "i32"
  });
  const allowForeground = bind({
    entryPoint: "AllowSetForegroundWindow",
    parameters: ["u32"],
    returnType: "i32"
  });
  const none = unsafe.pointer(null);
  const className = win32.wideString("STATIC");
  const owner = createWindow.invoke([
    win32.u32(0),
    className,
    className,
    win32.u32(data.windowStyle),
    win32.i32(0),
    win32.i32(0),
    win32.i32(0),
    win32.i32(0),
    none,
    none,
    none,
    none
  ]).returnValue;
  parentPort?.once("message", (command: MenuThreadCommand) => {
    let chosen = 0;
    if (command.type === "track") {
      const { returnValue } = trackPopup.invoke([
        unsafe.pointer(command.menu),
        win32.u32(command.flags),
        win32.i32(command.x),
        win32.i32(command.y),
        owner,
        none
      ]);
      chosen = win32.toNumber(returnValue);
      postMessage.invoke([owner, win32.u32(data.nullMessage), none, none]);

      // A pick starts or signals the app, which Windows' foreground lock refuses unless the process that
      // took the pick lets it; only a process in front can, and it is in front until the owner is gone.
      if (chosen !== 0) {
        allowForeground.invoke([win32.u32(data.anyProcess)]);
      }
    }

    destroyWindow.invoke([owner]);
    parentPort?.postMessage({
      type: "closed",
      command: chosen
    } satisfies MenuThreadMessage);
  });
  parentPort?.postMessage({
    type: "owner",
    owner: unsafe.pointerAddress(owner)
  } satisfies MenuThreadMessage);
}

const THREAD_SOURCE = `(${runMenuThread.toString()})(require("node:worker_threads").workerData)`;

function spawnNative() {
  const data: MenuThreadData = {
    moduleUnsafe: createRequire(import.meta.url).resolve("@microsoft/dynwinrt/win32/unsafe"),
    windowStyle: WS_POPUP,
    nullMessage: WM_NULL,
    anyProcess: ASFW_ANY
  };
  const worker = new Worker(THREAD_SOURCE, {
    eval: true,
    workerData: data
  });
  const handle: MenuThreadHandle = {
    postMessage: command => worker.postMessage(command),
    listen({ message, failure }) {
      worker.on("message", message);
      worker.on("error", failure);
      worker.on("exit", () => failure(new Error("the menu thread ended before the menu closed")));
    },
    terminate() {
      void worker.terminate();
    }
  };
  return handle;
}

interface TrackRequest {
  /** The menu to show (an `HMENU`). */
  readonly menu: bigint;
  readonly flags: number;
  readonly point: {
    readonly x: number;
    readonly y: number;
  };

  /**
   * Called with the thread's owner window before the menu opens, on the host's thread, to bring the
   * window to the front; the menu opens only when it returns true.
   */
  readonly focus: (owner: bigint) => boolean;
}

/**
 * Shows a popup menu on a thread of its own, so the thread of the host keeps running while the menu is
 * open and the menu's loop starts with an empty queue. The standard sequence of a notification icon runs
 * there: an owner window, `TrackPopupMenuEx`, then a `WM_NULL` for the owner.
 *
 * @param options - `spawn`: how to make the thread (a test passes a fake).
 */
export function createMenuThread({ spawn = spawnNative }: { readonly spawn?: () => MenuThreadHandle } = {}) {
  return {
    /**
     * Runs one menu to its end on a new thread.
     *
     * @returns The command number the user picked, 0 for none or when `focus` refused.
     */
    track({ menu, flags, point, focus }: TrackRequest) {
      const thread = spawn();
      return new Promise<number>((resolve, reject) => {
        let isDone = false;
        function finish(settle: () => void) {
          if (isDone) {
            return;
          }

          isDone = true;
          thread.terminate();
          settle();
        }

        thread.listen({
          message(message) {
            if (message.type === "closed") {
              finish(() => resolve(message.command));
              return;
            }

            const isFocused = focus(message.owner);
            const command: MenuThreadCommand = isFocused ? {
              type: "track",
              menu,
              flags,
              x: point.x,
              y: point.y
            } : { type: "abandon" };
            thread.postMessage(command);
          },
          failure: error => finish(() => reject(error))
        });
      });
    }
  };
}
