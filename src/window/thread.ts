import { roInitialize } from "@microsoft/dynwinrt";

// The UI thread: a worker, because WinUI's message loop never gives its
// thread back. Its apartment comes first, so everything loaded after it may
// create WinRT objects as it loads. This file imports nothing else of the
// package for that reason: `main` loads the rest.

const SINGLE_THREADED_APARTMENT = 0;

/**
 * Enters the apartment, runs `main` (which loads and starts the window), and
 * ends the process. WinUI has ended by then, but handles it left would keep
 * the thread alive; in a worker this ends only the worker, so the host ends
 * the process when the worker exits.
 *
 * It never returns: the process ends once `main` has.
 */
export async function runOnUiThread(main: () => Promise<void>) {
  roInitialize(SINGLE_THREADED_APARTMENT);
  await main();
  process.exit(0);
}
