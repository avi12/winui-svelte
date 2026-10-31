import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  readFile as readFileCallback,
  rmSync,
  watch,
  writeFileSync
} from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer as createHttpServer, request } from "node:http";
import { createConnection, createServer as createNetServer } from "node:net";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { MessageChannel, Worker } from "node:worker_threads";

// Each function starts one kind of background work and settles with what came
// back, from the callback, event or promise Node delivers it by. Every one of
// them runs on the UI thread, servers included.

const LOCALHOST = "127.0.0.1";
const PAYLOAD = "read from a file";
const KILOBYTE = 1024;
const BYTES_PER_MEGABYTE = KILOBYTE * KILOBYTE;
const BIG_FILE_MEGABYTES = 96;
const HTTP_OK = 200;
const CHUNK_DELAY_MILLISECONDS = 25;
const WEB_SOCKET_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const TEXT_FRAME = 0x81;
const MASK_BYTES = 4;
const HEADER_BYTES = 2;
const LENGTH_MASK = 0x7f;
const ECHO_PREFIX = "echo:";
const WORKER_SOURCE = "require('node:worker_threads').parentPort.postMessage('from a worker')";
const CHUNKS = ["one ", "two ", "three"];

function unmasked(frame: Buffer) {
  const length = (frame[1] ?? 0) & LENGTH_MASK;
  const mask = frame.subarray(HEADER_BYTES, HEADER_BYTES + MASK_BYTES);
  const payload = frame.subarray(HEADER_BYTES + MASK_BYTES, HEADER_BYTES + MASK_BYTES + length);
  return Buffer.from(payload.map((byte, i) => byte ^ (mask[i % MASK_BYTES] ?? 0))).toString();
}

function textFrame(text: string) {
  const payload = Buffer.from(text);
  return Buffer.concat([Buffer.from([TEXT_FRAME, payload.length]), payload]);
}

function portOf(address: AddressInfo | string | null) {
  const isAddress = typeof address === "object" && address !== null;
  return isAddress ? address.port : 0;
}

/** An http server (a slow chunked reply, and WebSocket echo) and a TCP echo server, both on this thread. */
export async function startServers() {
  const http = createHttpServer((_request, response) => {
    response.writeHead(HTTP_OK, { "content-type": "text/plain" });
    let sent = 0;
    const timer = setInterval(() => {
      response.write(CHUNKS[sent] ?? "");
      sent += 1;

      const isLast = sent === CHUNKS.length;
      if (isLast) {
        clearInterval(timer);
        response.end();
      }
    }, CHUNK_DELAY_MILLISECONDS);
  });
  http.on("upgrade", (incoming, socket) => {
    const key = String(incoming.headers["sec-websocket-key"]);
    const accept = createHash("sha1").update(key + WEB_SOCKET_GUID).digest("base64");
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    socket.on("data", frame => {
      socket.write(textFrame(ECHO_PREFIX + unmasked(frame)));
    });
  });
  const net = createNetServer(socket => {
    socket.on("data", data => {
      socket.write(data.toString().toUpperCase());
    });
  });
  await Promise.all([
    new Promise<void>(resolve => http.listen(0, LOCALHOST, resolve)),
    new Promise<void>(resolve => net.listen(0, LOCALHOST, resolve))
  ]);
  return {
    httpPort: portOf(http.address()),
    netPort: portOf(net.address()),
    close() {
      http.close();
      http.closeAllConnections();
      net.close();
    }
  };
}

/** A scratch folder with a small file and a large one. */
export function createScratch() {
  const folder = mkdtempSync(path.join(tmpdir(), "winui-svelte-loop-"));
  const small = path.join(folder, "small.txt");
  const big = path.join(folder, "big.bin");
  writeFileSync(small, PAYLOAD);
  writeFileSync(big, Buffer.alloc(BIG_FILE_MEGABYTES * BYTES_PER_MEGABYTE, 1));
  return {
    folder,
    small,
    big,
    remove() {
      rmSync(folder, {
        recursive: true,
        force: true
      });
    }
  };
}

