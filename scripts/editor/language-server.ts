// A client for the Svelte language server, the one VS Code's Svelte extension
// runs: it opens files the way the editor does and asks for what the editor
// shows (diagnostics and inlay hints). Set EDITOR_CHECK_DEBUG to see the
// server's own log.
import type { Json } from "#src/messaging/json.js";
import { jsonSchema } from "#src/messaging/json.js";
import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmdirSync,
  symlinkSync,
  unlinkSync
} from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";

const positionSchema = z.object({
  line: z.number(),
  character: z.number()
});

const diagnosticSchema = z.object({
  range: z.object({
    start: positionSchema
  }),
  message: z.string(),
  code: z.union([z.number(), z.string()]).optional(),
  source: z.string().optional()
});

type Diagnostic = z.infer<typeof diagnosticSchema>;

const inlayHintSchema = z.object({
  position: positionSchema,
  label: z.union([z.string(), z.array(z.object({ value: z.string() }))])
});

export type InlayHint = z.infer<typeof inlayHintSchema>;

const completionItemSchema = z.object({ label: z.string() });

// A completion answer: a list, or the items of a CompletionList.
const completionSchema = z.union([
  z.array(completionItemSchema),
  z.object({ items: z.array(completionItemSchema) })
]).nullable();

const messageSchema = z.object({
  id: z.number().optional(),
  method: z.string().optional(),
  params: jsonSchema.optional(),
  result: jsonSchema.optional()
});

type Message = z.infer<typeof messageSchema>;

const publishedSchema = z.object({
  uri: z.string(),
  diagnostics: z.array(diagnosticSchema)
});

const configurationRequestSchema = z.object({
  items: z.array(z.object({ section: z.string().optional() }))
});

// The server crawls its workspace for configs and watches it, and under the
// package that is .worktrees (dozens of other checkouts), .verify and
// the rest, which never settles. So it is started on a scratch workspace that
// links in only what the editor would show, not these (dist stays: the package
// imports itself through its exports, which point there). Each process has a
// folder of its own, because the tests run in parallel and one shared folder
// is cleared and rebuilt under another test that is using it.
const WORKSPACE_FOLDER = path.resolve(import.meta.dirname, "../../.verify/editor-workspace", String(process.pid));
const UNSEEN_ENTRIES = new Set([".worktrees", ".verify", ".git", ".idea", ".claude", ".fallow", ".winapp", "target"]);
const HEADER_SEPARATOR = "\r\n\r\n";
const contentLengthPattern = /Content-Length: (\d+)/i;
// The server publishes a file's diagnostics more than once (Svelte's first,
// TypeScript's after); it has settled when nothing new arrives for this long.
const SETTLE_MILLISECONDS = 4000;
const POLL_MILLISECONDS = 250;
const SETTLE_TIMEOUT_MILLISECONDS = 300_000;

// The editor's inlay hints, all on, so a type that collapsed to any shows.
const inlayHints = {
  parameterNames: {
    enabled: "all"
  },
  parameterTypes: {
    enabled: true
  },
  variableTypes: {
    enabled: true,
    suppressWhenTypeMatchesName: false
  },
  propertyDeclarationTypes: {
    enabled: true
  },
  functionLikeReturnTypes: {
    enabled: true
  }
};
const configuration = new Map<string, Json>([
  ["typescript", { inlayHints }],
  ["javascript", { inlayHints }],
  ["svelte", {}]
]);

// One key per file however the server spells its URI (it lower-cases the
// drive and escapes its colon).
function fileKey(file: string) {
  return uriKey(pathToFileURL(file).href);
}

function uriKey(uri: string) {
  return decodeURIComponent(uri).toLowerCase();
}

// Removes a folder of links and copies without touching what the links point at.
function clearFolder(folder: string) {
  for (const entry of readdirSync(folder)) {
    const entryPath = path.join(folder, entry);
    const stats = lstatSync(entryPath);
    if (stats.isDirectory()) {
      clearFolder(entryPath);
      rmdirSync(entryPath);
    } else {
      unlinkSync(entryPath);
    }
  }
}

