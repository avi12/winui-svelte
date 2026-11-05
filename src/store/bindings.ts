// The WinRT types the winui-svelte/store modules use, from the bindings the
// app generated (`pnpm bindings`, which makes the classes of `lateClasses` in
// scripts/codegen/tables.ts), reached through `#winui/*`. The one import site
// of the bindings for the store modules; they read nothing else.

export { Package } from "#winui/windows/application-model/Package";
export { PackageCatalog } from "#winui/windows/application-model/PackageCatalog";
export { StartupTask } from "#winui/windows/application-model/StartupTask";
export { StoreContext } from "#winui/windows/services/store/StoreContext";
export type { StorePackageUpdate } from "#winui/windows/services/store/StorePackageUpdate";
export { unpackStorePackageUpdateStatus } from "#winui/windows/services/store/StorePackageUpdateResult";
