import { FileAccessMode, HidDevice } from "./hardware-bindings.ts";
import { bufferOf, bytesOf } from "#src/devices/buffers.js";
import {
  deviceChanges,
  DeviceInterfaceClass,
  findAllDevices,
  selectorOfInterfaceClasses
} from "#src/devices/enumeration.js";

const PROPERTY_VENDOR = "System.DeviceInterface.Hid.VendorId";
const PROPERTY_PRODUCT = "System.DeviceInterface.Hid.ProductId";
const PROPERTY_USAGE_PAGE = "System.DeviceInterface.Hid.UsagePage";
const PROPERTY_USAGE = "System.DeviceInterface.Hid.UsageId";

/** What is known about a HID device without opening it. */
export interface HidDeviceInfo {
  /** The device interface path: the key the device is listed by. */
  readonly id: string;
  readonly vendorId: number;
  readonly productId: number;
  readonly productName?: string;

  /** The usage page of the device's top-level collection. */
  readonly usagePage: number;

  /** The usage of the device's top-level collection. */
  readonly usage: number;
}

/** An input report: its id and the bytes after the id. */
export interface HidReport {
  readonly reportId: number;
  readonly data: Uint8Array;
}

/** An open HID device. */
export interface HidConnection {
  /** Calls back for each input report until the returned function is called. */
  onInputReport(callback: (report: HidReport) => void): () => void;
  sendReport(report: HidReport): Promise<void>;
  sendFeatureReport(report: HidReport): Promise<void>;
  receiveFeatureReport(reportId: number): Promise<Uint8Array>;
  close(): void;
}

/** Everything the WebHID classes need from the system; the tests give their own. */
export interface HidBackend {
  list(): Promise<readonly HidDeviceInfo[]>;
  open(id: string): Promise<HidConnection>;

  /** Calls back whenever the list may have changed. */
  subscribe(onChange: () => void): () => void;
}

/** What a backend throws when the device or the system says no. */
export class HidFailure extends Error {
  override readonly name = "HidFailure";
}

function numberProperty(value: unknown) {
  return typeof value === "number" ? value : 0;
}

function withReportId({ reportId, data }: HidReport) {
  const bytes = new Uint8Array(data.length + 1);
  bytes[0] = reportId;
  bytes.set(data, 1);
  return bytes;
}

function connectionOf(device: HidDevice) {
  return {
    onInputReport: callback => device.onInputReportReceived((_sender, args) => callback({
      reportId: args.report.id,
      data: bytesOf(args.report.data).slice(1)
    })),
    async sendReport(report) {
      const output = device.createOutputReport(report.reportId);
      output.data = bufferOf(withReportId(report));
      await device.sendOutputReportAsync(output);
    },
    async sendFeatureReport(report) {
      const feature = device.createFeatureReport(report.reportId);
      feature.data = bufferOf(withReportId(report));
      await device.sendFeatureReportAsync(feature);
    },
    async receiveFeatureReport(reportId) {
      const feature = await device.getFeatureReportAsync(reportId);
      return bytesOf(feature.data).slice(1);
    },
    close: () => device.close()
  } satisfies HidConnection;
}

/**
 * The real backend over `Windows.Devices.HumanInterfaceDevice.HidDevice`:
 * devices are listed from their device interfaces without being opened, and
 * opened only by `open()`.
 *
 * @returns A backend over Windows HID.
 */
export function windowsHidBackend() {
  const selector = selectorOfInterfaceClasses(DeviceInterfaceClass.humanInterfaceDevice);
  return {
    async list() {
      const found = await findAllDevices({
        selector,
        requestedProperties: [PROPERTY_VENDOR, PROPERTY_PRODUCT, PROPERTY_USAGE_PAGE, PROPERTY_USAGE]
      });
      return found.map(snapshot => ({
        id: snapshot.id,
        vendorId: numberProperty(snapshot.properties.get(PROPERTY_VENDOR)),
        productId: numberProperty(snapshot.properties.get(PROPERTY_PRODUCT)),
        productName: snapshot.name,
        usagePage: numberProperty(snapshot.properties.get(PROPERTY_USAGE_PAGE)),
        usage: numberProperty(snapshot.properties.get(PROPERTY_USAGE))
      } satisfies HidDeviceInfo));
    },
    async open(id) {
      return connectionOf(await HidDevice.fromIdAsync(id, FileAccessMode.ReadWrite));
    },
    subscribe: onChange => deviceChanges({ selector })(onChange)
  } satisfies HidBackend;
}
