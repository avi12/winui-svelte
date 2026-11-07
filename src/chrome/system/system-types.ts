/** What `chrome.system.cpu.getInfo` reports for one logical processor. */
export interface ProcessorInfo {
  readonly usage: {
    readonly kernel: number;
    readonly user: number;
    readonly idle: number;
    readonly total: number;
  };
}

/** The result of `chrome.system.cpu.getInfo`. */
export interface CpuInfo {
  readonly numOfProcessors: number;
  readonly archName: string;
  readonly modelName: string;

  /** The instruction set extensions every processor of the architecture has; Node does not report the rest. */
  readonly features: readonly string[];

  /** Milliseconds each logical processor spent in kernel, user and idle since boot. */
  readonly processors: readonly ProcessorInfo[];

  /** Always empty: Windows gives no temperature without a driver. */
  readonly temperatures: readonly number[];
}

/** The result of `chrome.system.memory.getInfo`, in bytes. */
export interface MemoryInfo {
  readonly capacity: number;
  readonly availableCapacity: number;
}

/** The `type` of a `StorageUnitInfo`. */
export const StorageUnitType = {
  fixed: "fixed",
  removable: "removable",
  unknown: "unknown"
} as const;

/** One of `StorageUnitType`'s values. */
export type StorageUnitType = (typeof StorageUnitType)[keyof typeof StorageUnitType];

/** One drive of the result of `chrome.system.storage.getInfo`. */
export interface StorageUnitInfo {
  /** The drive's root, such as `C:\`. */
  readonly id: string;
  readonly name: string;
  readonly type: StorageUnitType;

  /** In bytes. */
  readonly capacity: number;
}

/** A rectangle in screen pixels, as Chrome writes it. */
export interface DisplayBounds {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** The result of `chrome.system.display.getInfo`, one per display. */
export interface DisplayUnitInfo {
  /** The display area's id, as a decimal string. */
  readonly id: string;

  /** `Display 1`, `Display 2` and so on, the primary one first. */
  readonly name: string;

  /** Always empty: Windows does not report mirroring to an app. */
  readonly mirroringSourceId: string;
  readonly isPrimary: boolean;
  readonly isEnabled: boolean;
  readonly dpiX: number;
  readonly dpiY: number;

  /** Always 0: a Windows app is not told a display is rotated. */
  readonly rotation: number;
  readonly bounds: DisplayBounds;

  /** The display less the taskbar. */
  readonly workArea: DisplayBounds;
}

/** What `chrome.system.display.getInfo` takes. */
export interface DisplayInfoFlags {
  /** Accepted and ignored: Windows has no unified desktop mode. */
  readonly singleUnified?: boolean | undefined;
}

/** One logical processor's times, as `os.cpus()` reports them. */
export interface CpuTimes {
  readonly user: number;
  readonly nice: number;
  readonly sys: number;
  readonly idle: number;
  readonly irq: number;
}

/** One entry of `os.cpus()`. */
export interface CpuEntry {
  readonly model: string;
  readonly times: CpuTimes;
}

/** A drive found on the machine: its root, label, kind and total size. */
export interface DriveEntry {
  readonly root: string;
  readonly label: string;
  readonly type: StorageUnitType;
  readonly capacity: number;
}
