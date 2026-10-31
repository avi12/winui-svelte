import { bytesOfBufferSource, dataViewOf } from "./buffer-source.ts";
import { chooseAndGrant, createDeviceGrants } from "./device-grants.ts";
import type { DeviceChooser, DeviceGrants } from "./device-grants.ts";
import { DevicePresenceTarget } from "./device-presence.ts";
import { DomErrorName, domException } from "./dom-exception.ts";
import { defineNavigatorProperty } from "./install.ts";
import type {
  UsbAlternateInfo,
  UsbBackend,
  UsbConfigurationInfo,
  UsbConnection,
  UsbDeviceInfo,
  UsbEndpointInfo,
  UsbInterfaceInfo,
  UsbSetup
} from "./usb-backend.ts";
import {
  UsbDirection,
  UsbEndpointType,
  UsbFailure,
  UsbRecipient,
  versionOfBcd,
  windowsUsbBackend
} from "./usb-backend.ts";

export type {
  UsbAlternateInfo,
  UsbBackend,
  UsbConfigurationInfo,
  UsbConnection,
  UsbDeviceInfo,
  UsbEndpointInfo,
  UsbInterfaceInfo,
  UsbSetup,
  UsbTransferResult
} from "./usb-backend.ts";
export type { DeviceChooser } from "./device-grants.ts";
export { UsbDirection, UsbEndpointType, UsbFailure, UsbRecipient, UsbRequestType, UsbTransferStatus } from "./usb-backend.ts";

const MAXIMUM_ENDPOINT_NUMBER = 15;
const INTERFACE_MASK = 0xFF;

/** One way to recognise a device in `requestDevice`: every part given must match. */
export interface UsbDeviceFilter {
  readonly vendorId?: number;
  readonly productId?: number;
  readonly classCode?: number;
  readonly subclassCode?: number;
  readonly protocolCode?: number;
  readonly serialNumber?: string;
}

/** The options of `requestDevice`, with the extras a browser does not have. */
export interface UsbRequestDeviceOptions {
  readonly filters: readonly UsbDeviceFilter[];

  /** WinUI-only: the picker for this call, instead of the one given at install. */
  readonly chooser?: DeviceChooser<UsbDeviceInfo>;

  /** WinUI-only: ends the chooser. */
  readonly signal?: AbortSignal;
}

/** What `installUsb` takes. */
export interface UsbInstallOptions {
  /** Stands in for Windows USB; the tests give one. */
  readonly backend?: UsbBackend;

  /**
   * The picker `requestDevice` asks. A browser shows a dialog here; without a
   * chooser (or one on the call) `requestDevice` rejects with `NotAllowedError`.
   */
  readonly chooser?: DeviceChooser<UsbDeviceInfo>;
}

interface UsbContext {
  readonly backend: UsbBackend;
  readonly chooser: DeviceChooser<UsbDeviceInfo> | undefined;
  readonly grants: DeviceGrants<UsbDeviceInfo>;
  readonly devices: Map<string, USBDevice>;
}

declare global {
  // The WebUSB entry point, which the DOM library does not have.
  interface Navigator {
    readonly usb: USB;
  }
}

let context: UsbContext | undefined;

function requireContext() {
  if (!context) {
    throw domException({
      name: DomErrorName.INVALID_STATE,
      message: "USB is not installed: call installUsb() first"
    });
  }

  return context;
}

function asDomException(thrown: unknown) {
  const isFailure = thrown instanceof UsbFailure;
  if (!isFailure) {
    return thrown;
  }

  return domException({
    name: thrown.isUnsupported ? DomErrorName.NOT_SUPPORTED : DomErrorName.NETWORK,
    message: thrown.message
  });
}

async function guarded<T>(work: () => Promise<T>) {
  try {
    return await work();
  } catch (thrown) {
    throw asDomException(thrown);
  }
}

function invalidState(message: string) {
  return domException({
    name: DomErrorName.INVALID_STATE,
    message
  });
}

