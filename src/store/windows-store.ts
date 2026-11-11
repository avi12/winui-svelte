import type { StorePackageUpdate } from "./bindings.ts";
import { StoreContext, unpackStorePackageUpdateStatus } from "./bindings.ts";
import { updateStateOf } from "./states.ts";
import type {
  AppLicense,
  AvailableUpdate,
  InstallOptions,
  StoreWindow,
  UpdateCheck,
  UpdateOutcome,
  UpdateProgress
} from "./types.ts";
import { initializeWithWindow } from "./window-interop.ts";
import { DynWinRtValue } from "@microsoft/dynwinrt";
import { z } from "zod";

// StoreContext over the default user. Every call that can show UI needs the
// owner window first (initializeWithWindow), or Windows refuses it.

const TICKS_PER_MILLISECOND = 10_000n;
const EPOCH_1601_TO_1970_MILLISECONDS = 11_644_473_600_000n;
const LATEST_DATE_MILLISECONDS = 8_640_000_000_000_000n;
const NO_TIME = 0n;

function contextOf(window: StoreWindow | undefined) {
  const context = StoreContext.getDefault();
  const isOwned = window !== undefined;
  if (isOwned) {
    initializeWithWindow({
      target: context,
      hwnd: window.appWindow.id.value
    });
  }

  return context;
}

function dateOf(universalTime: bigint) {
  const milliseconds = universalTime / TICKS_PER_MILLISECOND - EPOCH_1601_TO_1970_MILLISECONDS;
  const isNever = universalTime <= NO_TIME || milliseconds >= LATEST_DATE_MILLISECONDS;
  return isNever ? null : new Date(Number(milliseconds));
}

/**
 * The licence of this app (`GetAppLicenseAsync`). Needs a package identity.
 *
 * @param window - The owner window, if there is one.
 * @returns The licence.
 */
export async function windowsLicense(window: StoreWindow | undefined) {
  const license = await contextOf(window).getAppLicenseAsync();
  return {
    isActive: license.isActive,
    isTrial: license.isTrial,
    skuStoreId: license.skuStoreId,
    expirationDate: dateOf(license.expirationDate.universalTime)
  } satisfies AppLicense;
}

/**
 * Calls `callback` when Windows raises `OfflineLicensesChanged` (a refund, a
 * purchase, a licence that lapsed). Windows raises it on a thread of its
 * own, and the runtime delivers only what is raised on the UI thread, so
 * pair this with `poll`.
 *
 * @param callback - What to run.
 * @returns How to stop.
 */
export function windowsOnOfflineLicensesChanged(callback: () => void) {
  return StoreContext.getDefault().onOfflineLicensesChanged(callback);
}

const statusSchema = z.object({
  packageFamilyName: z.string(),
  packageDownloadProgress: z.number(),
  totalDownloadProgress: z.number(),
  packageUpdateState: z.number()
});

// The bindings type the status as an opaque class (its metadata has no default
// interface), but the progress callback gets the unpacked struct and a vector
// may hand over the raw value; both are read here.
function progressOf(status: unknown) {
  const unpacked = status instanceof DynWinRtValue ? unpackStorePackageUpdateStatus(status) : status;
  const fields = statusSchema.parse(unpacked);
  return {
    packageFamilyName: fields.packageFamilyName,
    state: updateStateOf(fields.packageUpdateState),
    packageDownloadProgress: fields.packageDownloadProgress,
    totalDownloadProgress: fields.totalDownloadProgress
  } satisfies UpdateProgress;
}

function availableOf(update: StorePackageUpdate) {
  return {
    packageFamilyName: update.package_.id.familyName,
    isMandatory: update.mandatory
  } satisfies AvailableUpdate;
}

/**
 * Asks the Store for updates of this app and its optional packages
 * (`GetAppAndOptionalStorePackageUpdatesAsync`); nothing is downloaded.
 *
 * @param window - The owner window, if there is one.
 * @returns The updates, and `install` for exactly those.
 */
export async function windowsCheckUpdates(window: StoreWindow | undefined) {
  const context = contextOf(window);
  const found = await context.getAppAndOptionalStorePackageUpdatesAsync();
  const updates = found === null ? [] : found.toArray();
  const available = updates.map(availableOf);
  return {
    updates: available,
    hasMandatory: available.some(update => update.isMandatory),
    async install({ onprogress }: InstallOptions = {}) {
      const operation = context.trySilentDownloadAndInstallStorePackageUpdatesAsync(updates);
      const isWatched = onprogress !== undefined;
      const result = await (isWatched ? operation.progress(status => onprogress(progressOf(status))) : operation);
      const statuses = result.storePackageUpdateStatuses;
      return {
        state: updateStateOf(result.overallState),
        packages: statuses === null ? [] : statuses.toArray().map(status => progressOf(status))
      } satisfies UpdateOutcome;
    }
  } satisfies UpdateCheck;
}
