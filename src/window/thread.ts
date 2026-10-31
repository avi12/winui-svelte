import { installUiTimers } from "./install-timers.ts";
import { roInitialize } from "@microsoft/dynwinrt";

// The UI thread: a worker, because WinUI's message loop never gives its
// thread back. Its apartment comes first, so everything loaded after it may
// create WinRT objects as it loads. This file imports nothing of WinRT for
// that reason (the timers it installs are plain JavaScript): `main` loads the
// rest.

const SINGLE_THREADED_APARTMENT = 0;

/**
 * Installs the UI thread's timers (`installUiTimers`), enters the apartment,
 * runs `main` (which loads and starts the window), and ends the process.
 * WinUI has ended by then, but handles it left would keep the
 * thread alive; in a worker this ends only the worker, so the host ends the
 * process when the worker exits.
 *
 * It never returns: the process ends once `main` has, with code 1 and the
 * error on stderr when `main` rejects, so a failed start is never silent.
 */
export async function runOnUiThread(main: () => Promise<void>) {
  installUiTimers();
  roInitialize(SINGLE_THREADED_APARTMENT);
  try {
    await main();
  } catch (error) {
    console.error(error);
    process.exit(1);
  }

  process.exit(0);
}
