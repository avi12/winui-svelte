import type { Package, PackageCatalog as PackageCatalogType } from "./bindings.ts";
import { PackageCatalog, StartupTask } from "./bindings.ts";
import { PackageStage, startupStateOf } from "./states.ts";
import type { PackageProgress, StartupTaskHandle } from "./types.ts";

interface PackageStageArgs {
  readonly activityId: string;
  readonly progress: number;
  readonly isComplete: boolean;
  readonly errorCode: number;
}

function progressOf({ stage, args, target }: {
  stage: PackageStage;
  args: PackageStageArgs;
  target: Package;
}) {
  return {
    stage,
    activityId: args.activityId,
    packageFullName: target.id.fullName,
    progress: args.progress,
    isComplete: args.isComplete,
    errorCode: args.errorCode
  } satisfies PackageProgress;
}

/**
 * Calls `callback` as the app's packages stage, install and update
 * (`PackageCatalog.OpenForCurrentUser`: `PackageStaging`, `PackageInstalling`
 * and `PackageUpdating`). Windows raises these on a thread of its own, and
 * the runtime delivers only what is raised on the UI thread, so an event may
 * never arrive; a download started by `install` reports its progress to
 * `onprogress` instead. Needs a package identity.
 *
 * @param callback - What to run for each event.
 * @returns How to stop.
 */
export function windowsOnPackageProgress(callback: (progress: PackageProgress) => void) {
  const catalog: PackageCatalogType = PackageCatalog.openForCurrentUser();
  const stops = [
    catalog.onPackageStaging((_sender, args) => callback(
      progressOf({
        stage: PackageStage.staging,
        args,
        target: args.package_
      })
    )),
    catalog.onPackageInstalling((_sender, args) => callback(
      progressOf({
        stage: PackageStage.installing,
        args,
        target: args.package_
      })
    )),
    catalog.onPackageUpdating((_sender, args) => callback(
      progressOf({
        stage: PackageStage.updating,
        args,
        target: args.targetPackage
      })
    ))
  ];
  return () => {
    for (const stop of stops) {
      stop();
    }
  };
}

/**
 * A startup task the package manifest declares (`StartupTask.GetAsync`).
 * Needs a package identity, and the id of a `uap5:StartupTask` extension.
 *
 * @param taskId - The `TaskId` from the manifest.
 * @returns Its state, and how to enable and disable it.
 */
export async function windowsStartupTask(taskId: string) {
  const task = await StartupTask.getAsync(taskId);
  return {
    get state() {
      return startupStateOf(task.state);
    },
    async enable() {
      return startupStateOf(await task.requestEnableAsync());
    },
    disable() {
      task.disable();
    }
  } satisfies StartupTaskHandle;
}
