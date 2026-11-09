import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { z } from "zod";

// The harness for a test that needs a package identity: it registers a loose
// layout package (a folder with an AppxManifest.xml, no signing, no MSIX file)
// with Add-AppxPackage -Register under a throwaway identity name, runs a
// script under that identity, and removes the package again, always.
// The package's executable is a copy (a hard link where the volume allows) of
// the node.exe that runs the test, so a script it runs and everything that
// script starts has the identity. It changes the machine, so a test using it
// is opt-in: PACKAGED_TEST_VARIABLE=1, and the test is skipped otherwise.
// Never use a real app's identity here.

/** The variable that opts a test that registers a package on this machine in. */
export const PACKAGED_TEST_VARIABLE = "WINUI_SVELTE_PACKAGED_TEST";

const OPT_IN_VALUE = "1";
const IDENTITY_PREFIX = "WinuiSvelte.PackagedTest";
const PUBLISHER = "CN=WinuiSvelteTest";
const FRAMEWORK_NAME = "Microsoft.WindowsAppRuntime.2";
const FRAMEWORK_PUBLISHER = "CN=Microsoft Corporation, O=Microsoft Corporation, L=Redmond, S=Washington, C=US";
const FRAMEWORK_MIN_VERSION = "2.0.0.0";
const APPLICATION_ID = "App";
const EXECUTABLE_NAME = "node.exe";
const LOGO_NAME = "logo.png";
const IDENTITY_SUFFIX_LENGTH = 8;
const HEXADECIMAL = 16;
const DECIMAL = 10;
const POLL_MILLISECONDS = 500;
const DEFAULT_TIMEOUT_MILLISECONDS = 240_000;
const REMOVE_ATTEMPTS = 5;
const REMOVE_WAIT_MILLISECONDS = 1000;
// A 1 by 1 transparent PNG: the manifest's logos must exist.
const LOGO_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAX+XDSwAAAABJRU5ErkJggg==", "base64");

/**
 * Whether the opt-in variable is set, which a packaged test's `skip` reads.
 *
 * @returns True when this run may register a package.
 */
export function isPackagedTestEnabled() {
  return process.env[PACKAGED_TEST_VARIABLE] === OPT_IN_VALUE;
}

/** A registered package. */
export interface TestPackage {
  readonly identityName: string;
  readonly familyName: string;
  readonly folder: string;
  readonly executable: string;
}

/** What goes into the manifest beyond the identity. */
export interface TestPackageOptions {
  /** Whether the manifest declares the Windows App SDK `PackageDependency`; true by default. */
  readonly hasWindowsAppRuntimeDependency?: boolean;

  /** Child elements of the application's `<Extensions>`, for a test of an activation. */
  readonly applicationExtensions?: string;

  /** Restricted capabilities beyond `runFullTrust`, by name. */
  readonly capabilities?: readonly string[];
}

function manifestOf({ identityName, hasWindowsAppRuntimeDependency, applicationExtensions, capabilities }: {
  identityName: string;
  hasWindowsAppRuntimeDependency: boolean;
  applicationExtensions: string;
  capabilities: readonly string[];
}) {
  const dependency = hasWindowsAppRuntimeDependency
    ? `<PackageDependency Name="${FRAMEWORK_NAME}" MinVersion="${FRAMEWORK_MIN_VERSION}" Publisher="${FRAMEWORK_PUBLISHER}" />`
    : "";
  const extensions = applicationExtensions === "" ? "" : `<Extensions>${applicationExtensions}</Extensions>`;
  const restricted = capabilities.map(name => `<rescap:Capability Name="${name}" />`).join("");
  return `<?xml version="1.0" encoding="utf-8"?>
<Package xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10"
  xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10"
  xmlns:uap3="http://schemas.microsoft.com/appx/manifest/uap/windows10/3"
  xmlns:desktop="http://schemas.microsoft.com/appx/manifest/desktop/windows10"
  xmlns:desktop6="http://schemas.microsoft.com/appx/manifest/desktop/windows10/6"
  xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities"
  IgnorableNamespaces="uap uap3 desktop desktop6 rescap">
  <Identity Name="${identityName}" Publisher="${PUBLISHER}" Version="1.0.0.0" ProcessorArchitecture="${process.arch}" />
  <Properties>
    <DisplayName>winui-svelte packaged test</DisplayName>
    <PublisherDisplayName>winui-svelte</PublisherDisplayName>
    <Logo>${LOGO_NAME}</Logo>
    <desktop6:FileSystemWriteVirtualization>disabled</desktop6:FileSystemWriteVirtualization>
    <desktop6:RegistryWriteVirtualization>disabled</desktop6:RegistryWriteVirtualization>
  </Properties>
  <Dependencies>
    <TargetDeviceFamily Name="Windows.Desktop" MinVersion="10.0.17763.0" MaxVersionTested="10.0.26100.0" />
    ${dependency}
  </Dependencies>
  <Resources>
    <Resource Language="en-us" />
  </Resources>
  <Applications>
    <Application Id="${APPLICATION_ID}" Executable="${EXECUTABLE_NAME}" EntryPoint="Windows.FullTrustApplication">
      <uap:VisualElements DisplayName="winui-svelte packaged test" Description="winui-svelte packaged test" BackgroundColor="transparent" Square150x150Logo="${LOGO_NAME}" Square44x44Logo="${LOGO_NAME}" />
      ${extensions}
    </Application>
  </Applications>
  <Capabilities>
    <rescap:Capability Name="runFullTrust" />
    <rescap:Capability Name="unvirtualizedResources" />
    ${restricted}
  </Capabilities>
</Package>
`;
}

