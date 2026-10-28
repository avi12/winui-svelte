# winui-svelte CSS: the interface

A component's `<style>` block becomes WinUI Styles in two steps: the Vite
plugin translates it at build time (pure, no WinUI), the runtime applies it
(`native.ts` is the only part that touches WinUI).

## What the renderer calls (`src/css/index.ts`)

```ts
// Once, after Application.create has installed WinUI's own resources.
// `winui` is the package's WinUI import site (`import * as winui`): it needs
// Application, ResourceDictionary, Style, XamlReader, PropertyValue, projectAs,
// ColumnDefinition, RowDefinition, GridUnitType.
installCss(winui: CssWinui): void;

// For every element the renderer creates; `elementType` is the tag ("border",
// "text-block"). Skip it for an element that never gets class, style or style:.
styledElement(control: object, elementType: string): StyledElement;

interface StyledElement {
  setClasses(classNames: string): void;                        // the whole class attribute, on every change
  setInlineStyle(cssText: string | null): void;                // the whole style attribute (Svelte merges style:name={value} into it)
  dispose(): void;                                             // when the element is removed
}
```

The renderer's `class` handler becomes `styled.setClasses(String(value))`, its
`style` handler `styled.setInlineStyle(...)` (a removed attribute is
`setClasses("")` / `setInlineStyle(null)`). A class no sheet knows applies nothing and
leaves the element alone (so a hand-applied Style survives); a throw means a
declaration the element's type cannot take, with the rule it came from.

Order does not matter between `installCss` and component modules: a sheet
registered before it is merged by it.

## What a component imports (`src/css/vite.ts`)

```ts
import { winuiCss } from "winui-svelte/css/vite";
import { cssHash } from "winui-svelte/css/sheet-module";

svelte({ compilerOptions: { cssHash, ...theRest } })   // the SAME options below
winuiCss({ root, compilerOptions: { cssHash, ...theRest }, runtimeModule: "winui-svelte/css" })
```

The plugin adds `import ".../Card.svelte-winui-css.js"` to each compiled
component that has a `<style>`. That module is

```ts
import { registerStyleSheet } from "<runtimeModule>";
registerStyleSheet(sheet);          // sheet = StyleSheetData as JSON
if (import.meta.hot) { import.meta.hot.accept(); }
```

`registerStyleSheet` with an id it has already seen replaces the sheet, keeps
its place in the cascade, and re-applies the classes of every live element.
`cssHash` is exported because Svelte's default scoping class depends on
`rootDir`; the component and its sheet must agree on it.

Without Vite (tests, the window kit), `compileSheetModule({ filename, source,
sheetId, resources, runtimeModule })` returns the module's code (or null for no
`<style>`); append it to the compiled component.

## The pure side (no WinUI, no Svelte)

```ts
translateStyleSheet({ file, css, map, resources }): { sheet: StyleSheetData, diagnostics }
formatDiagnostic(diagnostic): string   // "file:line:column: <property> has no WinUI meaning (<why>)"
```

`resources` is `loadWinuiCatalogue()` (node): the resource names in
`winui-resources.g.json`, exported from WinUI's generic.xaml by
`scripts/css/export-winui-resources.ts`.

## Opt-in groups

Some properties cost a parser, and the window's bundle has a budget. They are
not built in: a compiled sheet that uses one imports its module and registers
it (`registerPropertyGroups`), so an app that uses none carries none. A style
attribute works with them only once some sheet of the app has registered them,
and the `outline` shorthand does not work there: write `outline-width`,
`outline-style` and `outline-color`.

| Module | Properties | Section |
|---|---|---|
| `winui-svelte/css/gradients` | `background-image` | Gradients |
| `winui-svelte/css/transform` | `transform`, `transform-origin`, and the pivot of `scale` and `rotate` | Transforms |
| `winui-svelte/css/focus` | `outline`, `outline-offset` | Focus ring |
| `winui-svelte/css/surface` | `-winui-elevation`, `backdrop-filter` | Elevation and backdrop |
| `winui-svelte/css/resources` | custom properties on a class | Custom properties |

