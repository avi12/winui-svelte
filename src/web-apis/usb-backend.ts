import { InputStreamOptions, UsbControlRequestType, UsbDevice, UsbSetupPacket } from "./hardware-bindings.ts";
import { bufferOf, bytesOf } from "#src/devices/buffers.js";
import { deviceChanges, findAllDevices } from "#src/devices/enumeration.js";

const WINUSB_INTERFACE_CLASS = "{dee824ef-729b-4a0e-9c14-b7117d33a817}";
const BULK_IN_DIRECTION_BIT = 0x80;
const REQUEST_TYPE_SHIFT = 5;
const DIRECTION_SHIFT = 7;
const PROPERTY_VENDOR = "System.DeviceInterface.WinUsb.UsbVendorId";
const PROPERTY_PRODUCT = "System.DeviceInterface.WinUsb.UsbProductId";
const PROPERTY_CLASS = "System.DeviceInterface.WinUsb.UsbClass";
const PROPERTY_SUBCLASS = "System.DeviceInterface.WinUsb.UsbSubClass";
const PROPERTY_PROTOCOL = "System.DeviceInterface.WinUsb.UsbProtocol";
const PROPERTY_INSTANCE = "System.Devices.DeviceInstanceId";
const BCD_MAJOR_SHIFT = 8;
const BYTE_MASK = 0xFF;
const NIBBLE_SHIFT = 4;
const NIBBLE_MASK = 0xF;

/** The three outcomes of a USB transfer. */
export const UsbTransferStatus = {
  OK: "ok",
  STALL: "stall",
  BABBLE: "babble"
} as const;
/** One of the values of `UsbTransferStatus`. */
export type UsbTransferStatus = (typeof UsbTransferStatus)[keyof typeof UsbTransferStatus];

/** Which way a transfer or an endpoint goes, seen from the host. */
export const UsbDirection = {
  IN: "in",
  OUT: "out"
} as const;
/** One of the values of `UsbDirection`. */
export type UsbDirection = (typeof UsbDirection)[keyof typeof UsbDirection];

/** The kinds of endpoint. */
export const UsbEndpointType = {
  BULK: "bulk",
  INTERRUPT: "interrupt",
  ISOCHRONOUS: "isochronous"
} as const;
/** One of the values of `UsbEndpointType`. */
export type UsbEndpointType = (typeof UsbEndpointType)[keyof typeof UsbEndpointType];

/** The three kinds of control request, and where they are addressed. */
export const UsbRequestType = {
  STANDARD: "standard",
  CLASS: "class",
  VENDOR: "vendor"
} as const;
/** One of the values of `UsbRequestType`. */
export type UsbRequestType = (typeof UsbRequestType)[keyof typeof UsbRequestType];

/** Where a control request is addressed. */
export const UsbRecipient = {
  DEVICE: "device",
  INTERFACE: "interface",
  ENDPOINT: "endpoint",
  OTHER: "other"
} as const;
/** One of the values of `UsbRecipient`. */
export type UsbRecipient = (typeof UsbRecipient)[keyof typeof UsbRecipient];

/** The setup packet of a control transfer, as WebUSB has it. */
export interface UsbSetup {
  readonly requestType: UsbRequestType;
  readonly recipient: UsbRecipient;
  readonly request: number;
  readonly value: number;
  readonly index: number;
}

/** One endpoint of an interface. */
export interface UsbEndpointInfo {
  readonly endpointNumber: number;
  readonly direction: UsbDirection;
  readonly type: UsbEndpointType;
  readonly packetSize: number;
}

/** One alternate setting of an interface. */
export interface UsbAlternateInfo {
  readonly alternateSetting: number;
  readonly interfaceClass: number;
  readonly interfaceSubclass: number;
  readonly interfaceProtocol: number;
  readonly interfaceName?: string;
  readonly endpoints: readonly UsbEndpointInfo[];
}

/** One interface of a configuration. */
export interface UsbInterfaceInfo {
  readonly interfaceNumber: number;
  readonly alternates: readonly UsbAlternateInfo[];
}

