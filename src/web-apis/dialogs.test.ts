import { DialogButton, DialogResult, installDialogs, showDialog } from "./dialogs.ts";
import type { DialogAnswer, DialogHost, DialogSpec } from "./dialogs.ts";
import { NoticeButton } from "#src/notice/notice.js";
import type { NoticeOptions } from "#src/notice/notice.js";
import assert from "node:assert/strict";
import { test } from "node:test";

// alert, confirm and prompt over a stand-in for the ContentDialog host: what
// each asks the host to show, how each reads the answer, the line of dialogs
// and the message box used when there is no window. The real ContentDialog is
// for test/web-dialogs.test.ts.
type DialogGlobal = "alert" | "confirm" | "prompt";

function dialogGlobal(name: DialogGlobal) {
  // lib.dom types the globals as synchronous; installed, they return promises
  return Object.getOwnPropertyDescriptor(globalThis, name)?.value;
}

interface FakeHost extends DialogHost {
  readonly shown: DialogSpec[];
  answerWith(answer: DialogAnswer): void;
  hold(): () => void;
}

function fakeHost({ hasWindow = true } = {}) {
  const shown: DialogSpec[] = [];
  let next: DialogAnswer = { result: DialogResult.NONE };
  let gate: Promise<void> | undefined;
  const host: FakeHost = {
    shown,
    hasWindow: () => hasWindow,
    async show({ spec }) {
      shown.push(spec);
      await gate;
      return next;
    },
    answerWith(answer) {
      next = answer;
    },
    hold() {
      const { promise, resolve } = Promise.withResolvers<void>();
      gate = promise;
      return () => {
        gate = undefined;
        resolve();
      };
    }
  };
  return host;
}

function fakeNotice(pressed: NoticeButton) {
  const calls: NoticeOptions[] = [];
  return {
    calls,
    notice(options: NoticeOptions) {
      calls.push(options);
      return Promise.resolve(pressed);
    }
  };
}

test("alert shows a message with one OK button and resolves when it closes", async () => {
  const host = fakeHost();
  const uninstall = installDialogs({
    host,
    title: "App"
  });
  try {
    const result = await dialogGlobal("alert")("Saved");
    assert.equal(result, undefined);
    assert.deepEqual(host.shown, [{
      title: "App",
      content: "Saved",
      primaryButtonText: "",
      secondaryButtonText: "",
      closeButtonText: "OK",
      defaultButton: DialogButton.CLOSE,
      input: undefined
    }]);
  } finally {
    uninstall();
  }
});

test("confirm is true for the primary button only", async () => {
  const host = fakeHost();
  const uninstall = installDialogs({ host });
  try {
    host.answerWith({
      result: DialogResult.PRIMARY,
      text: undefined
    });
    assert.equal(await dialogGlobal("confirm")("Sure?"), true);
    host.answerWith({ result: DialogResult.NONE });
    assert.equal(await dialogGlobal("confirm")("Sure?"), false);
    assert.equal(host.shown[0]?.primaryButtonText, "OK");
    assert.equal(host.shown[0]?.closeButtonText, "Cancel");
    assert.equal(host.shown[0]?.defaultButton, DialogButton.PRIMARY);
  } finally {
    uninstall();
  }
});

test("prompt resolves with the text, and null when cancelled", async () => {
  const host = fakeHost();
  const uninstall = installDialogs({ host });
  try {
    host.answerWith({
      result: DialogResult.PRIMARY,
      text: "Ada"
    });
    assert.equal(await dialogGlobal("prompt")("Name?", "Grace"), "Ada");
    assert.deepEqual(host.shown[0]?.input, { value: "Grace" });
    host.answerWith({ result: DialogResult.NONE });
    assert.equal(await dialogGlobal("prompt")("Name?"), null);
    assert.deepEqual(host.shown[1]?.input, { value: "" });
  } finally {
    uninstall();
  }
});

test("a message that is not a string is shown as text, and none is empty", async () => {
  const host = fakeHost();
  const uninstall = installDialogs({ host });
  try {
    await dialogGlobal("alert")(42);
    await dialogGlobal("alert")();
    assert.deepEqual(host.shown.map(spec => spec.content), ["42", ""]);
  } finally {
    uninstall();
  }
});

test("showDialog passes the WinUI extras through and reports the secondary button", async () => {
  const host = fakeHost();
  const uninstall = installDialogs({ host });
  try {
    host.answerWith({ result: DialogResult.SECONDARY });
    const answer = await showDialog({
      title: "Unsaved changes",
      content: "Save first?",
      primaryButtonText: "Save",
      secondaryButtonText: "Do not save",
      closeButtonText: "Cancel",
      defaultButton: DialogButton.PRIMARY
    });
    assert.deepEqual(answer, { result: DialogResult.SECONDARY });
    assert.equal(host.shown[0]?.title, "Unsaved changes");
    assert.equal(host.shown[0]?.secondaryButtonText, "Do not save");
  } finally {
    uninstall();
  }
});

