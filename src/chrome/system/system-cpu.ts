import type { SystemBackend } from "./system-backend.ts";
import type { CpuInfo } from "./system-types.ts";

const ARCHITECTURE_NAMES = new Map([
  ["x64", "x86-64"],
  ["ia32", "x86-32"],
  ["arm64", "arm64"],
  ["arm", "arm"]
]);

// Every x86-64 processor has these three; Node reports no others.
const X64_FEATURES = ["mmx", "sse", "sse2"] as const;

/** `chrome.system.cpu`. */
export class SystemCpu {
  private readonly backend: SystemBackend;

  /** Made by `createChromeSystem`. */
  constructor(backend: SystemBackend) {
    this.backend = backend;
  }

  /**
   * Describes the processor: how many logical processors, the architecture,
   * the model name and the time each has spent working.
   *
   * @returns A promise of the description.
   */
  async getInfo() {
    const cpus = this.backend.cpus();
    const architecture = this.backend.architecture();
    const isX64 = architecture === "x64";
    return {
      numOfProcessors: cpus.length,
      archName: ARCHITECTURE_NAMES.get(architecture) ?? architecture,
      modelName: cpus[0]?.model ?? "",
      features: isX64 ? [...X64_FEATURES] : [],
      processors: cpus.map(({ times }) => ({
        usage: {
          kernel: times.sys,
          user: times.user,
          idle: times.idle,
          total: times.sys + times.user + times.idle
        }
      })),
      temperatures: []
    } satisfies CpuInfo;
  }
}
