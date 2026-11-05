export const SkipReason = {
  NO_DEPENDENCY: "no winui-svelte dependency",
  NOTHING_TO_CONVERT: "nothing to convert"
} as const;
export type SkipReason = (typeof SkipReason)[keyof typeof SkipReason];

/**
 * What a conversion of several files did, in one sentence: how many attributes moved in how many files, and the
 * files skipped by reason.
 */
export function reportSummary({ attributes, changedFiles, skipped }: {
  attributes: number;
  changedFiles: number;
  skipped: ReadonlyMap<SkipReason, number>;
}) {
  const skippedText = [...skipped].map(([reason, count]) => `${count} (${reason})`).join("; ");
  const suffix = skipped.size === 0 ? "" : `, skipped ${skippedText}`;
  return `${attributes} attributes converted in ${changedFiles} files${suffix}`;
}