test("dialogs asked for while one is open wait their turn, in order", async () => {
  const host = fakeHost();
  const uninstall = installDialogs({ host });
  try {
    const release = host.hold();
    const first = dialogGlobal("alert")("first");
    const second = dialogGlobal("alert")("second");
    const third = dialogGlobal("confirm")("third");
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.deepEqual(host.shown.map(spec => spec.content), ["first"]);
    release();
    await Promise.all([first, second, third]);
    assert.deepEqual(host.shown.map(spec => spec.content), ["first", "second", "third"]);
  } finally {
    uninstall();
  }
});

test("a dialog that fails does not hold the line", async () => {
  const host = fakeHost();
  const failing: DialogHost = {
    hasWindow: () => true,
    show: request => request.spec.content === "bad" ? Promise.reject(new Error("no root")) : host.show(request)
  };
  const uninstall = installDialogs({ host: failing });
  try {
    await assert.rejects(dialogGlobal("alert")("bad"), { message: "no root" });
    await dialogGlobal("alert")("good");
    assert.deepEqual(host.shown.map(spec => spec.content), ["good"]);
  } finally {
    uninstall();
  }
});

test("with no window, alert and confirm use the message box and prompt rejects", async () => {
  const host = fakeHost({ hasWindow: false });
  const { notice, calls } = fakeNotice(NoticeButton.OK);
  const uninstall = installDialogs({
    host,
    notice,
    title: "App"
  });
  try {
    await dialogGlobal("alert")("Hello");
    assert.equal(await dialogGlobal("confirm")("Go?"), true);
    assert.deepEqual(calls.map(call => [call.title, call.message, call.buttons]), [
      ["App", "Hello", undefined],
      ["App", "Go?", "okCancel"]
    ]);
    await assert.rejects(dialogGlobal("prompt")("Name?"), { name: "InvalidStateError" });
    await assert.rejects(showDialog({ content: "x" }), { name: "InvalidStateError" });
    assert.equal(host.shown.length, 0);
  } finally {
    uninstall();
  }
});

test("with no window, confirm is false when the message box is cancelled", async () => {
  const { notice } = fakeNotice(NoticeButton.CANCEL);
  const uninstall = installDialogs({
    host: fakeHost({ hasWindow: false }),
    notice
  });
  try {
    assert.equal(await dialogGlobal("confirm")("Go?"), false);
  } finally {
    uninstall();
  }
});

test("a dialog with no button text gets an OK close button, and the texts can be changed", async () => {
  const host = fakeHost();
  const uninstall = installDialogs({
    host,
    okText: "Okay",
    cancelText: "Nope"
  });
  try {
    await showDialog({ content: "Plain" });
    await dialogGlobal("confirm")("Go?");
    assert.equal(host.shown[0]?.closeButtonText, "Okay");
    assert.equal(host.shown[1]?.primaryButtonText, "Okay");
    assert.equal(host.shown[1]?.closeButtonText, "Nope");
  } finally {
    uninstall();
  }
});

test("uninstalling puts the globals back", () => {
  const before = Object.getOwnPropertyDescriptor(globalThis, "alert");
  const uninstall = installDialogs({ host: fakeHost() });
  assert.notEqual(Object.getOwnPropertyDescriptor(globalThis, "alert")?.value, before?.value);
  uninstall();
  assert.deepEqual(Object.getOwnPropertyDescriptor(globalThis, "alert"), before);
  assert.equal(Object.getOwnPropertyDescriptor(globalThis, "prompt"), undefined);
});

test("an abort while a dialog waits its turn rejects it, and the others go on", async () => {
  const host = fakeHost();
  const uninstall = installDialogs({ host });
  try {
    const release = host.hold();
    const first = showDialog({ content: "first" });
    const controller = new AbortController();
    const waiting = showDialog({
      content: "waiting",
      signal: controller.signal
    });
    const last = showDialog({ content: "last" });
    controller.abort();
    await assert.rejects(waiting, { name: "AbortError" });
    release();
    await Promise.all([first, last]);
    assert.deepEqual(host.shown.map(spec => spec.content), ["first", "last"]);
  } finally {
    uninstall();
  }
});

test("a signal that is already aborted shows nothing", async () => {
  const host = fakeHost();
  const uninstall = installDialogs({ host });
  try {
    await assert.rejects(
      showDialog({
        content: "never",
        signal: AbortSignal.abort()
      }), { name: "AbortError" }
    );
    assert.equal(host.shown.length, 0);
  } finally {
    uninstall();
  }
});

test("the signal reaches the host of the dialog that is showing", async () => {
  const host = fakeHost();
  const signals: Array<AbortSignal | undefined> = [];
  const watching: DialogHost = {
    hasWindow: () => true,
    show(request) {
      signals.push(request.signal);
      return host.show(request);
    }
  };
  const uninstall = installDialogs({ host: watching });
  try {
    const controller = new AbortController();
    await showDialog({
      content: "x",
      signal: controller.signal
    });
    assert.equal(signals[0], controller.signal);
  } finally {
    uninstall();
  }
});
