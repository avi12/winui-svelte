import type {
  BluetoothBackend,
  BluetoothCandidate,
  BluetoothCharacteristicFlags,
  BluetoothCharacteristicHandle,
  BluetoothConnection,
  BluetoothDescriptorHandle,
  BluetoothServiceHandle
} from "./bluetooth-backend.ts";
import { BluetoothFailure, BluetoothFailureKind, windowsBluetoothBackend } from "./bluetooth-backend.ts";
import { bytesOfBufferSource, dataViewOf } from "./buffer-source.ts";
import { chooseDevices, createDeviceGrants } from "./device-grants.ts";
import type { DeviceChooser, DeviceGrants } from "./device-grants.ts";
import { DomErrorName, domException } from "./dom-exception.ts";
import { HandlerEventTarget } from "./event-handlers.ts";
import { defineNavigatorProperty, defineProperty } from "./install.ts";
import { announcePermissionChange, PermissionStateName, registerPermission } from "./permissions.ts";
import type { BluetoothAdvertisement } from "#src/devices/bluetooth.js";
import { uuidOf } from "#src/devices/bluetooth.js";

export type {
  BluetoothBackend,
  BluetoothCandidate,
  BluetoothCharacteristicFlags,
  BluetoothCharacteristicHandle,
  BluetoothConnection,
  BluetoothDescriptorHandle,
  BluetoothServiceHandle
} from "./bluetooth-backend.ts";
export type { DeviceChooser } from "./device-grants.ts";
export { BluetoothFailure, BluetoothFailureKind } from "./bluetooth-backend.ts";

const PERMISSION_NAME = "bluetooth";
const DEFAULT_SCAN_MILLISECONDS = 5000;
const FULL_MASK = 0xFF;
const BASE_UUID_SUFFIX = "-0000-1000-8000-00805f9b34fb";
const SHORT_UUID_PATTERN = /^(?:[0-9a-f]{4}|[0-9a-f]{8})$/iu;
const SHORT_UUID_DIGITS = 8;
const HEX_RADIX = 16;
const GATT_DISCONNECTED = "gattserverdisconnected";
const VALUE_CHANGED = "characteristicvaluechanged";
const ADVERTISEMENT_RECEIVED = "advertisementreceived";

/** A 16-bit or 32-bit number, a 4 or 8 digit hex string, or a full UUID. */
export type BluetoothServiceUuid = number | string;

/** One way to recognise a device in `requestDevice`: every part given must match. */
export interface BluetoothLeScanFilter {
  readonly services?: readonly BluetoothServiceUuid[];
  readonly name?: string;
  readonly namePrefix?: string;
  readonly manufacturerData?: ReadonlyArray<{
    readonly companyIdentifier: number;
    readonly dataPrefix?: BufferSource;
    readonly mask?: BufferSource;
  }>;
}

/**
 * The options of `requestDevice`, with the extras. A browser ignores the
 * extras; the standard behaviour is the same when none is given.
 */
export interface RequestDeviceOptions {
  readonly filters?: readonly BluetoothLeScanFilter[];
  readonly exclusionFilters?: readonly BluetoothLeScanFilter[];
  readonly optionalServices?: readonly BluetoothServiceUuid[];
  readonly acceptAllDevices?: boolean;

  /** WinUI-only: the picker for this call, instead of the one given at install. */
  readonly chooser?: DeviceChooser<BluetoothCandidate>;

  /** WinUI-only: how long to scan for devices before the chooser is asked; 5000 by default. */
  readonly scanMilliseconds?: number;

  /** WinUI-only: ends the scan and the chooser. */
  readonly signal?: AbortSignal;
}

/** What `installBluetooth` takes. */
export interface BluetoothInstallOptions {
  /** Stands in for Windows Bluetooth; the tests give one. */
  readonly backend?: BluetoothBackend;

  /**
   * The picker `requestDevice` asks. A browser shows a dialog here; without a
   * chooser (or one on the call) `requestDevice` rejects with `NotAllowedError`.
   */
  readonly chooser?: DeviceChooser<BluetoothCandidate>;
}

interface DeviceRecord {
  readonly id: string;
  readonly candidate: BluetoothCandidate;
  readonly allowedServices: Set<string>;
}

