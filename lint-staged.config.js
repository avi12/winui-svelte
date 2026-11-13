// The pre-commit hook (simple-git-hooks, installed by `pnpm install`):
// the fixers run on the staged files, then fallow audits what changed
// against HEAD. Type-aware oxlint stays in `pnpm lint`, because it reads
// dist/ and a fresh clone has none.
export default {
  "*.{ts,svelte,js,mjs}": [
    "oxlint --fix --no-error-on-unmatched-pattern",
    "eslint --fix --no-warn-ignored",
    "oxlint --fix --no-error-on-unmatched-pattern",
    () => "fallow audit --base HEAD"
  ]
};