/** One configuration of a device. */
export interface UsbConfigurationInfo {
  readonly configurationValue: number;
  readonly configurationName?: string;
  readonly interfaces: readonly UsbInterfaceInfo[];
}

/** What is known about a device without opening it. */
export interface UsbDeviceInfo {
  /** The device interface path: the key the device is listed by. */
  readonly id: string;
  readonly vendorId: number;
  readonly productId: number;
  readonly usbVersion: number;
  readonly deviceVersion: number;
  readonly deviceClass: number;
  readonly deviceSubclass: number;
  readonly deviceProtocol: number;
  readonly productName?: string;
  readonly serialNumber?: string;
}

/** The result of one transfer. */
export interface UsbTransferResult {
  readonly status: UsbTransferStatus;

  /** What an IN transfer read. */
  readonly data?: Uint8Array;

  /** What an OUT transfer wrote. */
  readonly bytesWritten?: number;
}

/** An open device. */
export interface UsbConnection {
  /** The configurations the open device reports. */
  readonly configurations: readonly UsbConfigurationInfo[];

  /** The configuration in use, or null. */
  readonly activeConfigurationValue: number | null;
  close(): void;
  selectConfiguration(configurationValue: number): Promise<void>;
  claimInterface(interfaceNumber: number): Promise<void>;
  releaseInterface(interfaceNumber: number): Promise<void>;
  selectAlternate(request: {
    interfaceNumber: number;
    alternateSetting: number;
  }): Promise<void>;
  controlTransfer(request: {
    direction: UsbDirection;
    setup: UsbSetup;
    length: number;
    data?: Uint8Array;
  }): Promise<UsbTransferResult>;
  transfer(request: {
    direction: UsbDirection;
    endpointNumber: number;
    length: number;
    data?: Uint8Array;
  }): Promise<UsbTransferResult>;
  clearHalt(request: {
    direction: UsbDirection;
    endpointNumber: number;
  }): Promise<void>;
  reset(): Promise<void>;
}

/** Everything the WebUSB classes need from the system; the tests give their own. */
export interface UsbBackend {
  list(): Promise<readonly UsbDeviceInfo[]>;
  open(id: string): Promise<UsbConnection>;

  /** Calls back whenever the list may have changed. */
  subscribe(onChange: () => void): () => void;
}

/** What a backend throws when the device or the system says no. */
export class UsbFailure extends Error {
  override readonly name = "UsbFailure";
  readonly isUnsupported: boolean;

  constructor({ message, isUnsupported = false }: {
    message: string;
    isUnsupported?: boolean;
  }) {
    super(message);
    this.isUnsupported = isUnsupported;
  }
}

function numberProperty(value: unknown) {
  return typeof value === "number" ? value : 0;
}

function serialOf(instanceId: unknown) {
  const text = typeof instanceId === "string" ? instanceId : "";
  const last = text.split("\\").at(-1);
  const isSerial = last !== undefined && !last.includes("&");
  return isSerial ? last : undefined;
}

function setupByte({ direction, setup }: {
  direction: UsbDirection;
  setup: UsbSetup;
}) {
  const types = [UsbRequestType.STANDARD, UsbRequestType.CLASS, UsbRequestType.VENDOR];
  const recipients = [UsbRecipient.DEVICE, UsbRecipient.INTERFACE, UsbRecipient.ENDPOINT, UsbRecipient.OTHER];
  const directionBit = direction === UsbDirection.IN ? 1 : 0;
  return (directionBit << DIRECTION_SHIFT) | (types.indexOf(setup.requestType) << REQUEST_TYPE_SHIFT)
    | recipients.indexOf(setup.recipient);
}

function packetOf({ direction, setup, length }: {
  direction: UsbDirection;
  setup: UsbSetup;
  length: number;
}) {
  const requestType = UsbControlRequestType.create();
  requestType.asByte = setupByte({
    direction,
    setup
  });
  const packet = UsbSetupPacket.createDefault();
  packet.requestType = requestType;
  packet.request = setup.request;
  packet.value = setup.value;
  packet.index = setup.index;
  packet.length = length;
  return packet;
}

