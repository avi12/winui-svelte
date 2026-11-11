import { bytesOfBufferSource } from "./buffer-source.ts";
import { chooseOneMatching, createDeviceGrants } from "./device-grants.ts";
import type { DeviceChooser, DeviceGrants } from "./device-grants.ts";
import { DevicePresenceTarget } from "./device-presence.ts";
import { DomErrorName, domException } from "./dom-exception.ts";
import { ConnectionHandlerTarget } from "./event-handlers.ts";
import { defineNavigatorProperty } from "./install.ts";
import type {
  SerialBackend,
  SerialConnection,
  SerialOutputSignals,
  SerialPortInfo,
  SerialSettings
} from "./serial-backend.ts";
import { SerialFailure, SerialFlowControlName, SerialParityName, windowsSerialBackend } from "./serial-backend.ts";

export type {
  SerialBackend,
  SerialConnection,
  SerialOutputSignals,
  SerialPortInfo,
  SerialSettings
} from "./serial-backend.ts";
export type { DeviceChooser } from "./device-grants.ts";
export { SerialFailure, SerialFlowControlName, SerialLineError, SerialParityName } from "./serial-backend.ts";

const DEFAULT_DATA_BITS = 8;
const DEFAULT_STOP_BITS = 1;
const DEFAULT_BUFFER_SIZE = 255;
const MAXIMUM_BUFFER_SIZE = 16_777_216;
const SEVEN_DATA_BITS = 7;
const DATA_BITS = [SEVEN_DATA_BITS, DEFAULT_DATA_BITS];
const STOP_BITS = [DEFAULT_STOP_BITS, 2];

/** The options of `SerialPort.open`. */
export interface SerialOptions {
  readonly baudRate: number;
  readonly dataBits?: number;
  readonly stopBits?: number;
  readonly parity?: SerialParityName;
  readonly bufferSize?: number;
  readonly flowControl?: SerialFlowControlName;
}

/** One way to recognise a port in `requestPort`: every part given must match. */
export interface SerialPortFilter {
  readonly usbVendorId?: number;
  readonly usbProductId?: number;
}

/** The options of `requestPort`, with the extras a browser does not have. */
export interface SerialRequestPortOptions {
  readonly filters?: readonly SerialPortFilter[];

  /** WinUI-only: the picker for this call, instead of the one given at install. */
  readonly chooser?: DeviceChooser<SerialPortInfo>;

  /** WinUI-only: ends the chooser. */
  readonly signal?: AbortSignal;
}

/** What `installSerial` takes. */
export interface SerialInstallOptions {
  /** Stands in for Windows serial ports; the tests give one. */
  readonly backend?: SerialBackend;

  /**
   * The picker `requestPort` asks. A browser shows a dialog here; without a
   * chooser (or one on the call) `requestPort` rejects with `NotAllowedError`.
   */
  readonly chooser?: DeviceChooser<SerialPortInfo>;
}

interface SerialContext {
  readonly backend: SerialBackend;
  readonly chooser: DeviceChooser<SerialPortInfo> | undefined;
  readonly grants: DeviceGrants<SerialPortInfo>;
  readonly ports: Map<string, SerialPort>;
}

declare global {
  // The Web Serial entry point, which the DOM library does not have.
  interface Navigator {
    readonly serial: Serial;
  }
}

let context: SerialContext | undefined;

