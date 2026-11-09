# winui-svelte for WebStorm

An optional companion for projects that use
[winui-svelte](https://github.com/avi12/winui-svelte), the WinUI 3 controls as
Svelte components for native Windows apps; it does nothing in a project that
does not depend on it

## What it does in a `.svelte` file

- **Icons**: a Fluent icon name in a `glyph` prop, or in any prop typed
  `GlyphInput`, shows the icon inside the string, in the documentation popup and
  in completion
- **Colors**: a color in `style:color`, in `style="..."` or in a color prop shows
  a swatch beside it
- **Fonts**: the font-family completion lists the installed fonts, each in its
  own face
- **Resources**: a `var(--card-background-fill-color-default)` completes from the
  resources WinUI defines, each color with a swatch, and the documentation popup
  shows its light and its dark value
- **Pictures**: the picture beside the path of every prop, option or object
  key the library types as a picture (a tray menu item or tray icon icon, an
  `Image` source, a thumbnail button), also for `.ico` (best frame, all
  frame sizes in the popup), `.png`, `.svg`, `.jpg`, `.gif` and `.bmp`;
  the popup shows the larger picture with its name, pixel size and file size,
  a light and dark taskbar pair side by side on their backgrounds, and a
  missing file gets a warning; a path, a `file:` URL, an `http(s)` URL,
  `new URL("./x.png", import.meta.url)`, or a name bound by an image import
  or a `const` all preview, in markup and in TypeScript; a picture that cannot
  be drawn gets a placeholder icon and a popup that says why; remote pictures
  are fetched in the background (timeout, size cap, no credentials, a cache on
  disk, trusted projects only) unless Settings, winui-svelte, "Preview remote
  pictures" is off
- **CSS and layout previews**: see the next section
- **Convert to CSS**: Alt+Enter on a prop that has a CSS counterpart moves it into
  the `<style>` block or a `style:` directive

The component, prop, enum value and attachment documentation comes from the
package's `web-types.json`, which WebStorm reads by itself

## CSS and layout previews

Each preview is in the `<style>` block, in `style="..."`, in `style:`
directives and, where it fits, in the props; native units only, so a length is
in pixels; the bars and curves sit in the line, the rest is in the
documentation popup (Ctrl+Q, or the mouse hover)

- **Gradient**: a bar of the stops beside `linear-gradient()`,
  `radial-gradient()` and a `LinearGradientBrush` of `GradientStop`s
- **Contrast**: the WCAG ratio and its verdict after a text color that sits
  with a background color in the same rule or tag, for example `4.5:1 AA`
- **Easing**: a curve beside `cubic-bezier()`, `steps()`, `linear()`, a
  named easing and a `KeySpline`; the popup adds the timeline of a
  `transition` or `animation`
- **Box model and grid tracks**: the popup of `padding`, `margin`,
  `border-width` and `border-radius` draws the four values around the box;
  grid tracks of `auto`, pixels and `fr` are drawn in proportion
- **Declaration**: the popup of a CSS property says which WinUI property it
  sets and where the rule applies, or why it has no WinUI meaning
- **Media query**: an `@media` condition shows `now: yes` or `now: no`
  against the assumed environment, and the popup lists each part
- **Shadow and material**: the popup of `-winui-elevation` and `box-shadow`
  places the depth on the ladder WinUI uses, and `backdrop` shows the material

The logic of every preview is tested against `ide/css-previews.spec.json`, the
same file the VS Code extension is tested against

## Settings

Settings, Editor, winui-svelte: where converted CSS goes, whether the
`var(--...)` completion and documentation are on (they are by default), one
checkbox for each CSS and layout preview (all on by default), and the
environment the media answer assumes (theme, reduced motion, window width and
height; the system is never asked)

## Data

The resource names, their colors and the other tables the plugin shows are
`src/main/resources/winui-ide-data.json`, `fluent-glyphs.json` and
`winui-css-mappings.json`; `pnpm gen:ide-data` and `pnpm gen:components` write
them, never edit them by hand

The build, the tests and the install are in the repository's `CONTRIBUTING.md`
(the WebStorm plugin section)
