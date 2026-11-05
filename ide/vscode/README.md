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
- **Convert to CSS**: a prop that has a CSS counterpart gets a quick fix
  (Ctrl+.) that moves it into the `<style>` block, or writes it as a `style:`
  directive; one command converts the whole file, and another converts the
  selected files and folders in the Explorer

## Commands and settings

| Command | Default key |
| --- | --- |
| Convert winui-svelte Attributes to CSS in This File | Ctrl+Alt+Shift+K |
| Convert winui-svelte Attributes to CSS (Explorer) | Ctrl+Alt+Shift+X |

`winuiSvelte.destination` picks where a converted prop goes: `styleBlock` (a
rule in `<style>`) or `styleDirective` (a `style:` directive)

The same features exist for WebStorm, in the plugin of this repository
