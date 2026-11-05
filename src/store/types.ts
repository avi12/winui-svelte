import type { PackageStage, StartupState, UpdateState } from "./states.ts";

/** The window a Store call is owned by: a `WindowHandle` or the native `Window`. */
export interface StoreWindow {
  readonly appWindow: {
    readonly id: {
      readonly value: bigint;
    };
  };
}

/** What the running package is. */
export interface PackageInfo {
  readonly name: string;
  readonly fullName: string;
  readonly familyName: string;
  readonly publisher: string;

  /** Four numbers, `major.minor.build.revision`. */
  readonly version: string;
  readonly installedPath: string;
  readonly isDevelopmentMode: boolean;
}

/** The licence of this app in the Store (`StoreAppLicense`). */
export interface AppLicense {
  readonly isActive: boolean;
  readonly isTrial: boolean;
  readonly skuStoreId: string;

  /** When the licence ends; null when it never does. */
  readonly expirationDate: Date | null;
}

/** One update the Store has for this app or its optional packages. */
export interface AvailableUpdate {
  readonly packageFamilyName: string;
  readonly isMandatory: boolean;
}

/** How far a download and install has got, per package. */
export interface UpdateProgress {
  readonly packageFamilyName: string;
  readonly state: UpdateState;

  /** 0 to 1, this package. */
  readonly packageDownloadProgress: number;

  /** 0 to 1, all the packages. */
  readonly totalDownloadProgress: number;
}

/** How a download and install ended. */
export interface UpdateOutcome {
  readonly state: UpdateState;
  readonly packages: readonly UpdateProgress[];
}

/** What `install` takes. */
export interface InstallOptions {
  /** Called as the download and install move on. */
  readonly onprogress?: (progress: UpdateProgress) => void;
}

/** The updates the Store found, and the way to install exactly those. */
export interface UpdateCheck {
  readonly updates: readonly AvailableUpdate[];

  /** True when any update is mandatory. */
  readonly hasMandatory: boolean;

  /**
   * Downloads and installs the updates without the Store's own prompt
   * (`TrySilentDownloadAndInstallStorePackageUpdatesAsync`). It changes the
   * machine; nothing in this package calls it for you.
   */
  install(options?: InstallOptions): Promise<UpdateOutcome>;
}

/** What a `PackageCatalog` event says about a package change. */
export interface PackageProgress {
  readonly stage: PackageStage;
  readonly activityId: string;
  readonly packageFullName: string;

  /** 0 to 100. */
  readonly progress: number;
  readonly isComplete: boolean;

  /** The HRESULT of a failure; 0 while there is none. */
  readonly errorCode: number;
}

/** A startup task of the package, as the manifest declares it. */
export interface StartupTaskHandle {
  readonly state: StartupState;

  /** Asks Windows to enable it; the user may refuse, so read the state returned. */
  enable(): Promise<StartupState>;
  disable(): void;
}

/**
 * The Windows calls the store modules make; the tests stand in for them. The
 * default is `windowsStoreBackend`.
 */
export interface StoreBackend {
  /** True when this process has a package identity. */
  hasPackage(): boolean;
  packageInfo(): PackageInfo;
  license(window: StoreWindow | undefined): Promise<AppLicense>;
  onOfflineLicensesChanged(callback: () => void): () => void;
  checkUpdates(window: StoreWindow | undefined): Promise<UpdateCheck>;
  onPackageProgress(callback: (progress: PackageProgress) => void): () => void;
  startupTask(taskId: string): Promise<StartupTaskHandle>;

  /** Runs `tick` every `milliseconds` on the thread that can read WinRT; returns how to stop. */
  poll(options: {
    milliseconds: number;
    tick: () => void;
  }): () => void;
}
