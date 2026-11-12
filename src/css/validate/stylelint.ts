import { validateComponent } from "./validate.ts";
import type { ResourceCatalogue } from "#src/css/runtime/resources.js";
import { loadWinuiCatalogue } from "#src/css/translate/catalogue.js";
import type { Root } from "postcss";
import stylelint from "stylelint";
import type { PostcssResult } from "stylelint";

/** The name of the rule: it reports everything the validator finds. */
const RULE_NAME = "winui-svelte/no-unsupported-css";

export { RULE_NAME as ruleName };

let resources: ResourceCatalogue | null = null;

function catalogue() {
  resources ??= loadWinuiCatalogue();
  return resources;
}

function ignoredCodes(secondary: unknown) {
  const isRecordValue = typeof secondary === "object" && secondary !== null && "ignore" in secondary;
  const list: unknown = isRecordValue ? secondary.ignore : [];
  return Array.isArray(list) ? list.filter(item => typeof item === "string") : [];
}

function checkSheets(primary: unknown, secondary: unknown) {
  return (root: Root, result: PostcssResult) => {
    const isEnabled = stylelint.utils.validateOptions(result, RULE_NAME, { actual: primary }, {
      actual: secondary,
      optional: true
    });
    const input = result.root?.source?.input;
    const source = input?.css;
    const file = input?.file;
    const isSourceMissing = source === undefined || file === undefined;
    const shouldSkip = !isEnabled || isSourceMissing;
    if (shouldSkip) {
      return;
    }

    const ignored = new Set(ignoredCodes(secondary));
    const blockStart = root.source?.start?.offset ?? 0;
    const blockEnd = root.source?.end?.offset ?? source.length;
    const diagnostics = validateComponent({
      source,
      filename: file,
      resources: catalogue()
    });
    for (const diagnostic of diagnostics) {
      const isInBlock = diagnostic.start.character >= blockStart && diagnostic.start.character <= blockEnd + 1;
      const shouldReport = isInBlock && !ignored.has(diagnostic.code);
      if (shouldReport) {
        stylelint.utils.report({
          ruleName: RULE_NAME,
          result,
          node: root,
          message: diagnostic.message,
          severity: diagnostic.severity,
          start: {
            line: diagnostic.start.line,
            column: diagnostic.start.column + 1
          },
          end: {
            line: diagnostic.end.line,
            column: diagnostic.end.column + 1
          }
        });
      }
    }
  };
}

/**
 * The stylelint rule over the same validator the preprocessor and the Vite
 * plugin use, so a message and a position are the same wherever it shows. The
 * secondary option `{ ignore: ["partial-support"] }` skips codes.
 *
 *   plugins: ["winui-svelte/stylelint"], rules: { "winui-svelte/no-unsupported-css": true }
 */
export const rule = Object.assign(checkSheets, {
  ruleName: RULE_NAME,
  messages: {},
  meta: {
    url: "https://github.com/avi12/winui-svelte/blob/main/src/css/API.md"
  }
});
