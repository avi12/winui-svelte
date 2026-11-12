import { DataKind } from "./accept.ts";
import type { DragEvent } from "./drag-event.ts";
import { addDragHandler } from "./drag-source.ts";
import type { DragControl } from "./drag-source.ts";
import { addDropHandler, addDropzone, DropEventType } from "./drop-target.ts";
import type { DropArgs, DropControl } from "./drop-target.ts";
import { htmlFormatOf } from "./html-format.ts";
import { nativeFileOfBytes } from "./native-file.ts";
import type { PackageSource } from "./package-io.ts";
import { roInitialize } from "@microsoft/dynwinrt";
import { DataPackageOperation } from "#winui/windows/application-model/data-transfer/DataPackageOperation";
import type { DataPackageView } from "#winui/windows/application-model/data-transfer/DataPackageView";
import assert from "node:assert/strict";
import { test } from "node:test";

// A drop and a drag out, on stand-ins for the control and WinUI's event
// arguments: the handlers the control gets are called the way WinUI calls
// them, with no window and no input.

roInitialize();

type Callback = (sender: unknown, args: unknown) => void;

class FakeControl implements DropControl, DragControl {
  allowDrop = false;
  canDrag = false;
  readonly xamlRoot = null;
  readonly callbacks = new Map<string, Callback>();
  stopped: string[] = [];

  private listen(name: string) {
    return (callback: Callback) => {
      this.callbacks.set(name, callback);
      return () => {
        this.callbacks.delete(name);
        this.stopped.push(name);
      };
    };
  }

  onDragEnter = this.listen("enter");
  onDragOver = this.listen("over");
  onDragLeave = this.listen("leave");
  onDrop = this.listen("drop");
  onDragStarting = this.listen("starting");
  onDropCompleted = this.listen("completed");

  raise({ name, args }: {
    name: string;
    args: unknown;
  }) {
    this.callbacks.get(name)?.(this, args);
  }
}

// The sealed WinRT class stood in for by the two members the target reads before the drop.
function fakeView() {
  const view = {
    contains: (format: string) => format === "Text",
    availableFormats: null
  };
  return view as unknown as DataPackageView;
}

class FakeArgs implements DropArgs {
  acceptedOperation: number = DataPackageOperation.None;
  handled = false;
  isCompleted = false;
  readonly dataView: DataPackageView;
  readonly modifiers = 2;
  readonly dragUIOverride = {
    caption: "",
    isCaptionVisible: false,
    isGlyphVisible: true,
    isContentVisible: true
  };
  readonly allowedOperations: number;

  constructor(allowedOperations = DataPackageOperation.Copy | DataPackageOperation.Move) {
    this.allowedOperations = allowedOperations;
    this.dataView = fakeView();
  }

  getPosition() {
    return {
      x: 12,
      y: 34
    };
  }

  getDeferral() {
    return {
      complete: () => {
        this.isCompleted = true;
      }
    };
  }
}

function fakeSource({ kinds, files = [] }: {
  kinds: DataKind[];
  files?: Array<ReturnType<typeof nativeFileOfBytes>>;
}) {
  return {
    formats: () => [],
    has: kind => kinds.includes(kind),
    readText: () => Promise.resolve("dropped text"),
    readHtml: () => Promise.resolve(htmlFormatOf("<u>x</u>")),
    readUri: () => Promise.resolve("https://example.com/"),
    readFiles: () => Promise.resolve(files),
    readBitmap: () => Promise.reject(new Error("no bitmap")),
    readCustom: () => Promise.resolve(undefined)
  } satisfies PackageSource;
}

function picture({ name, type }: {
  name: string;
  type: string;
}) {
  return nativeFileOfBytes({
    name,
    type,
    content: new Uint8Array()
  });
}

test("a drop target with only ondrop accepts a drag with the effect the source prefers", () => {
  const control = new FakeControl();
  addDropzone({
    control,
    zone: {
      sourceOf() {
        return fakeSource({ kinds: [DataKind.text] });
      }
    }
  });
  assert.equal(control.allowDrop, true);
  const args = new FakeArgs();
  control.raise({
    name: "over",
    args
  });
  assert.equal(args.acceptedOperation, DataPackageOperation.Copy);
  assert.equal(args.handled, true);
});

