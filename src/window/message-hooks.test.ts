import { addMessageHook, runMessageHooks } from "./message-hooks.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

const MESSAGE = {
  hwnd: 0n,
  id: 0x312,
  wParam: 7n,
  lParam: 0n
};

test("a hook handles a message, the later hooks are not asked, and removing it ends that", () => {
  const asked: string[] = [];
  const removeFirst = addMessageHook(() => {
    asked.push("first");
    return true;
  });
  const removeSecond = addMessageHook(() => {
    asked.push("second");
    return false;
  });
  assert.equal(runMessageHooks(MESSAGE), true);
  assert.deepEqual(asked, ["first"]);
  removeFirst();
  assert.equal(runMessageHooks(MESSAGE), false);
  assert.deepEqual(asked, ["first", "second"]);
  removeSecond();
  assert.equal(runMessageHooks(MESSAGE), false);
  assert.deepEqual(asked, ["first", "second"]);
});