function configurationOf(device: UsbDevice) {
  const { configuration } = device;
  const usbInterfaces = [...configuration.usbInterfaces ?? []];
  return {
    configurationValue: configuration.configurationDescriptor.configurationValue,
    interfaces: usbInterfaces.map(usbInterface => ({
      interfaceNumber: usbInterface.interfaceNumber,
      alternates: [...usbInterface.interfaceSettings ?? []].map((setting, alternateSetting) => ({
        alternateSetting,
        interfaceClass: setting.interfaceDescriptor.classCode,
        interfaceSubclass: setting.interfaceDescriptor.subclassCode,
        interfaceProtocol: setting.interfaceDescriptor.protocolCode,
        endpoints: [
          ...[...setting.bulkInEndpoints ?? []].map(endpoint => ({
            endpointNumber: endpoint.endpointNumber,
            direction: UsbDirection.IN,
            type: UsbEndpointType.BULK,
            packetSize: endpoint.maxPacketSize
          })),
          ...[...setting.bulkOutEndpoints ?? []].map(endpoint => ({
            endpointNumber: endpoint.endpointNumber,
            direction: UsbDirection.OUT,
            type: UsbEndpointType.BULK,
            packetSize: endpoint.maxPacketSize
          })),
          ...[...setting.interruptInEndpoints ?? []].map(endpoint => ({
            endpointNumber: endpoint.endpointNumber,
            direction: UsbDirection.IN,
            type: UsbEndpointType.INTERRUPT,
            packetSize: endpoint.maxPacketSize
          })),
          ...[...setting.interruptOutEndpoints ?? []].map(endpoint => ({
            endpointNumber: endpoint.endpointNumber,
            direction: UsbDirection.OUT,
            type: UsbEndpointType.INTERRUPT,
            packetSize: endpoint.maxPacketSize
          }))
        ]
      }))
    }))
  } satisfies UsbConfigurationInfo;
}

function pipesOf({ device, direction, endpointNumber }: {
  device: UsbDevice;
  direction: UsbDirection;
  endpointNumber: number;
}) {
  const usbInterfaces = [...device.configuration.usbInterfaces ?? []];
  const isIn = direction === UsbDirection.IN;
  const bulk = usbInterfaces.flatMap(usbInterface => [
    ...(isIn ? usbInterface.bulkInPipes : usbInterface.bulkOutPipes) ?? []
  ]);
  const wanted = endpointNumber & ~BULK_IN_DIRECTION_BIT;
  return bulk.filter(pipe => pipe.endpointDescriptor.endpointNumber === wanted);
}

