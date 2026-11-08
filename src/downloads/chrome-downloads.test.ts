import type { DownloadDelta } from "./download-types.ts";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

// The chrome.downloads mirror against a local HTTP server that honours Range,
// with a stand-in for the taskbar button and for Explorer.

const { Downloads } = await import("./chrome-downloads.ts");
const { zoneIdentifierText } = await import("./zone-identifier.ts");
const { FileSystemFileHandle } = await import("#src/web-apis/file-system.js");

const BODY = Buffer.from("0123456789".repeat(100));
const PARTIAL_BYTES = 300;
const POLL_ATTEMPTS = 200;
const POLL_MILLISECONDS = 10;
const DROP_MILLISECONDS = 30;

interface Exchange {
  request: IncomingMessage;
  response: ServerResponse;
}

interface Context {
  url: string;
  folder: string;
  downloads: InstanceType<typeof Downloads>;
  revealed: string[];
  deltas: DownloadDelta[];
}

async function withDownloads({ handler, run }: {
  handler: (exchange: Exchange) => void;
  run: (context: Context) => Promise<void>;
}) {
  const server = createServer((request, response) => handler({
    request,
    response
  }));
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const folder = await mkdtemp(path.join(tmpdir(), "chrome-downloads-"));
  const revealed: string[] = [];
  const downloads = new Downloads({
    directory: folder,
    reveal: location => revealed.push(location)
  });
  const deltas: DownloadDelta[] = [];
  downloads.onChanged.addListener(delta => deltas.push(delta));
  try {
    const address = server.address();
    const isTcp = address !== null && typeof address !== "string";
    assert.ok(isTcp);
    await run({
      url: `http://127.0.0.1:${address.port}/file.bin`,
      folder,
      downloads,
      revealed,
      deltas
    });
  } finally {
    server.close();
    server.closeAllConnections();
    await rm(folder, {
      recursive: true,
      force: true
    });
  }
}

function serveRanges({ request, response }: Exchange) {
  const range = /^bytes=(\d+)-$/.exec(request.headers.range ?? "");
  const start = range?.[1] === undefined ? 0 : Number(range[1]);
  const slice = BODY.subarray(start);
  const isWhole = range === null;
  if (isWhole) {
    response.writeHead(200, { "content-length": slice.length }).end(slice);
    return;
  }

  response.writeHead(206, {
    "content-length": slice.length,
    "content-range": `bytes ${start}-${BODY.length - 1}/${BODY.length}`
  }).end(slice);
}

function pause() {
  return new Promise(resolve => setTimeout(resolve, POLL_MILLISECONDS));
}

async function settled({ downloads, id }: {
  downloads: Context["downloads"];
  id: number;
}) {
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
    const [item] = await downloads.search({ id });
    const isDone = item !== undefined && (item.state !== "in_progress" || item.paused);
    if (isDone) {
      return item;
    }

    await pause();
  }

  throw new Error("The download did not settle");
}

async function received({ downloads, id }: {
  downloads: Context["downloads"];
  id: number;
}) {
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
    const [item] = await downloads.search({ id });
    const hasBytes = (item?.bytesReceived ?? 0) > 0;
    if (hasBytes) {
      return;
    }

    await pause();
  }

  throw new Error("No bytes arrived");
}

function fakeTaskbar() {
  const calls: string[] = [];
  return {
    calls,
    setProgress(options: { state: string }) {
      calls.push(options.state);
    }
  };
}

test("download completes, names the file, marks it and reports the deltas", async () => {
  await withDownloads({
    handler: serveRanges,
    async run({ url, folder, downloads, deltas }) {
      const created: number[] = [];
      downloads.onCreated.addListener(item => created.push(item.id));
      const taskbar = fakeTaskbar();
      const id = await downloads.download({
        url,
        taskbar
      });
      const item = await settled({
        downloads,
        id
      });

      const target = path.join(folder, "file.bin");
      assert.deepEqual(created, [id]);
      assert.equal(item.state, "complete");
      assert.equal(item.filename, target);
      assert.equal(item.fileSize, BODY.length);
      assert.equal(item.totalBytes, BODY.length);
      assert.equal(item.exists, true);
      assert.deepEqual(await readFile(target), BODY);
      assert.equal(await readFile(`${target}:Zone.Identifier`, "utf8"), zoneIdentifierText(url));
      assert.equal(existsSync(`${target}.part`), false);
      assert.ok(deltas.some(delta => delta.state?.current === "complete"));
      assert.ok(deltas.every(delta => delta.id === id));
      assert.equal(taskbar.calls[0], "indeterminate");
      assert.ok(taskbar.calls.includes("normal"));
      assert.equal(taskbar.calls.at(-1), "none");
    }
  });
});

