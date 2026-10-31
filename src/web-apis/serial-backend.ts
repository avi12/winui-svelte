import {
  InputStreamOptions,
  SerialDevice,
  SerialError,
  SerialHandshake,
  SerialParity,
  SerialStopBitCount
} from "./hardware-bindings.ts";
import { bufferOf, bytesOf } from "#src/devices/buffers.js";
import { deviceChanges, findAllDevices } from "#src/devices/enumeration.js";

const PROPERTY_PORT_NAME = "System.DeviceInterface.Serial.PortName";
const PROPERTY_VENDOR = "System.DeviceInterface.Serial.UsbVendorId";
const PROPERTY_PRODUCT = "System.DeviceInterface.Serial.UsbProductId";

/** The parities Web Serial names. */
export const SerialParityName = {
  NONE: "none",
  EVEN: "even",
  ODD: "odd"
} as const;
/** One of the values of `SerialParityName`. */
export type SerialParityName = (typeof SerialParityName)[keyof typeof SerialParityName];

/** The flow controls Web Serial names. */
export const SerialFlowControlName = {
  NONE: "none",
  HARDWARE: "hardware"
} as const;
/** One of the values of `SerialFlowControlName`. */
export type SerialFlowControlName = (typeof SerialFlowControlName)[keyof typeof SerialFlowControlName];

/** What went wrong on the line, in the terms of the Web Serial stream errors. */
export const SerialLineError = {
  FRAMING: "FramingError",
  PARITY: "ParityError",
  BUFFER_OVERRUN: "BufferOverrunError",
  BREAK: "BreakError"
} as const;
/** One of the values of `SerialLineError`. */
export type SerialLineError = (typeof SerialLineError)[keyof typeof SerialLineError];

/** What `SerialPort.open` takes, with its defaults filled in. */
export interface SerialSettings {
  readonly baudRate: number;
  readonly dataBits: number;
  readonly stopBits: number;
  readonly parity: SerialParityName;
  readonly bufferSize: number;
  readonly flowControl: SerialFlowControlName;
}

/** The control lines Web Serial sets. */
export interface SerialOutputSignals {
  readonly dataTerminalReady?: boolean;
  readonly requestToSend?: boolean;
  readonly break?: boolean;
}

/** The control lines Web Serial reads. */
export interface SerialInputSignals {
  readonly dataCarrierDetect: boolean;
  readonly clearToSend: boolean;
  readonly ringIndicator: boolean;
  readonly dataSetReady: boolean;
}

/** What is known about a serial port without opening it. */
export interface SerialPortInfo {
  /** The device interface path: the key the port is listed by. */
  readonly id: string;

  /** The port's name, such as `COM3`. */
  readonly portName: string;
  readonly usbVendorId?: number;
  readonly usbProductId?: number;
}

/** An open serial port. */
export interface SerialConnection {
  /** Waits for bytes and returns them; null once the port is closed. */
  read(length: number): Promise<Uint8Array | null>;
  write(data: Uint8Array): Promise<void>;
  setSignals(signals: SerialOutputSignals): void;
  getSignals(): SerialInputSignals;

  /** Calls back when the line reports an error, until the returned function is called. */
  onError(callback: (error: SerialLineError) => void): () => void;
  close(): void;
}

/** Everything the Web Serial classes need from the system; the tests give their own. */
export interface SerialBackend {
  list(): Promise<readonly SerialPortInfo[]>;
  open(request: {
    id: string;
    settings: SerialSettings;
  }): Promise<SerialConnection>;

  /** Calls back whenever the list may have changed. */
  subscribe(onChange: () => void): () => void;
}

/** What a backend throws when the port or the system says no. */
export class SerialFailure extends Error {
  override readonly name = "SerialFailure";
}

function numberProperty(value: unknown) {
  return typeof value === "number" ? value : undefined;
}

