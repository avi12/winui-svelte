import { OverlayQueue } from "./overlay-queue.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

// Dialogs stand in for ContentDialog.showAsync: a promise the test settles.
function dialog({ shown, name }: {
  shown: string[];
  name: string;
}) {
  const { promise, resolve, reject } = Promise.withResolvers<string>();
  return {
    show() {
      shown.push(name);
      return promise;
    },
    close: (result: string) => resolve(result),
    fail: (error: Error) => reject(error)
  };
}

function settle() {
  return new Promise(resolve => setImmediate(resolve));
}

test("the first dialog shows at once, the second only after the first closes", async () => {
  const shown: string[] = [];
  const queue = new OverlayQueue();
  const first = dialog({
    shown,
    name: "first"
  });
  const second = dialog({
    shown,
    name: "second"
  });
  const firstTicket = queue.enqueue(first);
  const secondTicket = queue.enqueue(second);
  assert.deepEqual(shown, ["first"]);

  first.close("primary");
  assert.equal(await firstTicket.result, "primary");
  await settle();
  assert.deepEqual(shown, ["first", "second"]);

  second.close("secondary");
  assert.equal(await secondTicket.result, "secondary");
});

test("dialogs show in the order they were asked for", async () => {
  const shown: string[] = [];
  const queue = new OverlayQueue();
  const dialogs = ["a", "b", "c"].map(name => dialog({
    shown,
    name
  }));
  const tickets = dialogs.map(entry => queue.enqueue(entry));
  for (const entry of dialogs) {
    entry.close("done");
    await settle();
  }

  await Promise.all(tickets.map(ticket => ticket.result));
  assert.deepEqual(shown, ["a", "b", "c"]);
});

test("cancelling a dialog that waits removes it and resolves its result with undefined", async () => {
  const shown: string[] = [];
  const queue = new OverlayQueue();
  const first = dialog({
    shown,
    name: "first"
  });
  const second = dialog({
    shown,
    name: "second"
  });
  const third = dialog({
    shown,
    name: "third"
  });
  const firstTicket = queue.enqueue(first);
  const secondTicket = queue.enqueue(second);
  const thirdTicket = queue.enqueue(third);
  assert.equal(secondTicket.cancel(), true);
  assert.equal(await secondTicket.result, undefined);

  first.close("none");
  await firstTicket.result;
  await settle();
  assert.deepEqual(shown, ["first", "third"]);
  third.close("none");
  await thirdTicket.result;
});

test("cancelling a dialog that is showing or done changes nothing", async () => {
  const queue = new OverlayQueue();
  const first = dialog({
    shown: [],
    name: "first"
  });
  const ticket = queue.enqueue(first);
  assert.equal(ticket.cancel(), false);
  first.close("primary");
  assert.equal(await ticket.result, "primary");
  assert.equal(ticket.cancel(), false);
});

test("a dialog that fails to show rejects its result and does not hold the next one", async () => {
  const shown: string[] = [];
  const queue = new OverlayQueue();
  const first = dialog({
    shown,
    name: "first"
  });
  const second = dialog({
    shown,
    name: "second"
  });
  const firstTicket = queue.enqueue(first);
  const secondTicket = queue.enqueue(second);
  first.fail(new Error("0x80000019"));
  await assert.rejects(firstTicket.result, /0x80000019/u);
  await settle();
  assert.deepEqual(shown, ["first", "second"]);
  second.close("primary");
  assert.equal(await secondTicket.result, "primary");
});

test("a dialog asked for once the queue has emptied shows at once", async () => {
  const shown: string[] = [];
  const queue = new OverlayQueue();
  const first = dialog({
    shown,
    name: "first"
  });
  const firstTicket = queue.enqueue(first);
  first.close("primary");
  await firstTicket.result;
  await settle();
  const second = dialog({
    shown,
    name: "second"
  });
  queue.enqueue(second);
  assert.deepEqual(shown, ["first", "second"]);
});
