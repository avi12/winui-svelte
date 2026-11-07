# winui-svelte for VS Code

An optional companion for projects that use
[winui-svelte](https://github.com/avi12/winui-svelte), the WinUI 3 controls as
Svelte components for native Windows apps; it does nothing in a project that
does not depend on it

## Install

- From the Extensions view: search for `winui-svelte` and choose Install
- From a file: download `winui-svelte-vscode-<version>.vsix` from the
  [editors releases](https://github.com/avi12/winui-svelte/releases?q=editors-v),
  then run `code --install-extension winui-svelte-vscode-<version>.vsix`, or
  use the Extensions view, the `...` menu, Install from VSIX
- Reload the window; the extension starts when you open a `.svelte` file

## What it does in a `.svelte` file

- **Icons**: a Fluent icon name in a `glyph` prop, or in any prop typed
  `GlyphInput`, shows the icon beside the name, in a hover preview and in the
  completion list
- **Colors**: a color in `style:color`, in `style="..."` or in a color prop
  shows a swatch beside it, in the hover and in the completion list
- **Fonts**: the font-family completion lists the fonts installed on the
  machine, and the preview shows the font set in its own face
- **Resources**: a `var(--card-background-fill-color-default)` completes from
  the resources WinUI defines, and a color shows its light and its dark value as
  two swatches in the hover and beside each name in the list
- **Pictures**: the picture beside the path of every prop, option or object
  key the library types as a picture (a tray menu item or tray icon icon, an
  `Image` source, a thumbnail button), also for `.ico` (best frame, all
  frame sizes in the hover), `.png`, `.svg`, `.jpg`, `.gif`, `.bmp` and
  `.webp`; the hover shows the larger picture with its name, pixel size and
  file size, a light and dark taskbar pair side by side on their backgrounds,
  and a missing file gets a warning; remote pictures are fetched only with
  `winuiSvelte.previews.remotePictures` on
- **CSS and layout previews**: see the next section
- **Convert to CSS**: a prop that has a CSS counterpart gets a quick fix
  (Ctrl+.) that moves it into the `<style>` block, or writes it as a `style:`
  directive; one command converts the whole file, and another converts the
  selected files and folders in the Explorer

## CSS and layout previews

Each preview is in the `<style>` block, in `style="..."`, in `style:`
directives and, where it fits, in the props; native units only, so a length is
in pixels

- **Gradient**: a bar of the stops beside `linear-gradient()`,
  `radial-gradient()` and a `LinearGradientBrush` of `GradientStop`s; a stop
  without a percentage is spaced evenly, as CSS does
- **Contrast**: the WCAG ratio and its verdict after a text color that sits
  with a background color in the same rule or tag, for example `4.5:1 AA`
  (cut to a tenth, never rounded up; AAA from 7, AA from 4.5, AA for large
  text from 3)
- **Easing**: a curve beside `cubic-bezier()`, `steps()`, `linear()`, a
  named easing and a `KeySpline`; the hover adds the duration and delay
  timeline of a `transition` or `animation`
- **Box model and grid tracks**: the hover of `padding`, `margin`,
  `border-width` and `border-radius` draws the four values around the box;
  `grid-template-columns`, `grid-template-rows` and the `columns` and `rows`
  props draw `auto`, pixel and `fr` tracks in proportion
- **Declaration**: the hover of a CSS property says which WinUI property it
  sets and where the rule applies, or why it has no WinUI meaning
- **Media query**: an `@media` condition shows `now: yes` or `now: no`
  against the assumed environment below, and the hover lists each part
- **Shadow and material**: the hover of `-winui-elevation` and
  `box-shadow` places the depth on the ladder WinUI uses, and `backdrop`
  shows the material in the light and the dark theme

`winuiSvelte.previews.gradient`, `.contrast`, `.easing`, `.box`,
`.declaration`, `.media` and `.shadow` turn each one off (all on by
default)

The media answer reads `winuiSvelte.media.theme`, `.reducedMotion`, `.width`
and `.height` (dark, motion not reduced, 1024 by 768) and never asks the
system

The logic of every preview is tested against `ide/css-previews.spec.json`, the
same file the WebStorm plugin is tested against; the easings, shadow depths,
materials and unsupported properties come from `winui-ide-data.json`

## Commands and settings

| Command | Default key |
| --- | --- |
| Convert winui-svelte Attributes to CSS in This File | Ctrl+Alt+Shift+K |
| Convert winui-svelte Attributes to CSS (Explorer) | Ctrl+Alt+Shift+X |

`winuiSvelte.destination` picks where a converted prop goes: `styleBlock` (a
rule in `<style>`) or `styleDirective` (a `style:` directive)

`winuiSvelte.resourceHints` (on by default) turns the `var(--...)` completion
and hover off; the names and colors come from `winui-ide-data.json`, which
`pnpm gen:ide-data` writes for both editors

The same features exist for WebStorm, in the plugin of this repository