function notFound(message: string) {
  return domException({
    name: DomErrorName.NOT_FOUND,
    message
  });
}

function validateFilter(filter: UsbDeviceFilter) {
  const isProductAlone = filter.productId !== undefined && filter.vendorId === undefined;
  const isSubclassAlone = filter.subclassCode !== undefined && filter.classCode === undefined;
  const isProtocolAlone = filter.protocolCode !== undefined && filter.subclassCode === undefined;
  const isInvalid = isProductAlone || isSubclassAlone || isProtocolAlone;
  if (isInvalid) {
    throw new TypeError("Failed to execute 'requestDevice' on 'USB': productId needs vendorId, subclassCode needs classCode, protocolCode needs subclassCode");
  }
}

function matchesFilter({ info, filter }: {
  info: UsbDeviceInfo;
  filter: UsbDeviceFilter;
}) {
  const isVendorKept = filter.vendorId === undefined || info.vendorId === filter.vendorId;
  const isProductKept = filter.productId === undefined || info.productId === filter.productId;
  const isClassKept = filter.classCode === undefined || info.deviceClass === filter.classCode;
  const isSubclassKept = filter.subclassCode === undefined || info.deviceSubclass === filter.subclassCode;
  const isProtocolKept = filter.protocolCode === undefined || info.deviceProtocol === filter.protocolCode;
  const isSerialKept = filter.serialNumber === undefined || info.serialNumber === filter.serialNumber;
  return isVendorKept && isProductKept && isClassKept && isSubclassKept && isProtocolKept && isSerialKept;
}

/** The outcome of a control or data transfer that read. */
export class USBInTransferResult {
  readonly status: string;
  readonly data: DataView | undefined;

  /** Made by the transfer methods. */
  constructor(status: string, data?: DataView) {
    this.status = status;
    this.data = data;
  }
}

/** The outcome of a control or data transfer that wrote. */
export class USBOutTransferResult {
  readonly status: string;
  readonly bytesWritten: number;

  /** Made by the transfer methods. */
  constructor(status: string, bytesWritten: number) {
    this.status = status;
    this.bytesWritten = bytesWritten;
  }
}

/** `connect` and `disconnect` events: the device that came or went. */
export class USBConnectionEvent extends Event {
  readonly device: USBDevice;

  /** Made when a device the page may use arrives or leaves. */
  constructor(type: string, init: { device: USBDevice }) {
    super(type);
    this.device = init.device;
  }
}

/** One USB device the user allowed this page to use. */
export class USBDevice {
  readonly vendorId: number;
  readonly productId: number;
  readonly deviceClass: number;
  readonly deviceSubclass: number;
  readonly deviceProtocol: number;
  readonly usbVersionMajor: number;
  readonly usbVersionMinor: number;
  readonly usbVersionSubminor: number;
  readonly deviceVersionMajor: number;
  readonly deviceVersionMinor: number;
  readonly deviceVersionSubminor: number;
  readonly manufacturerName: string | undefined;
  readonly productName: string | undefined;
  readonly serialNumber: string | undefined;

  /** The Windows device interface path. WinUI-only. */
  readonly interfacePath: string;
  private connection: UsbConnection | undefined;
  private configurationList: UsbConfigurationInfo[] = [];
  private activeValue: number | null = null;
  private readonly claimedAlternates = new Map<number, number>();
  private readonly known: UsbContext;

  /** Made by `getDevices` and `requestDevice`. */
  constructor(known: UsbContext, info: UsbDeviceInfo) {
    this.known = known;
    this.interfacePath = info.id;
    this.vendorId = info.vendorId;
    this.productId = info.productId;
    this.deviceClass = info.deviceClass;
    this.deviceSubclass = info.deviceSubclass;
    this.deviceProtocol = info.deviceProtocol;
    const usbVersion = versionOfBcd(info.usbVersion);
    this.usbVersionMajor = usbVersion.major;
    this.usbVersionMinor = usbVersion.minor;
    this.usbVersionSubminor = usbVersion.subminor;
    const deviceVersion = versionOfBcd(info.deviceVersion);
    this.deviceVersionMajor = deviceVersion.major;
    this.deviceVersionMinor = deviceVersion.minor;
    this.deviceVersionSubminor = deviceVersion.subminor;
    this.manufacturerName = undefined;
    this.productName = info.productName;
    this.serialNumber = info.serialNumber;
  }

