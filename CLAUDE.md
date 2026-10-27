# winui-svelte

WinUI 3 controls as Svelte 5 components: native Windows apps written in Svelte,
for Tauri, Electron or plain Node. Windows only. This file is for contributors
and coding agents; it is never published to npm (`files` in `package.json` is an
allowlist, and `pnpm pack --dry-run` must not list it).

# Stack
- pnpm only: `packageManager` is pinned, `pnpm-lock.yaml` is committed, every script, CI step and doc uses `pnpm`. Never `npm` or `yarn`, and never a second lockfile
- TypeScript, ESM only, `strict` plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride` and `verbatimModuleSyntax`
- Svelte 5 (runes) on the custom renderer the package ships; the generated components come from WinUI's metadata through `scripts/codegen` (never hand-edit `src/components/generated`)
- Licence: MIT

# Which rules win
1. **Google TypeScript Style Guide** (https://google.github.io/styleguide/tsguide.html): followed strictly wherever it speaks.
2. **Avi's house rules** (below, adapted from `avi/youtube-time-manager`): they add to it, and win only where Google is silent.
3. A conflict is settled in the table here, not ad hoc. Add the row when you meet a new one.

| Topic | Google | House rule | Decision |
|---|---|---|---|
| Default exports | Forbidden | n/a | Named exports only. A `.svelte` file's default export is Svelte's own and the one exception |
| Return types | Inference allowed | Never write them | Infer everywhere. `publint` and `are-the-types-wrong` gate the emitted `.d.ts` |
| Comments | JSDoc on every exported symbol | Zero comments by default | JSDoc (TSDoc) on the public API only, saying what a reader cannot see from the name and type. No comment that restates code; a comment on internals only for a WinUI quirk, a required order or a dead end |
| Braces | Always, body on its own line | `if` always braced | Both agree: braces on every `if`/`else`/`for`/`while`, K&R, body on the next line |
| Constants | `CONSTANT_CASE` | `SCREAMING_SNAKE_CASE` | Same thing |
| Enums | `enum` allowed, no `const enum` | Strings are enums | A closed set of values is an `as const` object plus its union type (`export const X = { A: "a" } as const; export type X = typeof X[keyof typeof X]`): the package runs under Node's type stripping with `erasableSyntaxOnly`, which forbids `enum`. Never `const enum` |
| Imports | Relative within the project, no deep `../../../` | `@` alias over `../` | Relative imports (`./x`, `../x`): the build compiles each file in place, and a path alias would need a second map for `dist`. The one subpath import is `#winui/*`, the bindings an app generates for itself. Keep `../` chains short by keeping folders shallow |
| Parameters | n/a | 2+ parameters take one destructured object | Adopt it, public API included. Exempt: key/value accessors and callbacks whose signature WinUI or Svelte dictates |

# Google style, in short (the guide has the rest)
- Named exports only; no `export default`, no namespaces, no `require`, no side-effectful modules
- `any` is banned (`unknown`, then narrow); no `@ts-ignore` / `@ts-nocheck`; `@ts-expect-error` only in a test, with the reason
- No type assertion (`as`, `!`) without a one-line reason; prefer a type guard or a schema. No `<T>x` casts, no `Object`, `String` or `Number` wrapper types
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
- DRY with separation of concerns: one concern per module, named in its top-level export. Before writing a helper, constant or type, find the one that exists and extend it (single source of truth)
- Functional style, `async`/`await`, parallel work with `Promise.all`
- A condition that is compound, a comparison or a call is extracted into a named boolean first (`const isReady = ...; if (isReady) {`). A lone `if (!value)` or `if (isReady)` stays inline
- Inline a variable that is assigned once and used once, unless it names a magic value or an opaque expression
- **Tree shaking is a requirement:** `"sideEffects": false`, ESM only, no top-level work at import time (no registrations, no `new` of heavy objects, no patching globals), no barrel that pulls in more than it names, one subpath export per area (`./components`, `./state`, `./css`, `./window`...). A consumer who imports `Button` must not bundle `NavigationView`. A test bundles a one-component app and fails if the output grows past its budget
- Validate loose data (messages, config files, metadata) with a schema (`zod`), not hand-rolled `typeof` chains; a schema used only for its inferred type stays un-exported
- Svelte: `$derived.by` with if/else, never a ternary inside `$derived`; a handler used once is inlined; no ternary in markup when the lint rule forbids it
- No em dashes; use hyphens

# Naming
- Full words, no abbreviations (`direction`, not `dir`). Allowed idioms (the `id-length` allow-list): `i`/`j` loop counters, `x`/`y`, `id`, `to`, `on`, `ok`, `T` for a type parameter and `_` for an unused parameter; `hwnd`, `rva` and `dip` are long enough
- Booleans carry `is` / `has` / `can` / `should` and read positively (`isEnabled`, never `isDisabled`)
- An index variable is `i`-prefixed (`iItem`), or a bare `i` in a loop
- Generated and hand-written components mirror WinUI's own names (`StackPanel`, `childrenTransitions`); props are the WinUI property in `lowerCamelCase`, events `on` + the WinUI event name

