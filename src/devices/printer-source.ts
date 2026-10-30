/** The `PRINTER_STATUS_*` flags of a printer's `Status`. */
export const PrinterStatus = {
  paused: 0x1,
  error: 0x2,
  pendingDeletion: 0x4,
  paperJam: 0x8,
  paperOut: 0x10,
  manualFeed: 0x20,
  paperProblem: 0x40,
  offline: 0x80,
  ioActive: 0x100,
  busy: 0x200,
  printing: 0x400,
  outputBinFull: 0x800,
  notAvailable: 0x1000,
  waiting: 0x2000,
  processing: 0x4000,
  initializing: 0x8000,
  warmingUp: 0x10000,
  tonerLow: 0x20000,
  noToner: 0x40000,
  pagePunt: 0x80000,
  userIntervention: 0x100000,
  outOfMemory: 0x200000,
  doorOpen: 0x400000,
  serverUnknown: 0x800000,
  powerSave: 0x1000000
} as const;
/** One of `PrinterStatus`'s values. */
export type PrinterStatus = typeof PrinterStatus[keyof typeof PrinterStatus];

/** The `PRINTER_ATTRIBUTE_*` flags of a printer's `Attributes`. */
export const PrinterAttribute = {
  queued: 0x1,
  direct: 0x2,
  default: 0x4,
  shared: 0x8,
  network: 0x10,
  hidden: 0x20,
  local: 0x40,
  enableDevq: 0x80,
  keepPrintedJobs: 0x100,
  doCompleteFirst: 0x200,
  workOffline: 0x400,
  enableBidirectional: 0x800,
  rawOnly: 0x1000,
  published: 0x2000
} as const;
/** One of `PrinterAttribute`'s values. */
export type PrinterAttribute = typeof PrinterAttribute[keyof typeof PrinterAttribute];

/** What `EnumPrintersW` level 2 says of one printer. */
export interface PrinterRecord {
  readonly name: string;

  /** The print server of a network connection; null for a local printer. */
  readonly serverName: string | null;
  readonly shareName: string | null;
  readonly portName: string | null;
  readonly driverName: string | null;
  readonly location: string | null;
  readonly comment: string | null;

  /** The `PrinterAttribute` bits. */
  readonly attributes: number;

  /** The `PrinterStatus` bits; 0 is ready. */
  readonly status: number;

  /** The jobs waiting in the queue. */
  readonly jobCount: number;
}

/** The Win32 reads the printer list makes; a test stands in for them. */
export interface PrinterSource {
  list(): readonly PrinterRecord[];

  /** The name of the default printer; null when there is none. */
  defaultName(): string | null;
}