  get opened() {
    return this.connection !== undefined;
  }

  /** The configurations; known once the device has been opened, empty before. */
  get configurations() {
    return this.configurationList.map(configuration => this.viewOfConfiguration(configuration));
  }

  get configuration() {
    const active = this.configurationList.find(candidate => candidate.configurationValue === this.activeValue);
    return active === undefined ? null : this.viewOfConfiguration(active);
  }

  /**
   * Opens the device for use.
   *
   * @throws {DOMException} `NetworkError` when it cannot be opened.
   */
  async open() {
    const isOpen = this.connection !== undefined;
    if (isOpen) {
      return;
    }

    const connection = await guarded(() => this.known.backend.open(this.interfacePath));
    this.connection = connection;
    this.configurationList = [...connection.configurations];
    this.activeValue = connection.activeConfigurationValue;
  }

  /** Closes the device and gives its interfaces back. */
  async close() {
    this.connection?.close();
    this.connection = undefined;
    this.claimedAlternates.clear();
  }

  /** Takes back the permission. */
  async forget() {
    await this.close();
    this.known.grants.forget(this.interfacePath);
    this.known.devices.delete(this.interfacePath);
  }

  /**
   * Chooses the configuration to use.
   *
   * @param configurationValue - The `configurationValue` of one of the configurations.
   * @throws {DOMException} `NotFoundError` when there is none such, `InvalidStateError` when not open.
   */
  async selectConfiguration(configurationValue: number) {
    const connection = this.requireOpen();
    const isKnown = this.configurationList.some(candidate => candidate.configurationValue === configurationValue);
    if (!isKnown) {
      throw notFound("The configuration index exceeds the number of configurations on this device.");
    }

    await guarded(() => connection.selectConfiguration(configurationValue));
    this.activeValue = configurationValue;
    this.claimedAlternates.clear();
  }

  /**
   * Takes an interface for this page's use.
   *
   * @param interfaceNumber - The interface's number.
   * @throws {DOMException} `NotFoundError` when there is none such, `InvalidStateError` without a configuration.
   */
  async claimInterface(interfaceNumber: number) {
    const connection = this.requireOpen();
    this.requireInterface(interfaceNumber);
    await guarded(() => connection.claimInterface(interfaceNumber));
    this.claimedAlternates.set(interfaceNumber, 0);
  }

  /**
   * Gives an interface back.
   *
   * @param interfaceNumber - The interface's number.
   */
  async releaseInterface(interfaceNumber: number) {
    const connection = this.requireOpen();
    this.requireClaimed(interfaceNumber);
    await guarded(() => connection.releaseInterface(interfaceNumber));
    this.claimedAlternates.delete(interfaceNumber);
  }

  /**
   * Chooses an alternate setting of a claimed interface.
   *
   * @param interfaceNumber - The interface's number.
   * @param alternateSetting - The setting's number.
   */
  // eslint-disable-next-line no-restricted-syntax -- the positional signature of the Web API
  async selectAlternateInterface(interfaceNumber: number, alternateSetting: number) {
    const connection = this.requireOpen();
    this.requireClaimed(interfaceNumber);
    const usbInterface = this.requireInterface(interfaceNumber);
    const isKnown = usbInterface.alternates.some(alternate => alternate.alternateSetting === alternateSetting);
    if (!isKnown) {
      throw notFound("The alternate setting does not exist.");
    }

    await guarded(() => connection.selectAlternate({
      interfaceNumber,
      alternateSetting
    }));
    this.claimedAlternates.set(interfaceNumber, alternateSetting);
  }

