import type { MessageBoxCall, NoticeNative } from "./native.ts";
import { NoticeButton, NoticeButtons, NoticeIcon, showNotice } from "./notice.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

// The notice against a fake MessageBoxW, so no dialog ever opens, and against
// the real call with an owner handle that cannot exist, which Windows refuses
// at once without showing anything.

const MB_ICONERROR = 0x10;
const MB_ICONWARNING = 0x30;
const MB_YESNO = 0x4;
const MB_YESNOCANCEL = 0x3;
const MB_TOPMOST = 0x40000;
const MB_SETFOREGROUND = 0x10000;
const IDOK = 1;
const IDCANCEL = 2;
const IDYES = 6;
const NOT_A_WINDOW = 0x7FFFFFFFn;

function fakeNative(answer: number) {
  const calls: MessageBoxCall[] = [];
  const native: NoticeNative = {
    messageBox(call) {
      calls.push(call);
      return answer;
    }
  };
  return {
    native,
    calls
  };
}

test("a notice maps its options to the flags and answers with the button", async () => {
  const { native, calls } = fakeNative(IDYES);
  const pressed = await showNotice({
    title: "Update",
    message: "Install now?",
    icon: NoticeIcon.WARNING,
    buttons: NoticeButtons.YES_NO,
    native
  });
  assert.equal(pressed, NoticeButton.YES);
  assert.deepEqual(calls, [{
    owner: 0n,
    title: "Update",
    message: "Install now?",
    flags: MB_ICONWARNING | MB_YESNO | MB_TOPMOST | MB_SETFOREGROUND
  }]);
});

test("a notice with only a title and a message is an OK box with no icon", async () => {
  const { native, calls } = fakeNative(IDOK);
  const pressed = await showNotice({
    title: "t",
    message: "m",
    native
  });
  assert.equal(pressed, NoticeButton.OK);
  assert.equal(calls[0]?.flags, MB_TOPMOST | MB_SETFOREGROUND);
});

test("a notice with an owner is not made topmost", async () => {
  const { native, calls } = fakeNative(IDCANCEL);
  const pressed = await showNotice({
    title: "t",
    message: "m",
    icon: NoticeIcon.ERROR,
    buttons: NoticeButtons.YES_NO_CANCEL,
    owner: 42n,
    native
  });
  assert.equal(pressed, NoticeButton.CANCEL);
  assert.equal(calls[0]?.owner, 42n);
  assert.equal(calls[0]?.flags, MB_ICONERROR | MB_YESNOCANCEL);
});

test("an answer Windows does not define is an error", async () => {
  const { native } = fakeNative(0);
  await assert.rejects(
    showNotice({
      title: "t",
      message: "m",
      native
    }), /could not be shown/u
  );
});

test("the real MessageBoxW refuses an owner that is no window, and shows nothing", async () => {
  await assert.rejects(
    showNotice({
      title: "t",
      message: "m",
      owner: NOT_A_WINDOW
    }), /could not be shown/u
  );
});