test("filename, a repeated name and conflictAction", async () => {
  await withDownloads({
    handler: serveRanges,
    async run({ url, folder, downloads }) {
      const first = await downloads.download({
        url,
        filename: "sub/one.bin"
      });
      await settled({
        downloads,
        id: first
      });
      const second = await downloads.download({
        url,
        filename: "sub/one.bin"
      });
      const uniquified = await settled({
        downloads,
        id: second
      });
      assert.equal(uniquified.filename, path.join(folder, "sub", "one (1).bin"));

      await writeFile(path.join(folder, "sub", "one.bin"), "old");
      const third = await downloads.download({
        url,
        filename: "sub/one.bin",
        conflictAction: "overwrite"
      });
      const overwritten = await settled({
        downloads,
        id: third
      });
      assert.equal(overwritten.filename, path.join(folder, "sub", "one.bin"));
      assert.deepEqual(await readFile(path.join(folder, "sub", "one.bin")), BODY);
    }
  });
});

test("options that are not Chrome's shape are refused", async () => {
  await withDownloads({
    handler: serveRanges,
    async run({ url, downloads }) {
      await assert.rejects(downloads.download({ url: "not a url" }));
      await assert.rejects(
        downloads.download({
          url,
          filename: "../escape.bin"
        }), /Invalid filename/u
      );
      await assert.rejects(
        downloads.download({
          url,
          filename: "C:\\escape.bin"
        }), /Invalid filename/u
      );
      await assert.rejects(
        downloads.search({
        // @ts-expect-error -- an unknown key is what this test sends
          nonsense: 1
        })
      );
    }
  });
});

test("headers, method and body reach the server", async () => {
  const seen: Array<{
    method: string | undefined;
    token: string | string[] | undefined;
    body: string;
  }> = [];
  await withDownloads({
    handler({ request, response }) {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        seen.push({
          method: request.method,
          token: request.headers["x-token"],
          body: Buffer.concat(chunks).toString()
        });
        response.writeHead(200, { "content-length": 2 }).end("ok");
      });
    },
    async run({ url, downloads }) {
      const id = await downloads.download({
        url,
        method: "POST",
        body: "payload",
        headers: [{
          name: "X-Token",
          value: "abc"
        }]
      });
      await settled({
        downloads,
        id
      });
      assert.deepEqual(seen, [{
        method: "POST",
        token: "abc",
        body: "payload"
      }]);
    }
  });
});

test("pause keeps the bytes and resume asks for the rest with a Range request", async () => {
  const ranges: Array<string | undefined> = [];
  await withDownloads({
    handler({ request, response }) {
      ranges.push(request.headers.range);
      const isFirst = request.headers.range === undefined;
      if (isFirst) {
        response.writeHead(200, { "content-length": BODY.length });
        response.write(BODY.subarray(0, PARTIAL_BYTES));
        return;
      }

      serveRanges({
        request,
        response
      });
    },
    async run({ url, folder, downloads }) {
      const id = await downloads.download({ url });
      await received({
        downloads,
        id
      });
      await downloads.pause(id);
      const [paused] = await downloads.search({ id });
      assert.equal(paused?.paused, true);
      assert.equal(paused?.canResume, true);
      assert.equal(paused?.state, "in_progress");
      await assert.rejects(downloads.pause(id));

      await downloads.resume(id);
      const item = await settled({
        downloads,
        id
      });
      assert.equal(item.state, "complete");
      assert.equal(ranges.length, 2);
      assert.match(ranges[1] ?? "", /^bytes=\d+-$/u);
      assert.deepEqual(await readFile(path.join(folder, "file.bin")), BODY);
    }
  });
});

test("a dropped connection interrupts and can resume", async () => {
  let isFirst = true;
  await withDownloads({
    handler({ request, response }) {
      if (!isFirst) {
        serveRanges({
          request,
          response
        });
        return;
      }

      isFirst = false;
      response.writeHead(200, { "content-length": BODY.length });
      response.write(BODY.subarray(0, PARTIAL_BYTES));
      setTimeout(() => response.destroy(), DROP_MILLISECONDS);
    },
    async run({ url, folder, downloads }) {
      const id = await downloads.download({ url });
      const interrupted = await settled({
        downloads,
        id
      });
      assert.equal(interrupted.state, "interrupted");
      assert.equal(interrupted.error, "NETWORK_FAILED");
      assert.equal(interrupted.canResume, true);

      await downloads.resume(id);
      const item = await settled({
        downloads,
        id
      });
      assert.equal(item.state, "complete");
      assert.equal(item.error, undefined);
      assert.deepEqual(await readFile(path.join(folder, "file.bin")), BODY);
    }
  });
});

