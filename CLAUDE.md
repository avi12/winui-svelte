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
| Imports | Relative within the project, no deep `../../../` | `@` alias over `../` | Vite-style: `@/` is the project root (`@/src/x.js`), `./x` for a sibling in the same folder, never `../`; the lint rule bans `../`; `package.json` subpath imports must start with `#`, so `@/` needs a `tsconfig` `paths` entry and the build must rewrite it in `dist` (until it does, `#src/*` stands in). The other subpath import is `#winui/*`, the bindings an app generates for itself |
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
| `.kt`, `.kts` (`ide/webstorm`) | [Kotlin style guide](https://developer.android.com/kotlin/style-guide) and the [Kotlin coding conventions](https://kotlinlang.org/docs/coding-conventions.html) | 2-space indent and 120 columns from `ide/webstorm/.editorconfig` (sb-companion's), where the Android guide says 4; no wildcard imports, sorted imports, no trailing commas, full-word names, `val` over `var`, immutable collections, early returns, a compound or comparing condition in a named boolean, no `!!`, the narrowest visibility (`internal` by default, `public` only for what `plugin.xml` names), `by lazy` or an `object` instead of work at load, no comment that restates the code; pure logic in plain files with no platform imports, platform glue thin; ktlint (formatting) and detekt (correctness, complexity) enforce it through `ktLint` |
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
Fix what they flag; never silence a rule to pass: a lint-disable comment is an error in oxlint and ESLint ignores it, so an exemption goes in the config (`.oxlintrc.json`, `eslint.config.js`) with its reason, never at the line
After anything that removes or rewires code, run the dead-code audit (`pnpm fallow`) and clean up the orphans by hand

- `pnpm lint` runs every light step, and `pnpm lint:full` adds `check:editor`, `check:webstorm`, `check:webstorm-plugin` (the IDE inspections) and `check:package` (the heaviest steps); both run every step even when an earlier one fails, so one run lists everything: `build`, oxlint (type-aware), ESLint, stylelint, `check` (`tsc` and `svelte-check`; `tsrs --noEmit` cannot stand in for `tsc` yet, see below), `check:editor` (the VS Code Svelte language server's diagnostics), `check:webstorm` (WebStorm's own inspections, see below), fallow, `gen:components:check` and `check:package` (publint and are-the-types-wrong on the packed tarball)
  It exits 1 if any failed
  The memory-heavy steps (`lint:eslint`, `check` and `check:editor`) are marked `isHeavy` in `scripts/lint/lint.ts` and never run together, so the peak memory is the largest one, not their sum
- The shared rules live in the public repository `avi12/lint-config`, installed from a tag as `github:avi12/lint-config#vX.Y.Z&path:/packages/<name>`: `eslint-config-avi12` (ESLint, which since v0.4 lints only `.svelte` files: the Svelte layer; every rule oxlint can run, including the custom layout rules, JSDoc and tree shaking, runs in oxlint), `oxlint-config-avi12` and `oxlint-plugin-naming` (oxlint, with `naming/convention`), `stylelint-config-avi12` and `fallow-config-avi12`
  This repository keeps only what is its own, as small overrides: the `native.ts` files that may import Win32, the platform and Chrome API files whose positional signatures a library written for a browser relies on, the codegen exclusions, `#src/*` imports, the `taskbarTheme` JSDoc tag and the Kotlin plugin
  A shared rule that is wrong is fixed in that repository, tagged, and the tag bumped here; never worked around
  Every exemption is a file list in the config, so a new one is a decision visible in a diff, and `naming/convention` takes `allowedNames` and `fileOverrides` that each carry a reason
- ESLint reads no type information (that is what made each worker take 1.5 GB); the rules that need types run in type-aware oxlint
- `tsrs --noEmit` is not used for `pnpm check`: tsrs's bundled `lib.dom` already declares `navigator.serial`, so `src/web-apis/serial.ts` collides with it (TS2717, and three follow-on errors in `serial.test.ts`), while TypeScript 6's `lib.dom` does not have it; switch when both agree
- Type-aware oxlint rules run through `tsrs-lint` (tsrs, a Rust port of TypeScript 7), never Go's tsgolint: `scripts/lint/type-aware-environment.ts` is the one place that points oxlint at it, and `pnpm lint:oxlint`, `pnpm lint:fix` and `pnpm lint:summary` all go through it; run `oxlint --type-aware` by hand only with that environment
- `pnpm lint:fix` runs the fixers over the whole tree (ESLint `--fix`, which also removes unused imports, then oxlint `--fix`)
  The pre-commit hook (simple-git-hooks, installed by `pnpm install`, config in `lint-staged.config.js`) runs the same fixers and `pnpm fallow:audit` on the staged files; never skip it
- `pnpm lint:summary [eslint|oxlint|tsc|svelte-check ...] [--folder src/css]` counts the violations per rule and per top-level folder (and lists the files of one folder)
  Use it to pick an area and watch its count fall
- `pnpm build` fails only when tsc emitted nothing; type errors are `pnpm check`'s to report
- `pnpm check:webstorm` runs WebStorm's own command-line inspection, headless, over a shadow copy of the working tree (`scripts/editor/check-webstorm.ts`), with the checks listed in `scripts/editor/webstorm/profile.xml` (the one list; add a check by naming its inspection id)
  It is mandatory in `pnpm lint:full` wherever WebStorm is installed; `pnpm lint:full` must pass before a release and runs in CI, while the default `pnpm lint` omits it (with `check:editor` and `check:webstorm-plugin`) to keep memory low
  Where it is not (CI, a VS Code-only machine) it says so and passes with exit 0; `--require` makes a missing WebStorm a failure
  It never touches a running WebStorm: it starts an instance of its own with config, system, plugin and log folders under `.verify/webstorm`, and only ever stops the pid it started
  It runs with the TypeScript language service on, as WebStorm does by default, so type errors stay `tsc`'s and `svelte-check`'s to report; it adds the Svelte plugin's checks, unresolved references and imports, and unused and unreachable code
  `--ide-types` turns the service off so the IDE's own type evaluator reports instead; that is noisy (it disagrees with `tsc` on code `tsc` accepts) and is for looking, not gating
  A finding that is WebStorm misreading a string or template as code is silenced where it stands with `// noinspection <id>` and the reason
- The WebStorm plugin (`ide/webstorm`, Kotlin, never in the npm package) is built and checked by `pnpm check:webstorm-plugin` (its tests, ktlint, detekt and a headless inspection in the isolated WebStorm; `pnpm check:webstorm-plugin-compat` runs the Plugin Verifier over it, after every WebStorm update)
  `pnpm install:webstorm-plugin` builds it and unpacks it into the developer's own WebStorm (`scripts/editor/install-webstorm-plugin.ts`); run it when the user asks to install or update the plugin, or after a plugin change they want to try
  Never close, restart or kill WebStorm: while one runs the script writes nothing and exits 2, then tell the user to close WebStorm and run `pnpm install:webstorm-plugin --skip-build`, or to install the printed zip with Settings, Plugins, Install Plugin from Disk
  After it installs, the user starts WebStorm to load the plugin: a relaunch alone loads whatever zip was installed last, so a new build must be installed first
- `ide/vscode` has its own `package.json`, so the root `#src/*` subpath imports do not reach it and a subpath import cannot point outside the package; the ten files under `ide/vscode/src` that import the root `src` or the WebStorm resource JSON with `../` are exempt from `house/no-parent-imports` in `.oxlintrc.json` (it is bundled by esbuild and tested by `node --test`, with no alias in either)
- The VS Code extension (`ide/vscode`, TypeScript, never in the npm package) is built and installed by `pnpm install:vscode-extension` (`scripts/editor/install-vscode-extension.ts`, which runs `code --install-extension`); run it when the user asks to install or update the extension, then tell them to reload the VS Code window
- Every rule below is an error
  The rules live in `eslint-config-avi12` and `oxlint-config-avi12` (from `avi12/lint-config`), with this repository's overrides in `eslint.config.js` and `.oxlintrc.json`; the compiler flags in `tsconfig.json`

## What the tools enforce
- **Compiler:** `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noPropertyAccessFromIndexSignature`, `noImplicitOverride`, `noImplicitReturns`, `noUncheckedSideEffectImports`, `verbatimModuleSyntax`, unreachable code and unused locals
- **Google style:** named exports only, no `any` / `@ts-ignore` / `@ts-nocheck` (`@ts-expect-error` needs a description), `consistent-type-imports`, no non-null assertion, no object-literal assertion (and oxlint bans every other assertion except `as const`), `===`, braces on every block with the body on its own line, `prefer-const`, no `var`, `for...of` instead of index loops and `for...in`, `only-throw-error`, no namespaces / `require` / wrapper types, `T[]` for simple types, `interface` over a type alias, no parameter properties except `readonly` ones, no `public` keyword, `unused-imports/no-unused-imports` (the fixer that removes a dead import), `typescript/no-floating-promises` (off in `node:test` files, whose `test()` returns a promise by design; elsewhere a deliberate fire-and-forget says `void`)
- **Naming:** UpperCamelCase types, classes, enums and components; lowerCamelCase variables, functions and properties; `CONSTANT_CASE` module constants and enum members; no `I` prefix; no leading `_` except on an unused parameter; a boolean variable, parameter or class property starts `is` / `has` / `can` / `should`; no names under 3 characters beyond the allow-list
- **House rules:** a compound or comparing `if` condition (and a compound ternary condition) is extracted into a named boolean (an `else if` stays inline); no `.forEach` / `.reduce`; one destructured parameter from two (declarations and methods); no written return types (a type predicate is the exception); no magic numbers beyond `0`, `1`, `-1`, `2`; early returns (`no-else-return`, `no-lonely-if`, `max-depth` 3, `max-nested-callbacks` 3, no nested ternary); no `../` import (use `#src/*.js`, or `#scripts/*.ts` from one tooling script to another); no import cycle (type-only ones are ignored); no em dash
- **Public API:** JSDoc with a description on every exported function, class, interface, type alias and enum in `src/`, no types in the JSDoc
- **Tree shaking:** a statement at the top level of a module in `src/` (a call, an `if`, a loop, a `try`) fails; the entry points (`src/window/bootstrap.ts`, `src/window/thread.ts`) are exempt, and a test bundles a one-component app against a size budget
- **Kotlin (`ide/webstorm`):** ktlint (`ide/webstorm/.editorconfig`) and detekt (`ide/webstorm/config/detekt/detekt.yml`, `maxIssues: 0`, no rule silenced) through the `ktLint` Gradle task, which `pnpm check:webstorm-plugin` and so `pnpm lint` run; `pnpm lint:fix` runs `ktLintFix`; one concern per file, named after its top-level declaration (detekt `MatchingDeclarationName`), at most 11 functions per object or class (`TooManyFunctions`), nesting, condition and method-size limits at detekt's defaults
- **Generated components** (`src/components/generated`) are excluded from the style rules because the generator is where they are fixed; tsc, `svelte-check`, `props-strictness.ts`, the editor check and `gen:components:check` cover them

## What no tool enforces (review catches it)
- The Google guides for Markdown, JSON, XML, PowerShell and YAML (see "Other languages"): no linter runs over them yet, so review is the gate
  Check every new or edited file of those kinds against its row before committing; if a violation can be found by a script, add the check to `pnpm lint` instead of relying on review
- A type assertion with a one-line reason: oxlint's rule is stricter and allows none, so a genuinely needed assertion goes in the `typescript/consistent-type-assertions` file list of `.oxlintrc.json`
- An `if` whose condition is a call with an unclear intent: only compound conditions and comparisons are flagged
- A function with 2+ parameters that is an exempt shape (a key/value accessor, a callback whose signature WinUI or Svelte dictates): the rule flags it, and the file joins the matching list in `eslint.config.js`
- A boolean named `allowDrop`-style because it mirrors a WinUI property: the prefix rule covers variables, parameters and class properties, not interface or object-literal keys
- JSDoc on an export of an internal module that no entry point re-exports: the rule asks for it anyway; its description is not judged
- DRY, single source of truth, separation of concerns, "inline a variable used once", and "no comment that restates the code"
- A top-level initializer that does work (`const registry = register()`): only statements are flagged; the bundle-size test is the backstop
- Hungarian-style and abbreviated names that happen to be 3+ characters
- Kotlin (`ide/webstorm`): duplicated logic merged into one home (a gate check, a tag or attribute match, a class-name or rule helper, a settings read, a test fixture or builder); every closed set of values an enum or sealed type; pure logic kept free of platform imports and unit-tested, platform glue thin; no dead declaration; no lazy-needing work at load

# Tidiness
- After each feature, remove what it orphaned (exports, helpers, scripts, files, docs), then run `pnpm fallow`; it must finish clean
- No dead code, no commented-out code, no TODO without an owner, no stale docs: a README, CONTRIBUTING or DESIGN passage that describes something removed is fixed in the same change

# Commits and releases
- Digestible commits: one self-contained logical change each, with a message saying what and why; large work lands as a sequence
- `main` is the default branch
- Releases go out only when asked: bump the version, `pnpm build`, `pnpm pack --dry-run` (check the file list and size), commit `chore(release): X.Y.Z` and push `main`, then create the GitHub release; never a local `pnpm publish`
- Creating the GitHub release is what publishes to npm: `.github/workflows/publish.yml` runs on `release: published`, checks the tag equals `package.json`'s version and runs `pnpm publish --provenance` (npm trusted publishing; a version already on npm is skipped)
  `gh release create vX.Y.Z --target main --title X.Y.Z --notes-file <notes>`: the notes list the highlights of the change log, grouped by what a user of the package sees, and link the commit range (`vPREVIOUS...vX.Y.Z`) for the rest
  When Claude writes the release, the notes end with the line `🤖 Generated with [Claude Code](https://claude.com/claude-code)`, so readers can see it was made with Claude
  Every published version has its release, since the release is what publishes it
- Release gate: no release until every WinUI 3 component is fully operational from Svelte (the coverage guard in `scripts/codegen/coverage.ts` shows 0 gaps and each remaining exclusion is justified) and the user explicitly asks