function parityOf(name: SerialParityName) {
  const parities = new Map<SerialParityName, SerialParity>([
    [SerialParityName.NONE, SerialParity.None],
    [SerialParityName.EVEN, SerialParity.Even],
    [SerialParityName.ODD, SerialParity.Odd]
  ]);
  return parities.get(name) ?? SerialParity.None;
}

function connectionOf(device: SerialDevice) {
  const closing = new AbortController();
  const lineErrors = new Map<SerialError, SerialLineError>([
    [SerialError.Frame, SerialLineError.FRAMING],
    [SerialError.ReceiveParity, SerialLineError.PARITY],
    [SerialError.BufferOverrun, SerialLineError.BUFFER_OVERRUN],
    [SerialError.ReceiveFull, SerialLineError.BUFFER_OVERRUN]
  ]);
  return {
    async read(length) {
      try {
        const buffer = await device.inputStream.readAsync(
          bufferOf(new Uint8Array(length)),
          length,
          InputStreamOptions.Partial,
          closing.signal
        );
        return bytesOf(buffer);
      } catch (thrown) {
        const isClosing = closing.signal.aborted;
        if (isClosing) {
          return null;
        }

        throw thrown;
      }
    },
    async write(data) {
      await device.outputStream.writeAsync(bufferOf(data));
    },
    setSignals(signals) {
      const hasTerminal = signals.dataTerminalReady !== undefined;
      const hasRequest = signals.requestToSend !== undefined;
      const hasBreak = signals.break !== undefined;
      if (hasTerminal) {
        device.isDataTerminalReadyEnabled = signals.dataTerminalReady === true;
      }

      if (hasRequest) {
        device.isRequestToSendEnabled = signals.requestToSend === true;
      }

      if (hasBreak) {
        device.breakSignalState = signals.break === true;
      }
    },
    getSignals: () => ({
      dataCarrierDetect: device.carrierDetectState,
      clearToSend: device.clearToSendState,
      ringIndicator: false,
      dataSetReady: device.dataSetReadyState
    }),
    onError: callback => device.onErrorReceived((_sender, args) => {
      const error = lineErrors.get(args.error);
      const isKnown = error !== undefined;
      if (isKnown) {
        callback(error);
      }
    }),
    close() {
      closing.abort();
      device.close();
    }
  } satisfies SerialConnection;
}

/**
 * The real backend over `Windows.Devices.SerialCommunication.SerialDevice`:
 * ports are listed from their device interfaces without being opened, and
 * opened only by `open()`.
 *
 * @returns A backend over Windows serial ports.
 */
export function windowsSerialBackend() {
  const selector = SerialDevice.getDeviceSelector();
  return {
    async list() {
      const found = await findAllDevices({
        selector,
        requestedProperties: [PROPERTY_PORT_NAME, PROPERTY_VENDOR, PROPERTY_PRODUCT]
      });
      return found.map(snapshot => {
        const portName = snapshot.properties.get(PROPERTY_PORT_NAME);
        const usbVendorId = numberProperty(snapshot.properties.get(PROPERTY_VENDOR));
        const usbProductId = numberProperty(snapshot.properties.get(PROPERTY_PRODUCT));
        return {
          id: snapshot.id,
          portName: typeof portName === "string" ? portName : snapshot.name,
          ...usbVendorId === undefined ? {} : { usbVendorId },
          ...usbProductId === undefined ? {} : { usbProductId }
        } satisfies SerialPortInfo;
      });
    },
    async open({ id, settings }) {
      const device = await SerialDevice.fromIdAsync(id);
      device.baudRate = settings.baudRate;
      device.dataBits = settings.dataBits;
      device.parity = parityOf(settings.parity);
      device.stopBits = settings.stopBits === 2 ? SerialStopBitCount.Two : SerialStopBitCount.One;
      device.handshake = settings.flowControl === SerialFlowControlName.HARDWARE
        ? SerialHandshake.RequestToSend
        : SerialHandshake.None;
      return connectionOf(device);
    },
    subscribe: onChange => deviceChanges({ selector })(onChange)
  } satisfies SerialBackend;
}
