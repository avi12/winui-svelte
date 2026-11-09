/** How `initWindowsAppSdk` starts the Windows App SDK runtime. */
export const BootstrapMode = {
  /** Skip the bootstrapper when the package's manifest already brings the runtime (the default). */
  auto: "auto",
  /** Always call the bootstrapper; a process with a runtime in its package graph then fails as Windows says. */
  always: "always",
  /** Never call it; the environment and PATH steps still run. */
  never: "never"
} as const;

/** One of the `BootstrapMode` values. */
export type BootstrapMode = (typeof BootstrapMode)[keyof typeof BootstrapMode];

/** Where the runtime came from, as `initWindowsAppSdk` reports it. */
export const RuntimeSource = {
  /** The bootstrapper found the installed runtime. */
  bootstrapper: "bootstrapper",
  /** The process's own package brought it. */
  package: "package"
} as const;

/** One of the `RuntimeSource` values. */
export type RuntimeSource = (typeof RuntimeSource)[keyof typeof RuntimeSource];