// A folder that mirrors `source` for the server: its folders as junctions, its
// files (tsconfig.json, package.json) as copies, minus UNSEEN_ENTRIES.
function mirror({ source, target }: {
  source: string;
  target: string;
}) {
  mkdirSync(target, { recursive: true });
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const isSeen = !UNSEEN_ENTRIES.has(entry.name);
    const entryPath = path.join(source, entry.name);
    const entryTarget = path.join(target, entry.name);
    const isLinked = isSeen && entry.isDirectory();
    const isCopied = isSeen && entry.isFile();
    if (isLinked) {
      symlinkSync(entryPath, entryTarget, "junction");
    } else if (isCopied) {
      copyFileSync(entryPath, entryTarget);
    }
  }
}

function sleep(milliseconds: number) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

export class LanguageServer {
  private readonly server: ChildProcessWithoutNullStreams;
  private readonly pending = new Map<number, (result: Json | undefined) => void>();
  private readonly diagnostics = new Map<string, Diagnostic[]>();
  private nextId = 1;
  private buffer = Buffer.alloc(0);
  private lastPublish = Date.now();
  private exitCode: number | null | undefined;
  private readonly mirrors = new Map<string, string>();

  constructor(fromFolder: string) {
    const serverPath = createRequire(pathToFileURL(`${fromFolder}/`)).resolve("svelte-language-server/bin/server.js");
    this.server = spawn(process.execPath, [serverPath, "--stdio"], { stdio: ["pipe", "pipe", "pipe"] });
    this.server.stdout.on("data", (chunk: Buffer) => this.receive(chunk));
    this.server.stderr.on("data", (chunk: Buffer) => {
      if (process.env["EDITOR_CHECK_DEBUG"]) {
        process.stderr.write(chunk);
      }
    });
    this.server.on("exit", code => {
      this.exitCode = code;
    });
  }

  /**
   * Starts the server on a scratch workspace that mirrors each of `folders`;
   * the methods below take the real paths and map them in.
   */
  async start(folders: string[]) {
    if (existsSync(WORKSPACE_FOLDER)) {
      clearFolder(WORKSPACE_FOLDER);
    }

    for (const [iFolder, folder] of folders.entries()) {
      const mirrored = path.join(WORKSPACE_FOLDER, `${iFolder}-${path.basename(folder)}`);
      mirror({
        source: folder,
        target: mirrored
      });
      this.mirrors.set(folder, mirrored);
    }

    const rootUri = pathToFileURL(WORKSPACE_FOLDER).href;
    const params = {
      processId: process.pid,
      rootUri,
      workspaceFolders: [{
        uri: rootUri,
        name: "root"
      }],
      capabilities: {
        textDocument: {
          publishDiagnostics: {},
          inlayHint: {},
          completion: {}
        },
        workspace: {
          configuration: true
        }
      },
      initializationOptions: {
        configuration: Object.fromEntries(configuration)
      }
    };
    await this.request({
      method: "initialize",
      params
    });
    this.notify({
      method: "initialized",
      params: {}
    });
  }

  // The scratch path the server knows a real file by.
  private inWorkspace(file: string) {
    for (const [folder, mirrored] of this.mirrors) {
      const relative = path.relative(folder, file);
      const isInside = !relative.startsWith("..") && !path.isAbsolute(relative);
      if (isInside) {
        return path.join(mirrored, relative);
      }
    }

    throw new Error(`${file} is in none of the folders the server was started on.`);
  }

  open(file: string) {
    const params = {
      textDocument: {
        uri: pathToFileURL(this.inWorkspace(file)).href,
        languageId: "svelte",
        version: 1,
        text: readFileSync(file, "utf8")
      }
    };
    this.notify({
      method: "textDocument/didOpen",
      params
    });
  }

  // Waits until every opened file has diagnostics and none arrived lately.
  async settle(files: string[]) {
    const deadline = Date.now() + SETTLE_TIMEOUT_MILLISECONDS;
    while (Date.now() < deadline) {
      const hasExited = this.exitCode !== undefined;
      if (hasExited) {
        throw new Error(`The Svelte language server exited (${String(this.exitCode)}).`);
      }

      const hasEveryFile = files.every(file => this.diagnostics.has(fileKey(this.inWorkspace(file))));
      const isSettled = hasEveryFile && Date.now() - this.lastPublish > SETTLE_MILLISECONDS;
      if (isSettled) {
        return;
      }

      await sleep(POLL_MILLISECONDS);
    }

    throw new Error("The Svelte language server did not finish checking in time.");
  }

