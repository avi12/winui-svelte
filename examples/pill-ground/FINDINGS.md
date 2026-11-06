# Pill ground: findings

What the Gemini Live pill needs from winui-svelte, checked against the code, the
docs and the tests (HANDOFF-gemini-live.md, "Looks covered")
The example now runs as one transparent window (`test/pill-ground.test.ts`, off
screen and never activated, read back with PrintWindow, which has no alpha: a
clear pixel and an opaque black one read the same there, so what is transparent
is proved by `test/transparent-window.test.ts` on the screen itself); a row
says what that run showed, and the rows that predate it rest on the docs and
the code

The web API column says whether the package offers the web form: offers,
partly or lacks

| Item | Verdict | Evidence and gap | Web API form |
| --- | --- | --- | --- |
| `isBorderless`, `isToolWindow`, `isShownInSwitchers`, `isAlwaysOnTop` | yes | API.md Window, `test/window-frame.test.ts`; they re-apply at run time; `isAlwaysOnTop` is for the windowed presentation only | none exists in the web |
| `isActivatable` at run time | yes | the same effect toggles `WS_EX_NOACTIVATE`, and a test drops it; taking focus afterwards needs `handle.activate()` | none |
| `dragRegions` | caveat | rectangles in device-independent pixels from the top-left; `y` must follow the measured height, buttons need `passthroughRegions`, the borderless case was not run | none |
| `MenuFlyout` opening upward | yes, caveat | `placement="Top"` (enum names are PascalCase strings), opened from a button's `flyout` snippet; a window only as tall as its content may clip the popup, so the example sets `shouldConstrainToRootBounds={false}` | lacks |
| `PasswordBox` Enter and Esc | yes | `bind:password`; there is no DOM `keydown`, so read `projectAs(args, KeyRoutedEventArgs)` and compare `VirtualKey.Enter` and `Escape`, as `items-host` does; `KeyboardAccelerator` is the other route | `<input type=password>` and `KeyboardEvent` lack |
| `Hyperlink` | yes | an inline in a `TextBlock` with `navigateUri` | `<a>` lacks; `window.open` offers, and the link chips use it |
| `isTextSelectionEnabled` | yes | `TextBlock` prop, or `user-select` in CSS; selecting and Ctrl+C need the window activatable first | `getSelection` lacks; `navigator.clipboard` offers |
| `filter: blur()` | yes, a real Gaussian blur | Win2D on the Composition visual (`css/filter`, `test/effects.test.ts`); it draws up to 3 radii outside the element and paints over later siblings; `@keyframes` cannot animate `filter`, only Svelte's `blur` transition animates the radius | `filter` offers in CSS; `element.animate` on `filter` lacks |
| A blurred gradient band as a glow | yes | a gradient plus `filter: blur(24px)` in `Glow.svelte`; on the transparent window the blur bleeds past the pill into the room under it (`PillSize.glowRoom`, part of the content), which the test sees; faint at the resting opacity | CSS offers |
| WinUI-parity glow alternatives | n/a | `ThemeShadow` and `-winui-elevation` have no colour, blur or offset, so they are a shadow and not a glow; `AcrylicBrush` and the window `backdrop` are materials; `filter: drop-shadow(0 0 24px colour)` is the nearest coloured glow | `box-shadow` partly (depth only) |
| `linear-gradient` | yes | `to right` and 0, 90, 180, 270 degrees are exact, other angles warn; stops must be plain colours | CSS offers |
| `transition` | yes | implicit transitions on `Translation`, `Scale`, `Rotation`, `opacity` and `border-color`; `height: auto` and `box-shadow` do not animate | CSS offers; `element.animate` offers |
| `@keyframes` | yes | storyboards for opacity, size, colours and transforms; no `filter` | `element.animate` offers (no keyframe `offset`, no composite modes) |
| Svelte `fly` and `fade` | yes | on a raw element (`<border in:fly>`), never on a component (`test/transitions.test.ts`); a 0.96 scale rise needs a custom transition; the window's own enter and exit stay with the host | `element.animate` offers |
| `startTimer` for a breathing glow | caveat | it is `setInterval` on the dispatcher, about 16 ms a frame, with no cadence measurement in the repository | `requestAnimationFrame` and `element.animate` offer; the example uses `element.animate` and no timer |
| Crossfading text | yes | `{#key}` with `in:fade` and `out:fade` on a `<border>` in one grid cell | `element.animate` offers |
| Selectable text, scroll capped at 200 px, a hidden bar | yes | `ScrollViewer` with `max-height: 200px` and `verticalScrollBarVisibility="Hidden"`; CSS `overflow: hidden` means Disabled (no scrolling), so do not use it | `Element.scrollTo`, `scrollTop` and `scrollbar-width` lack |
| Per-element opacity and translate animation | yes | CSS animation, Svelte transitions and `element.animate` all land on `Opacity`, `Translation`, `Scale` and `Rotation`; the engine writes about every 16 ms on the UI thread | `element.animate` offers |
| Card height glide | now offered | `glideHeight` (API.md, Gliding a height): an attachment that listens to `SizeChanged` and runs `element.animate({ height })`; it cannot glide the first layout or an element with a fixed `height`; proven in a window (`test/card-glide.test.ts`) | `ResizeObserver` and `element.animate` offer |
| Wrapping link chips | recipe | CSS `flex-wrap` stays a build error; a `RichTextBlock` whose `Paragraph` holds `InlineUIContainer` chips wraps chips of different widths (API.md, Wrapping chips; `examples/chip-tray`, `test/chip-tray.test.ts`); `VariableSizedWrapGrid` wraps with one cell size | none |
| Transparent window | yes, since the frame fix | `backdrop="transparent"`; it drew an opaque rectangle (black, or the theme color) over the desktop until the package made the whole window the window manager's frame (`DwmExtendFrameIntoClientArea`, `transparent-backdrop.ts`), which PrintWindow could not show because it has no alpha: clear pixels read black there either way; `test/transparent-window.test.ts` now reads the screen over a bright window and sees the desktop around the card, with no outline or shadow; it failed at startup until the package gave the thread a Windows.System dispatcher queue (`system-dispatcher-queue.ts`) | none; no web API makes a window transparent |
| Size to content with the bottom-right corner pinned | yes | `sizeToContent="height" anchor="bottomRight"` and `handle.dock({ anchor, inset: 6 })`: the window grows upward with the corner fixed and sits 6 device pixels inside the work area of the display it is on; `isBorderless` kept a 3 pixel dialog frame (now removed) and the 8 pixel resize frame goes with `isResizable={false}`; which display `dock` picks is not observable off screen | `ResizeObserver` offers, not used: it reports the laid-out size |
| Material Symbols font | now offered | `@font-face { font-family: "Material Symbols Rounded"; src: url("./MaterialSymbolsRounded.ttf") }` in the `<style>`, or `document.fonts.add(new FontFace(...))` (README Fonts); the file is handed to WinUI as `ms-appx:///` and its absolute path, which works in plain Node (test/fonts.test.ts); the example still uses Segoe Fluent Icons | `FontFace` and `document.fonts` (`winui-svelte/web-apis/fonts`) |
