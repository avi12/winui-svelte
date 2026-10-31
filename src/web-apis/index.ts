export { DomErrorName, domException } from "./dom-exception.ts";
export { HandlerEventTarget } from "./event-handlers.ts";
export type { Uninstall, WebApiInstaller } from "./install.ts";
export { defineNavigatorProperty, defineProperty, installWebApis } from "./install.ts";
export type { PermissionProvider } from "./permissions.ts";
export {
  announcePermissionChange,
  installPermissions,
  PermissionName,
  Permissions,
  PermissionStateName,
  PermissionStatus,
  registerPermission
} from "./permissions.ts";