test("with a dragover handler the drag is refused until the handler calls preventDefault", () => {
  const control = new FakeControl();
  const seen: DragEvent[] = [];
  let isAccepting = false;
  addDropHandler({
    control,
    type: "dragover",
    handler(event) {
      seen.push(event);

      if (isAccepting) {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }
    }
  });
  addDropzone({
    control,
    zone: {
      sourceOf: () => fakeSource({ kinds: [DataKind.text] })
    }
  });
  const args = new FakeArgs();
  control.raise({
    name: "over",
    args
  });
  assert.equal(args.acceptedOperation, DataPackageOperation.Copy);
  const [event] = seen;
  assert.equal(event?.clientX, 12);
  assert.equal(event?.offsetY, 34);
  assert.equal(event?.ctrlKey, true);
  assert.equal(event?.shiftKey, false);
  assert.deepEqual(event?.dataTransfer.types, ["text/plain"]);
  assert.equal(event?.dataTransfer.effectAllowed, "copyMove");
  isAccepting = true;
  control.raise({
    name: "over",
    args
  });
  assert.equal(args.acceptedOperation, DataPackageOperation.Move);
});

test("a raw handler without a zone refuses a drag until preventDefault", () => {
  const control = new FakeControl();
  addDropHandler({
    control,
    type: "dragenter",
    handler() {
      return undefined;
    }
  });
  const args = new FakeArgs();
  control.raise({
    name: "enter",
    args
  });
  assert.equal(args.acceptedOperation, DataPackageOperation.None);
  assert.equal(args.handled, false);
});

test("accept refuses a drag whose kind it does not take, and tells the highlight", () => {
  const control = new FakeControl();
  const states: boolean[] = [];
  addDropzone({
    control,
    zone: {
      accept: ".png",
      onDragStateChange: isOver => states.push(isOver),
      sourceOf: () => fakeSource({ kinds: [DataKind.text] })
    }
  });
  const args = new FakeArgs();
  control.raise({
    name: "enter",
    args
  });
  assert.equal(args.acceptedOperation, DataPackageOperation.None);
  control.raise({
    name: "enter",
    args
  });
  control.raise({
    name: "leave",
    args
  });
  assert.deepEqual(states, [true, false]);
});

test("a zone owns its area: it marks the drag handled even when it refuses, so an outer zone does not answer", () => {
  const control = new FakeControl();
  addDropzone({
    control,
    zone: {
      accept: ".png",
      sourceOf: () => fakeSource({ kinds: [DataKind.text] })
    }
  });
  const args = new FakeArgs();
  control.raise({
    name: "over",
    args
  });
  assert.equal(args.acceptedOperation, DataPackageOperation.None);
  assert.equal(args.handled, true);
});

test("a drag that carries no data (a ListView reordering its rows) is left to the control under it", () => {
  const control = new FakeControl();
  const states: boolean[] = [];
  const heard: string[] = [];
  addDropzone({
    control,
    zone: {
      accept: "directory",
      onDragStateChange: isOver => states.push(isOver),
      sourceOf: () => fakeSource({ kinds: [] })
    }
  });
  for (const type of Object.values(DropEventType)) {
    addDropHandler({
      control,
      type,
      handler(event) {
        heard.push(event.type);
      }
    });
  }
  const args = new FakeArgs();
  args.acceptedOperation = DataPackageOperation.Move;
  for (const name of ["enter", "over", "drop"]) {
    control.raise({
      name,
      args
    });
  }
  control.raise({
    name: "leave",
    args
  });
  assert.equal(args.acceptedOperation, DataPackageOperation.Move, "the list's own answer stays");
  assert.equal(args.handled, false);
  assert.deepEqual(states, []);
  assert.deepEqual(heard, []);
  assert.equal(args.isCompleted, true);
});

