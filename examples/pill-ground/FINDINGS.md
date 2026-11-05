# Pill ground: findings

What the Gemini Live pill needs from winui-svelte, checked against the code, the
docs and the tests (HANDOFF-gemini-live.md, "Looks covered")
Nothing was launched in a window: a "yes" rests on the docs, the code and the
existing tests, not on a run of this example

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
| A blurred gradient band as a glow | yes, statically | a gradient plus `filter: blur(24px)` in `Glow.svelte`; the window is not transparent, so the bleed past the pill is clipped | CSS offers |
| WinUI-parity glow alternatives | n/a | `ThemeShadow` and `-winui-elevation` have no colour, blur or offset, so they are a shadow and not a glow; `AcrylicBrush` and the window `backdrop` are materials; `filter: drop-shadow(0 0 24px colour)` is the nearest coloured glow | `box-shadow` partly (depth only) |
| `linear-gradient` | yes | `to right` and 0, 90, 180, 270 degrees are exact, other angles warn; stops must be plain colours | CSS offers |
| `transition` | yes | implicit transitions on `Translation`, `Scale`, `Rotation`, `opacity` and `border-color`; `height: auto` and `box-shadow` do not animate | CSS offers; `element.animate` offers |
| `@keyframes` | yes | storyboards for opacity, size, colours and transforms; no `filter` | `element.animate` offers (no keyframe `offset`, no composite modes) |
| Svelte `fly` and `fade` | yes | on a raw element (`<border in:fly>`), never on a component (`test/transitions.test.ts`); a 0.96 scale rise needs a custom transition; the window's own enter and exit stay with the host | `element.animate` offers |
| `startTimer` for a breathing glow | caveat | it is `setInterval` on the dispatcher, about 16 ms a frame, with no cadence measurement in the repository | `requestAnimationFrame` and `element.animate` offer; the example uses `element.animate` and no timer |
| Crossfading text | yes | `{#key}` with `in:fade` and `out:fade` on a `<border>` in one grid cell | `element.animate` offers |
| Selectable text, scroll capped at 200 px, a hidden bar | yes | `ScrollViewer` with `max-height: 200px` and `verticalScrollBarVisibility="Hidden"`; CSS `overflow: hidden` means Disabled (no scrolling), so do not use it | `Element.scrollTo`, `scrollTop` and `scrollbar-width` lack |
| Per-element opacity and translate animation | yes | CSS animation, Svelte transitions and `element.animate` all land on `Opacity`, `Translation`, `Scale` and `Rotation`; the engine writes about every 16 ms on the UI thread | `element.animate` offers |
| Card height glide | missing | `auto` height has nothing for CSS to animate; use `ResizeObserver` plus `element.animate({height})`, not built | `ResizeObserver` and `element.animate` offer |
| Wrapping link chips | missing | `flex-wrap` is a build error and there is no wrap panel; the example uses one row | none |
| Transparent window | now offered | `backdrop="transparent"` (API.md Window); not run on screen | none; no web API makes a window transparent |
| Size to content with the bottom-right corner pinned | now offered | `sizeToContent` with `anchor` (API.md Window); not run on screen | `ResizeObserver` offers, not used: it reports the laid-out size |
| Material Symbols font | missing | fonts are named by family and there is no way to load a font file from the app folder; the example uses Segoe Fluent Icons | none |