A group may also bring the shorthands it expands and the handlers of the
`write` outputs it produces: a write is something set on the element itself
(a grid's columns, the pivot, the focus visuals, the scoped resources), which a
Style cannot say. The runtime applies a write when its value changes and undoes
it when the style stops calling for it or the element goes.

## Gradients: `background-image`

`background-image` (and `background` with a gradient as its only value) sets
the Background to a `LinearGradientBrush` or a `RadialGradientBrush`. The
setter is `kind: "content"`: the brush is written as XAML inside the Style's
`<Setter.Value>`, like the transitions.

The gradient parser is an opt-in group (see above): a compiled sheet that has a
`background-image` imports it from `winui-svelte/css/gradients`.

```css
.hero { background-image: linear-gradient(to right, #00e5ff, transparent) }
.glow { background: radial-gradient(closest-side at 30% 70%, #ff0 20%, #f00) }
```

```xml
<Setter Property="Background"><Setter.Value>
  <LinearGradientBrush StartPoint="0,0.5" EndPoint="1,0.5">
    <GradientStop Color="#00E5FF" Offset="0"/><GradientStop Color="#0000E5FF" Offset="1"/>
  </LinearGradientBrush>
</Setter.Value></Setter>
```

What maps, and how:

| CSS | WinUI |
|---|---|
| `linear-gradient(to <side or corner>, ...)` | `StartPoint` / `EndPoint` on the unit square: exact at every size (`to bottom right` puts the 50% line through the other two corners, as CSS does) |
| `linear-gradient(<angle>, ...)` in `deg`, `grad`, `rad`, `turn` | the same line for a square element; exact for 0, 90, 180, 270 degrees; any other angle warns (the brush maps to the element's bounding box, so it skews on a non-square element) |
| no direction | `to bottom` |
| `radial-gradient([ellipse] [size] [at position], ...)` | `Center`, `GradientOrigin` (= center), `RadiusX`, `RadiusY` as fractions of the bounding box: exact at every size. `size` is `closest-side`, `farthest-side`, `closest-corner`, `farthest-corner` (default) or two percentages. `position` is keywords or percentages |
| `radial-gradient(circle ...)` | the radii of the circle in a square box; warns (an ellipse on any other box) |
| stops `color`, `color 20%`, `color 20% 40%` | `GradientStop` (a two-position stop is two stops); missing positions are spread evenly, a stop never sits before the one ahead of it (CSS's fix-up) |
| `transparent` (or any fully transparent color) as a stop | the neighbouring stop's color at no opacity, so the fade keeps its hue as it does in CSS |
| `background-image: none` | nothing is set |

A gradient replaces `background-color` where both are written (a WinUI
Background is one brush), with a warning. The other stop colors are what
`parseColor` takes: hex, `rgb()`, `hsl()`, a name. Interpolation between stops
is WinUI's.

An error (with the declaration's line) for what a WinUI gradient cannot say:

- `repeating-linear-gradient()`, `repeating-radial-gradient()`, `conic-gradient()`
- a stop position or radius in `px`/`rem` (the brush maps to the element's size, so a length has no fixed place), a color hint (a lone percentage between stops), a stop outside 0% to 100%
- `var()` as a stop color (a declaration holds one resolved resource, and a stop needs a Color)
- several comma-separated images, `url()`, `image-set()`: an image cannot be a Background in a Style, use an Image element

## Custom properties: app-wide and scoped

A custom property is a WinUI resource, named like the CSS property in Pascal
case (`--button-background-pointer-over` is `ButtonBackgroundPointerOver`).

- On `:root` (and only there) it is an **app-wide** resource, merged into
  `Application.Resources` with the others of the sheet.
- On any other selector it is **scoped**: the sheet keeps it with the rule, and
  every element that rule matches gets it in a ResourceDictionary of its own
  (merged into the element's `Resources`), so the element's template and its
  children read it and nothing else does. A sheet with such a rule imports
  `winui-svelte/css/resources`, which does the merging.

```css
:root { --accent: #0af }                                   /* the whole app */
.danger { --button-background-pointer-over: #c42b1c }      /* only buttons with class danger */
@media (prefers-color-scheme: dark) { .danger { --button-background-pointer-over: #ff99a4 } }
```

### Color schemes and high contrast

A custom property can be declared per scheme, on `:root` or on a class:

```css
:root { --card: #fff }                                              /* the default */
@media (prefers-color-scheme: dark) { :root { --card: #202020 } }
@media (forced-colors: active) { :root { --card: Canvas; --card-text: var(--system-color-window-text-color) } }
```

`forced-colors: active` is Windows' high contrast theme. Its values may be a
CSS system color (`Canvas`, `CanvasText`, `ButtonFace`, `ButtonText`, `GrayText`,
`Highlight`, `HighlightText`, `LinkText`) or `var(--system-color-...-color)`, any
of WinUI's `SystemColor*Color` resources: they become a `{ThemeResource}`
reference, which WinUI keeps current as the user changes the contrast theme.
A style rule in these blocks is an error, as in a dark one.

As soon as a sheet declares any scheme, the dictionaries are the explicit
`Light`, `Dark` and `HighContrast` that Microsoft's theme resources guidance
asks for (a `Default` beside a `HighContrast` lets the light and dark parts of
an app change each other's brushes), each holding the default values with its
own over them: a theme with no dictionary would fail the lookup. A sheet with
one value per property keeps a single `Default`. Every property needs a value
outside the blocks, or one for light and dark both.

A scoped override is read when the control builds its template, and WinUI
reads a theme resource again on a theme change; so it takes effect when the
class is on the element as it is created, and a later class change may not show
until the next theme change. A custom property on a pseudo-class rule
(`.danger:hover`) is an error: the control's template drives the state, so
override the resource it reads for it (`--button-background-pointer-over`).

A key WinUI defines keeps WinUI's spelling and kind, so a known Brush gets a
`SolidColorBrush` (never a bare `Color`, which a template reading a brush would
not take), a `Thickness` or `CornerRadius` key takes one length, and a value of
the wrong kind is a build error. Any other name is a `Color` with a `Brush` of
the same name plus `Brush`, or a number (`x:Double`).

## Transforms: `translate`, `scale`, `rotate`, `transform-origin`

`translate`, `scale` and `rotate` set the element's `Translation`, `Scale` and
`Rotation`. WinUI pivots the last two about `CenterPoint`, which is 0,0 (the
top-left corner) until set, where CSS pivots at the centre. So an element that
scales or rotates also gets a `CenterPoint` at `transform-origin`, 50% 50% by
default. `CenterPoint` is absolute (device-independent pixels, a `Vector3`) and
a Style cannot compute it from the size, so it is not a setter: the `origin`
write sets it from the element's size and sets it again on `SizeChanged`. It is
part of the transform module (`winui-svelte/css/transform`), which a sheet
imports when it has `scale`, `rotate`, `transform` or `transform-origin`; with
none of those in any sheet, a `scale` in a style attribute pivots at the
top-left corner, as WinUI does.

`transform-origin` takes one or two positions: `left`, `center`, `right`, `top`,
`bottom` (either order), a percentage of the element's size, or a length in
`px`. A third (z) value is an error.

```css
.card:hover { scale: 1.05 }                  /* grows from the centre, as CSS */
.fan { rotate: 8deg; transform-origin: left bottom }
```

### `transform`

`transform` takes a list of `translate()`, `translateX()`, `translateY()`,
`scale()`, `scaleX()`, `scaleY()`, `rotate()`, `skew()`, `skewX()`, `skewY()` and
`matrix()`, and sets the element's `RenderTransform` (a `TransformGroup` for a
list, in the order CSS applies it: the last function acts on the element first).
Lengths are `px` (a percentage needs the element's size and is an error), angles
`deg`, `rad`, `turn` or `grad`. 3D functions are errors: a RenderTransform is 2D.

The `origin` write above also sets `RenderTransformOrigin` (a fraction of the
size, which is what WinUI wants here), so `scale`, `rotate` and `transform`
share one `transform-origin`, as in CSS.

`transition: transform` warns and is dropped: WinUI's implicit transitions
animate `Translation`, `Scale` and `Rotation` and not a RenderTransform, so for
motion use `translate`, `scale` and `rotate`.

```css
.badge { transform: translate(4px, -4px) rotate(8deg) }
```

## Focus ring: `outline`

`outline` styles the control's focus visual:

| CSS | WinUI |
|---|---|
| `outline-color` | `FocusVisualPrimaryBrush` |
| `outline-width` | `FocusVisualPrimaryThickness` |
| `outline-offset` | `FocusVisualMargin`, negated: a negative WinUI margin pushes the ring outward, as a positive CSS offset does |
| `outline: none` | both thicknesses 0: no focus visual |
| any visible outline | `FocusVisualSecondaryThickness` 0 (a WinUI focus visual is two rings; CSS has one), and `UseSystemFocusVisuals` on a Control |

`solid` and `auto` are the styles; the others are errors. `UseSystemFocusVisuals`
exists on a `Control` and not on other types, so a write sets it where the
element has it. The module is `winui-svelte/css/focus`.

```css
button:focus-visible { outline: 2px solid #0af; outline-offset: 2px }
.quiet { outline: none }
```

## Elevation and backdrop: `-winui-elevation`, `backdrop-filter`

`-winui-elevation: <length>px` is a WinUI shadow: the element's `Shadow` is a
`ThemeShadow` and the Z of its `Translation` is the depth (16 for a card, 32 for
a flyout), which WinUI draws the shadow from. A `translate` on the element keeps
its X and Y. A ThemeShadow has no blur, offset, spread or color, so
`box-shadow` is an error that points here. Windows 11 casts the shadow with
nothing more; earlier, or for an app that targets a Windows SDK older than
22000, it draws only on the elements named in the shadow's `Receivers`, which a
Style cannot set. Every use warns of that; it is not verified without a window.

`backdrop-filter: blur(<length>px)` makes the Background an `AcrylicBrush`,
which blurs what is behind the element. The brush has a blur of its own, so the
radius is ignored (a warning says so); the tint is the element's literal
`background-color`, its alpha the `TintOpacity`. Without a `background-color` the
acrylic is untinted. Other filter functions are errors, and so is `filter`.

```css
.card { -winui-elevation: 16px }
.sheet { background-color: rgba(32, 32, 32, 0.6); backdrop-filter: blur(20px) }
```

Both are in `winui-svelte/css/surface`.

## What stays unsupported, and why

`unsupported-properties.ts` holds the reason shown for each property no group
handles. Declarations like these fail the build with it:

| Property | Why |
|---|---|
| `position`, `top`, `left`, `right`, `bottom` | a Style does not know its parent: a Canvas places by `Canvas.Left` / `Canvas.Top` (no right or bottom), the others have no counterpart |
| `box-shadow` | `ThemeShadow` takes no blur, offset, spread or color: use `-winui-elevation` |
| `filter` | WinUI has no filters; use an acrylic brush or a Mica backdrop |
| `animation` | use `transition` on opacity, translate, scale or rotate: WinUI has no keyframes |
| `float`, `flex*`, `align-items`, `justify-*`, `place-items`, `content`, `list-style`, `text-transform`, `text-indent`, `word-break`, `user-select` | no WinUI equivalent in a Style; each message names the nearest WinUI way |
