import path from "node:path";
import { initWindowsAppSdk } from "winui-svelte/bootstrap";

// Starts the Windows App SDK for an example's main thread, with the
// bootstrapper `winapp restore` put in this folder's .winapp. The examples run
// from the package's folder:
//
//   node --disable-warning=ExperimentalWarning --enable-source-maps examples/counter/launch.ts

const WINDOWS_APP_SDK_MAJOR = 2;
const WINDOWS_APP_SDK_MINOR = 2;

export function startWindowsAppSdk() {
  initWindowsAppSdk({
    major: WINDOWS_APP_SDK_MAJOR,
    minor: WINDOWS_APP_SDK_MINOR,
    folders: [path.join(process.cwd(), ".winapp", "bin", process.arch)]
  });
}
