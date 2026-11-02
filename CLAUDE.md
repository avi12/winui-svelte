# winui-svelte

WinUI 3 controls as Svelte 5 components: native Windows apps written in Svelte,
for Tauri, Electron or plain Node
Windows only
This file is for contributors
and coding agents; it is never published to npm (`files` in `package.json` is an
allowlist, and `pnpm pack --dry-run` must not list it)

# Stack
- pnpm only: `packageManager` is pinned, `pnpm-lock.yaml` is committed, every script, CI step and doc uses `pnpm`
  Never `npm` or `yarn`, and never a second lockfile
- TypeScript, ESM only, `strict` plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride` and `verbatimModuleSyntax`
- Svelte 5 (runes) on the custom renderer the package ships; the generated components come from WinUI's metadata through `scripts/codegen` (never hand-edit `src/components/generated`)
- What the generator decides by hand is a table in `scripts/codegen/tables.ts` (`rootClasses` for the families that become components, `itemsHosted` for the controls that take `items`/`key`/`item`, `nonConstructible`, `bindingsAfterWinapp`)
  Change the table and run `pnpm gen:components`, never the output
  Only `Window` and the item hosts (`src/components/hand-written/items`) are hand-written
  The WinUI bindings come from `pnpm bindings` (winapp, then `scripts/bindings/after-winapp.ts`); the API is in `API.md`, the contributor steps in `CONTRIBUTING.md`
- `pnpm test:windows` needs an ordinary desktop session (WebView2 cannot launch its browser in a sandboxed process)
- Licence: Apache-2.0: keep `LICENSE` and `NOTICE` (forks must carry the copyright and NOTICE)

# Which rules win
1. **Google's style guide for the language** (https://google.github.io/styleguide/), followed strictly wherever it speaks, in every language the repository holds, not only TypeScript: TypeScript (https://google.github.io/styleguide/tsguide.html), JavaScript, HTML and CSS (the markup and `<style>` of `.svelte` files), JSON, Markdown and XML. The table under "Other languages" says which guide covers which files and where a tool dictates otherwise
2. **Avi's house rules** (below, adapted from `avi/youtube-time-manager`): they add to it, and win only where Google is silent
3. A conflict is settled in the table here, not ad hoc
   Add the row when you meet a new one

| Topic | Google | House rule | Decision |
|---|---|---|---|
| Default exports | Forbidden | n/a | Named exports only. A `.svelte` file's default export is Svelte's own and the one exception |
| Return types | Inference allowed | Never write them | Infer everywhere. `publint` and `are-the-types-wrong` gate the emitted `.d.ts` |
| Comments | JSDoc on every exported symbol | Zero comments by default | JSDoc (TSDoc) on the public API only, saying what a reader cannot see from the name and type. No comment that restates code; a comment on internals only for a WinUI quirk, a required order or a dead end |
| Braces | Always, body on its own line | `if` always braced | Both agree: braces on every `if`/`else`/`for`/`while`, K&R, body on the next line |
| Constants | `CONSTANT_CASE` | `SCREAMING_SNAKE_CASE` | Same thing |
| Enums | `enum` allowed, no `const enum` | Strings are enums | A closed set of values is an `as const` object plus its union type (`export const X = { A: "a" } as const; export type X = typeof X[keyof typeof X]`): the package runs under Node's type stripping with `erasableSyntaxOnly`, which forbids `enum`. Never `const enum` |
| Imports | Relative within the project, no deep `../../../` | `@` alias over `../` | Relative imports (`./x`, `../x`): the build compiles each file in place, and a path alias would need a second map for `dist`. The one subpath import is `#winui/*`, the bindings an app generates for itself. Keep `../` chains short by keeping folders shallow |
| Parameters | n/a | 2+ parameters take one destructured object | Adopt it, public API included. Exempt: key/value accessors and callbacks whose signature WinUI or Svelte dictates, and the classes that mirror the Canvas 2D API (`src/win2d/context-2d`: `Context2D`, `Path2D`, `CanvasElement`, `CanvasGradient`), whose methods are positional so that a library written for a browser canvas calls them unchanged; and the classes that mirror a Web API (`src/web-apis`: `Notification`, `NotificationClickEvent`, `PermissionStatus`, and the next), whose constructors and methods keep the spec's positional signatures and member names (`silent`, `requireInteraction`, `onclick`) so that a library written for a browser calls them unchanged; a WinUI extra is an optional member of the options object, never a positional parameter |

# Other languages
Every file follows Google's guide for its language
Read the guide before writing in a language you have not touched in this repository; where a tool's own format is fixed (npm's `package.json` keys, GitHub Actions' YAML schema, pnpm's lockfile) the tool wins for that file and nowhere else

