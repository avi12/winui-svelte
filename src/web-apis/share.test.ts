import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

// navigator.share over a stand-in for the share pane: data validation, the
// content handed to the pane, files copied to a temporary folder, errors.

const { installShare } = await import("./share.ts");
const { ShareUnavailableError } = await import("#src/data-transfer/share.js");

type Backend = NonNullable<Parameters<typeof installShare>[0]>["backend"];
type Content = Parameters<NonNullable<Backend>["show"]>[0];

async function withShare({ isSupported = true, failure, run }: {
  isSupported?: boolean;
  failure?: Error;
  run: (shown: Content[], folder: string) => Promise<void>;
}) {
  const shown: Content[] = [];
  const folder = mkdtempSync(path.join(tmpdir(), "wa-c-share-test-"));
  const uninstall = installShare({
    backend: {
      isSupported: () => isSupported,
      show(content) {
        shown.push(content);
        return failure ? Promise.reject(failure) : Promise.resolve();
      }
    },
    temporaryFolder: () => folder
  });
  try {
    await run(shown, folder);
  } finally {
    uninstall();
    rmSync(folder, {
      recursive: true,
      force: true
    });
  }
}

test("share hands title, text and url to the pane", () => withShare({
  async run(shown) {
    await navigator.share({
      title: "T",
      text: "body",
      url: "https://example.com/a"
    });
    assert.deepEqual(shown, [{
      title: "T",
      text: "body",
      uri: "https://example.com/a"
    }]);
  }
}));

test("the title falls back to the text", () => withShare({
  async run(shown) {
    await navigator.share({ text: "only text" });
    assert.equal(shown[0]?.title, "only text");
  }
}));

test("files are copied to the temporary folder", async () => {
  await withShare({
    async run(shown, folder) {
      await navigator.share({ files: [new File(["abc"], "note.txt", { type: "text/plain" })] });
      const copy = shown[0]?.files?.[0]?.path ?? "";
      assert.equal(readFileSync(copy, "utf8"), "abc");
      assert.equal(path.dirname(copy), folder);
    }
  });
});

test("the extras reach the pane", () => withShare({
  async run(shown) {
    await navigator.share({
      title: "T",
      description: "d",
      html: "<i>x</i>",
      custom: {
        format: "v"
      }
    });
    assert.deepEqual(shown[0], {
      title: "T",
      description: "d",
      html: "<i>x</i>",
      custom: {
        format: "v"
      }
    });
  }
}));

test("empty data and a bad url reject with TypeError", () => withShare({
  async run(shown) {
    await assert.rejects(navigator.share({}), TypeError);
    await assert.rejects(navigator.share({ url: "not a url" }), TypeError);
    assert.equal(shown.length, 0);
  }
}));

test("canShare checks the data and the support", async () => {
  await withShare({
    run() {
      assert.equal(navigator.canShare({ text: "a" }), true);
      assert.equal(navigator.canShare({}), false);
      assert.equal(navigator.canShare({ url: "nope" }), false);
      return Promise.resolve();
    }
  });
  await withShare({
    isSupported: false,
    run() {
      assert.equal(navigator.canShare({ text: "a" }), false);
      return Promise.resolve();
    }
  });
});

test("an app without a package identity gets NotAllowedError", () => withShare({
  failure: new ShareUnavailableError("no identity"),
  async run() {
    await assert.rejects(navigator.share({ text: "a" }), {
      name: "NotAllowedError",
      message: "no identity"
    });
  }
}));

test("other failures pass through, and uninstall removes the functions", async () => {
  await withShare({
    failure: new Error("boom"),
    async run() {
      await assert.rejects(navigator.share({ text: "a" }), { message: "boom" });
    }
  });
  assert.equal("share" in navigator, false);
  assert.equal("canShare" in navigator, false);
});