interface BluetoothContext {
  readonly backend: BluetoothBackend;
  readonly chooser: DeviceChooser<BluetoothCandidate> | undefined;
  readonly grants: DeviceGrants<DeviceRecord>;
  readonly devices: Map<string, BluetoothDevice>;
}

declare global {
  // The Web Bluetooth entry point, which the DOM library does not have.
  interface Navigator {
    readonly bluetooth: Bluetooth;
  }
}

let context: BluetoothContext | undefined;

function requireContext() {
  if (!context) {
    throw domException({
      name: DomErrorName.INVALID_STATE,
      message: "Bluetooth is not installed: call installBluetooth() first"
    });
  }

  return context;
}

function canonicalUuid(input: BluetoothServiceUuid) {
  const isNumber = typeof input === "number";
  if (isNumber) {
    const isInvalid = !Number.isInteger(input) || input < 0;
    if (isInvalid) {
      throw new TypeError(`${input} is not a valid Bluetooth UUID number`);
    }

    return `${input.toString(HEX_RADIX).padStart(SHORT_UUID_DIGITS, "0")}${BASE_UUID_SUFFIX}`;
  }

  const isShort = SHORT_UUID_PATTERN.test(input);
  if (isShort) {
    return `${input.toLowerCase().padStart(SHORT_UUID_DIGITS, "0")}${BASE_UUID_SUFFIX}`;
  }

  return uuidOf(input);
}

