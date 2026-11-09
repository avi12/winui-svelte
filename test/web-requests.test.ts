import { ExampleProcess, IS_WINDOWS_APP_SDK_RESTORED } from "./example-process.ts";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import type { IncomingMessage } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

// The web-requests example (examples/web-requests) in a real WinUI window, off
// screen and never activated: its WebView2 loads a page from a server this test
// started, with one of the page's requests blocked (the page sees status 204
// and the server sees no request), and the example types into the page's text
// box with trusted key events over the DevTools protocol, timed for 300
// characters. Same skips and the same desktop as test/web-bridge.test.ts.

const TIMEOUT_MILLISECONDS = 300_000;
const POLL_MILLISECONDS = 500;
const TYPED_CHARACTERS = 300;
const NO_CONTENT = 204;
const NATIVE_LIBRARY = path.join(import.meta.dirname, "..", ".winapp", "bin", process.arch, "Microsoft.Web.WebView2.Core.dll");
const RUNTIME_KEY = String.raw`HKLM\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}`;
// noinspection JSUnresolvedReference,JSValidateTypes: the hosted page's own script, in a string
const PAGE_HTML = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Requests page</title></head>
<body>
  <input id="box" type="text">
  <script>
    fetch("/RotateCookies").then(response => {
      window.rotateStatus = response.status;
    }, () => {
      window.rotateStatus = -1;
    });
  </script>
</body>
</html>`;

function isWebViewRuntimeInstalled() {
  try {
    execFileSync("reg", ["query", RUNTIME_KEY], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

test("a blocked request answers 204 without reaching the server, and typing goes in as trusted keys", {
  skip: !IS_WINDOWS_APP_SDK_RESTORED || !existsSync(NATIVE_LIBRARY) || !isWebViewRuntimeInstalled(),
  timeout: TIMEOUT_MILLISECONDS
}, async () => {
  const requested: string[] = [];
  const server = createServer((request: IncomingMessage, response) => {
    requested.push(request.url ?? "");
    response.setHeader("Content-Type", "text/html");
    response.end(PAGE_HTML);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const isListening = typeof address === "object" && address !== null;
  const port = isListening ? address.port : 0;
  const userDataFolder = mkdtempSync(path.join(tmpdir(), "winui-svelte-web-requests-"));
  const example = ExampleProcess.start({
    entry: "examples/web-requests/main.ts",
    env: {
      WEBVIEW2_USER_DATA_FOLDER: userDataFolder
    }
  });
  try {
    example.send({
      cmd: "navigate",
      url: `http://127.0.0.1:${port}/page`
    });
    const deadline = Date.now() + TIMEOUT_MILLISECONDS / 2;
    let status = await example.ask({
      command: {
        cmd: "page"
      },
      kind: "page"
    });
    while (JSON.stringify(status["page"]).includes("\"rotate\":null") && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, POLL_MILLISECONDS));
      status = await example.ask({
        command: {
          cmd: "page"
        },
        kind: "page"
      });
    }

    const page = JSON.stringify(status["page"]);
    assert.match(page, new RegExp(`"rotate":${NO_CONTENT}`));
    assert.ok(requested.includes("/page"));
    assert.equal(requested.some(url => url.startsWith("/RotateCookies")), false);

    const text = "abcdefghij".repeat(TYPED_CHARACTERS / 10);
    const typed = await example.ask({
      command: {
        cmd: "type",
        text
      },
      kind: "typed"
    });
    assert.match(JSON.stringify(typed["page"]), new RegExp(`"value":"${text}"`));
    process.stdout.write(`typed ${TYPED_CHARACTERS} characters in ${Math.round(Number(typed["milliseconds"]))} ms\n`);
    const inserted = await example.ask({
      command: {
        cmd: "type",
        text,
        mode: "insert"
      },
      kind: "typed"
    });
    process.stdout.write(`inserted after the first key in ${Math.round(Number(inserted["milliseconds"]))} ms\n`);
    await example.ask({
      command: {
        cmd: "close"
      },
      kind: "closed"
    });
  } finally {
    example.kill();
    server.close();
    rmSync(userDataFolder, {
      force: true,
      maxRetries: 5,
      recursive: true
    });
  }
});