  /**
   * Reads with a control transfer.
   *
   * @param setup - The setup packet.
   * @param length - How many bytes to ask for.
   * @returns The status and the bytes.
   */
  // eslint-disable-next-line no-restricted-syntax -- the positional signature of the Web API
  async controlTransferIn(setup: UsbSetup, length: number) {
    const connection = this.requireOpen();
    this.requireSetupTarget(setup);
    const result = await guarded(() => connection.controlTransfer({
      direction: UsbDirection.IN,
      setup,
      length
    }));
    return new USBInTransferResult(result.status, result.data === undefined ? undefined : dataViewOf(result.data));
  }

  /**
   * Writes with a control transfer.
   *
   * @param setup - The setup packet.
   * @param data - The bytes to send, if any.
   * @returns The status and how many bytes went.
   */
  // eslint-disable-next-line no-restricted-syntax -- the positional signature of the Web API
  async controlTransferOut(setup: UsbSetup, data?: BufferSource) {
    const connection = this.requireOpen();
    this.requireSetupTarget(setup);
    const bytes = data === undefined ? new Uint8Array() : bytesOfBufferSource(data);
    const result = await guarded(() => connection.controlTransfer({
      direction: UsbDirection.OUT,
      setup,
      length: bytes.length,
      data: bytes
    }));
    return new USBOutTransferResult(result.status, result.bytesWritten ?? 0);
  }

  /**
   * Reads from an endpoint.
   *
   * @param endpointNumber - The endpoint's number, 1 to 15.
   * @param length - How many bytes to ask for.
   * @returns The status and the bytes.
   */
  // eslint-disable-next-line no-restricted-syntax -- the positional signature of the Web API
  async transferIn(endpointNumber: number, length: number) {
    const connection = this.requireOpen();
    this.requireEndpoint({
      direction: UsbDirection.IN,
      endpointNumber
    });
    const result = await guarded(() => connection.transfer({
      direction: UsbDirection.IN,
      endpointNumber,
      length
    }));
    return new USBInTransferResult(result.status, result.data === undefined ? undefined : dataViewOf(result.data));
  }

  /**
   * Writes to an endpoint.
   *
   * @param endpointNumber - The endpoint's number, 1 to 15.
   * @param data - The bytes to send.
   * @returns The status and how many bytes went.
   */
  // eslint-disable-next-line no-restricted-syntax -- the positional signature of the Web API
  async transferOut(endpointNumber: number, data: BufferSource) {
    const connection = this.requireOpen();
    this.requireEndpoint({
      direction: UsbDirection.OUT,
      endpointNumber
    });
    const bytes = bytesOfBufferSource(data);
    const result = await guarded(() => connection.transfer({
      direction: UsbDirection.OUT,
      endpointNumber,
      length: bytes.length,
      data: bytes
    }));
    return new USBOutTransferResult(result.status, result.bytesWritten ?? 0);
  }

  /**
   * Clears a stalled endpoint.
   *
   * @param direction - `"in"` or `"out"`.
   * @param endpointNumber - The endpoint's number.
   */
  // eslint-disable-next-line no-restricted-syntax -- the positional signature of the Web API
  async clearHalt(direction: UsbDirection, endpointNumber: number) {
    const connection = this.requireOpen();
    this.requireEndpoint({
      direction,
      endpointNumber
    });
    await guarded(() => connection.clearHalt({
      direction,
      endpointNumber
    }));
  }

  /** Resets the device; Windows has no such call for WinUSB devices, so this rejects with `NotSupportedError`. */
  async reset() {
    const connection = this.requireOpen();
    await guarded(() => connection.reset());
  }

  /** Isochronous transfers are not available through WinRT; rejects with `NotSupportedError`. */
  async isochronousTransferIn() {
    throw domException({
      name: DomErrorName.NOT_SUPPORTED,
      message: "Isochronous transfers are not available on Windows through WinRT"
    });
  }

  /** Isochronous transfers are not available through WinRT; rejects with `NotSupportedError`. */
  async isochronousTransferOut() {
    throw domException({
      name: DomErrorName.NOT_SUPPORTED,
      message: "Isochronous transfers are not available on Windows through WinRT"
    });
  }

