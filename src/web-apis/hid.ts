import { bytesOfBufferSource, dataViewOf } from "./buffer-source.ts";
import { chooseAndGrant, createDeviceGrants } from "./device-grants.ts";
import type { DeviceChooser, DeviceGrants } from "./device-grants.ts";
import { DevicePresenceTarget } from "./device-presence.ts";
import { DomErrorName, domException } from "./dom-exception.ts";
import { HandlerEventTarget } from "./event-handlers.ts";
import type { HidBackend, HidConnection, HidDeviceInfo } from "./hid-backend.ts";
import { HidFailure, windowsHidBackend } from "./hid-backend.ts";
import { defineNavigatorProperty } from "./install.ts";

export type { HidBackend, HidConnection, HidDeviceInfo, HidReport } from "./hid-backend.ts";
export type { DeviceChooser } from "./device-grants.ts";
export { HidFailure } from "./hid-backend.ts";

const TOP_LEVEL_COLLECTION_TYPE = 1;

/** One way to recognise a device in `requestDevice`: every part given must match. */
export interface HidDeviceFilter {
  readonly vendorId?: number;
  readonly productId?: number;
  readonly usagePage?: number;
  readonly usage?: number;
}

/** The options of `requestDevice`, with the extras a browser does not have. */
export interface HidRequestDeviceOptions {
  readonly filters: readonly HidDeviceFilter[];
  readonly exclusionFilters?: readonly HidDeviceFilter[];

  /** WinUI-only: the picker for this call, instead of the one given at install. */
  readonly chooser?: DeviceChooser<HidDeviceInfo>;

  /** WinUI-only: ends the chooser. */
  readonly signal?: AbortSignal;
}

/** What `installHid` takes. */
export interface HidInstallOptions {
  /** Stands in for Windows HID; the tests give one. */
  readonly backend?: HidBackend;

  /**
   * The picker `requestDevice` asks. A browser shows a dialog here; without a
   * chooser (or one on the call) `requestDevice` rejects with `NotAllowedError`.
   */
  readonly chooser?: DeviceChooser<HidDeviceInfo>;
}

interface HidContext {
  readonly backend: HidBackend;
  readonly chooser: DeviceChooser<HidDeviceInfo> | undefined;
  readonly grants: DeviceGrants<HidDeviceInfo>;
  readonly devices: Map<string, HIDDevice>;
}

declare global {
  // The WebHID entry point, which the DOM library does not have.
  interface Navigator {
    readonly hid: HID;
  }
}

let context: HidContext | undefined;

function requireContext() {
  if (!context) {
    throw domException({
      name: DomErrorName.INVALID_STATE,
      message: "HID is not installed: call installHid() first"
    });
  }

  return context;
}

async function guarded<T>({ work, name }: {
  work: () => Promise<T>;
  name: DomErrorName;
}) {
  try {
    return await work();
  } catch (thrown) {
    const isFailure = thrown instanceof HidFailure;
    throw isFailure ? domException({
      name,
      message: thrown.message
    }) : thrown;
  }
}

function validateFilter(filter: HidDeviceFilter) {
  const isUsageAlone = filter.usage !== undefined && filter.usagePage === undefined;
  if (isUsageAlone) {
    throw new TypeError("Failed to execute 'requestDevice' on 'HID': usage needs usagePage");
  }
}

function matchesFilter({ info, filter }: {
  info: HidDeviceInfo;
  filter: HidDeviceFilter;
}) {
  const isVendorKept = filter.vendorId === undefined || info.vendorId === filter.vendorId;
  const isProductKept = filter.productId === undefined || info.productId === filter.productId;
  const isPageKept = filter.usagePage === undefined || info.usagePage === filter.usagePage;
  const isUsageKept = filter.usage === undefined || info.usage === filter.usage;
  return isVendorKept && isProductKept && isPageKept && isUsageKept;
}

/** An input report from an open device. */
export class HIDInputReportEvent extends Event {
  readonly device: HIDDevice;
  readonly reportId: number;
  readonly data: DataView;

  /** Made when the device sends a report. */
  constructor(type: string, init: {
    device: HIDDevice;
    reportId: number;
    data: DataView;
  }) {
    super(type);
    this.device = init.device;
    this.reportId = init.reportId;
    this.data = init.data;
  }
}

/** `connect` and `disconnect` events: the device that came or went. */
export class HIDConnectionEvent extends Event {
  readonly device: HIDDevice;