  diagnosticsOf(file: string) {
    return this.diagnostics.get(fileKey(this.inWorkspace(file))) ?? [];
  }

  async inlayHintsOf(file: string) {
    const lineCount = readFileSync(file, "utf8").split("\n").length;
    const params = {
      textDocument: {
        uri: pathToFileURL(this.inWorkspace(file)).href
      },
      range: {
        start: {
          line: 0,
          character: 0
        },
        end: {
          line: lineCount,
          character: 0
        }
      }
    };
    const hints = await this.request({
      method: "textDocument/inlayHint",
      params
    });
    return z.array(inlayHintSchema).nullable().parse(hints) ?? [];
  }

  // The labels the editor offers at a position (zero-based line and character).
  async completionsAt({ file, line, character }: {
    file: string;
    line: number;
    character: number;
  }) {
    const params = {
      textDocument: {
        uri: pathToFileURL(this.inWorkspace(file)).href
      },
      position: {
        line,
        character
      }
    };
    const answer = completionSchema.parse(
      await this.request({
        method: "textDocument/completion",
        params
      })
    ) ?? [];
    const items = Array.isArray(answer) ? answer : answer.items;
    return items.map(item => item.label);
  }

  stop() {
    this.server.kill();
  }

  private request({ method, params }: {
    method: string;
    params: Json;
  }) {
    const id = this.nextId;
    this.nextId++;
    this.send({
      id,
      method,
      params
    });
    return new Promise(resolve => this.pending.set(id, resolve));
  }

  private notify({ method, params }: {
    method: string;
    params: Json;
  }) {
    this.send({
      method,
      params
    });
  }

  private send(message: Message) {
    const body = Buffer.from(
      JSON.stringify({
        jsonrpc: "2.0",
        ...message
      }), "utf8"
    );
    this.server.stdin.write(`Content-Length: ${body.length}${HEADER_SEPARATOR}`);
    this.server.stdin.write(body);
  }

  private receive(chunk: Buffer) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (true) {
      const headerEnd = this.buffer.indexOf(HEADER_SEPARATOR);
      const hasHeader = headerEnd >= 0;
      if (!hasHeader) {
        return;
      }

      const length = Number(contentLengthPattern.exec(this.buffer.subarray(0, headerEnd).toString())?.[1] ?? 0);
      const bodyStart = headerEnd + HEADER_SEPARATOR.length;
      const isComplete = this.buffer.length >= bodyStart + length;
      if (!isComplete) {
        return;
      }

      const text = this.buffer.subarray(bodyStart, bodyStart + length).toString("utf8");
      this.buffer = this.buffer.subarray(bodyStart + length);
      this.handle(messageSchema.parse(JSON.parse(text)));
    }
  }

  private handle(message: Message) {
    const resolve = message.id === undefined ? undefined : this.pending.get(message.id);
    const isResponse = resolve !== undefined && message.method === undefined;
    if (isResponse) {
      this.pending.delete(message.id ?? 0);
      resolve(message.result);
      return;
    }

    const isPublishedDiagnostics = message.method === "textDocument/publishDiagnostics";
    if (isPublishedDiagnostics) {
      const published = publishedSchema.parse(message.params);
      this.diagnostics.set(uriKey(published.uri), published.diagnostics);
      this.lastPublish = Date.now();
      return;
    }

    const isServerRequest = message.id !== undefined && message.method !== undefined;
    if (!isServerRequest) {
      return;
    }

    // The editor's settings, and no answer to the rest (progress, watchers).
    const isConfiguration = message.method === "workspace/configuration";
    const result = isConfiguration
      ? configurationRequestSchema.parse(message.params).items.map(item => configuration.get(item.section ?? "") ?? {})
      : null;
    this.send({
      id: message.id,
      result
    });
  }
}