/** `fs.promises.readFile`. */
export function readWithPromise(file: string) {
  return readFile(file, "utf8");
}

/** The callback `fs.readFile`. */
export function readWithCallback(file: string) {
  return new Promise<string>((resolve, reject) => {
    readFileCallback(file, "utf8", (error, text) => {
      const isRead = error === null;
      if (isRead) {
        resolve(text);
        return;
      }

      reject(error);
    });
  });
}

/** `fs.promises.readFile` of a large file: the number of bytes. */
export async function readBigFile(file: string) {
  const content = await readFile(file);
  return content.length;
}

/** `fs.watch`: writes a file into the folder and settles on the change event. */
export function watchFolder(folder: string) {
  return new Promise<string>(resolve => {
    const watcher = watch(folder, (_event, name) => {
      watcher.close();
      resolve(`changed ${String(name)}`);
    });
    setTimeout(() => {
      writeFileSync(path.join(folder, "watched.txt"), "x");
    }, CHUNK_DELAY_MILLISECONDS);
  });
}

/** `http.request` against the chunked reply. */
export function requestOverHttp(port: number) {
  return new Promise<string>((resolve, reject) => {
    request({
      host: LOCALHOST,
      port
    }, response => {
      let text = "";
      response.setEncoding("utf8");
      response.on("data", (chunk: string) => {
        text += chunk;
      });
      response.on("end", () => resolve(text));
    }).on("error", reject).end();
  });
}

/** `fetch`, read chunk by chunk: the answer says how many chunks arrived. */
export async function fetchAsStream(port: number) {
  const response = await fetch(`http://${LOCALHOST}:${port}/`);
  const reader = response.body?.getReader();
  const hasBody = reader !== undefined;
  if (!hasBody) {
    return "no body";
  }

  const decoder = new TextDecoder();
  let text = "";
  let chunks = 0;
  for (let part = await reader.read(); !part.done; part = await reader.read()) {
    text += decoder.decode(part.value, { stream: true });
    chunks += 1;
  }

  return `${chunks} chunks: ${text}`;
}

/** A TCP round trip through the upper-casing server. */
export function echoOverTcp(port: number) {
  return new Promise<string>((resolve, reject) => {
    const socket = createConnection({
      host: LOCALHOST,
      port
    }, () => {
      socket.write("ping");
    });
    socket.on("data", data => {
      resolve(data.toString());
      socket.end();
    });
    socket.on("error", reject);
  });
}

/** The WebSocket client of Node, against the server above. */
export function echoOverWebSocket(port: number) {
  return new Promise<string>((resolve, reject) => {
    const socket = new WebSocket(`ws://${LOCALHOST}:${port}/`);
    socket.addEventListener("open", () => {
      socket.send("hello");
    });
    socket.addEventListener("message", event => {
      resolve(String(event.data));
      socket.close();
    });
    socket.addEventListener("error", () => reject(new Error("websocket error")));
  });
}

/** A `MessageChannel` between two ports of this thread. */
export function sendOverChannel() {
  return new Promise<string>(resolve => {
    const { port1, port2 } = new MessageChannel();
    port1.on("message", message => {
      port1.close();
      resolve(String(message));
    });
    port2.postMessage("through a channel");
  });
}

/** A message from a `Worker`. */
export function hearWorker() {
  return new Promise<string>((resolve, reject) => {
    const worker = new Worker(WORKER_SOURCE, { eval: true });
    worker.on("message", message => {
      resolve(String(message));
      void worker.terminate();
    });
    worker.on("error", reject);
  });
}

/** The output of a child process, from its stream's `data` events. */
export function hearChildProcess() {
  return new Promise<string>((resolve, reject) => {
    const child = spawn("cmd", ["/c", "echo hi"]);
    let output = "";
    child.stdout.on("data", (data: Buffer) => {
      output += data.toString();
    });
    child.on("close", () => resolve(output.trim()));
    child.on("error", reject);
  });
}
