import { IS_WINDOWS_APP_SDK_RESTORED } from "./example-process.ts";
import { isPackagedTestEnabled, PACKAGED_TEST_VARIABLE, withTestPackage } from "./support/test-package.ts";
import { ActivationKind } from "#src/app/activation/kinds.js";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { z } from "zod";

// A packaged process started by Windows for a link: a throwaway loose layout
// package (test/support/test-package.ts) declaring two protocols, one whose
// Parameters pass the address on the command line (Route A) and one whose do
// not (Route B, read through the Windows App SDK). Each is started with a link
// through the shell, and its relay answers what it saw. The startup task
// cannot be started without a sign-in, so it is covered by the unit tests.
// It registers a package on this machine, so it runs only with
// WINUI_SVELTE_PACKAGED_TEST=1, in an ordinary desktop session.

const TIMEOUT_MILLISECONDS = 420_000;
const ANSWER_MILLISECONDS = 120_000;
const POLL_MILLISECONDS = 500;
const RELAY = path.join(import.meta.dirname, "packaged-activation-relay.ts");
const SCHEME_ARGUMENT = "winuisveltetest-argument";
const SCHEME_ACTIVATION = "winuisveltetest-activation";
const LINK_QUERY = "?state=HoldStart&x=1";
const DECIMAL = 10;

const answerSchema = z.object({
  arguments: z.array(z.string()),
  packaged: z.object({
    kind: z.string(),
    uri: z.string().optional()
  }).nullable()
});

function protocolOf({ scheme, parameters }: {
  scheme: string;
  parameters: string;
}) {
  return `<uap3:Extension Category="windows.protocol" Executable="node.exe" EntryPoint="Windows.FullTrustApplication"><uap3:Protocol Name="${scheme}" Parameters="${parameters}" /></uap3:Extension>`;
}

function parametersOf({ resultFile, hasAddress }: {
  resultFile: string;
  hasAddress: boolean;
}) {
  const parts = ["--disable-warning=ExperimentalWarning", RELAY, resultFile];
  const quoted = parts.map(part => `&quot;${part}&quot;`);
  return hasAddress ? [...quoted, "&quot;%1&quot;"].join(" ") : quoted.join(" ");
}

async function startWithLink({ scheme, resultFile }: {
  scheme: string;
  resultFile: string;
}) {
  const link = `${scheme}://open${LINK_QUERY}`;
  spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `Start-Process '${link}'`], { windowsHide: true });
  const deadline = Date.now() + ANSWER_MILLISECONDS;
  try {
    while (Date.now() < deadline) {
      if (existsSync(resultFile)) {
        return answerSchema.parse(JSON.parse(readFileSync(resultFile, "utf8")));
      }

      await new Promise(resolve => setTimeout(resolve, POLL_MILLISECONDS));
    }

    throw new Error(`no answer in ${resultFile}`);
  } finally {
    const pidFile = `${resultFile}.pid`;
    if (existsSync(pidFile)) {
      const pid = Number.parseInt(readFileSync(pidFile, "utf8"), DECIMAL);
      spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
    }
  }
}

test(`a link starts a packaged process whose activation is read (${PACKAGED_TEST_VARIABLE}=1)`, {
  skip: !isPackagedTestEnabled() || !IS_WINDOWS_APP_SDK_RESTORED,
  timeout: TIMEOUT_MILLISECONDS
}, async () => {
  const scratch = mkdtempSync(path.join(tmpdir(), "winui-svelte-packaged-activation-"));
  const argumentFile = path.join(scratch, "argument.json");
  const activationFile = path.join(scratch, "activation.json");
  try {
    await withTestPackage({
      options: {
        applicationExtensions: [
          protocolOf({
            scheme: SCHEME_ARGUMENT,
            parameters: parametersOf({
              resultFile: argumentFile,
              hasAddress: true
            })
          }),
          protocolOf({
            scheme: SCHEME_ACTIVATION,
            parameters: parametersOf({
              resultFile: activationFile,
              hasAddress: false
            })
          })
        ].join("")
      },
      async use() {
        const viaArgument = await startWithLink({
          scheme: SCHEME_ARGUMENT,
          resultFile: argumentFile
        });
        assert.ok(
          viaArgument.arguments.some(argument => argument.startsWith(`${SCHEME_ARGUMENT}:`) && argument.includes("x=1")),
          `Route A: the address is on the command line ${JSON.stringify(viaArgument.arguments)}`
        );
        assert.equal(viaArgument.packaged?.kind, ActivationKind.protocol);
        const viaActivation = await startWithLink({
          scheme: SCHEME_ACTIVATION,
          resultFile: activationFile
        });
        assert.deepEqual(viaActivation.arguments, [], "Route B: the command line holds no address");
        assert.equal(viaActivation.packaged?.kind, ActivationKind.protocol);
        assert.ok(viaActivation.packaged?.uri?.startsWith(`${SCHEME_ACTIVATION}:`));
        assert.ok(viaActivation.packaged?.uri?.includes("state=HoldStart&x=1"));
      }
    });
  } finally {
    rmSync(scratch, {
      recursive: true,
      force: true
    });
  }
});