test("cancel deletes the part file and ends USER_CANCELED", async () => {
  await withDownloads({
    handler({ response }) {
      response.writeHead(200, { "content-length": BODY.length });
      response.write(BODY.subarray(0, PARTIAL_BYTES));
    },
    async run({ url, folder, downloads }) {
      const taskbar = fakeTaskbar();
      const id = await downloads.download({
        url,
        taskbar
      });
      await received({
        downloads,
        id
      });
      await downloads.cancel(id);
      const [item] = await downloads.search({ id });
      assert.equal(item?.state, "interrupted");
      assert.equal(item?.error, "USER_CANCELED");
      assert.equal(item?.canResume, false);
      assert.equal(existsSync(path.join(folder, "file.bin.part")), false);
      assert.equal(taskbar.calls.at(-1), "none");
      await assert.rejects(downloads.resume(id));
    }
  });
});

test("a failing status interrupts with the matching error and shows the error state", async () => {
  await withDownloads({
    handler({ response }) {
      response.writeHead(403).end();
    },
    async run({ url, downloads }) {
      const taskbar = fakeTaskbar();
      const id = await downloads.download({
        url,
        taskbar
      });
      const item = await settled({
        downloads,
        id
      });
      assert.equal(item.state, "interrupted");
      assert.equal(item.error, "SERVER_FORBIDDEN");
      assert.equal(item.canResume, false);
      assert.equal(taskbar.calls.at(-1), "error");
    }
  });
});

test("saveAs writes through the picked handle", async () => {
  await withDownloads({
    handler: serveRanges,
    async run({ url, folder }) {
      const picked = path.join(folder, "picked.bin");
      const suggested: string[] = [];
      const downloads = new Downloads({
        directory: folder,
        pickSaveFile(init) {
          suggested.push(init.suggestedName);
          return Promise.resolve(new FileSystemFileHandle(picked));
        }
      });
      const id = await downloads.download({
        url,
        saveAs: true
      });
      const item = await settled({
        downloads,
        id
      });
      assert.deepEqual(suggested, ["file.bin"]);
      assert.equal(item.filename, picked);
      assert.deepEqual(await readFile(picked), BODY);
      assert.equal(await readFile(`${picked}:Zone.Identifier`, "utf8"), zoneIdentifierText(url));
    }
  });
});

test("a cancelled picker ends USER_CANCELED", async () => {
  await withDownloads({
    handler: serveRanges,
    async run({ url, folder }) {
      const downloads = new Downloads({
        directory: folder,
        pickSaveFile: () => Promise.reject(new DOMException("The user aborted a request.", "AbortError"))
      });
      const id = await downloads.download({
        url,
        saveAs: true
      });
      const item = await settled({
        downloads,
        id
      });
      assert.equal(item.error, "USER_CANCELED");
    }
  });
});

test("search filters and orders, erase removes, show reveals", async () => {
  await withDownloads({
    handler: serveRanges,
    async run({ url, folder, downloads, revealed }) {
      const ids: number[] = [];
      for (const filename of ["a.txt", "b.bin", "c.bin"]) {
        const id = await downloads.download({
          url,
          filename
        });
        await settled({
          downloads,
          id
        });
        ids.push(id);
      }

      const bins = await downloads.search({
        query: ["-a.txt"],
        orderBy: ["-startTime"]
      });
      assert.deepEqual(bins.map(item => path.basename(item.filename)).toSorted(), ["b.bin", "c.bin"]);
      assert.equal((await downloads.search({ query: ["-b.bin", "-c.bin"] })).length, 1);
      assert.equal((await downloads.search({ filenameRegex: "a\\.txt$" })).length, 1);
      assert.equal((await downloads.search({ limit: 2 })).length, 2);
      assert.equal((await downloads.search({ totalBytesGreater: BODY.length })).length, 0);
      assert.equal((await downloads.search({ state: "complete" })).length, 3);

      const [first = 0, ...others] = ids;
      await downloads.show(first);
      await downloads.showDefaultFolder();
      assert.deepEqual(revealed, [path.join(folder, "a.txt"), folder]);

      await downloads.removeFile(first);
      assert.equal((await downloads.search({ id: first }))[0]?.exists, false);

      const erased: number[] = [];
      downloads.onErased.addListener(id => erased.push(id));
      assert.deepEqual(await downloads.erase({ query: ["-a.txt"] }), others);
      assert.deepEqual(erased, others);
      assert.equal((await downloads.search({})).length, 1);
    }
  });
});
