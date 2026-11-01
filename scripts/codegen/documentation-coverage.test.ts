import { filesIn } from "#scripts/files-in.ts";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

// Every generated props interface and every member of one carries a JSDoc
// comment from Microsoft's documentation (the NuGet XML, else
// documentation-fallback.json). The members below are the ones Microsoft
// documents nowhere: the page of each is empty or absent in
// MicrosoftDocs/winapps-winrt-api and learn.microsoft.com shows only a
// placeholder. When Microsoft writes one, `pnpm fetch:documentation` finds it,
// and this list shrinks (a name here that is documented fails the test).

const GENERATED_FOLDER = path.join(import.meta.dirname, "..", "..", "src", "components", "generated");
const CONTROL_FILE_PATTERN = /controls[\\/][^\\/]+\.svelte\.ts$/;
const INTERFACE_PATTERN = /^export interface (\w+Props)\b/;
const MEMBER_PATTERN = /^ {2}(\w+)\??:/;
const COMMENT_END = "*/";

const undocumentedByMicrosoft = new Map([
  ["ItemsRepeaterProps.itemTransitionProvider", "ItemsRepeater.ItemTransitionProvider has an empty page"],
  ["MediaTransportControlsProps.isCompact", "MediaTransportControls.IsCompact has an empty page"],
  ["PopupProps.onactualplacementchanged", "Popup.ActualPlacementChanged has an empty page"],
  ["SplitMenuFlyoutItemProps", "SplitMenuFlyoutItem has no page, only learn.microsoft.com's placeholder"],
  ["SplitMenuFlyoutItemProps.children", "children takes the class summary, which SplitMenuFlyoutItem lacks"],
  ["SplitMenuFlyoutItemProps.subMenuItemStyle", "SplitMenuFlyoutItem.SubMenuItemStyle has no page"],
  ["SplitMenuFlyoutItemProps.subMenuPresenterStyle", "SplitMenuFlyoutItem.SubMenuPresenterStyle has no page"],
  ["SystemBackdropElementProps", "SystemBackdropElement has no page, only learn.microsoft.com's placeholder"],
  ["SystemBackdropElementProps.cornerRadius", "SystemBackdropElement.CornerRadius has no page"],
  ["SystemBackdropElementProps.systemBackdrop", "SystemBackdropElement.SystemBackdrop has no page"],
  ["TitleBarProps.autoRefreshDragRegions", "TitleBar.AutoRefreshDragRegions has no page"]
]);

function undocumentedIn(file: string) {
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  const gaps: string[] = [];
  let current: string | null = null;
  for (const [i, line] of lines.entries()) {
    const isCommented = (lines[i - 1] ?? "").trim().endsWith(COMMENT_END);
    const declared = INTERFACE_PATTERN.exec(line)?.[1];
    const isDeclaration = declared !== undefined;
    if (isDeclaration) {
      current = declared;

      if (!isCommented) {
        gaps.push(declared);
      }

      continue;
    }

    const isClosing = line.startsWith("}");
    if (isClosing) {
      current = null;
      continue;
    }

    const member = MEMBER_PATTERN.exec(line)?.[1];
    const isUncommentedMember = current !== null && member !== undefined && !isCommented;
    if (isUncommentedMember) {
      gaps.push(`${current}.${member}`);
    }
  }

  return gaps;
}

test("every generated prop and props interface has WinUI's documentation", () => {
  const gaps = filesIn(GENERATED_FOLDER)
    .filter(file => CONTROL_FILE_PATTERN.test(file))
    .flatMap(file => undocumentedIn(file))
    .sort();
  assert.deepEqual(gaps, [...undocumentedByMicrosoft.keys()].sort());
});
