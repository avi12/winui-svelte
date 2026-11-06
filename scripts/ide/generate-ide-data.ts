import { ideDataText } from "./ide-data-text.ts";
import { IDE_DATA_FILE } from "./ide-data.ts";
import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";

// Writes ide/webstorm/src/main/resources/winui-ide-data.json, the one data set
// the WebStorm plugin and the VS Code extension read and web-types.json is
// derived from: the resource names with their light and dark swatches, the
// `as const` sets of winui-svelte/enums, the `@attach` helpers and web events,
// and the CSS properties the translation handles.
//
//   node scripts/ide/generate-ide-data.ts [--check]
//
// --check writes nothing and fails when the file differs, as the lint gate does.

const { values } = parseArgs({
  options: {
    check: {
      type: "boolean"
    }
  }
});
const TEXT = ideDataText();
const IS_CHECK = values.check === true;
if (IS_CHECK) {
  const isCurrent = readFileSync(IDE_DATA_FILE, "utf8").replaceAll("\r\n", "\n") === TEXT;
  if (!isCurrent) {
    console.error("ide/webstorm/src/main/resources/winui-ide-data.json is out of date: run pnpm gen:ide-data");
    process.exitCode = 1;
  }
} else {
  writeFileSync(IDE_DATA_FILE, TEXT);
}