function requireContext() {
  if (!context) {
    throw domException({
      name: DomErrorName.INVALID_STATE,
      message: "Serial is not installed: call installSerial() first"
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
    const isFailure = thrown instanceof SerialFailure;
    throw isFailure ? domException({
      name,
      message: thrown.message
    }) : thrown;
  }
}

function invalidState(message: string) {
  return domException({
    name: DomErrorName.INVALID_STATE,
    message
  });
}

function settingsOf(options: SerialOptions) {
  const {
    baudRate,
    dataBits = DEFAULT_DATA_BITS,
    stopBits = DEFAULT_STOP_BITS,
    bufferSize = DEFAULT_BUFFER_SIZE
  } = options;
  const isBaudRateValid = Number.isInteger(baudRate) && baudRate > 0;
  if (!isBaudRateValid) {
    throw new TypeError("Failed to execute 'open' on 'SerialPort': a positive baudRate is required");
  }

  const isFramingValid = DATA_BITS.includes(dataBits) && STOP_BITS.includes(stopBits);
  if (!isFramingValid) {
    throw new TypeError("Failed to execute 'open' on 'SerialPort': dataBits must be 7 or 8 and stopBits 1 or 2");
  }

  const isBufferValid = Number.isInteger(bufferSize) && bufferSize > 0 && bufferSize < MAXIMUM_BUFFER_SIZE;
  if (!isBufferValid) {
    throw new TypeError("Failed to execute 'open' on 'SerialPort': bufferSize must be between 1 and 16777215");
  }

  return {
    baudRate,
    dataBits,
    stopBits,
    parity: options.parity ?? SerialParityName.NONE,
    bufferSize,
    flowControl: options.flowControl ?? SerialFlowControlName.NONE
  } satisfies SerialSettings;
}

function matchesFilter({ info, filter }: {
  info: SerialPortInfo;
  filter: SerialPortFilter;
}) {
  const isVendorKept = filter.usbVendorId === undefined || info.usbVendorId === filter.usbVendorId;
  const isProductKept = filter.usbProductId === undefined || info.usbProductId === filter.usbProductId;
  return isVendorKept && isProductKept;
}

/** `connect` and `disconnect` events: the port that came or went. */
export class SerialConnectionEvent extends Event {
  readonly port: SerialPort;

  /** Made when a port the page may use arrives or leaves. */
  constructor(type: string, init: { port: SerialPort }) {
    super(type, { bubbles: true });
    this.port = init.port;
  }
}

/** One serial port the user allowed this page to use. */
export class SerialPort extends ConnectionHandlerTarget {
  /** The port's name, such as `COM3`. WinUI-only. */
  readonly portName: string;

  /** The Windows device interface path. WinUI-only. */
  readonly interfacePath: string;
  private readonly info: SerialPortInfo;
  private connection: SerialConnection | undefined;
  private currentReadable: ReadableStream<Uint8Array> | null = null;
  private currentWritable: WritableStream<BufferSource> | null = null;
  private stopErrors: (() => void) | undefined;
  private isPresent = true;
  private pendingRead: Promise<Uint8Array | null> | undefined;
  private readonly known: SerialContext;

  /** Made by `getPorts` and `requestPort`. */
  constructor(known: SerialContext, info: SerialPortInfo) {
    super();
    this.known = known;
    this.info = info;
    this.portName = info.portName;
    this.interfacePath = info.id;
  }

  /** Whether the port is plugged in. */
  get connected() {
    return this.isPresent;
  }

  get readable() {
    return this.currentReadable;
  }

  get writable() {
    return this.currentWritable;
  }

  /**
   * What identifies the port when it is a USB one.
   *
   * @returns The vendor and product ids, when there are any.
   */
  getInfo() {
    return {
      ...this.info.usbVendorId === undefined ? {} : { usbVendorId: this.info.usbVendorId },
      ...this.info.usbProductId === undefined ? {} : { usbProductId: this.info.usbProductId }
    };
  }

  /**
   * Opens the port; `readable` and `writable` are streams of bytes after.
   *
   * @param options - The line settings; `baudRate` is required.
   * @throws {TypeError} When a setting is not valid.
   * @throws {DOMException} `InvalidStateError` when already open, `NetworkError` when it cannot be opened.
   */
  async open(options: SerialOptions) {
    const settings = settingsOf(options);
    const isOpen = this.connection !== undefined;
    if (isOpen) {
      throw invalidState("The port is already open.");
    }

    const connection = await guarded({
      work: () => this.known.backend.open({
        id: this.interfacePath,
        settings
      }),
      name: DomErrorName.NETWORK
    });
    this.connection = connection;
    this.currentWritable = this.createWritable(connection);
    this.currentReadable = this.createReadable({
      connection,
      bufferSize: settings.bufferSize
    });
  }

  /**
   * Closes the port after cancelling its readable and closing its writable.
   *
   * @throws {TypeError} When either stream is locked, as a stream cannot be cancelled then.
   * @throws {DOMException} `InvalidStateError` when the port is not open.
   */
  async close() {
    const connection = this.requireOpen();
    const { currentReadable: readable, currentWritable: writable } = this;
    const isLocked = readable?.locked === true || writable?.locked === true;
    if (isLocked) {
      throw new TypeError("Cannot close the port while its streams are locked: release the reader and the writer first");
    }

    this.connection = undefined;
    this.currentReadable = null;
    this.currentWritable = null;
    this.stopErrors?.();
    this.stopErrors = undefined;
    await Promise.all([readable?.cancel(), writable?.close()]);
    connection.close();
  }

  /** Takes back the permission; an open port is closed if its streams are free. */
  async forget() {
    const isOpen = this.connection !== undefined;
    if (isOpen) {
      await this.close();
    }

    this.known.grants.forget(this.interfacePath);
    this.known.ports.delete(this.interfacePath);
  }

  /**
   * Sets the output control lines.
   *
   * @param signals - At least one of `dataTerminalReady`, `requestToSend` and `break`.
   * @throws {TypeError} When none is given.
   */
  async setSignals(signals: SerialOutputSignals = {}) {
    const connection = this.requireOpen();
    const isEmpty = Object.values(signals).every(value => value === undefined);
    if (isEmpty) {
      throw new TypeError("Failed to execute 'setSignals' on 'SerialPort': at least one signal is required");
    }

    connection.setSignals(signals);
  }

  /**
   * Reads the input control lines.
   *
   * @returns The lines' states.
   */
  async getSignals() {
    return this.requireOpen().getSignals();
  }

  /** Called when the port leaves: the open state ends. */
  markGone() {
    this.isPresent = false;
    this.connection = undefined;
    this.currentReadable = null;
    this.currentWritable = null;
    this.stopErrors?.();
    this.stopErrors = undefined;
  }

  /** Closes the port without waiting for its streams; used when the API is uninstalled. */
  dispose() {
    this.connection?.close();
    this.markGone();
  }

  /** Called when the port arrives again. */
  markBack() {
    this.isPresent = true;
  }

  private requireOpen() {
    const { connection } = this;
    const isClosed = connection === undefined;
    if (isClosed) {
      throw invalidState("The port is not open.");
    }

    return connection;
  }

  private createReadable({ connection, bufferSize }: {
    connection: SerialConnection;
    bufferSize: number;
  }) {
    let current: ReadableStreamDefaultController<Uint8Array> | undefined;
    let isErrored = false;
    const nextChunk = () => this.nextChunk({
      connection,
      bufferSize
    });
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        current = controller;
      },
      async pull(controller) {
        const chunk = await nextChunk();
        if (isErrored) {
          return;
        }

        const isEnd = chunk === null;
        if (isEnd) {
          controller.close();
          return;
        }

        controller.enqueue(chunk);
      }
    }, new ByteLengthQueuingStrategy({ highWaterMark: bufferSize }));
    this.stopErrors?.();
    this.stopErrors = connection.onError(error => {
      isErrored = true;
      current?.error(new DOMException(`The serial line reported ${error}`, error));
      const isStillOpen = this.connection === connection;
      if (isStillOpen) {
        this.currentReadable = this.createReadable({
          connection,
          bufferSize
        });
      }
    });
    return stream;
  }

  private nextChunk({ connection, bufferSize }: {
    connection: SerialConnection;
    bufferSize: number;
  }) {
    const read = this.pendingRead ?? connection.read(bufferSize);
    this.pendingRead = read;
    return read.finally(() => {
      const isCurrent = this.pendingRead === read;
      if (isCurrent) {
        this.pendingRead = undefined;
      }
    });
  }

  private createWritable(connection: SerialConnection) {
    return new WritableStream<BufferSource>({
      async write(chunk) {
        await guarded({
          work: () => connection.write(bytesOfBufferSource(chunk)),
          name: DomErrorName.NETWORK
        });
      }
    });
  }

  get [Symbol.toStringTag]() {
    return "SerialPort";
  }
}

