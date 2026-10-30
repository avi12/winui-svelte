// The environment variable that runs every window in the background: set to
// `1`, windows open off screen, are never activated and have no taskbar
// button. The test runners set it so the tests can run while the desktop is in
// use.
const BACKGROUND_VARIABLE = "WINUI_SVELTE_BACKGROUND";

const BACKGROUND_VALUE = "1";

/** Whether this process runs its windows in the background (`BACKGROUND_VARIABLE`). */
export function isBackgroundRun() {
  return process.env[BACKGROUND_VARIABLE] === BACKGROUND_VALUE;
}

/** The environment a child process is started with so its windows run in the background. */
export function backgroundEnvironment() {
  return {
    ...process.env,
    [BACKGROUND_VARIABLE]: BACKGROUND_VALUE
  };
}
