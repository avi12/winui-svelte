import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

// downloadFile against a local HTTP server that honours Range, with a stand-in
// for the taskbar button.

const { downloadFile, DownloadError } = await import("./download-file.ts");
const { zoneIdentifierText } = await import("./zone-identifier.ts");

const BODY = Buffer.from("0123456789".repeat(100));
const PARTIAL_BYTES = 300;

interface Seen {
  ranges: Array<string | undefined>;
}

interface Exchange {
  request: IncomingMessage;
  response: ServerResponse;
}

async function withServer({ handler, run }: {
  handler: (exchange: Exchange) => void;
  run: (context: {
    url: string;
    folder: string;
    seen: Seen;
  }) => Promise<void>;
}) {
  const seen: Seen = { ranges: [] };
  const server = createServer((request, response) => {
    seen.ranges.push(request.headers.range);
    handler({
      request,
      response
    });
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const folder = await mkdtemp(path.join(tmpdir(), "download-file-"));
  try {
    const address = server.address();
    const isTcp = address !== null && typeof address !== "string";
    assert.ok(isTcp);
    await run({
      url: `http://127.0.0.1:${address.port}/file.bin`,
      folder,
      seen
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
  const isBeyondEnd = start >= BODY.length;
  if (isBeyondEnd) {
    response.writeHead(416, { "content-range": `bytes */${BODY.length}` }).end();
    return;
  }

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

function fakeTaskbar() {
  const calls: Array<{
    state: string;
    value?: number | undefined;
  }> = [];
  return {
    calls,
    setProgress(options: {
      state: string;
      value?: number | undefined;
    }) {
      calls.push(options);
    }
  };
}

test("downloads the file, marks it from the Internet and shows progress", async () => {
  await withServer({
    handler: serveRanges,
    async run({ url, folder }) {
      const target = path.join(folder, "out.bin");
      const taskbar = fakeTaskbar();
      const loadedValues: number[] = [];
      const result = await downloadFile({
        url,
        path: target,
        taskbar,
        onprogress({ loaded, total }) {
          assert.equal(total, BODY.length);
          loadedValues.push(loaded);
        }
      });

      assert.equal(result.bytes, BODY.length);
      assert.deepEqual(await readFile(target), BODY);
      assert.equal(loadedValues.at(-1), BODY.length);
      assert.equal(await readFile(`${target}:Zone.Identifier`, "utf8"), zoneIdentifierText(url));
      assert.match(zoneIdentifierText(url), /^\[ZoneTransfer\]\r\nZoneId=3\r\nHostUrl=http:\/\/127\.0\.0\.1:\d+\/file\.bin\r\n$/);
      assert.equal(taskbar.calls[0]?.state, "normal");
      assert.equal(taskbar.calls.at(-1)?.state, "none");
    }
  });
});

test("resume asks for the rest with a Range request and appends it", async () => {
  await withServer({
    handler: serveRanges,
    async run({ url, folder, seen }) {
      const target = path.join(folder, "out.bin");
      await writeFile(`${target}.part`, BODY.subarray(0, PARTIAL_BYTES));
      const first: number[] = [];
      await downloadFile({
        url,
        path: target,
        resume: true,
        onprogress: ({ loaded }) => first.push(loaded)
      });

      assert.deepEqual(seen.ranges, [`bytes=${PARTIAL_BYTES}-`]);
      assert.deepEqual(await readFile(target), BODY);
      assert.ok((first[0] ?? 0) > PARTIAL_BYTES);
    }
  });
});

test("a server that ignores Range restarts from the beginning", async () => {
  await withServer({
    handler({ response }) {
      response.writeHead(200, { "content-length": BODY.length }).end(BODY);
    },
    async run({ url, folder }) {
      const target = path.join(folder, "out.bin");
      await writeFile(`${target}.part`, Buffer.from("stale bytes"));
      await downloadFile({
        url,
        path: target,
        resume: true
      });

      assert.deepEqual(await readFile(target), BODY);
    }
  });
});

test("a refused Range (416) is retried from the start", async () => {
  await withServer({
    handler: serveRanges,
    async run({ url, folder, seen }) {
      const target = path.join(folder, "out.bin");
      await writeFile(`${target}.part`, Buffer.concat([BODY, BODY]));
      await downloadFile({
        url,
        path: target,
        resume: true
      });

      assert.equal(seen.ranges.length, 2);
      assert.equal(seen.ranges[1], undefined);
      assert.deepEqual(await readFile(target), BODY);
    }
  });
});

test("a failing status throws DownloadError and shows the error state", async () => {
  await withServer({
    handler({ response }) {
      response.writeHead(404).end();
    },
    async run({ url, folder }) {
      const taskbar = fakeTaskbar();
      await assert.rejects(
        downloadFile({
          url,
          path: path.join(folder, "out.bin"),
          taskbar
        }),
        error => error instanceof DownloadError && error.status === 404
      );
      assert.equal(taskbar.calls.at(-1)?.state, "error");
    }
  });
});

test("credentials are dropped from HostUrl", () => {
  assert.equal(
    zoneIdentifierText("https://user:secret@example.com/a.exe"),
    "[ZoneTransfer]\r\nZoneId=3\r\nHostUrl=https://example.com/a.exe\r\n"
  );
});