# Hardcoded values
- A closed set of values is an enum; a lone magic string or number is a named `CONSTANT_CASE` constant (unless self-evident: `0`, `1`, `/ 2`)

# Type safety
- 100% typed: no implicit or explicit `any`, anywhere, generated code included. The lint gate fails on `any` hints from the editor's language server too
- A prop's type is WinUI's own (from the bindings), narrowed as far as the metadata allows; `unknown` or a loose input type needs a one-line reason in the codegen table
- An unknown attribute or a wrong value type on a component must fail `svelte-check`; keep a test that proves it

# Linting
After each change run `pnpm lint` and `pnpm test`. Fix what they flag; never silence a rule to pass. After anything that removes or rewires code, run the dead-code audit (`pnpm fallow`) and clean up the orphans by hand.

- `pnpm lint` runs every step even when an earlier one fails, so one run lists everything: `build`, oxlint (type-aware), ESLint, stylelint, `check` (tsc and `svelte-check`), `check:editor` (the VS Code Svelte language server's diagnostics), fallow, `gen:components:check` and `check:package` (publint and are-the-types-wrong on the packed tarball). It exits 1 if any failed
- `pnpm lint:summary [eslint|oxlint|tsc|svelte-check ...] [--folder src/css]` counts the violations per rule and per top-level folder (and lists the files of one folder). Use it to pick an area and watch its count fall
- `pnpm build` fails only when tsc emitted nothing; type errors are `pnpm check`'s to report
- Every rule below is an error. The rules live in `eslint-config/google-style.js` (ESLint, applied to `.ts` and `.svelte`) and `.oxlintrc.json`; the compiler flags in `tsconfig.json`

## What the tools enforce
- **Compiler:** `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noPropertyAccessFromIndexSignature`, `noImplicitOverride`, `noImplicitReturns`, `noUncheckedSideEffectImports`, `verbatimModuleSyntax`, unreachable code and unused locals
- **Google style:** named exports only, no `any` / `@ts-ignore` / `@ts-nocheck` (`@ts-expect-error` needs a description), `consistent-type-imports`, no non-null assertion, no object-literal assertion (and oxlint bans every other assertion except `as const`), `===`, braces on every block with the body on its own line, `prefer-const`, no `var`, `for...of` instead of index loops and `for...in`, `only-throw-error`, no namespaces / `require` / wrapper types, `T[]` for simple types, `interface` over a type alias, no parameter properties except `readonly` ones, no `public` keyword
- **Naming:** UpperCamelCase types, classes, enums and components; lowerCamelCase variables, functions and properties; `CONSTANT_CASE` module constants and enum members; no `I` prefix; no leading `_` except on an unused parameter; a boolean variable, parameter or class property starts `is` / `has` / `can` / `should`; no names under 3 characters beyond the allow-list
- **House rules:** a compound or comparing `if` condition (and a compound ternary condition) is extracted into a named boolean (an `else if` stays inline); no `.forEach` / `.reduce`; one destructured parameter from two (declarations and methods); no written return types (a type predicate is the exception); no magic numbers beyond `0`, `1`, `-1`, `2`; early returns (`no-else-return`, `no-lonely-if`, `max-depth` 3, `max-nested-callbacks` 3, no nested ternary); no `../` import (use `#src/*.js`); no import cycle (type-only ones are ignored); no em dash
- **Public API:** JSDoc with a description on every exported function, class, interface, type alias and enum in `src/`, no types in the JSDoc
- **Tree shaking:** a statement at the top level of a module in `src/` (a call, an `if`, a loop, a `try`) fails; the entry points (`src/cli/main.ts`, `src/window/bootstrap.ts`, `src/window/thread.ts`) are exempt, and a test bundles a one-component app against a size budget
- **Generated components** (`src/components/generated`) are excluded from the style rules because the generator is where they are fixed; tsc, `svelte-check`, `props-strictness.ts`, the editor check and `gen:components:check` cover them

## What no tool enforces (review catches it)
- A type assertion with a one-line reason: oxlint's rule is stricter and allows none, so a genuinely needed assertion takes a `// oxlint-disable-next-line` with the reason
- An `if` whose condition is a call with an unclear intent: only compound conditions and comparisons are flagged
- A function with 2+ parameters that is an exempt shape (a key/value accessor, a callback whose signature WinUI or Svelte dictates): the rule flags it, and the disable comment carries the reason
- A boolean named `allowDrop`-style because it mirrors a WinUI property: the prefix rule covers variables, parameters and class properties, not interface or object-literal keys
- JSDoc on an export of an internal module that no entry point re-exports: the rule asks for it anyway; its description is not judged
- DRY, single source of truth, separation of concerns, "inline a variable used once", and "no comment that restates the code"
- A top-level initializer that does work (`const registry = register()`): only statements are flagged; the bundle-size test is the backstop
- Hungarian-style and abbreviated names that happen to be 3+ characters

# Commits and releases
- Digestible commits: one self-contained logical change each, with a message saying what and why; large work lands as a sequence
- `main` is the default branch
- Releases go out only when asked: bump the version, `pnpm build`, `pnpm pack --dry-run` (check the file list and size), then `pnpm publish`