  /** Called when the device leaves: the open state ends. */
  markGone() {
    this.connection = undefined;
    this.claimedAlternates.clear();
  }

  private requireOpen() {
    const { connection } = this;
    const isClosed = connection === undefined;
    if (isClosed) {
      throw invalidState("The device must be opened first.");
    }

    return connection;
  }

  private requireInterface(interfaceNumber: number) {
    const configuration = this.configurationList.find(candidate => candidate.configurationValue === this.activeValue);
    const isUnconfigured = configuration === undefined;
    if (isUnconfigured) {
      throw invalidState("The device must have a configuration selected.");
    }

    const usbInterface = configuration.interfaces.find(candidate => candidate.interfaceNumber === interfaceNumber);
    const isMissing = usbInterface === undefined;
    if (isMissing) {
      throw notFound("The interface number provided is not supported by the device in its current configuration.");
    }

    return usbInterface;
  }

  private requireClaimed(interfaceNumber: number) {
    const isClaimed = this.claimedAlternates.has(interfaceNumber);
    if (!isClaimed) {
      throw invalidState("The interface must be claimed first.");
    }
  }

  private requireSetupTarget(setup: UsbSetup) {
    const isInterfaceRequest = setup.recipient === UsbRecipient.INTERFACE;
    if (isInterfaceRequest) {
      this.requireClaimed(setup.index & INTERFACE_MASK);
    }
  }

  private requireEndpoint({ direction, endpointNumber }: {
    direction: UsbDirection;
    endpointNumber: number;
  }) {
    const isInRange = Number.isInteger(endpointNumber)
      && endpointNumber >= 1
      && endpointNumber <= MAXIMUM_ENDPOINT_NUMBER;
    if (!isInRange) {
      throw new RangeError(`The endpoint number must be between 1 and ${MAXIMUM_ENDPOINT_NUMBER}`);
    }

    const endpoint = this.claimedEndpoints().find(candidate => candidate.direction === direction
      && candidate.endpointNumber === endpointNumber);
    const isUnclaimed = endpoint === undefined;
    if (isUnclaimed) {
      throw notFound("The specified endpoint is not part of a claimed and selected alternate interface.");
    }

    const isIsochronous = endpoint.type === UsbEndpointType.ISOCHRONOUS;
    if (isIsochronous) {
      throw domException({
        name: DomErrorName.NOT_SUPPORTED,
        message: "Isochronous endpoints are not supported"
      });
    }

    return endpoint;
  }

  private claimedEndpoints() {
    const configuration = this.configurationList.find(candidate => candidate.configurationValue === this.activeValue);
    return [...this.claimedAlternates].flatMap(([interfaceNumber, alternateSetting]) => {
      const usbInterface = configuration?.interfaces.find(candidate => candidate.interfaceNumber === interfaceNumber);
      const alternate = usbInterface?.alternates.find(candidate => candidate.alternateSetting === alternateSetting);
      return alternate?.endpoints ?? [];
    });
  }

  private viewOfConfiguration(configuration: UsbConfigurationInfo) {
    return {
      configurationValue: configuration.configurationValue,
      configurationName: configuration.configurationName,
      interfaces: configuration.interfaces.map(usbInterface => this.viewOfInterface(usbInterface))
    };
  }

  private viewOfInterface(usbInterface: UsbInterfaceInfo) {
    const { interfaceNumber } = usbInterface;
    const alternates = usbInterface.alternates.map(alternate => viewOfAlternate(alternate));
    const claimed = this.claimedAlternates;
    return {
      interfaceNumber,
      alternates,
      get alternate() {
        const selected = claimed.get(interfaceNumber);
        const found = alternates.find(candidate => candidate.alternateSetting === selected);
        return found ?? null;
      },
      get claimed() {
        return claimed.has(interfaceNumber);
      }
    };
  }

  get [Symbol.toStringTag]() {
    return "USBDevice";
  }
}