function asDomException(thrown: unknown) {
  const isFailure = thrown instanceof BluetoothFailure;
  if (!isFailure) {
    return thrown;
  }

  const names = new Map<BluetoothFailureKind, DomErrorName>([
    [BluetoothFailureKind.UNREACHABLE, DomErrorName.NETWORK],
    [BluetoothFailureKind.DENIED, DomErrorName.NOT_ALLOWED],
    [BluetoothFailureKind.FAILED, DomErrorName.NOT_SUPPORTED]
  ]);
  return domException({
    name: names.get(thrown.kind) ?? DomErrorName.NOT_SUPPORTED,
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

function notFound(message: string) {
  return domException({
    name: DomErrorName.NOT_FOUND,
    message
  });
}

async function findHandles<T>({ input, kind, container, load }: {
  input: BluetoothServiceUuid | undefined;
  kind: string;
  container: string;
  load: (uuid: string | undefined) => Promise<readonly T[]>;
}) {
  const uuid = input === undefined ? undefined : canonicalUuid(input);
  const handles = await guarded(() => load(uuid));
  const isEmpty = uuid !== undefined && handles.length === 0;
  if (isEmpty) {
    throw notFound(`No ${kind} matching UUID ${uuid} found in ${container}.`);
  }

  return handles;
}

function cachedWrappers<Handle extends { readonly uuid: string }, Wrapper>({ handles, cache, create }: {
  handles: readonly Handle[];
  cache: Map<string, Wrapper>;
  create: (handle: Handle) => Wrapper;
}) {
  return handles.map(handle => {
    const known = cache.get(handle.uuid) ?? create(handle);
    cache.set(handle.uuid, known);
    return known;
  });
}

function hasPrefix({ bytes, prefix, mask }: {
  bytes: Uint8Array;
  prefix: Uint8Array;
  mask: Uint8Array;
}) {
  const isShort = bytes.length < prefix.length;
  if (isShort) {
    return false;
  }

  for (const [i, expected] of prefix.entries()) {
    const maskBits = mask[i] ?? FULL_MASK;
    const isDifferent = ((bytes[i] ?? 0) & maskBits) !== (expected & maskBits);
    if (isDifferent) {
      return false;
    }
  }

  return true;
}

function matchesFilter({ candidate, filter }: {
  candidate: BluetoothCandidate;
  filter: BluetoothLeScanFilter;
}) {
  const { advertisement, name } = candidate;
  const { services, name: exactName, namePrefix, manufacturerData } = filter;
  const isNameKept = exactName === undefined || name === exactName;
  const isPrefixKept = namePrefix === undefined || name.startsWith(namePrefix);
  const isServiceKept = services === undefined
    || services.every(service => advertisement.serviceUuids.includes(uuidOf(canonicalUuid(service))));
  const isDataKept = manufacturerData === undefined
    || manufacturerData.some(wanted => advertisement.manufacturerData.some(
      section => section.companyId === wanted.companyIdentifier && hasPrefix({
        bytes: section.data,
        prefix: wanted.dataPrefix === undefined ? new Uint8Array() : bytesOfBufferSource(wanted.dataPrefix),
        mask: wanted.mask === undefined ? new Uint8Array() : bytesOfBufferSource(wanted.mask)
      })
    ));
  return isNameKept && isPrefixKept && isServiceKept && isDataKept;
}

function validateFilter(filter: BluetoothLeScanFilter) {
  const { services, name, namePrefix, manufacturerData } = filter;
  const isEmpty = [services, name, namePrefix, manufacturerData].every(part => part === undefined);
  const isEmptyList = services?.length === 0 || manufacturerData?.length === 0;
  const isEmptyPrefix = namePrefix === "";
  const isInvalid = isEmpty || isEmptyList || isEmptyPrefix;
  if (isInvalid) {
    throw new TypeError("Failed to execute 'requestDevice' on 'Bluetooth': a filter must name services, a name, a name prefix or manufacturer data");
  }

  for (const service of services ?? []) {
    canonicalUuid(service);
  }
}

function validateRequest(options: RequestDeviceOptions) {
  const { filters } = options;
  const isAcceptingAll = options.acceptAllDevices === true;
  const hasFilters = filters !== undefined;
  const isConflict = hasFilters && isAcceptingAll;
  if (isConflict) {
    throw new TypeError("Failed to execute 'requestDevice' on 'Bluetooth': filters and acceptAllDevices cannot both be set");
  }

  const isUndecided = !hasFilters && !isAcceptingAll;
  const isEmptyList = filters?.length === 0;
  const isInvalid = isUndecided || isEmptyList;
  if (isInvalid) {
    throw new TypeError("Failed to execute 'requestDevice' on 'Bluetooth': either filters or acceptAllDevices must be given");
  }

  for (const filter of [...filters ?? [], ...options.exclusionFilters ?? []]) {
    validateFilter(filter);
  }

  for (const service of options.optionalServices ?? []) {
    canonicalUuid(service);
  }
}

/** An advertisement a watched device sent. */
export class BluetoothAdvertisingEvent extends Event {
  readonly device: BluetoothDevice;
  readonly uuids: readonly string[];
  readonly name: string | null;
  readonly appearance: number | null;
  readonly txPower: number | null;
  readonly rssi: number;
  readonly manufacturerData: ReadonlyMap<number, DataView>;
  readonly serviceData: ReadonlyMap<string, DataView>;

  /** Made by `BluetoothDevice.watchAdvertisements`. */
  constructor(device: BluetoothDevice, advertisement: BluetoothAdvertisement) {
    super(ADVERTISEMENT_RECEIVED);
    this.device = device;
    this.uuids = advertisement.serviceUuids;
    this.name = advertisement.localName === "" ? null : advertisement.localName;
    this.appearance = null;
    this.txPower = advertisement.transmitPower;
    this.rssi = advertisement.rssi;
    this.manufacturerData = new Map(
      advertisement.manufacturerData.map(section => [section.companyId, dataViewOf(section.data)])
    );
    this.serviceData = new Map();
  }
}

/**
 * A `characteristicvaluechanged` event, with the characteristic it came from
 * (which `target` is not once it reaches the service or device).
 */
export class BluetoothValueChangedEvent extends Event {
  readonly characteristic: BluetoothRemoteGATTCharacteristic;

  /** Made when a notification arrives. */
  constructor(characteristic: BluetoothRemoteGATTCharacteristic) {
    super(VALUE_CHANGED);
    this.characteristic = characteristic;
  }
}

/** A descriptor of a GATT characteristic. */
export class BluetoothRemoteGATTDescriptor {
  readonly characteristic: BluetoothRemoteGATTCharacteristic;
  readonly uuid: string;
  private currentValue: DataView | null = null;
  private readonly handle: BluetoothDescriptorHandle;

  /** Made by `BluetoothRemoteGATTCharacteristic.getDescriptor`. */
  constructor(characteristic: BluetoothRemoteGATTCharacteristic, handle: BluetoothDescriptorHandle) {
    this.characteristic = characteristic;
    this.uuid = handle.uuid;
    this.handle = handle;
  }

  get value() {
    return this.currentValue;
  }

  /**
   * Reads the descriptor from the device.
   *
   * @returns The value.
   */
  async readValue() {
    this.characteristic.service.device.gatt.requireConnected();
    const bytes = await guarded(() => this.handle.read());
    this.currentValue = dataViewOf(bytes);
    return this.currentValue;
  }

  /**
   * Writes the descriptor on the device.
   *
   * @param value - The bytes to write.
   */
  async writeValue(value: BufferSource) {
    this.characteristic.service.device.gatt.requireConnected();
    await guarded(() => this.handle.write(bytesOfBufferSource(value)));
  }
}

/** A GATT characteristic: read, write and notify. */
export class BluetoothRemoteGATTCharacteristic extends HandlerEventTarget {
  readonly service: BluetoothRemoteGATTService;
  readonly uuid: string;
  readonly properties: Readonly<BluetoothCharacteristicFlags>;
  private currentValue: DataView | null = null;
  private readonly handle: BluetoothCharacteristicHandle;
  private readonly descriptors = new Map<string, BluetoothRemoteGATTDescriptor>();
  private stopNotifying: (() => Promise<void>) | undefined;

  /** Made by `BluetoothRemoteGATTService.getCharacteristic`. */
  constructor(service: BluetoothRemoteGATTService, handle: BluetoothCharacteristicHandle) {
    super();
    this.service = service;
    this.uuid = handle.uuid;
    this.properties = Object.freeze({ ...handle.flags });
    this.handle = handle;
  }

  get value() {
    return this.currentValue;
  }

  get oncharacteristicvaluechanged() {
    return this.getHandler(VALUE_CHANGED);
  }

  set oncharacteristicvaluechanged(handler: EventListener | null) {
    this.setHandler({
      type: VALUE_CHANGED,
      handler
    });
  }

  /**
   * Reads the value from the device.
   *
   * @returns The value.
   * @throws {DOMException} `NotSupportedError` when it cannot be read, `NetworkError` when disconnected.
   */
  async readValue() {
    this.service.device.gatt.requireConnected();
    this.requireCapability(this.properties.read);
    const bytes = await guarded(() => this.handle.read());
    this.currentValue = dataViewOf(bytes);
    this.dispatchValueChanged();
    return this.currentValue;
  }

  /**
   * Writes the value, with a response when the characteristic does that,
   * without otherwise.
   *
   * @param value - The bytes to write.
   */
  async writeValue(value: BufferSource) {
    const canWrite = this.properties.write;
    this.requireCapability(canWrite || this.properties.writeWithoutResponse);
    await this.write({
      value,
      isWithoutResponse: !canWrite
    });
  }

  /**
   * Writes the value and waits for the device to acknowledge it.
   *
   * @param value - The bytes to write.
   */
  async writeValueWithResponse(value: BufferSource) {
    this.requireCapability(this.properties.write);
    await this.write({
      value,
      isWithoutResponse: false
    });
  }

  /**
   * Writes the value without waiting for an acknowledgement.
   *
   * @param value - The bytes to write.
   */
  async writeValueWithoutResponse(value: BufferSource) {
    this.requireCapability(this.properties.writeWithoutResponse);
    await this.write({
      value,
      isWithoutResponse: true
    });
  }

  /**
   * Asks the device to send value changes; they arrive as
   * `characteristicvaluechanged` events.
   *
   * @returns This characteristic.
   * @throws {DOMException} `NotSupportedError` when it neither notifies nor indicates.
   */
  async startNotifications() {
    this.service.device.gatt.requireConnected();
    this.requireCapability(this.properties.notify || this.properties.indicate);
    const isStarted = this.stopNotifying !== undefined;
    if (isStarted) {
      return this;
    }

    this.stopNotifying = await guarded(() => this.handle.startNotifications(bytes => {
      this.currentValue = dataViewOf(bytes);
      this.dispatchValueChanged();
    }));
    return this;
  }

  /**
   * Tells the device to stop sending value changes.
   *
   * @returns This characteristic.
   */
  async stopNotifications() {
    const stop = this.stopNotifying;
    const isStopped = stop === undefined;
    if (isStopped) {
      return this;
    }

    this.stopNotifying = undefined;
    await guarded(stop);
    return this;
  }

  /**
   * Finds one descriptor.
   *
   * @param descriptor - Its UUID, or its 16-bit number.
   * @returns The descriptor.
   * @throws {DOMException} `NotFoundError` when there is none.
   */
  async getDescriptor(descriptor: BluetoothServiceUuid) {
    const found = await this.getDescriptors(descriptor);
    const [first] = found;
    const isMissing = first === undefined;
    if (isMissing) {
      throw notFound(`No Descriptors matching UUID ${canonicalUuid(descriptor)} found in Characteristic.`);
    }

    return first;
  }

  /**
   * Finds descriptors.
   *
   * @param descriptor - A UUID to look for; every descriptor when omitted.
   * @returns The descriptors; `NotFoundError` when a UUID was given and none match.
   */
  async getDescriptors(descriptor?: BluetoothServiceUuid) {
    this.service.device.gatt.requireConnected();
    const handles = await findHandles({
      input: descriptor,
      kind: "Descriptors",
      container: "Characteristic",
      load: uuid => this.handle.descriptors(uuid)
    });
    return cachedWrappers({
      handles,
      cache: this.descriptors,
      create: handle => new BluetoothRemoteGATTDescriptor(this, handle)
    });
  }

  /** Forgets what was cached when the connection ends. */
  closeConnection() {
    this.stopNotifying = undefined;
    this.descriptors.clear();
  }

  private async write({ value, isWithoutResponse }: {
    value: BufferSource;
    isWithoutResponse: boolean;
  }) {
    this.service.device.gatt.requireConnected();
    await guarded(() => this.handle.write({
      value: bytesOfBufferSource(value),
      isWithoutResponse
    }));
  }

  private requireCapability(isSupported: boolean) {
    if (!isSupported) {
      throw domException({
        name: DomErrorName.NOT_SUPPORTED,
        message: "GATT operation not permitted."
      });
    }
  }

  private dispatchValueChanged() {
    const { service } = this;
    for (const target of [this, service, service.device]) {
      target.dispatchEvent(new BluetoothValueChangedEvent(this));
    }
  }

  get [Symbol.toStringTag]() {
    return "BluetoothRemoteGATTCharacteristic";
  }
}

/** A GATT service on a connected device. */
export class BluetoothRemoteGATTService extends HandlerEventTarget {
  readonly device: BluetoothDevice;
  readonly uuid: string;
  private readonly handle: BluetoothServiceHandle;
  private readonly characteristics = new Map<string, BluetoothRemoteGATTCharacteristic>();

  /** Made by `BluetoothRemoteGATTServer.getPrimaryService`. */
  constructor(device: BluetoothDevice, handle: BluetoothServiceHandle) {
    super();
    this.device = device;
    this.uuid = handle.uuid;
    this.handle = handle;
  }

  /** Always true: Windows lists only primary services. */
  get isPrimary() {
    return true;
  }

  get oncharacteristicvaluechanged() {
    return this.getHandler(VALUE_CHANGED);
  }

  set oncharacteristicvaluechanged(handler: EventListener | null) {
    this.setHandler({
      type: VALUE_CHANGED,
      handler
    });
  }

  /**
   * Finds one characteristic.
   *
   * @param characteristic - Its UUID, or its 16-bit number.
   * @returns The characteristic.
   * @throws {DOMException} `NotFoundError` when there is none.
   */
  async getCharacteristic(characteristic: BluetoothServiceUuid) {
    const [first] = await this.getCharacteristics(characteristic);
    const isMissing = first === undefined;
    if (isMissing) {
      throw notFound(`No Characteristics matching UUID ${canonicalUuid(characteristic)} found in Service.`);
    }

    return first;
  }

  /**
   * Finds characteristics.
   *
   * @param characteristic - A UUID to look for; every characteristic when omitted.
   * @returns The characteristics; `NotFoundError` when a UUID was given and none match.
   */
  async getCharacteristics(characteristic?: BluetoothServiceUuid) {
    this.device.gatt.requireConnected();
    const handles = await findHandles({
      input: characteristic,
      kind: "Characteristics",
      container: "Service",
      load: uuid => this.handle.characteristics(uuid)
    });
    return cachedWrappers({
      handles,
      cache: this.characteristics,
      create: handle => new BluetoothRemoteGATTCharacteristic(this, handle)
    });
  }

  /** Forgets what was cached when the connection ends. */
  closeConnection() {
    for (const characteristic of this.characteristics.values()) {
      characteristic.closeConnection();
    }

    this.characteristics.clear();
  }

  get [Symbol.toStringTag]() {
    return "BluetoothRemoteGATTService";
  }
}

/** The GATT connection of a device. */
export class BluetoothRemoteGATTServer {
  readonly device: BluetoothDevice;
  private connection: BluetoothConnection | undefined;
  private pending: Promise<BluetoothRemoteGATTServer> | undefined;
  private stopListening: (() => void) | undefined;
  private readonly services = new Map<string, BluetoothRemoteGATTService>();
  private readonly known: BluetoothContext;
  private readonly record: DeviceRecord;

  /** Made with the device. */
  constructor({ device, known, record }: {
    device: BluetoothDevice;
    known: BluetoothContext;
    record: DeviceRecord;
  }) {
    this.device = device;
    this.known = known;
    this.record = record;
  }

  get connected() {
    return this.connection !== undefined;
  }

  /**
   * Connects to the device.
   *
   * @returns This server, once connected.
   * @throws {DOMException} `NetworkError` when the device cannot be reached.
   */
  connect() {
    const { pending } = this;
    const isPending = pending !== undefined;
    if (isPending) {
      return pending;
    }

    const attempt = this.open().finally(() => {
      this.pending = undefined;
    });
    this.pending = attempt;
    return attempt;
  }

  /** Ends the connection; `gattserverdisconnected` fires if it was open. */
  disconnect() {
    const { connection } = this;
    const isClosed = connection === undefined;
    if (isClosed) {
      return;
    }

    connection.close();
    this.drop();
  }

  /**
   * Finds one service.
   *
   * @param service - Its UUID, or its 16-bit number; it must be one the request named.
   * @returns The service.
   * @throws {DOMException} `SecurityError` when the request did not name it, `NotFoundError` when the device has none.
   */
  async getPrimaryService(service: BluetoothServiceUuid) {
    const [first] = await this.getPrimaryServices(service);
    const isMissing = first === undefined;
    if (isMissing) {
      throw notFound(`No Services matching UUID ${canonicalUuid(service)} found in Device.`);
    }

    return first;
  }

  /**
   * Finds services.
   *
   * @param service - A UUID to look for; every service the request named when omitted.
   * @returns The services; `NotFoundError` when none match.
   */
  async getPrimaryServices(service?: BluetoothServiceUuid) {
    const connection = this.requireConnected();
    const uuid = service === undefined ? undefined : canonicalUuid(service);
    const isForbidden = uuid !== undefined && !this.record.allowedServices.has(uuid);
    if (isForbidden) {
      throw domException({
        name: DomErrorName.SECURITY,
        message: `Origin is not allowed to access the service ${uuid}. Tip: add the service UUID to 'optionalServices' in requestDevice().`
      });
    }

    const handles = await guarded(() => connection.services(uuid));
    const allowed = handles.filter(handle => this.record.allowedServices.has(handle.uuid));
    const isEmpty = allowed.length === 0;
    if (isEmpty) {
      throw notFound(uuid === undefined ? "No Services found in device." : `No Services matching UUID ${uuid} found in Device.`);
    }

    return allowed.map(handle => {
      const cached = this.services.get(handle.uuid) ?? new BluetoothRemoteGATTService(this.device, handle);
      this.services.set(handle.uuid, cached);
      return cached;
    });
  }

  /**
   * Throws unless connected; used by the objects below this one.
   *
   * @returns The open connection.
   * @throws {DOMException} `NetworkError` when disconnected.
   */
  requireConnected() {
    const { connection } = this;
    const isDisconnected = connection === undefined;
    if (isDisconnected) {
      throw domException({
        name: DomErrorName.NETWORK,
        message: "GATT Server is disconnected. Cannot perform GATT operations. (Re)connect first with `device.gatt.connect`."
      });
    }

    return connection;
  }

  private async open() {
    const isOpen = this.connection !== undefined;
    if (isOpen) {
      return this;
    }

    const connection = await guarded(() => this.known.backend.connect(this.record.candidate));
    this.connection = connection;
    this.stopListening = connection.onDisconnected(() => this.drop());
    return this;
  }

  private drop() {
    this.stopListening?.();
    this.stopListening = undefined;
    this.connection = undefined;
    for (const service of this.services.values()) {
      service.closeConnection();
    }

    this.services.clear();
    this.device.dispatchEvent(new Event(GATT_DISCONNECTED, { bubbles: true }));
  }
}

/** A Bluetooth LE device the user allowed this page to use. */
export class BluetoothDevice extends HandlerEventTarget {
  readonly id: string;
  readonly name: string | undefined;
  readonly gatt: BluetoothRemoteGATTServer;

  /** The address as `AA:BB:CC:DD:EE:FF`. WinUI-only. */
  readonly address: string;
  private readonly known: BluetoothContext;
  private readonly record: DeviceRecord;
  private watcher: AbortController | undefined;

  /** Made by `requestDevice` and `getDevices`. */
  constructor(known: BluetoothContext, record: DeviceRecord) {
    super();
    this.known = known;
    this.record = record;
    this.id = record.id;
    this.name = record.candidate.name === "" ? undefined : record.candidate.name;
    this.address = record.candidate.id;
    this.gatt = new BluetoothRemoteGATTServer({
      device: this,
      known,
      record
    });
  }

  get watchingAdvertisements() {
    return this.watcher !== undefined;
  }

  get ongattserverdisconnected() {
    return this.getHandler(GATT_DISCONNECTED);
  }

  set ongattserverdisconnected(handler: EventListener | null) {
    this.setHandler({
      type: GATT_DISCONNECTED,
      handler
    });
  }

  get onadvertisementreceived() {
    return this.getHandler(ADVERTISEMENT_RECEIVED);
  }

  set onadvertisementreceived(handler: EventListener | null) {
    this.setHandler({
      type: ADVERTISEMENT_RECEIVED,
      handler
    });
  }

  get oncharacteristicvaluechanged() {
    return this.getHandler(VALUE_CHANGED);
  }

  set oncharacteristicvaluechanged(handler: EventListener | null) {
    this.setHandler({
      type: VALUE_CHANGED,
      handler
    });
  }

  /**
   * Starts delivering the device's advertisements as `advertisementreceived`.
   *
   * @param options - A `signal` that stops it.
   */
  async watchAdvertisements(options: { signal?: AbortSignal } = {}) {
    const { signal } = options;
    signal?.throwIfAborted();
    this.watcher?.abort();
    const watcher = new AbortController();
    this.watcher = watcher;
    const stop = () => {
      watcher.abort();
      const isCurrent = this.watcher === watcher;
      if (isCurrent) {
        this.watcher = undefined;
      }
    };
    signal?.addEventListener("abort", stop, { once: true });
    this.known.backend.watch({
      candidate: this.record.candidate,
      onAdvertisement: advertisement => this.dispatchEvent(new BluetoothAdvertisingEvent(this, advertisement)),
      signal: watcher.signal
    });
  }

  /** Takes back the permission; the device is not listed by `getDevices` again until the user picks it again. */
  async forget() {
    this.watcher?.abort();
    this.watcher = undefined;
    this.gatt.disconnect();
    this.known.grants.forget(this.id);
    this.known.devices.delete(this.id);
    announcePermissionChange(PERMISSION_NAME);
  }

  get [Symbol.toStringTag]() {
    return "BluetoothDevice";
  }
}

/** `BluetoothUUID`: the helpers that turn short numbers into full UUIDs. */
export class BluetoothUUID {
  /**
   * The full UUID of a 16-bit or 32-bit number, on the Bluetooth base UUID.
   *
   * @param alias - The number, or its hex string.
   * @returns The UUID in lowercase.
   */
  static canonicalUUID(alias: number) {
    return canonicalUuid(alias);
  }
}

function deviceOf({ known, record }: {
  known: BluetoothContext;
  record: DeviceRecord;
}) {
  const existing = known.devices.get(record.id);
  const isKnown = existing !== undefined;
  if (isKnown) {
    return existing;
  }

  const created = new BluetoothDevice(known, record);
  known.devices.set(record.id, created);
  return created;
}

function namedServices(options: RequestDeviceOptions) {
  const named = [
    ...(options.filters ?? []).flatMap(filter => filter.services ?? []),
    ...options.optionalServices ?? []
  ];
  return named.map(service => canonicalUuid(service));
}

/** The `navigator.bluetooth` object. */
export class Bluetooth {
  /**
   * Whether this machine has a Bluetooth LE adapter that is on.
   *
   * @returns True when it does.
   */
  async getAvailability() {
    return requireContext().backend.isAvailable();
  }

  /**
   * The devices the user allowed earlier in this run.
   *
   * @returns The devices.
   */
  async getDevices() {
    const known = requireContext();
    return known.grants.list().map(record => deviceOf({
      known,
      record
    }));
  }

  /**
   * Scans, asks the chooser which device the user wants, and allows it.
   *
   * @param options - The filters (or `acceptAllDevices`), the services to reach, and the WinUI extras.
   * @returns The chosen device.
   * @throws {TypeError} When the options are not valid.
   * @throws {DOMException} `NotFoundError` when no adapter is on or the user cancels.
   * @throws {DOMException} `NotAllowedError` when there is no chooser.
   */
  async requestDevice(options: RequestDeviceOptions = {}) {
    validateRequest(options);
    const known = requireContext();
    options.signal?.throwIfAborted();
    const isAvailable = await known.backend.isAvailable();
    if (!isAvailable) {
      throw notFound("Bluetooth adapter not available.");
    }

    const discovered = await guarded(() => known.backend.discover({
      scanMilliseconds: options.scanMilliseconds ?? DEFAULT_SCAN_MILLISECONDS,
      ...options.signal === undefined ? {} : { signal: options.signal }
    }));
    const isAny = options.acceptAllDevices === true;
    const candidates = discovered.filter(candidate => {
      const isIncluded = isAny || (options.filters ?? []).some(filter => matchesFilter({
        candidate,
        filter
      }));
      const isExcluded = (options.exclusionFilters ?? []).some(filter => matchesFilter({
        candidate,
        filter
      }));
      return isIncluded && !isExcluded;
    });
    const [chosen] = await chooseDevices({
      chooser: options.chooser ?? known.chooser,
      candidates,
      ...options.signal === undefined ? {} : { signal: options.signal }
    });
    const isCancelled = chosen === undefined;
    if (isCancelled) {
      throw notFound("User cancelled the requestDevice() chooser.");
    }

    const previous = known.grants.list().find(record => record.id === chosen.id);
    const record = previous ?? {
      id: chosen.id,
      candidate: chosen,
      allowedServices: new Set<string>()
    };
    for (const service of namedServices(options)) {
      record.allowedServices.add(service);
    }

    known.grants.grant(record);
    announcePermissionChange(PERMISSION_NAME);
    return deviceOf({
      known,
      record
    });
  }

  get [Symbol.toStringTag]() {
    return "Bluetooth";
  }
}

/**
 * Defines `navigator.bluetooth` and `BluetoothUUID` and answers the
 * Permissions API's `bluetooth` (granted once a device is allowed). Nothing
 * is defined until this is called; call it on the thread the app's code runs
 * on.
 *
 * @param options - The picker and test stand-ins.
 * @returns The function that disconnects the devices and takes the API away again.
 */
export function installBluetooth(options: BluetoothInstallOptions = {}) {
  const previousContext = context;
  const installed: BluetoothContext = {
    backend: options.backend ?? windowsBluetoothBackend(),
    chooser: options.chooser,
    grants: createDeviceGrants(),
    devices: new Map()
  };
  context = installed;
  const uninstallNavigator = defineNavigatorProperty({
    name: "bluetooth",
    value: new Bluetooth()
  });
  const uninstallUuid = defineProperty({
    name: "BluetoothUUID",
    value: BluetoothUUID
  });
  const unregister = registerPermission({
    name: PERMISSION_NAME,
    provider: {
      state: () => installed.grants.hasAny ? PermissionStateName.GRANTED : PermissionStateName.PROMPT
    }
  });
  return () => {
    for (const device of installed.devices.values()) {
      device.gatt.disconnect();
    }

    unregister();
    uninstallUuid();
    uninstallNavigator();
    context = previousContext;
  };
}
