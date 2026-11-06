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
- **Convert to CSS**: Alt+Enter on a prop that has a CSS counterpart moves it into
  the `<style>` block or a `style:` directive

The component, prop, enum value and attachment documentation comes from the
package's `web-types.json`, which WebStorm reads by itself

## Settings

Settings, Editor, winui-svelte: where converted CSS goes, and whether the
`var(--...)` completion and documentation are on (they are by default)

## Data

The resource names, their colors and the other tables the plugin shows are
`src/main/resources/winui-ide-data.json`, `fluent-glyphs.json` and
`winui-css-mappings.json`; `pnpm gen:ide-data` and `pnpm gen:components` write
them, never edit them by hand

The build, the tests and the install are in the repository's `CONTRIBUTING.md`
(the WebStorm plugin section)
