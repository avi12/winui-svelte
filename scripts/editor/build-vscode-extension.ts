// Bundles the VS Code extension (ide/vscode) into ide/vscode/dist/extension.js,
// the file its package.json names as `main`, and packs it as a .vsix next to it:
//
//   node scripts/editor/build-vscode-extension.ts
//
// The icon table is the WebStorm plugin's (fluent-glyphs.json, written by
// `pnpm gen:components`), so the two editors offer the same names.
import { buildExtension } from "#scripts/editor/vscode/extension-build.ts";

process.exitCode = await buildExtension() ? 0 : 1;
