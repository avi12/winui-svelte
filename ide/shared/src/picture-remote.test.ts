import { createRemotePictures, download, RemoteFailure, RemoteState } from "./picture-remote.ts";
import { pictureTables } from "./picture-spec.ts";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import type { IncomingHttpHeaders } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
const NOT_FOUND = 404;
const REDIRECT = 302;

async function withServer({ run }: {
  run: (context: {
    base: string;
    hits: string[];
    headers: IncomingHttpHeaders[];
  }) => Promise<void>;
}) {
  const hits: string[] = [];
  const headers: IncomingHttpHeaders[] = [];
  const server = createServer((request, response) => {
    hits.push(request.url ?? "");
    headers.push(request.headers);
    switch (request.url) {
      case "/a.png":
        response.writeHead(200, { "content-type": "image/png" }).end(PNG);
        return;
      case "/hop":
        response.writeHead(REDIRECT, { location: "/a.png" }).end();
        return;
      case "/loop":
        response.writeHead(REDIRECT, { location: "/loop" }).end();
        return;
      case "/page":
        response.writeHead(200, { "content-type": "text/html" }).end("<html></html>");
        return;
      case "/huge":
        response.writeHead(200, { "content-type": "image/png" }).end(Buffer.alloc(pictureTables.remote.maxBytes + 1));
        return;
      default:
        response.writeHead(NOT_FOUND).end();
    }
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const hasNoPort = address === null || typeof address === "string";
  if (hasNoPort) {
    throw new Error("the test server has no port");
  }

  try {
    await run({
      base: `http://127.0.0.1:${address.port}`,
      hits,
      headers
    });
  } finally {
    server.closeAllConnections();
    server.close();
  }
}

test("a picture is downloaded, through a redirect, with no credentials or cookies sent", async () => {
  await withServer({
    async run({ base, headers }) {
      const result = await download({ url: `${base}/hop` });
      assert.equal(result.failure, undefined);
      assert.equal(result.failure === undefined && result.extension, "png");
      const sent = headers[0] ?? {};
      assert.equal(sent["authorization"], undefined);
      assert.equal(sent["cookie"], undefined);
    }
  });
});

test("a download fails with the reason: status, not a picture, over the cap, a redirect loop, a blocked address", async () => {
  await withServer({
    async run({ base }) {
      assert.equal((await download({ url: `${base}/missing.png` })).failure, RemoteFailure.STATUS);
      assert.equal((await download({ url: `${base}/page` })).failure, RemoteFailure.NOT_A_PICTURE);
      assert.equal((await download({ url: `${base}/huge` })).failure, RemoteFailure.TOO_LARGE);
      assert.equal((await download({ url: `${base}/loop` })).failure, RemoteFailure.BLOCKED);
      assert.equal((await download({ url: "https://user:secret@example.com/a.png" })).failure, RemoteFailure.BLOCKED);
      assert.equal((await download({ url: "ftp://example.com/a.png" })).failure, RemoteFailure.BLOCKED);
    }
  });
});

test("a remote picture is asked for once, kept on disk, and found there by the next session", async () => {
  const cacheFolder = await mkdtemp(path.join(tmpdir(), "winui-pictures-"));
  try {
    await withServer({
      async run({ base, hits }) {
        const url = `${base}/a.png`;
        const settled = Promise.withResolvers<void>();
        const first = createRemotePictures({
          cacheFolder,
          onSettled: settled.resolve
        });
        assert.equal(first.peek(url).state, RemoteState.UNKNOWN);
        first.request(url);
        first.request(url);
        assert.equal(first.peek(url).state, RemoteState.PENDING);
        await settled.promise;
        assert.equal(first.peek(url).state, RemoteState.READY);
        assert.deepEqual(hits, ["/a.png"]);

        const next = Promise.withResolvers<void>();
        const second = createRemotePictures({
          cacheFolder,
          onSettled: next.resolve
        });
        second.request(url);
        await next.promise;
        assert.equal(second.peek(url).state, RemoteState.READY);
        assert.deepEqual(hits, ["/a.png"]);
      }
    });
  } finally {
    await rm(cacheFolder, {
      recursive: true,
      force: true
    });
  }
});

test("a failed picture is not asked for again until the retry time", async () => {
  const cacheFolder = await mkdtemp(path.join(tmpdir(), "winui-pictures-"));
  try {
    await withServer({
      async run({ base, hits }) {
        const url = `${base}/missing.png`;
        const settled = Promise.withResolvers<void>();
        const remote = createRemotePictures({
          cacheFolder,
          onSettled: settled.resolve
        });
        remote.request(url);
        await settled.promise;
        remote.request(url);
        assert.deepEqual(remote.peek(url), {
          state: RemoteState.FAILED,
          failure: RemoteFailure.STATUS
        });
        assert.equal(hits.length, 1);
      }
    });
  } finally {
    await rm(cacheFolder, {
      recursive: true,
      force: true
    });
  }
});