function connectionOf(device: UsbDevice) {
  const configuration = configurationOf(device);
  return {
    configurations: [configuration],
    activeConfigurationValue: configuration.configurationValue,
    close: () => device.close(),
    selectConfiguration(configurationValue) {
      const isCurrent = configurationValue === configuration.configurationValue;
      if (isCurrent) {
        return Promise.resolve();
      }

      return Promise.reject(
        new UsbFailure({
          message: "Windows selects the configuration of a WinUSB device itself",
          isUnsupported: true
        })
      );
    },
    claimInterface: () => Promise.resolve(),
    releaseInterface: () => Promise.resolve(),
    async selectAlternate({ interfaceNumber, alternateSetting }) {
      const usbInterface = [...device.configuration.usbInterfaces ?? []]
        .find(candidate => candidate.interfaceNumber === interfaceNumber);
      const setting = [...usbInterface?.interfaceSettings ?? []][alternateSetting];
      await setting?.selectSettingAsync();
    },
    async controlTransfer({ direction, setup, length, data }) {
      const packet = packetOf({
        direction,
        setup,
        length
      });
      const isRead = direction === UsbDirection.IN;
      if (isRead) {
        const buffer = await device.sendControlInTransferAsync(packet, bufferOf(new Uint8Array(length)));
        return {
          status: UsbTransferStatus.OK,
          data: bytesOf(buffer)
        };
      }

      const bytesWritten = await device.sendControlOutTransferAsync(packet, bufferOf(data ?? new Uint8Array()));
      return {
        status: UsbTransferStatus.OK,
        bytesWritten
      };
    },
    async transfer({ direction, endpointNumber, length, data }) {
      const [pipe] = pipesOf({
        device,
        direction,
        endpointNumber
      });
      const isMissing = pipe === undefined;
      if (isMissing) {
        throw new UsbFailure({
          message: "only bulk endpoints can be transferred on Windows",
          isUnsupported: true
        });
      }

      const isInput = "inputStream" in pipe;
      if (isInput) {
        const buffer = await pipe.inputStream.readAsync(
          bufferOf(new Uint8Array(length)),
          length,
          InputStreamOptions.Partial
        );
        return {
          status: UsbTransferStatus.OK,
          data: bytesOf(buffer)
        };
      }

      const bytesWritten = await pipe.outputStream.writeAsync(bufferOf(data ?? new Uint8Array()));
      return {
        status: UsbTransferStatus.OK,
        bytesWritten
      };
    },
    async clearHalt({ direction, endpointNumber }) {
      for (const pipe of pipesOf({
        device,
        direction,
        endpointNumber
      })) {
        await pipe.clearStallAsync();
      }
    },
    reset: () => Promise.reject(
      new UsbFailure({
        message: "Windows has no device reset for WinUSB devices",
        isUnsupported: true
      })
    )
  } satisfies UsbConnection;
}

/**
 * The real backend over `Windows.Devices.Usb.UsbDevice`: devices with the
 * WinUSB driver are listed without being opened, and opened only by
 * `open()`.
 *
 * @returns A backend over Windows USB.
 */
export function windowsUsbBackend() {
  const selector = UsbDevice.getDeviceSelector(WINUSB_INTERFACE_CLASS);
  return {
    async list() {
      const found = await findAllDevices({
        selector,
        requestedProperties: [
          PROPERTY_VENDOR,
          PROPERTY_PRODUCT,
          PROPERTY_CLASS,
          PROPERTY_SUBCLASS,
          PROPERTY_PROTOCOL,
          PROPERTY_INSTANCE
        ]
      });
      return found.map(snapshot => {
        const serialNumber = serialOf(snapshot.properties.get(PROPERTY_INSTANCE));
        return {
          id: snapshot.id,
          vendorId: numberProperty(snapshot.properties.get(PROPERTY_VENDOR)),
          productId: numberProperty(snapshot.properties.get(PROPERTY_PRODUCT)),
          usbVersion: 0,
          deviceVersion: 0,
          deviceClass: numberProperty(snapshot.properties.get(PROPERTY_CLASS)),
          deviceSubclass: numberProperty(snapshot.properties.get(PROPERTY_SUBCLASS)),
          deviceProtocol: numberProperty(snapshot.properties.get(PROPERTY_PROTOCOL)),
          productName: snapshot.name,
          ...serialNumber === undefined ? {} : { serialNumber }
        } satisfies UsbDeviceInfo;
      });
    },
    async open(id) {
      return connectionOf(await UsbDevice.fromIdAsync(id));
    },
    subscribe: onChange => deviceChanges({ selector })(onChange)
  } satisfies UsbBackend;
}

/**
 * The version bytes of a binary-coded decimal number, as WebUSB splits them
 * (`0x0210` is major 2, minor 1, subminor 0).
 *
 * @param bcd - The BCD number.
 * @returns Its major, minor and subminor.
 */
export function versionOfBcd(bcd: number) {
  return {
    major: (bcd >> BCD_MAJOR_SHIFT) & BYTE_MASK,
    minor: (bcd >> NIBBLE_SHIFT) & NIBBLE_MASK,
    subminor: bcd & NIBBLE_MASK
  };
}
