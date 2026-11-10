import path from "node:path";

const PACKAGE_ROOT = path.join(import.meta.dirname, "..", "..");
const WINDOWS_LAUNCHER_EXTENSION = ".CMD";

/**
 * Type-aware oxlint runs the linter named by `OXLINT_TSGOLINT_PATH` as `<path> headless ...`; tsrs's `tsrs-lint`
 * launcher answers that protocol with its own Rust port of the type-aware rules, so Go's tsgolint is not used.
 * Every place that runs `oxlint --type-aware` takes its environment from here.
 */
export function typeAwareEnvironment() {
  const launcher = path.join(PACKAGE_ROOT, "node_modules", ".bin", `tsrs-lint${WINDOWS_LAUNCHER_EXTENSION}`);
  return {
    ...process.env,
    OXLINT_TSGOLINT_PATH: launcher
  };
}