  /** Made when a device the page may use arrives or leaves. */
  constructor(type: string, init: { device: HIDDevice }) {
    super(type);
    this.device = init.device;
  }
}

/** One HID device the user allowed this page to use. */
export class HIDDevice extends HandlerEventTarget {
  readonly vendorId: number;
  readonly productId: number;
  readonly productName: string;

  /** The top-level collection; Windows does not expose the report layout through WinRT. */
  readonly collections: ReadonlyArray<{
    readonly usagePage: number;
    readonly usage: number;
    readonly type: number;
    readonly children: readonly object[];
    readonly inputReports: readonly object[];
    readonly outputReports: readonly object[];
    readonly featureReports: readonly object[];
  }>;

  /** The Windows device interface path. WinUI-only. */
  readonly interfacePath: string;
  private connection: HidConnection | undefined;
  private stopReports: (() => void) | undefined;
  private readonly known: HidContext;

  /** Made by `getDevices` and `requestDevice`. */
  constructor(known: HidContext, info: HidDeviceInfo) {
    super();
    this.known = known;
    this.interfacePath = info.id;
    this.vendorId = info.vendorId;
    this.productId = info.productId;
    this.productName = info.productName ?? "";
    this.collections = [{
      usagePage: info.usagePage,
      usage: info.usage,
      type: TOP_LEVEL_COLLECTION_TYPE,
      children: [],
      inputReports: [],
      outputReports: [],
      featureReports: []
    }];
  }

  get opened() {
    return this.connection !== undefined;
  }

  get oninputreport() {
    return this.getHandler("inputreport");
  }

  set oninputreport(handler: EventListener | null) {
    this.setHandler({
      type: "inputreport",
      handler
    });
  }

  /**
   * Opens the device; `inputreport` events follow.
   *
   * @throws {DOMException} `NotAllowedError` when it cannot be opened.
   */
  async open() {
    const isOpen = this.connection !== undefined;
    if (isOpen) {
      return;
    }

    const connection = await guarded({
      work: () => this.known.backend.open(this.interfacePath),
      name: DomErrorName.NOT_ALLOWED
    });
    this.connection = connection;
    this.stopReports = connection.onInputReport(report => this.dispatchEvent(
      new HIDInputReportEvent("inputreport", {
        device: this,
        reportId: report.reportId,
        data: dataViewOf(report.data)
      })
    ));
  }

  /** Closes the device. */
  async close() {
    this.stopReports?.();
    this.stopReports = undefined;
    this.connection?.close();
    this.connection = undefined;
  }

  /** Takes back the permission. */
  async forget() {
    await this.close();
    this.known.grants.forget(this.interfacePath);
    this.known.devices.delete(this.interfacePath);
  }

  /**
   * Sends an output report.
   *
   * @param reportId - The report's id, 0 when the device uses none.
   * @param data - The report's bytes, without the id.
   */
  // eslint-disable-next-line no-restricted-syntax -- the positional signature of the Web API
  async sendReport(reportId: number, data: BufferSource) {
    const connection = this.requireOpen();
    await guarded({
      work: () => connection.sendReport({
        reportId,
        data: bytesOfBufferSource(data)
      }),
      name: DomErrorName.NOT_ALLOWED
    });
  }

  /**
   * Sends a feature report.
   *
   * @param reportId - The report's id, 0 when the device uses none.
   * @param data - The report's bytes, without the id.
   */
  // eslint-disable-next-line no-restricted-syntax -- the positional signature of the Web API
  async sendFeatureReport(reportId: number, data: BufferSource) {
    const connection = this.requireOpen();
    await guarded({
      work: () => connection.sendFeatureReport({
        reportId,
        data: bytesOfBufferSource(data)
      }),
      name: DomErrorName.NOT_ALLOWED
    });
  }

  /**
   * Asks for a feature report.
   *
   * @param reportId - The report's id, 0 when the device uses none.
   * @returns The report's bytes, without the id.
   */
  async receiveFeatureReport(reportId: number) {
    const connection = this.requireOpen();
    const bytes = await guarded({
      work: () => connection.receiveFeatureReport(reportId),
      name: DomErrorName.NOT_ALLOWED
    });
    return dataViewOf(bytes);
  }

  /** Called when the device leaves: the open state ends. */
  markGone() {
    this.stopReports?.();
    this.stopReports = undefined;
    this.connection = undefined;
  }