test("a drop reads the data, passes only what accept takes, and completes the deferral", async () => {
  const control = new FakeControl();
  const dropped: DragEvent[] = [];
  const rejected: DragEvent[] = [];
  const files = [picture({
    name: "a.png",
    type: "image/png"
  }), picture({
    name: "b.txt",
    type: "text/plain"
  }), picture({
    name: "c.png",
    type: "image/png"
  })];
  addDropzone({
    control,
    zone: {
      accept: "image/*",
      isSingle: true,
      onReject: event => rejected.push(event),
      sourceOf: () => fakeSource({
        kinds: [DataKind.file, DataKind.text],
        files
      })
    }
  });
  addDropHandler({
    control,
    type: "drop",
    handler(event) {
      dropped.push(event);
    }
  });
  const args = new FakeArgs();
  control.raise({
    name: "over",
    args
  });
  control.raise({
    name: "drop",
    args
  });
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(args.isCompleted, true);
  assert.equal(args.acceptedOperation, DataPackageOperation.Copy);
  const [event] = dropped;
  assert.deepEqual(event?.dataTransfer.files.map(file => file.name), ["a.png"]);
  assert.equal(event?.dataTransfer.getData("text/plain"), "dropped text");
  assert.deepEqual(rejected[0]?.dataTransfer.files.map(file => file.name), ["b.txt", "c.png"]);
});

test("removing the last handler stops the events and ends AllowDrop", () => {
  const control = new FakeControl();
  const stop = addDropHandler({
    control,
    type: "drop",
    handler: () => undefined
  });
  assert.equal(control.callbacks.size, 4);
  stop();
  assert.equal(control.callbacks.size, 0);
  assert.equal(control.allowDrop, false);
});

test("a drag source builds its data in dragstart, can cancel it, and hears how it ended", async () => {
  const control = new FakeControl();
  const log: string[] = [];
  const texts: string[] = [];
  addDragHandler({
    control,
    type: "dragstart",
    handler(event) {
      event.dataTransfer.setData("text/plain", "dragged");
      event.dataTransfer.effectAllowed = "copyMove";
      log.push(event.type);
    }
  });
  addDragHandler({
    control,
    type: "dragend",
    handler(event) {
      log.push(`${event.type}:${event.dataTransfer.dropEffect}`);
    }
  });
  assert.equal(control.canDrag, true);
  const data = {
    setText: (text: string) => texts.push(text)
  };
  const start = {
    cancel: false,
    allowedOperations: 0,
    data,
    isCompleted: false,
    getDeferral() {
      return {
        complete() {
          start.isCompleted = true;
        }
      };
    }
  };
  control.raise({
    name: "starting",
    args: start
  });
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(start.isCompleted, true);
  assert.equal(start.allowedOperations, DataPackageOperation.Copy | DataPackageOperation.Move);
  assert.deepEqual(texts, ["dragged"]);
  control.raise({
    name: "completed",
    args: {
      dropResult: DataPackageOperation.Move
    }
  });
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.deepEqual(log, ["dragstart", "dragend:move"]);
});

test("preventDefault in dragstart cancels the drag, and drag repeats with the cursor on the clock", async () => {
  const control = new FakeControl();
  const positions: number[] = [];
  const ticking: {
    tick: () => void;
    isStopped: boolean;
  } = {
    tick: () => undefined,
    isStopped: false
  };
  function clock() {
    return {
      every(onTick: () => void) {
        ticking.tick = onTick;
        return () => {
          ticking.isStopped = true;
        };
      },
      cursor() {
        return {
          x: 5,
          y: 6
        };
      }
    };
  }
  addDragHandler({
    control,
    type: "dragstart",
    clock,
    handler(event) {
      event.dataTransfer.setData("text/plain", "x");
    }
  });
  addDragHandler({
    control,
    type: "drag",
    clock,
    handler(event) {
      positions.push(event.clientX, event.clientY);
    }
  });
  const start = {
    cancel: false,
    allowedOperations: 0,
    data: {
      setText: () => undefined
    },
    getDeferral: () => ({ complete: () => undefined })
  };
  control.raise({
    name: "starting",
    args: start
  });
  await new Promise(resolve => setTimeout(resolve, 10));
  ticking.tick();
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.deepEqual(positions, [5, 6]);
  control.raise({
    name: "completed",
    args: {
      dropResult: DataPackageOperation.None
    }
  });
  assert.equal(ticking.isStopped, true);

  const cancelled = new FakeControl();
  addDragHandler({
    control: cancelled,
    type: "dragstart",
    handler: event => event.preventDefault()
  });
  const second = {
    cancel: false,
    allowedOperations: 0,
    data: {
      setText: () => undefined
    },
    getDeferral: () => ({ complete: () => undefined })
  };
  cancelled.raise({
    name: "starting",
    args: second
  });
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(second.cancel, true);
});
