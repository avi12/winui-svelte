import type { Delivery } from "./delivery.ts";
import { deviceChanges } from "./device-changes.ts";
import type { DeviceChangesOptions } from "./device-changes.ts";
import { DeviceInterfaceClass, selectorOfInterfaceClasses } from "./interface-classes.ts";
import { liveTracker, pollingSubscription } from "./live.svelte.ts";
import { windowsPrinterSource } from "./native.ts";
import type { PrinterRecord, PrinterSource } from "./printer-source.ts";
import { PrinterAttribute, PrinterStatus } from "./printer-source.ts";

const DEFAULT_POLL_MILLISECONDS = 5000;

/** An installed printer, with its state. */
export interface Printer extends PrinterRecord {
  /** The printer a program that does not ask uses. */
  readonly isDefault: boolean;

  /** The printer cannot be reached: Windows marks it offline, or the user chose Use Printer Offline. */
  readonly isOffline: boolean;
  readonly isPaused: boolean;

  /** The printer reports a fault: an error, a paper jam, no paper, no toner, an open door. */
  readonly hasError: boolean;
  readonly isNetwork: boolean;
  readonly isShared: boolean;
}

const FAULTS = PrinterStatus.error
  | PrinterStatus.paperJam
  | PrinterStatus.paperOut
  | PrinterStatus.paperProblem
  | PrinterStatus.noToner
  | PrinterStatus.doorOpen
  | PrinterStatus.outOfMemory
  | PrinterStatus.userIntervention;

function printerOf({ record, defaultName }: {
  record: PrinterRecord;
  defaultName: string | null;
}) {
  const { status, attributes } = record;
  return {
    ...record,
    isDefault: record.name === defaultName,
    isOffline: (status & PrinterStatus.offline) !== 0 || (attributes & PrinterAttribute.workOffline) !== 0,
    isPaused: (status & PrinterStatus.paused) !== 0,
    hasError: (status & FAULTS) !== 0,
    isNetwork: (attributes & PrinterAttribute.network) !== 0,
    isShared: (attributes & PrinterAttribute.shared) !== 0
  } satisfies Printer;
}

/**
 * Lists the installed printers once, with the default marked.
 *
 * @param options - Where the printers come from; the default is Windows (`EnumPrintersW`).
 * @returns The printers: local ones and the connections to network printers.
 */
export function listPrinters({ source = windowsPrinterSource() }: { source?: PrinterSource } = {}) {
  const defaultName = source.defaultName();
  return source.list().map(record => printerOf({
    record,
    defaultName
  }));
}

/** What `printers` takes. */
export interface PrintersOptions {
  /** Where the printers come from; the default is Windows. */
  readonly source?: PrinterSource;

  /**
   * How often to read the printers' state again while something reads
   * them, in milliseconds: Windows raises no event for a printer going
   * offline. 0 turns it off; printers added and removed are still noticed.
   */
  readonly pollMilliseconds?: number;

  /** How a change reaches the UI thread; the default runs on its dispatcher queue. */
  readonly deliver?: Delivery;

  /** Makes the watcher of printers coming and going; a test stands in for it. */
  readonly createSource?: DeviceChangesOptions["createSource"];
}

/**
 * The installed printers, read live: name, port, driver, queue length, and
 * whether each is the default, offline, paused or faulted. Every field is
 * reactive. Printers coming and going are noticed through a device watcher of
 * the printer interfaces, and the state of each is read again every
 * `pollMilliseconds` while an effect reads it.
 *
 * @param options - Where the printers come from, and how changes are noticed and delivered.
 * @returns `printers`, `defaultPrinter` and `count` as reactive getters.
 */
export function printers(options: PrintersOptions = {}) {
  const source = options.source ?? windowsPrinterSource();
  const pollMilliseconds = options.pollMilliseconds ?? DEFAULT_POLL_MILLISECONDS;
  const isPolling = pollMilliseconds > 0;
  const track = liveTracker({
    subscriptions: [
      deviceChanges({
        selector: selectorOfInterfaceClasses(DeviceInterfaceClass.printer),
        ...options.createSource === undefined ? {} : { createSource: options.createSource }
      }),
      ...isPolling ? [pollingSubscription(pollMilliseconds)] : []
    ],
    ...options.deliver === undefined ? {} : { deliver: options.deliver }
  });
  function read() {
    track();
    return listPrinters({ source });
  }
  return {
    get printers() {
      return read();
    },
    get defaultPrinter() {
      return read().find(printer => printer.isDefault);
    },
    get count() {
      return read().length;
    }
  };
}
