import { attachmentData, entryApi, webEventData } from "./attachment-data.ts";
import { easingData, materialData, shadowDepthData, unsupportedPropertyData } from "./css-preview-data.ts";
import { enumData } from "./enum-data.ts";
import { parsedIdeData } from "./ide-data.ts";
import { resourceData } from "./resource-data.ts";
import { handledMembers } from "#src/css/translate/handled-members.js";

// The text of the data set, deterministic: the same sources give the same bytes.

function compareNames({ left, right }: {
  left: string;
  right: string;
}) {
  const isSameName = left === right;
  if (isSameName) {
    return 0;
  }

  return left < right ? -1 : 1;
}

function byName<T extends { name: string }>(entries: T[]) {
  return entries.toSorted((left, right) => compareNames({
    left: left.name,
    right: right.name
  }));
}

// One entry to a line, so that a change of one resource is one line of the diff.
function section({ key, entries }: {
  key: string;
  entries: unknown[];
}) {
  const lines = entries.map(entry => `    ${JSON.stringify(entry)}`);
  return `  "${key}": [\n${lines.join(",\n")}\n  ]`;
}

/** The checked-in data set as written to disk. */
export function ideDataText() {
  const api = entryApi();
  const data = parsedIdeData({
    resources: byName(resourceData()),
    enums: byName(enumData()),
    attachments: byName(attachmentData(api)),
    webEvents: byName(webEventData(api)),
    translateKeys: [...handledMembers()].toSorted((left, right) => compareNames({
      left,
      right
    })),
    easings: easingData(),
    shadowDepths: shadowDepthData(),
    unsupportedProperties: byName(unsupportedPropertyData()),
    materials: materialData()
  });
  return `{\n${Object.entries(data).map(([key, entries]) => section({
    key,
    entries
  })).join(",\n")}\n}\n`;
}