function portOf({ known, info }: {
  known: SerialContext;
  info: SerialPortInfo;
}) {
  const existing = known.ports.get(info.id);
  const isKnown = existing !== undefined;
  if (isKnown) {
    return existing;
  }

  const created = new SerialPort(known, info);
  known.ports.set(info.id, created);
  return created;
}

/** The `navigator.serial` object. */
export class Serial extends DevicePresenceTarget<SerialPortInfo> {
  /** Made by `installSerial`. */
  constructor(known: SerialContext) {
    super({
      list: () => known.backend.list(),
      subscribe: onChange => known.backend.subscribe(onChange),
      onAdded(info) {
        const isAllowed = known.grants.has(info.id);
        if (!isAllowed) {
          return undefined;
        }

        const port = portOf({
          known,
          info
        });
        port.markBack();
        port.dispatchEvent(new SerialConnectionEvent("connect", { port }));
        return new SerialConnectionEvent("connect", { port });
      },
      onRemoved(info) {
        const port = known.ports.get(info.id);
        const isUnknown = port === undefined;
        if (isUnknown) {
          return undefined;
        }

        port.markGone();
        port.dispatchEvent(new SerialConnectionEvent("disconnect", { port }));
        return new SerialConnectionEvent("disconnect", { port });
      }
    });
  }

