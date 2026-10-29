# Security policy

## Supported versions

The package is pre-1.0: only the latest published `0.x` release receives
fixes.

## Reporting a vulnerability

Do not open a public issue. Report it privately through GitHub's security
advisories: <https://github.com/avi12/winui-svelte/security/advisories/new>.
Expect an acknowledgement within a week.

## Scope

The package draws WinUI controls and loads no network resource of its own.
It does not use `eval`, and importing it does no work. A `WebView2` control
browses whatever URL an app gives it; the app owns that content's trust.

## Dependencies

The package keeps its runtime dependencies few: `@microsoft/dynwinrt` (the
native WinRT binding) and `zod`. The Vite plugin and the Svelte runtime edits
are the package's own code, so no Vite plugin package is installed with it.
