import {
  allowedOperationsOf,
  DropEffect,
  EffectAllowed,
  grantedOperationOf,
  operationOf
} from "./drag-effects.ts";
import { DataPackageOperation } from "#winui/windows/application-model/data-transfer/DataPackageOperation";
import assert from "node:assert/strict";
import { test } from "node:test";

test("a drop effect by its name is the operation, and any other string is none", () => {
  assert.equal(operationOf(DropEffect.link), DataPackageOperation.Link);
  assert.equal(operationOf("copy"), DataPackageOperation.Copy);
  assert.equal(operationOf("shortcut"), DataPackageOperation.None);
});

test("a drop gets the effect the target chose, or an allowed one when the source forbids it", () => {
  const copyMove = DataPackageOperation.Copy | DataPackageOperation.Move;
  const all = copyMove | DataPackageOperation.Link;
  assert.equal(
    grantedOperationOf({
      effect: DropEffect.link,
      allowed: all
    }), DataPackageOperation.Link
  );
  assert.equal(
    grantedOperationOf({
      effect: DropEffect.link,
      allowed: copyMove
    }), DataPackageOperation.Copy
  );
  assert.equal(
    grantedOperationOf({
      effect: DropEffect.none,
      allowed: all
    }), DataPackageOperation.None
  );
});

test("an effect allowed by its name is its operations, and any other string allows everything", () => {
  assert.equal(allowedOperationsOf(EffectAllowed.copyLink), DataPackageOperation.Copy | DataPackageOperation.Link);
  assert.equal(allowedOperationsOf("whatever"), allowedOperationsOf(EffectAllowed.all));
});