  private requireOpen() {
    const { connection } = this;
    const isClosed = connection === undefined;
    if (isClosed) {
      throw domException({
        name: DomErrorName.INVALID_STATE,
        message: "The device is closed."
      });
    }

    return connection;
  }

  get [Symbol.toStringTag]() {
    return "HIDDevice";
  }
}

function deviceOf({ known, info }: {
  known: HidContext;
  info: HidDeviceInfo;
}) {
  const existing = known.devices.get(info.id);
  const isKnown = existing !== undefined;
  if (isKnown) {
    return existing;
  }

  const created = new HIDDevice(known, info);
  known.devices.set(info.id, created);
  return created;
}

/** The `navigator.hid` object. */
export class HID extends DevicePresenceTarget<HidDeviceInfo> {
  /** Made by `installHid`. */
  constructor(known: HidContext) {
    super({
      list: () => known.backend.list(),
      subscribe: onChange => known.backend.subscribe(onChange),
      onAdded(info) {
        const isAllowed = known.grants.has(info.id);
        if (!isAllowed) {
          return undefined;
        }

        return new HIDConnectionEvent("connect", {
          device: deviceOf({
            known,
            info
          })
        });
      },
      onRemoved(info) {
        const device = known.devices.get(info.id);
        const isUnknown = device === undefined;
        if (isUnknown) {
          return undefined;
        }

        device.markGone();
        return new HIDConnectionEvent("disconnect", { device });
      }
    });
  }

  /**
   * The HID devices the user allowed earlier that are plugged in now.
   *
   * @returns The devices.
   */
  async getDevices() {
    const known = requireContext();
    const present = await guarded({
      work: () => known.backend.list(),
      name: DomErrorName.NOT_ALLOWED
    });
    return present
      .filter(info => known.grants.has(info.id))
      .map(info => deviceOf({
        known,
        info
      }));
  }

  /**
   * Lists the devices that match, asks the chooser which the user wants, and
   * allows them.
   *
   * @param options - The filters (an empty list matches every device), the exclusions and the WinUI extras.
   * @returns The chosen devices.
   * @throws {TypeError} When a filter is not valid.
   * @throws {DOMException} `NotFoundError` when nothing is chosen, `NotAllowedError` without a chooser.
   */
  async requestDevice(options: HidRequestDeviceOptions) {
    const known = requireContext();
    const { filters, exclusionFilters = [] } = options;
    const isMissing = !Array.isArray(filters);
    if (isMissing) {
      throw new TypeError("Failed to execute 'requestDevice' on 'HID': required member filters is undefined");
    }

    for (const filter of [...filters, ...exclusionFilters]) {
      validateFilter(filter);
    }

    options.signal?.throwIfAborted();
    const present = await guarded({
      work: () => known.backend.list(),
      name: DomErrorName.NOT_ALLOWED
    });
    const candidates = present.filter(info => {
      const isIncluded = filters.length === 0 || filters.some(filter => matchesFilter({
        info,
        filter
      }));
      const isExcluded = exclusionFilters.some(filter => matchesFilter({
        info,
        filter
      }));
      return isIncluded && !isExcluded;
    });
    const chosen = await chooseAndGrant({
      chooser: options.chooser ?? known.chooser,
      candidates,
      grants: known.grants,
      emptyMessage: "No device selected.",
      maximum: Number.POSITIVE_INFINITY,
      ...options.signal === undefined ? {} : { signal: options.signal }
    });
    return chosen.map(info => deviceOf({
      known,
      info
    }));
  }

  get [Symbol.toStringTag]() {
    return "HID";
  }
}

/**
 * Defines `navigator.hid` over `Windows.Devices.HumanInterfaceDevice`.
 * Nothing is defined until this is called; call it on the thread the app's
 * code runs on.
 *
 * @param options - The picker and test stand-ins.
 * @returns The function that closes the devices and takes the API away again.
 */
export function installHid(options: HidInstallOptions = {}) {
  const previousContext = context;
  const installed: HidContext = {
    backend: options.backend ?? windowsHidBackend(),
    chooser: options.chooser,
    grants: createDeviceGrants(),
    devices: new Map()
  };
  context = installed;
  const hid = new HID(installed);
  const uninstallNavigator = defineNavigatorProperty({
    name: "hid",
    value: hid
  });
  return () => {
    hid.stopWatching();
    for (const device of installed.devices.values()) {
      void device.close();
    }

    uninstallNavigator();
    context = previousContext;
  };
}
