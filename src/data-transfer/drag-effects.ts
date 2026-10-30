import { DataPackageOperation } from "#winui/windows/application-model/data-transfer/DataPackageOperation";

/** What a drop did, as the web names it: the cursor shows the matching icon. */
export const DropEffect = {
  none: "none",
  copy: "copy",
  move: "move",
  link: "link"
} as const;

/** One of `DropEffect`'s values. */
export type DropEffect = (typeof DropEffect)[keyof typeof DropEffect];

/** What the source of a drag lets the target do. */
export const EffectAllowed = {
  none: "none",
  copy: "copy",
  copyLink: "copyLink",
  copyMove: "copyMove",
  link: "link",
  linkMove: "linkMove",
  move: "move",
  all: "all",
  uninitialized: "uninitialized"
} as const;

/** One of `EffectAllowed`'s values. */
export type EffectAllowed = (typeof EffectAllowed)[keyof typeof EffectAllowed];

const OPERATIONS = {
  [DropEffect.none]: DataPackageOperation.None,
  [DropEffect.copy]: DataPackageOperation.Copy,
  [DropEffect.move]: DataPackageOperation.Move,
  [DropEffect.link]: DataPackageOperation.Link
} as const satisfies Record<DropEffect, number>;

const ALL_OPERATIONS = DataPackageOperation.Copy | DataPackageOperation.Move | DataPackageOperation.Link;

const ALLOWED = {
  [EffectAllowed.none]: DataPackageOperation.None,
  [EffectAllowed.copy]: DataPackageOperation.Copy,
  [EffectAllowed.copyLink]: DataPackageOperation.Copy | DataPackageOperation.Link,
  [EffectAllowed.copyMove]: DataPackageOperation.Copy | DataPackageOperation.Move,
  [EffectAllowed.link]: DataPackageOperation.Link,
  [EffectAllowed.linkMove]: DataPackageOperation.Link | DataPackageOperation.Move,
  [EffectAllowed.move]: DataPackageOperation.Move,
  [EffectAllowed.all]: ALL_OPERATIONS,
  [EffectAllowed.uninitialized]: ALL_OPERATIONS
} as const satisfies Record<EffectAllowed, number>;

// The effect a drop gets when the page does not choose: copy, then move, then link.
const PREFERENCE = [DropEffect.copy, DropEffect.move, DropEffect.link] as const;

/**
 * The WinUI operation flags an effect stands for.
 *
 * @param effect - The drop effect.
 * @returns The `DataPackageOperation` value.
 */
export function operationOf(effect: DropEffect) {
  return OPERATIONS[effect];
}

/**
 * The operations a source allows, as the flags WinUI takes.
 *
 * @param effectAllowed - What the source allows.
 * @returns The `DataPackageOperation` flags.
 */
export function allowedOperationsOf(effectAllowed: EffectAllowed) {
  return ALLOWED[effectAllowed];
}

/**
 * The effect WinUI's operation flags stand for: the preferred one among them.
 *
 * @param operation - The `DataPackageOperation` flags.
 * @returns The effect, `none` when no operation is set.
 */
export function effectOf(operation: number) {
  return PREFERENCE.find(effect => (operation & OPERATIONS[effect]) !== 0) ?? DropEffect.none;
}

/**
 * The `effectAllowed` a set of WinUI operation flags is.
 *
 * @param operations - The `DataPackageOperation` flags a source allows.
 * @returns The matching name, `none` when no operation is set.
 */
export function effectAllowedOf(operations: number) {
  const names = Object.values(EffectAllowed).filter(name => name !== EffectAllowed.uninitialized);
  return names.find(name => ALLOWED[name] === (operations & ALL_OPERATIONS)) ?? EffectAllowed.none;
}

/**
 * The effect a target gets when its handler accepted the drag without choosing
 * one: the preferred effect the source allows.
 *
 * @param allowedOperations - The `DataPackageOperation` flags the source allows.
 * @returns The effect, `none` when the source allows none.
 */
export function defaultEffectOf(allowedOperations: number) {
  return effectOf(allowedOperations);
}