function viewOfAlternate(alternate: UsbAlternateInfo) {
  return {
    alternateSetting: alternate.alternateSetting,
    interfaceClass: alternate.interfaceClass,
    interfaceSubclass: alternate.interfaceSubclass,
    interfaceProtocol: alternate.interfaceProtocol,
    interfaceName: alternate.interfaceName,
    endpoints: alternate.endpoints.map((endpoint: UsbEndpointInfo) => ({ ...endpoint }))
  };
}

function deviceOf({ known, info }: {
  known: UsbContext;
  info: UsbDeviceInfo;
}) {
  const existing = known.devices.get(info.id);
  const isKnown = existing !== undefined;
  if (isKnown) {
    return existing;
  }

  const created = new USBDevice(known, info);
  known.devices.set(info.id, created);
  return created;
}

/** The `navigator.usb` object. */
export class USB extends DevicePresenceTarget<UsbDeviceInfo> {
  /** Made by `installUsb`. */
  constructor(known: UsbContext) {
    super({
      list: () => known.backend.list(),
      subscribe: onChange => known.backend.subscribe(onChange),
      onAdded(info) {
        const isAllowed = known.grants.has(info.id);
        if (!isAllowed) {
          return undefined;
        }

        return new USBConnectionEvent("connect", {
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
        return new USBConnectionEvent("disconnect", { device });
      }
    });
  }

  /**
   * The USB devices the user allowed earlier that are plugged in now.
   *
   * @returns The devices.
   */
  async getDevices() {
    const known = requireContext();
    const present = await guarded(() => known.backend.list());
    return present
      .filter(info => known.grants.has(info.id))
      .map(info => deviceOf({
        known,
        info
      }));
  }

  /**
   * Lists the devices that match, asks the chooser which one the user wants,
   * and allows it.
   *
   * @param options - The filters (an empty list matches every device) and the WinUI extras.
   * @returns The chosen device.
   * @throws {TypeError} When a filter is not valid.
   * @throws {DOMException} `NotFoundError` when nothing is chosen, `NotAllowedError` without a chooser.
   */
  async requestDevice(options: UsbRequestDeviceOptions) {
    const known = requireContext();
    const { filters } = options;
    const isMissing = !Array.isArray(filters);
    if (isMissing) {
      throw new TypeError("Failed to execute 'requestDevice' on 'USB': required member filters is undefined");
    }

    for (const filter of filters) {
      validateFilter(filter);
    }

    options.signal?.throwIfAborted();
    const present = await guarded(() => known.backend.list());
    const candidates = present.filter(info => filters.length === 0 || filters.some(filter => matchesFilter({
      info,
      filter
    })));
    const [chosen] = await chooseAndGrant({
      chooser: options.chooser ?? known.chooser,
      candidates,
      grants: known.grants,
      emptyMessage: "No device selected.",
      maximum: 1,
      ...options.signal === undefined ? {} : { signal: options.signal }
    });
    return deviceOf({
      known,
      info: chosen
    });
  }

  get [Symbol.toStringTag]() {
    return "USB";
  }
}

/**
 * Defines `navigator.usb` over `Windows.Devices.Usb`. Nothing is defined
 * until this is called; call it on the thread the app's code runs on. Only
 * devices with the WinUSB driver are reachable.
 *
 * @param options - The picker and test stand-ins.
 * @returns The function that closes the devices and takes the API away again.
 */
export function installUsb(options: UsbInstallOptions = {}) {
  const previousContext = context;
  const installed: UsbContext = {
    backend: options.backend ?? windowsUsbBackend(),
    chooser: options.chooser,
    grants: createDeviceGrants(),
    devices: new Map()
  };
  context = installed;
  const usb = new USB(installed);
  const uninstallNavigator = defineNavigatorProperty({
    name: "usb",
    value: usb
  });
  return () => {
    usb.stopWatching();
    for (const device of installed.devices.values()) {
      void device.close();
    }

    uninstallNavigator();
    context = previousContext;
  };
}