  /**
   * The ports the user allowed earlier that are plugged in now.
   *
   * @returns The ports.
   */
  async getPorts() {
    const known = requireContext();
    const present = await guarded({
      work: () => known.backend.list(),
      name: DomErrorName.NETWORK
    });
    return present
      .filter(info => known.grants.has(info.id))
      .map(info => portOf({
        known,
        info
      }));
  }

  /**
   * Lists the ports that match, asks the chooser which one the user wants,
   * and allows it.
   *
   * @param options - The filters (none matches every port) and the WinUI extras.
   * @returns The chosen port.
   * @throws {TypeError} When a filter has a product id without a vendor id.
   * @throws {DOMException} `NotFoundError` when nothing is chosen, `NotAllowedError` without a chooser.
   */
  async requestPort(options: SerialRequestPortOptions = {}) {
    const known = requireContext();
    const filters = options.filters ?? [];
    const isInvalid = filters.some(filter => filter.usbProductId !== undefined && filter.usbVendorId === undefined);
    if (isInvalid) {
      throw new TypeError("Failed to execute 'requestPort' on 'Serial': usbProductId needs usbVendorId");
    }

    options.signal?.throwIfAborted();
    const present = await guarded({
      work: () => known.backend.list(),
      name: DomErrorName.NETWORK
    });
    const chosen = await chooseOneMatching({
      present,
      filters,
      matches: matchesFilter,
      chooser: options.chooser ?? known.chooser,
      grants: known.grants,
      emptyMessage: "No port selected by the user.",
      ...options.signal === undefined ? {} : { signal: options.signal }
    });
    return portOf({
      known,
      info: chosen
    });
  }

  get [Symbol.toStringTag]() {
    return "Serial";
  }
}

/**
 * Defines `navigator.serial` over `Windows.Devices.SerialCommunication`.
 * Nothing is defined until this is called; call it on the thread the app's
 * code runs on.
 *
 * @param options - The picker and test stand-ins.
 * @returns The function that closes the ports and takes the API away again.
 */
export function installSerial(options: SerialInstallOptions = {}) {
  const previousContext = context;
  const installed: SerialContext = {
    backend: options.backend ?? windowsSerialBackend(),
    chooser: options.chooser,
    grants: createDeviceGrants(),
    ports: new Map()
  };
  context = installed;
  const serial = new Serial(installed);
  const uninstallNavigator = defineNavigatorProperty({
    name: "serial",
    value: serial
  });
  return () => {
    serial.stopWatching();
    for (const port of installed.ports.values()) {
      port.dispose();
    }

    uninstallNavigator();
    context = previousContext;
  };
}