function powershell(script: string) {
  return execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script], {
    encoding: "utf8",
    windowsHide: true
  }).trim();
}

function quoted(text: string) {
  return `'${text.replaceAll("'", "''")}'`;
}

function placeExecutable(folder: string) {
  const target = path.join(folder, EXECUTABLE_NAME);
  try {
    linkSync(process.execPath, target);
  } catch {
    copyFileSync(process.execPath, target);
  }

  return target;
}

function layoutOf({ identityName, options }: {
  identityName: string;
  options: TestPackageOptions;
}) {
  const folder = mkdtempSync(path.join(tmpdir(), "winui-svelte-package-"));
  writeFileSync(
    path.join(folder, "AppxManifest.xml"), manifestOf({
      identityName,
      hasWindowsAppRuntimeDependency: options.hasWindowsAppRuntimeDependency ?? true,
      applicationExtensions: options.applicationExtensions ?? "",
      capabilities: options.capabilities ?? []
    })
  );
  writeFileSync(path.join(folder, LOGO_NAME), LOGO_PNG);
  return {
    folder,
    executable: placeExecutable(folder)
  };
}

async function removeFolder(folder: string) {
  for (let iAttempt = 0; iAttempt < REMOVE_ATTEMPTS; iAttempt += 1) {
    try {
      rmSync(folder, {
        recursive: true,
        force: true
      });
      return;
    } catch {
      await new Promise(resolve => setTimeout(resolve, REMOVE_WAIT_MILLISECONDS));
    }
  }
}

/**
 * Registers a throwaway loose layout package, runs `use` with it, and removes
 * the package and its folder whether or not `use` throws.
 *
 * @param options - What the package declares, and `use`, the work.
 * @returns What `use` returns.
 */
export async function withTestPackage<T>({ options = {}, use }: {
  options?: TestPackageOptions;
  use: (testPackage: TestPackage) => Promise<T>;
}) {
  const suffix = Math.random().toString(HEXADECIMAL).slice(2, 2 + IDENTITY_SUFFIX_LENGTH);
  const identityName = `${IDENTITY_PREFIX}.${suffix}`;
  const { folder, executable } = layoutOf({
    identityName,
    options
  });
  try {
    const manifest = path.join(folder, "AppxManifest.xml");
    const familyName = powershell(
      `Add-AppxPackage -Register ${quoted(manifest)} | Out-Null; (Get-AppxPackage -Name ${quoted(identityName)}).PackageFamilyName`
    );
    return await use({
      identityName,
      familyName,
      folder,
      executable
    });
  } finally {
    powershell(`Get-AppxPackage -Name ${quoted(identityName)} | Remove-AppxPackage`);
    await removeFolder(folder);
  }
}

/** A script run under a package's identity. */
export interface PackagedRun {
  /** The script, run by the package's own node.exe, with `resultFile` as its one argument. */
  readonly script: string;

  /**
   * Where the script answers, as JSON, once, with `answer`. It writes
   * `<resultFile>.pid` first (`announceProcess`), so a run that times out ends
   * only that process.
   */
  readonly resultFile: string;
  readonly timeoutMilliseconds?: number;
}

function endProcess(pidFile: string) {
  const isWritten = existsSync(pidFile);
  if (!isWritten) {
    return;
  }

  const pid = Number.parseInt(readFileSync(pidFile, "utf8"), DECIMAL);
  const isPid = Number.isInteger(pid) && pid > 0;
  if (isPid) {
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
  }
}

/**
 * Starts a script under a package's identity (Invoke-CommandInDesktopPackage:
 * the output of a packaged process cannot be read, so the script answers in a
 * file) and waits for the answer.
 *
 * @param options - The package and the run.
 * @returns The script's answer, parsed.
 * @throws {Error} when no answer comes in time.
 */
export async function runInTestPackage({ testPackage, run }: {
  testPackage: TestPackage;
  run: PackagedRun;
}) {
  const { script, resultFile, timeoutMilliseconds = DEFAULT_TIMEOUT_MILLISECONDS } = run;
  const argumentLine = ["--disable-warning=ExperimentalWarning", script, resultFile].map(argument => `"${argument}"`).join(" ");
  powershell(
    `Invoke-CommandInDesktopPackage -PackageFamilyName ${quoted(testPackage.familyName)} -AppId ${APPLICATION_ID} -Command ${quoted(testPackage.executable)} -Args ${quoted(argumentLine)}`
  );
  const deadline = Date.now() + timeoutMilliseconds;
  try {
    while (Date.now() < deadline) {
      const isAnswered = existsSync(resultFile);
      if (isAnswered) {
        return z.unknown().parse(JSON.parse(readFileSync(resultFile, "utf8")));
      }

      await new Promise(resolve => setTimeout(resolve, POLL_MILLISECONDS));
    }

    throw new Error(`no answer in ${resultFile} within ${timeoutMilliseconds} ms`);
  } finally {
    endProcess(`${resultFile}.pid`);
  }
}

/**
 * What a packaged script calls first, so the harness can end it if it hangs.
 *
 * @param resultFile - The file the run named.
 */
export function announceProcess(resultFile: string) {
  mkdirSync(path.dirname(resultFile), { recursive: true });
  writeFileSync(`${resultFile}.pid`, String(process.pid));
}

/**
 * What a packaged script calls to answer: written to a temporary file and
 * renamed, so the reader never sees half of it.
 *
 * @param options - The file the run named, and the answer.
 */
export function answer({ resultFile, value }: {
  resultFile: string;
  value: unknown;
}) {
  const pending = `${resultFile}.tmp`;
  writeFileSync(pending, JSON.stringify(value));
  renameSync(pending, resultFile);
}