| Files | Guide | Applied here |
|---|---|---|
| `.ts`, the `<script>` of `.svelte` | [TypeScript](https://google.github.io/styleguide/tsguide.html) | The sections above and below; ESLint and oxlint enforce it |
| `.js`, `.cjs`, `.mjs` (config, lint rules) | [JavaScript](https://google.github.io/styleguide/jsguide.html) | The same rules as TypeScript, minus the types: ES modules, `const`/`let`, named exports, `===`, braces, `for...of`, JSDoc on exports |
| Markup of `.svelte`, `.html` | [HTML/CSS](https://google.github.io/styleguide/htmlcssguide.html) | Lowercase element and attribute names, double-quoted attribute values, 2-space indent, no trailing whitespace, no `type` on `<script>`/`<style>`, semantic elements; WinUI element names in a `.svelte` file are the library's own (`<text-block>`) |
| `<style>` of `.svelte`, `.css` | [HTML/CSS](https://google.github.io/styleguide/htmlcssguide.html) | Lowercase, short hex, no unit on zero, hyphenated class names, one declaration per line, `;` after the last, a space after `:`, no `!important`, no ID selectors for style; stylelint enforces it, and the translator accepts only what WinUI can say |
| `.json` | [JSON](https://google.github.io/styleguide/jsoncstyleguide.html) | Double quotes, no comments, no trailing commas, 2-space indent, `camelCase` property names that this repository names; a file another tool defines (`package.json`, `tsconfig.json`) keeps that tool's keys |
| `.md` | [Markdown](https://google.github.io/styleguide/docguide/style.html) | ATX headings (`#`), one H1, a blank line around headings, lists and fences, fenced code blocks with a language, lines wrapped near 80, no trailing whitespace, descriptive link text, hyphens for bullets, and no full stops in prose (end a sentence with a line break, a semicolon or a comma; code, tables, file names and numbers keep theirs); `scripts/pack/docs-prose.test.ts` enforces it |
| `.xml` | [XML](https://google.github.io/styleguide/xmlstyle.html) | Well-formed, 2-space indent, lowercase-hyphenated or the schema's own names, no mixed content where avoidable |
| `.ps1` | none from Google; its [shell guide](https://google.github.io/styleguide/shellguide.html) for the principles | 2-space indent, lines near 80, quote every expansion, `Set-StrictMode`, fail fast (`$ErrorActionPreference = 'Stop'`), a comment for what is not obvious; PowerShell's own conventions win where they differ (`Verb-Noun` functions, `PascalCase` parameters, approved verbs) |
| `.yml`, `.yaml` | none | 2-space indent, no tabs, no trailing whitespace, quoted strings only where YAML needs them; keys in the order the tool documents |

A conflict between the guide and a house rule is settled by the first table in this file, and a new one gets its row there
Never write against a guide "because the file is small": the style is the same everywhere in the repository

# Google style, in short (the guide has the rest)
- Named exports only; no `export default`, no namespaces, no `require`, no side-effectful modules
- `any` is banned (`unknown`, then narrow); no `@ts-ignore` / `@ts-nocheck`; `@ts-expect-error` only in a test, with the reason
- No type assertion (`as`, `!`) without a one-line reason; prefer a type guard or a schema
  No `<T>x` casts, no `Object`, `String` or `Number` wrapper types
- `readonly` on every property and array that is never reassigned; `const` by default, never `var`
- `interface` for object shapes, `type` for unions and aliases; no `I` prefix, no `_` prefix, no Hungarian decoration
- `UpperCamelCase` types, classes, enums and components; `lowerCamelCase` variables, functions and properties; `CONSTANT_CASE` module constants and enum members
- Use `private`/`protected` and `readonly`, not `#private`; no parameter properties except for plain dependency holders
- `for...of` over `.forEach` and over index loops; no `for...in`; array literals, not `new Array`
- Prefer `Map`/`Set` over indexing plain objects with unknown keys; template literals over concatenation
- Errors: throw `Error` subclasses only, never strings; `catch` narrows `unknown`
- Always `===` and `!==`; the one exception is `== null` to test null and undefined together, as Google allows

# Code style
- Early returns; minimise indentation; no nested try/catch
- DRY with separation of concerns: one concern per module, named in its top-level export
  Before writing a helper, constant or type, find the one that exists and extend it (single source of truth)
- Functional style, `async`/`await`, parallel work with `Promise.all`
- A condition that is compound, a comparison or a call is extracted into a named boolean first (`const isReady = ...; if (isReady) {`)
  A lone `if (!value)` or `if (isReady)` stays inline
- Inline a variable that is assigned once and used once, unless it names a magic value or an opaque expression
- **Tree shaking is a requirement:** `"sideEffects": false`, ESM only, no top-level work at import time (no registrations, no `new` of heavy objects, no patching globals), no barrel that pulls in more than it names, one subpath export per area (`./components`, `./state`, `./css`, `./window`...)
  A consumer who imports `Button` must not bundle `NavigationView`
  A test bundles a one-component app and fails if the output grows past its budget
- Validate loose data (messages, config files, metadata) with a schema (`zod`), not hand-rolled `typeof` chains; a schema used only for its inferred type stays un-exported
- Svelte: `$derived.by` with if/else, never a ternary inside `$derived`; a handler used once is inlined; no ternary in markup when the lint rule forbids it
- No em dashes; use hyphens
- No full stops in the prose of Markdown docs: a sentence ends without a period (separate sentences with a line break, a semicolon or a comma); write "for example", "that is" and "and so on" instead of the abbreviations

# Naming
- Full words, no abbreviations (`direction`, not `dir`)
  Allowed idioms (the `id-length` allow-list): `i`/`j` loop counters, `x`/`y`, `id`, `to`, `on`, `ok`, `T` for a type parameter and `_` for an unused parameter; `hwnd`, `rva` and `dip` are long enough
- Booleans carry `is` / `has` / `can` / `should` and read positively (`isEnabled`, never `isDisabled`)
- An index variable is `i`-prefixed (`iItem`), or a bare `i` in a loop
- Generated and hand-written components mirror WinUI's own names (`StackPanel`, `childrenTransitions`); props are the WinUI property in `lowerCamelCase`, events `on` + the WinUI event name in lowercase, like the DOM's (`ontoggled`, `onselectionchanged`)

# Hardcoded values
- A closed set of values is an enum; a lone magic string or number is a named `CONSTANT_CASE` constant (unless self-evident: `0`, `1`, `/ 2`)

# Type safety
- 100% typed: no implicit or explicit `any`, anywhere, generated code included
  The lint gate fails on `any` hints from the editor's language server too
- A prop's type is WinUI's own (from the bindings), narrowed as far as the metadata allows; `unknown` or a loose input type needs a one-line reason in the codegen table
- An unknown attribute or a wrong value type on a component must fail `svelte-check`; keep a test that proves it

# Linting
After each change run `pnpm lint` and `pnpm test`
Fix what they flag; never silence a rule to pass
After anything that removes or rewires code, run the dead-code audit (`pnpm fallow`) and clean up the orphans by hand

- `pnpm lint` runs every step even when an earlier one fails, so one run lists everything: `build`, oxlint (type-aware), ESLint, stylelint, `check` (tsc and `svelte-check`), `check:editor` (the VS Code Svelte language server's diagnostics), `check:webstorm` (WebStorm's own inspections, see below), fallow, `gen:components:check` and `check:package` (publint and are-the-types-wrong on the packed tarball)
  It exits 1 if any failed
- `pnpm lint:fix` runs the fixers over the whole tree (oxlint `--fix` with `.oxlintrc.fix.json`, ESLint `--fix`, oxlint)
  The pre-commit hook (simple-git-hooks, installed by `pnpm install`, config in `lint-staged.config.js`) runs the same fixers and `pnpm fallow:audit` on the staged files; never skip it
- `pnpm lint:summary [eslint|oxlint|tsc|svelte-check ...] [--folder src/css]` counts the violations per rule and per top-level folder (and lists the files of one folder)
  Use it to pick an area and watch its count fall
- `pnpm build` fails only when tsc emitted nothing; type errors are `pnpm check`'s to report
- `pnpm check:webstorm` runs WebStorm's own command-line inspection, headless, over a shadow copy of the working tree (`scripts/editor/check-webstorm.ts`), with the checks listed in `scripts/editor/webstorm/profile.xml` (the one list; add a check by naming its inspection id)
  It is mandatory wherever WebStorm is installed
  Where it is not (CI, a VS Code-only machine) it says so and passes with exit 0; `--require` makes a missing WebStorm a failure
  It never touches a running WebStorm: it starts an instance of its own with config, system, plugin and log folders under `.verify/webstorm`, and only ever stops the pid it started
  It runs with the TypeScript language service on, as WebStorm does by default, so type errors stay `tsc`'s and `svelte-check`'s to report; it adds the Svelte plugin's checks, unresolved references and imports, and unused and unreachable code
  `--ide-types` turns the service off so the IDE's own type evaluator reports instead; that is noisy (it disagrees with `tsc` on code `tsc` accepts) and is for looking, not gating
  A finding that is WebStorm misreading a string or template as code is silenced where it stands with `// noinspection <id>` and the reason
- Every rule below is an error
  The rules live in `eslint-config/google-style.js` (ESLint, applied to `.ts` and `.svelte`) and `.oxlintrc.json`; the compiler flags in `tsconfig.json`

## What the tools enforce
- **Compiler:** `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noPropertyAccessFromIndexSignature`, `noImplicitOverride`, `noImplicitReturns`, `noUncheckedSideEffectImports`, `verbatimModuleSyntax`, unreachable code and unused locals
- **Google style:** named exports only, no `any` / `@ts-ignore` / `@ts-nocheck` (`@ts-expect-error` needs a description), `consistent-type-imports`, no non-null assertion, no object-literal assertion (and oxlint bans every other assertion except `as const`), `===`, braces on every block with the body on its own line, `prefer-const`, no `var`, `for...of` instead of index loops and `for...in`, `only-throw-error`, no namespaces / `require` / wrapper types, `T[]` for simple types, `interface` over a type alias, no parameter properties except `readonly` ones, no `public` keyword, `unused-imports/no-unused-imports` (the fixer that removes a dead import), `typescript/no-floating-promises` (off in `node:test` files, whose `test()` returns a promise by design; elsewhere a deliberate fire-and-forget says `void`)
- **Naming:** UpperCamelCase types, classes, enums and components; lowerCamelCase variables, functions and properties; `CONSTANT_CASE` module constants and enum members; no `I` prefix; no leading `_` except on an unused parameter; a boolean variable, parameter or class property starts `is` / `has` / `can` / `should`; no names under 3 characters beyond the allow-list
- **House rules:** a compound or comparing `if` condition (and a compound ternary condition) is extracted into a named boolean (an `else if` stays inline); no `.forEach` / `.reduce`; one destructured parameter from two (declarations and methods); no written return types (a type predicate is the exception); no magic numbers beyond `0`, `1`, `-1`, `2`; early returns (`no-else-return`, `no-lonely-if`, `max-depth` 3, `max-nested-callbacks` 3, no nested ternary); no `../` import (use `#src/*.js`, or `#scripts/*.ts` from one tooling script to another); no import cycle (type-only ones are ignored); no em dash
- **Public API:** JSDoc with a description on every exported function, class, interface, type alias and enum in `src/`, no types in the JSDoc
- **Tree shaking:** a statement at the top level of a module in `src/` (a call, an `if`, a loop, a `try`) fails; the entry points (`src/window/bootstrap.ts`, `src/window/thread.ts`) are exempt, and a test bundles a one-component app against a size budget
- **Generated components** (`src/components/generated`) are excluded from the style rules because the generator is where they are fixed; tsc, `svelte-check`, `props-strictness.ts`, the editor check and `gen:components:check` cover them

## What no tool enforces (review catches it)
- The Google guides for Markdown, JSON, XML, PowerShell and YAML (see "Other languages"): no linter runs over them yet, so review is the gate
  Check every new or edited file of those kinds against its row before committing; if a violation can be found by a script, add the check to `pnpm lint` instead of relying on review
- A type assertion with a one-line reason: oxlint's rule is stricter and allows none, so a genuinely needed assertion takes a `// oxlint-disable-next-line` with the reason
- An `if` whose condition is a call with an unclear intent: only compound conditions and comparisons are flagged
- A function with 2+ parameters that is an exempt shape (a key/value accessor, a callback whose signature WinUI or Svelte dictates): the rule flags it, and the disable comment carries the reason
- A boolean named `allowDrop`-style because it mirrors a WinUI property: the prefix rule covers variables, parameters and class properties, not interface or object-literal keys
- JSDoc on an export of an internal module that no entry point re-exports: the rule asks for it anyway; its description is not judged
- DRY, single source of truth, separation of concerns, "inline a variable used once", and "no comment that restates the code"
- A top-level initializer that does work (`const registry = register()`): only statements are flagged; the bundle-size test is the backstop
- Hungarian-style and abbreviated names that happen to be 3+ characters

# Tidiness
- After each feature, remove what it orphaned (exports, helpers, scripts, files, docs), then run `pnpm fallow`; it must finish clean
- No dead code, no commented-out code, no TODO without an owner, no stale docs: a README, CONTRIBUTING or DESIGN passage that describes something removed is fixed in the same change

# Commits and releases
- Digestible commits: one self-contained logical change each, with a message saying what and why; large work lands as a sequence
- `main` is the default branch
- Releases go out only when asked: bump the version, `pnpm build`, `pnpm pack --dry-run` (check the file list and size), then `pnpm publish`
- Every published version also gets a GitHub release on its `vX.Y.Z` tag (`gh release create`): the notes list the highlights of the change log, grouped by what a user of the package sees, and link the commit range (`vPREVIOUS...vX.Y.Z`) for the rest
  Create it in the same step as the publish, never leave a published version without one
- Release gate: no release until every WinUI 3 component is fully operational from Svelte (the coverage guard in `scripts/codegen/coverage.ts` shows 0 gaps and each remaining exclusion is justified) and the user explicitly asks
