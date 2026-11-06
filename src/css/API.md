# winui-svelte CSS: the interface

A component's `<style>` block becomes WinUI Styles in two steps: the Vite
plugin translates it at build time (pure, no WinUI), the runtime applies it
(`native.ts` is the only part that touches WinUI)

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
`setClasses("")` / `setInlineStyle(null)`)
A class no sheet knows applies nothing and
leaves the element alone (so a hand-applied Style survives); a throw means a
declaration the element's type cannot take, with the rule it came from

Order does not matter between `installCss` and component modules: a sheet
registered before it is merged by it

## What a component imports (`src/css/vite.ts`)

```ts
import { winuiCss } from "winui-svelte/css/vite";

svelte({ compilerOptions })   // the SAME options below
winuiCss({ root, compilerOptions, runtimeModule: "winui-svelte/css" })
```

The plugin adds `import ".../Card.svelte-winui-css.js"` to each compiled
component that has a `<style>`
That module is

```ts
import { registerStyleSheet } from "<runtimeModule>";
registerStyleSheet(sheet);          // sheet = StyleSheetData as JSON
if (import.meta.hot) { import.meta.hot.accept(); }
```

`registerStyleSheet` with an id it has already seen replaces the sheet, keeps
its place in the cascade, and re-applies the classes of every live element
Svelte's default scoping class depends on `rootDir`; the component and its
sheet read it from the same `compilerOptions`, and the markup's instances get
the class out of a Svelte compile of the same file, never a hash of our own

Without Vite (tests, the window kit), `compileSheetModule({ filename, source,
sheetId, resources, runtimeModule })` returns the module's code (or null for no
`<style>`); append it to the compiled component
`compileCssFileModule({ source, sheetId, resources, runtimeModule })` does the same for a
shared `.css` file

## Shared styles: a `.css` file

A component imports a stylesheet for its side effect, and the file's rules
apply to the whole window, as the rules of a component's `<style>` do

```svelte
<script>
  import "./theme.css";
</script>
```

```css
/* theme.css */
:root { --neon-cyan: #0ff }
text-block { font-size: 12px }
```

- The file is translated like a `<style>` (same properties, same diagnostics), with no scoping, so its selectors are global
- A custom property it declares on `:root` is an app-wide resource, and `var(--neon-cyan)` in the importing component's `<style>` resolves to it
- Editing the file restyles the open window in place
- The import must be relative and end in `.css`; a package's stylesheet is not touched
- TypeScript needs to know the import: add `/// <reference types="winui-svelte/css/stylesheet" />` to a `.d.ts` of the app, or `"types": ["winui-svelte/css/stylesheet"]` to its tsconfig

## The pure side (no WinUI, no Svelte)

```ts
translateStyleSheet({ file, css, map, resources }): { sheet: StyleSheetData, diagnostics }
formatDiagnostic(diagnostic): string   // "file:line:column: <property> has no WinUI meaning (<why>)"
```

`resources` is `loadWinuiCatalogue()` (node): the resource names in
`winui-resources.g.json`, exported from WinUI's generic.xaml by
`scripts/css/export-winui-resources.ts`

## Scoping

A rule in a component's `<style>` reaches the elements and the component
instances that component writes, and nothing else; `:global(...)` and
`:global { }` escape the scope, as in Svelte 5
Svelte's own compiler decides which rules match: each component instance is
read as an element (`<winui-instance>`, with its `class` and spreads) for the
sheet's compile, so `.title` and `.page .title` match instances, an unused
rule is Svelte's `css_unused_selector` warning, and the selectors come out as
`.title.svelte-<hash>`
A class given to a `*Style` prop (`itemContainerStyle="row"`) names no element
of the component, so the build gives the prop's value the scope class too
(`"row svelte-<hash>"`, or `[value, "svelte-<hash>"]` for an expression), the
stand-in element holds the class so Svelte counts the rule as used, and
`styleOfClasses` matches the scoped rule
The component's own compile gets the instance's `class` with the scope class
added (`class="title svelte-x"`, `class={[expr, "svelte-x"]}`; `scopeClassOf`
and `scopedMarkup` in `runtime/sheet-module.ts`), so the Style registered
under `.title.svelte-<hash>` matches only this component's `.title`
The hash is Svelte's own, of the file's path, so an edit re-registers the sheet
and re-scopes the markup with no stale class
A parent's scope does not reach the inside of a child; a child that forwards
its `class` prop to an element gets the scope class with the value, so
`clsx`-style arrays and objects are the way to pass classes on
With a spread and no `class` attribute the scope class goes before the spread,
so a `class` inside the spread replaces it

### Scoped rules without false warnings

`svelte-check`, the Svelte language server (VS Code) and WebStorm run Svelte's
plain compiler, which reads `<TextBlock class="title">` as no element and warns
`css_unused_selector` for `.title`
`winuiDiagnostics()` from `winui-svelte/preprocess` returns the pair that
removes exactly those warnings: `preprocess` reads each component with its
instances as elements (the build's own reading) and keeps the selectors still
unused; `warningFilter` drops every other `css_unused_selector`
A rule that matches nothing, instances included, still warns

```js
// svelte.config.js
import { winuiDiagnostics } from "winui-svelte/preprocess";

const winui = winuiDiagnostics();

export default {
  preprocess: [winui.preprocess],
  compilerOptions: {
    warningFilter: winui.warningFilter
  }
};
```

The editor reads a `vite.config` before `svelte.config.js`, and `winuiSvelte()`
carries the same pair for it, so a project with the plugin needs nothing more
Put `vitePreprocess()` after `winui.preprocess` as before; the filter fills
from the preprocessor of the same call, so use the two of one call

### Directives on components

`style:name={value}`, `style:name="..."`, `style:--custom={value}`,
`style:name|important` and `class:name={condition}` on a component instance
are rewritten, in the same pass, into `style` (an expression that joins the
`style` attribute and the declarations, later wins, `null`, `undefined` and
`false` omitted) and `class` (a clsx array with the scope class and a
condition object)
Both stay reactive; positions in source maps follow the rewritten markup

### A prop beats a rule

A rule, the `style` text and the directives become a Style's setters; a prop is
a local value, which WinUI ranks above them
Both forms are allowed for `isTextSelectionEnabled` and `user-select`,
`padding`, `spacing` and `gap`, `fontSize` and `font-size`; the prop wins,
and removing it brings the rule's value back
Properties the translation writes outside the Style (effects, grid tracks)
have no prop to compete with
An animation overrides either while it runs

## Opt-in groups

Some properties cost a parser, and the window's bundle has a budget
They are
not built in: a compiled sheet that uses one imports its module and registers
it (`registerPropertyGroups`), so an app that uses none carries none
A style
attribute works with them only once some sheet of the app has registered them,
and the `outline` shorthand does not work there: write `outline-width`,
`outline-style` and `outline-color`
The build also registers the groups a component's markup names: a
`style:clip-path={shape}` directive (or a static `style` attribute) opts the
window in, with or without a `<style>` that uses the property

| Module | Properties | Section |
|---|---|---|
| `winui-svelte/css/gradients` | `background-image` | Gradients |
| `winui-svelte/css/transform` | `transform`, `translate`, `scale`, `rotate`, `transform-origin`, `transition` | Transforms |
| `winui-svelte/css/animation` | `animation`, `animation-*`, `@keyframes` | Animations |
| `winui-svelte/css/scroll-timeline` | `animation-timeline`, `animation-range*`, `scroll-timeline*`, `view-timeline*` | Scroll-driven animation |
| `winui-svelte/css/effects` | `aspect-ratio` | Aspect ratio |
| `winui-svelte/css/filter` | `filter`, `backdrop-filter`, `mix-blend-mode`, `mask`, `mask-image` | Filters, blends and masks |
| `winui-svelte/css/clip` | `clip-path` | Clip shapes |
| `winui-svelte/css/cursor` | `cursor` | Cursor |
| `winui-svelte/css/control` | `font-stretch`, `direction`, `background-clip`, `tab-index` | Control properties (`controlGroups`) |
| `winui-svelte/css/typography` | `font-variant`, `font-variant-*`, `font-kerning`, `font-feature-settings`, `font-optical-sizing` | Typography (`typographyGroups`) |
| `winui-svelte/css/shape` | `fill`, `stroke-dasharray`, `stroke-dashoffset`, `stroke-linecap`, `stroke-linejoin`, `stroke-miterlimit`, `rx`, `ry`, `fill-rule` | Shapes |
| `winui-svelte/css/focus` | `outline`, `outline-offset` | Focus ring |
| `winui-svelte/css/surface` | `-winui-elevation`, `box-shadow` | Elevation |
| `winui-svelte/css/position` | `position`, `top`, `left`, `right`, `bottom`, `inset` | Position |
| `winui-svelte/css/queries` | `@media`, `@container` and `@starting-style` rules (a group with no property of its own) | Responsive rules |
| `winui-svelte/css/environment` | the `@media` features beyond the size (preferences, display, input; a group with no property of its own) | Media features |
| `winui-svelte/css/compat` | `text-transform`, `word-break`, `user-select`, `object-fit`, `line-clamp`, `box-sizing` | Unsupported |
| `winui-svelte/css/resources` | custom properties on a class | Custom properties |

`calc()`, `min()`, `max()` and `clamp()` of px fold when the build
translates a `<style>` block, so a window carries no evaluator: in a `style`
attribute they are not a length
The logical properties (`margin-inline`,
`inline-size`...) and `grid-area` are shorthands only the build expands, for
the same reason; write the physical longhands in a `style` attribute

`translate`, `scale`, `rotate` (and the Z lift of `-winui-elevation` and
`position: relative`) set WinUI's Translation, Scale and Rotation
A Style
setter for one, applied before the element has loaded, hangs the window, so the
runtime writes them to the element once it has loaded (at once if it has)
`transform` is a RenderTransform; WinUI refuses CenterPoint beside it, so its
pivot is RenderTransformOrigin and `scale` and `rotate` pivot by CenterPoint

A group may also bring the shorthands it expands and the handlers of the
`write` outputs it produces: a write is something set on the element itself
(a grid's columns, the pivot, the focus visuals, the scoped resources), which a
Style cannot say
The runtime applies a write when its value changes and undoes
it when the style stops calling for it or the element goes

## Gradients: `background-image`

`background-image` (and `background` with a gradient as its only value) sets
the Background to a `LinearGradientBrush` or a `RadialGradientBrush`
The
setter is `kind: "content"`: the brush is written as XAML inside the Style's
`<Setter.Value>`, like the transitions

The gradient parser is an opt-in group (see above): a compiled sheet that has a
`background-image` imports it from `winui-svelte/css/gradients`

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
| `linear-gradient(<angle>, ...)` in `deg` | the same line for a square element; exact for 0, 90, 180, 270 degrees; any other angle warns (the brush maps to the element's bounding box, so it skews on a non-square element) |
| no direction | `to bottom` |
| `radial-gradient([ellipse] [size] [at position], ...)` | `Center`, `GradientOrigin` (= center), `RadiusX`, `RadiusY` as fractions of the bounding box: exact at every size. `size` is `closest-side`, `farthest-side`, `closest-corner`, `farthest-corner` (default) or two percentages. `position` is keywords or percentages |
| `radial-gradient(circle ...)` | the radii of the circle in a square box; warns (an ellipse on any other box) |
| stops `color`, `color 20%`, `color 20% 40%` | `GradientStop` (a two-position stop is two stops); missing positions are spread evenly, a stop never sits before the one ahead of it (CSS's fix-up) |
| `transparent` (or any fully transparent color) as a stop | the neighbouring stop's color at no opacity, so the fade keeps its hue as it does in CSS |
| `background-image: none` | nothing is set |

A gradient replaces `background-color` where both are written (a WinUI
Background is one brush), with a warning
The other stop colors are what
`parseColor` takes: hex, `rgb()`, `hsl()`, a name
Interpolation between stops
is WinUI's

An error (with the declaration's line) for what a WinUI gradient cannot say:

- `repeating-linear-gradient()`, `repeating-radial-gradient()`, `conic-gradient()`
- a stop position or radius in `px` (the brush maps to the element's size, so a length has no fixed place), a color hint (a lone percentage between stops), a stop outside 0% to 100%
- `var()` as a stop color (a declaration holds one resolved resource, and a stop needs a Color)
- several comma-separated images, `url()`, `image-set()`: an image cannot be a Background in a Style, use an Image element

## Custom properties: app-wide and scoped

A custom property is a WinUI resource, named like the CSS property in Pascal
case (`--button-background-pointer-over` is `ButtonBackgroundPointerOver`)

- On `:root` (and only there) it is an **app-wide** resource, merged into
  `Application.Resources` with the others of the sheet
- On any other selector it is **scoped**: the sheet keeps it with the rule, and
  every element that rule matches gets it in a ResourceDictionary of its own
  (merged into the element's `Resources`), so the element's template and its
  children read it and nothing else does
  A sheet with such a rule imports
  `winui-svelte/css/resources`, which does the merging

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

`forced-colors: active` is Windows' high contrast theme
Its values may be a
CSS system color (`Canvas`, `CanvasText`, `ButtonFace`, `ButtonText`, `GrayText`,
`Highlight`, `HighlightText`, `LinkText`) or `var(--system-color-...-color)`, any
of WinUI's `SystemColor*Color` resources: they become a `{ThemeResource}`
reference, which WinUI keeps current as the user changes the contrast theme
A style rule in these blocks is not a dictionary entry: it applies while the
query holds, as any other `@media` rule does (see Media features)

As soon as a sheet declares any scheme, the dictionaries are the explicit
`Light`, `Dark` and `HighContrast` that Microsoft's theme resources guidance
asks for (a `Default` beside a `HighContrast` lets the light and dark parts of
an app change each other's brushes), each holding the default values with its
own over them: a theme with no dictionary would fail the lookup
A sheet with
one value per property keeps a single `Default`
Every property needs a value
outside the blocks, or one for light and dark both

A scoped override is read when the control builds its template, and WinUI
reads a theme resource again on a theme change; so it takes effect when the
class is on the element as it is created, and a later class change may not show
until the next theme change
A custom property on a pseudo-class rule
(`.danger:hover`) is an error: the control's template drives the state, so
override the resource it reads for it (`--button-background-pointer-over`)

A key WinUI defines keeps WinUI's spelling and kind, so a known Brush gets a
`SolidColorBrush` (never a bare `Color`, which a template reading a brush would
not take), a `Thickness` or `CornerRadius` key takes one length, and a value of
the wrong kind is a build error
Any other name is a `Color` with a `Brush` of
the same name plus `Brush`, or a number (`x:Double`)

A custom property can be `var()` of another: of one the sheet declares (its
value stands in, a few levels deep, so a scoped override can name the accent
the `:root` rule sets), or of a `Color` resource WinUI defines
(`--accent-fill-color-default: var(--system-accent-color)` follows the theme)

### Overriding the accent

WinUI's templates do not read `AccentFillColorDefaultBrush` themselves: the
toggle reads `ToggleSwitchFillOn`, a radio button
`RadioButtonOuterEllipseCheckedFill`, and WinUI's own dictionary binds each of
these aliases to the accent brush when it loads, so a new
`AccentFillColorDefaultBrush` in the app does not reach them
The translation therefore also writes, next to a key it overrides, an alias for
every alias WinUI's dictionaries have of it, pointing at your key (43 of them
for the accent brush: the checked check box, the slider, the progress bar, the
selection indicators and so on), unless the sheet sets that key itself

```css
:root { --accent-fill-color-default: #22d3ee }   /* toggles, radios, sliders... */
```

Limits: a control that is already on screen keeps what it read, so declare it
in a sheet that loads before the window opens; `SystemAccentColor` and its
Light/Dark tints are the system's and are not what the templates read, so
override `--accent-fill-color-default` and the other `*-fill-color-*` keys
(`secondary`, `tertiary`, `disabled`) the control states use; the high contrast
theme is left to the system, aliases are taken from WinUI's light and dark
dictionaries only

## Transforms: `translate`, `scale`, `rotate`, `transform-origin`

`translate`, `scale` and `rotate` set the element's `Translation`, `Scale` and
`Rotation`
WinUI pivots the last two about `CenterPoint`, which is 0,0 (the
top-left corner) until set, where CSS pivots at the centre
So an element that
scales or rotates also gets a `CenterPoint` at `transform-origin`, 50% 50% by
default
`CenterPoint` is absolute (device-independent pixels, a `Vector3`) and
a Style cannot compute it from the size, so it is not a setter: the `origin`
write sets it from the element's size and sets it again on `SizeChanged`
It is
part of the transform module (`winui-svelte/css/transform`), which a sheet
imports when it has `scale`, `rotate`, `transform`, `transform-origin` or
`transition`; with none of those in any sheet, a `scale` in a style attribute
pivots at the top-left corner, as WinUI does
A `transition` in a style
attribute works only once some sheet of the app has the module

`transform-origin` takes one or two positions: `left`, `center`, `right`, `top`,
`bottom` (either order), a percentage of the element's size, or a length in
`px`
A third (z) value is an error

```css
.card:hover { scale: 1.05 }                  /* grows from the centre, as CSS */
.fan { rotate: 8deg; transform-origin: left bottom }
```

### `transform`

`transform` takes a list of `translate()`, `translateX()`, `translateY()`,
`scale()`, `scaleX()`, `scaleY()`, `rotate()`, `skew()`, `skewX()`, `skewY()` and
`matrix()`, and sets the element's `RenderTransform` (a `TransformGroup` for a
list, in the order CSS applies it: the last function acts on the element first)
Lengths are `px` (a percentage needs the element's size and is an error), angles
`deg`. 3D functions are errors: a RenderTransform is 2D

The `origin` write above also sets `RenderTransformOrigin` (a fraction of the
size, which is what WinUI wants here), so `scale`, `rotate` and `transform`
share one `transform-origin`, as in CSS

WinUI's implicit transitions animate `Translation`, `Scale` and `Rotation` and
not a RenderTransform
So when a rule has a `transition` that names `transform`
(or `all`), a `transform` list of `translate()`, `rotate()` and `scale()` in that
order (WinUI's own order of applying them) is set as those three properties and
the transition animates it
Any other list (a `skew()`, a `matrix()`, another
order) stays a RenderTransform, and the transition warns that it does nothing
A transition on `box-shadow` or `-winui-elevation` sets a Vector3Transition on
`Translation`, but a real window draws the ThemeShadow at its new depth at once
(sampled by pixels), though a plain `translate` does animate
A transition on `border-color` is a Storyboard on the border's brush: when the colors the rules
say change (a `:hover`, a class), a color animation runs from the old color to the new one,
with the duration, the timing function (`ease` when unwritten) and the delay of the
`transition` (`transition: border-color 200ms ease-out`)
Both colors must be written out (hex, `rgb()`, a name): a `var()` warns and the transition is dropped
The first color an element gets is set, not animated; the border keeps a brush of its own after a transition

```css
.badge { transform: translate(4px, -4px) rotate(8deg) }
```

## Fonts: `@font-face`

`@font-face` names a font file of the app and the family it is used by:
`@font-face { font-family: "Face"; src: url("./Face.ttf") }`
The family must be the name written inside the file
The first `url()` of `src` is the file, relative to the stylesheet (in a built app
also by its name beside the bundle); a web address or a `src` with no `url()` is
an error
`font-weight`, `font-style`, `font-stretch` and `unicode-range` are a warning, as
WinUI takes the face from the file; `font-display` is ignored
The sheet's module registers the file with `registerFont` (from
`winui-svelte/css`) before it registers the sheet, and any `font-family` of that
name, in any sheet or prop, is then handed to WinUI as
`ms-appx:///C:/app/Face.ttf#Face` (a `file:` URI is not read by WinUI)
Register a font before the first window shows text: a font registered later is
used by the controls created after it

## Typography: OpenType features and the type ramp

WinUI draws a TextBlock's OpenType features through the `Typography` attached
properties (`Typography.Capitals`, `Typography.StylisticSet1`...), and the
module `winui-svelte/css/typography` lowers the CSS properties onto them
A sheet imports it when it has one of these properties; one that has none
bundles none of it

| Property | Typography property it sets |
|---|---|
| `font-variant-caps` | `Capitals`: `small-caps`, `all-small-caps`, `petite-caps`, `all-petite-caps`, `unicase`, `titling-caps` |
| `font-variant-numeric` | `NumeralStyle` (`lining-nums`, `oldstyle-nums`), `NumeralAlignment` (`proportional-nums`, `tabular-nums`), `Fraction` (`diagonal-fractions`, `stacked-fractions`), `Variants` (`ordinal`), `SlashedZero` |
| `font-variant-position` | `Variants`: `sub`, `super` |
| `font-variant-ligatures` | `StandardLigatures`, `ContextualLigatures`, `DiscretionaryLigatures`, `HistoricalLigatures`, `ContextualAlternates`; `none` turns all five off |
| `font-variant-alternates` | `HistoricalForms` (`historical-forms`) |
| `font-variant-east-asian` | `EastAsianLanguage`, `EastAsianWidths`, `Variants` (`ruby`) |
| `font-kerning` | `Kerning`: `none` turns it off, `auto` and `normal` on |
| `font-feature-settings` | any OpenType tag WinUI has a property for, as `"tag"`, `"tag" on`, `"tag" off` or `"tag" 2`: `ss01` to `ss20`, `smcp`, `c2sc`, `pcap`, `c2pc`, `unic`, `titl`, `lnum`, `onum`, `pnum`, `tnum`, `frac`, `afrc`, `sups`, `subs`, `ordn`, `sinf`, `ruby`, `zero`, `liga`, `clig`, `dlig`, `hlig`, `calt`, `kern`, `case`, `cpsp`, `hist`, `mgrk`, `expt`, the East Asian forms and widths, and the counts `salt`, `swsh`, `cswh` and `nalt` |
| `font-variant` | the shorthand: each keyword goes to the longhand that takes it, and the longhands it does not name go back to `normal` |
| `font-optical-sizing` | `auto` only |

`normal` puts a property back to its default, and does not undo what another
longhand of the same rule sets on a property
`font-feature-settings` applies after the `font-variant` properties, as in CSS,
so where both set a property the feature wins
WinUI holds one value per property: two words that set `Typography.Variants`
differently (`font-variant-position: super` with `font-variant-numeric:
ordinal`) are an error

Rejected, each with the reason in the message:

| Value | Why |
|---|---|
| `font-variation-settings` | WinUI has no API for a variable font's axes; name an instance in `font-family` (`"Segoe UI Variable Display"`), and set `font-weight` and `font-stretch` |
| `font-optical-sizing: none` | DirectWrite applies a variable font's optical size axis from the font size, and nothing turns it off |
| a functional `font-variant-alternates` (`stylistic()`, `styleset()`, `character-variant()`, `swash()`, `ornaments()`, `annotation()`) | each names an `@font-feature-values` entry, which WinUI has no counterpart for; write the feature in `font-feature-settings` (`"ss02"`, `"salt" 2`, `"swsh" 1`) |
| `font-feature-settings` with a tag WinUI has no property for (`cv01`, `aalt`...) | the message lists the tags it sets |

```css
.price { font-variant-numeric: oldstyle-nums tabular-nums }
.label { font-variant-caps: all-small-caps; font-feature-settings: "ss06", "salt" 2 }
```

A font that lacks a feature draws without it, as in a browser

### The type ramp: `font: var(--type-body)`

`font` takes a step of WinUI's type ramp as `var(--type-<step>)`, and sets the
font size resource of WinUI's style for it (`{ThemeResource TitleTextBlockFontSize}`)
and the weight of that style, so the size follows WinUI's

| Step | Style it matches | Weight |
|---|---|---|
| `--type-caption` | `CaptionTextBlockStyle` | normal |
| `--type-body` | `BodyTextBlockStyle` | normal |
| `--type-body-strong` | `BodyStrongTextBlockStyle` | semi bold |
| `--type-body-large` | `BodyLargeTextBlockStyle` | normal |
| `--type-subtitle` | `SubtitleTextBlockStyle` | semi bold |
| `--type-title` | `TitleTextBlockStyle` | semi bold |
| `--type-title-large` | `TitleLargeTextBlockStyle` | semi bold |
| `--type-display` | `DisplayTextBlockStyle` | semi bold |

Any other `var(--type-...)` is an error that lists the steps
The step is a build-time shorthand (it needs no module), and the rest of
`font` is as before: `font: italic bold 16px Georgia`

## Animations: `animation`, `@keyframes`

`@keyframes` stays inside the sheet's data (`StyleSheetData.keyframes`, global to
the app as in CSS: any element's `animation-name` may name a rule of any sheet)
and `animation` runs on a WinUI `Storyboard` that the runtime begins when the
rule applies to the element and stops when it stops applying (a class removed,
the element gone)
The module is `winui-svelte/css/animation`, which a sheet
imports when it has an `animation` property

| CSS | WinUI |
|---|---|
| `animation-name`, the shorthand | one `Storyboard` per animation of the list |
| `animation-duration`, `animation-delay` | key times; a delay is `BeginTime` (a negative one starts mid-way) |
| `animation-timing-function` | `KeySpline` of a `SplineDoubleKeyFrame` or `SplineColorKeyFrame` for `ease`, `ease-in`, `ease-out`, `ease-in-out` and `cubic-bezier()`; `linear` key frames; `steps()`, `step-start` and `step-end` as discrete key frames. A keyframe's own `animation-timing-function` eases the interval it starts |
| `animation-iteration-count` | `RepeatBehavior` (`3x`, `Forever`); a whole number only |
| `animation-direction` | the key frames written reversed, with the easing mirrored; `alternate` repeats a forward and a backward run |
| `animation-fill-mode` | `forwards` and `both` hold the end (`HoldEnd`), otherwise `Stop`; `backwards` and `both` hold the first frame through the delay (not with a repeat count) |
| `animation-play-state` | `paused` begins the storyboard paused; changing it restarts the animation |

Keyframes can set `opacity`, `width`, `height`, `background-color`, `color`,
`border-color`, `translate`, `scale`, `rotate` and `transform`
Anything else is
a build error that lists these
A transform animates a `CompositeTransform` that
becomes the element's `RenderTransform` while the animation runs (translate and
scale add up, rotate and skew add up; a list is not applied in order), pivoting
about `transform-origin` (centre by default)
A color animates a
`SolidColorBrush` that the element is given for the time being; write the colors
out (hex, `rgb()`, a name): `var()` is an error
Give every animated property
a `from` and a `to` (or `0%` and `100%`): a property with no first frame starts
from the element's own value, and with more than one iteration the later
iterations start from where the last one ended

```css
@keyframes pulse { 0% { opacity: 1 } 50% { opacity: 0.4 } 100% { opacity: 1 } }
.badge { animation: pulse 1.2s ease-in-out infinite }
```

## Scroll-driven animation: `animation-timeline`, `scroll-timeline`, `view-timeline`

An animation can follow a scroll position instead of the clock
`animation-timeline` binds a `@keyframes` rule to a scroll viewer, and
Composition runs it on the compositor: the scroll viewer's manipulation
property set (`ElementCompositionPreview.GetScrollViewerManipulationPropertySet`)
feeds one `ExpressionAnimation` that gives the progress through the animation
range, and one more for each animated property that turns the progress into a
clamped `Lerp` of its key frames; the UI thread stays idle while the user
scrolls
The module is `winui-svelte/css/scroll-timeline`, which a sheet imports when it
has one of these properties (`animation-timeline`, `animation-range`,
`scroll-timeline*`, `view-timeline*`)

| Property | Meaning |
|---|---|
| `animation-timeline` | `auto` (the clock, the default), `none` (the animation does not play), `scroll([nearest \| root \| self] [block \| inline \| x \| y])`, `view([block \| inline \| x \| y] [inset])` or a dashed name; a comma list matches `animation-name` |
| `animation-range`, `animation-range-start`, `animation-range-end` | `normal` (the whole scroll range, or the whole cover range of a view), a length in px or a percentage, and for a view timeline a range name (`cover`, `contain`, `entry`, `exit`, `entry-crossing`, `exit-crossing`) with an offset into it: `animation-range: entry 10% exit 90%` |
| `scroll-timeline`, `scroll-timeline-name`, `scroll-timeline-axis` | the scroll viewer this rule styles defines a timeline that `animation-timeline: --name` finds |
| `view-timeline`, `view-timeline-name`, `view-timeline-axis`, `view-timeline-inset` | the element this rule styles defines a view timeline: its passage through the nearest scroll viewer |

`block` and `y` are vertical, `inline` and `x` horizontal (WinUI scrolls in the
left to right layout only)
`scroll()` measures the nearest scroll viewer above the element, the outermost
one (`root`) or the element itself (`self`)
`view()` measures the element itself against its nearest scroll viewer; its
inset (`auto`, or one or two lengths in px or percentages of the scrollport)
shrinks the scrollport the element is measured against

```css
.page { scroll-timeline: --page block }

.header {
  animation: collapse linear both;
  animation-timeline: --page;
  animation-range: 0 400px;
}

@keyframes collapse {
  to { opacity: 0; translate: 0 -30px; scale: 1 0.5 }
}

.hero { animation: drift linear both view() }
@keyframes drift {
  from { translate: 0 -40px }
  to { translate: 0 40px }
}
```

A name is found from the element that uses it: the timeline defined on the
element itself, on an ancestor, or anywhere below an ancestor (so a header
beside the scroll viewer finds the viewer's `--page`, which on the web
`timeline-scope` does)
An animation whose scroll viewer or name is not in the tree yet links when it
is

Limits, each reported by the build with what to write instead:

- only what Composition drives from a scroll position: `opacity`, `translate`,
  `scale`, `rotate` and a `transform` of `translate()`, `scale()` and
  `rotate()`; a width, a color, a keyword or a skew in the key frames is an
  error (use a time-based animation for it)
- the key frames map straight onto the range: write
  `animation-timing-function: linear` (the default `ease` is an error), and
  no easing in a key frame
- one iteration, in the `normal` or `reverse` direction; the duration, the
  delay and `animation-play-state` mean nothing to a scroll position
- the first and last values hold outside the range, as `animation-fill-mode:
  both` does; a property a key frame leaves out holds the element's own value
- scale and rotate turn about the element's centre; `transform-origin` is not
  read for them
- a range name needs a view timeline; `timeline-scope` is not supported
- the sizes are measured again at every layout; a scroll viewer that zooms is
  measured at zoom factor 1

Reduced motion: the copy of the rule that sets `animation: none` under
`prefers-reduced-motion: reduce` (see Reduced motion is automatic) also takes
the timeline away, so the element shows its own, unanimated values and not an
end state; an element with the class `winui-motion-always` keeps the link

`ParallaxView` is the control for a background that moves slower than its
scroll viewer, with a speed ratio: use it for that one effect, since it also
handles the layers for you
Use a view timeline when the effect is anything else (a fade or a scale as an
element crosses the viewport, a header that collapses, a progress bar) or when
the movement is not a ratio of the scroll

## Shapes: `fill`, `stroke-*`, `rx`, `ry`, `fill-rule`

A WinUI Shape (`rectangle`, `ellipse`, `line`, `polyline`, `polygon`, `path`)
draws with these, besides `stroke` and `stroke-width`; a sheet that uses one
imports `winui-svelte/css/shape` (`shapeGroups`), which the build adds:

| CSS | WinUI |
|---|---|
| `fill` | `Fill`, a color or `var()` brush; `none` is a transparent one |
| `stroke-dasharray` | `StrokeDashArray`; WinUI counts dashes in multiples of the stroke's thickness, so the px lengths are divided by `stroke-width` (1px when it is not written); `none` clears them |
| `stroke-dashoffset` | `StrokeDashOffset`, in multiples of the thickness as well |
| `stroke-linecap` | `StrokeStartLineCap` and `StrokeEndLineCap`: `butt` is Flat, `round` Round, `square` Square |
| `stroke-linejoin` | `StrokeLineJoin`: `miter`, `bevel`, `round` |
| `stroke-miterlimit` | `StrokeMiterLimit`, a number of at least 1 |
| `rx`, `ry` | `RadiusX` and `RadiusY` of a `rectangle` |
| `fill-rule` | `FillRule` of a `polygon`: `nonzero` is Nonzero, `evenodd` EvenOdd |

A `path` has no `FillRule` of its own (it belongs to the `PathGeometry` in its
`data`), so a Style cannot set it there
Lengths are in px (`stroke-dasharray: 8px 4px`), as everywhere else

## Focus ring: `outline`

`outline` styles the control's focus visual:

| CSS | WinUI |
|---|---|
| `outline-color` | `FocusVisualPrimaryBrush` |
| `outline-width` | `FocusVisualPrimaryThickness` |
| `outline-offset` | `FocusVisualMargin`, negated: a negative WinUI margin pushes the ring outward, as a positive CSS offset does |
| `outline: none` | both thicknesses 0: no focus visual |
| any visible outline | `FocusVisualSecondaryThickness` 0 (a WinUI focus visual is two rings; CSS has one), and `UseSystemFocusVisuals` on a Control |

`solid` and `auto` are the styles; the others are errors
`UseSystemFocusVisuals`
exists on a `Control` and not on other types, so a write sets it where the
element has it
The module is `winui-svelte/css/focus`

```css
button:focus-visible { outline: 2px solid #0af; outline-offset: 2px }
.quiet { outline: none }
```

## Elevation: `-winui-elevation`, `box-shadow`

`-winui-elevation: <length>px` is a WinUI shadow: the element's `Shadow` is a
`ThemeShadow` and the Z of its `Translation` is the depth (16 for a card, 32 for
a flyout), which WinUI draws the shadow from
A `translate` on the element keeps
its X and Y. A ThemeShadow has no blur, offset, spread or color, so
`box-shadow` is read for its depth only: the first shadow's blur (or, with no
blur, its larger offset) is the depth, as if written `-winui-elevation`, and a
warning says the color, offset and spread are dropped
`inset` is an error
`-winui-elevation` wins where both are written
Windows 11 casts the shadow with
nothing more; earlier, or for an app that targets a Windows SDK older than
22000, it draws only on the elements named in the shadow's `Receivers`, which a
Style cannot set
Every use warns of that; it is not verified without a window

```css
.card { -winui-elevation: 16px }
```

Both are in `winui-svelte/css/surface`

## Filters, blends and masks: `filter`, `backdrop-filter`, `mix-blend-mode`, `mask-image`

These draw the element through an effect graph of Win2D effects on its
Composition visual, so a Style cannot set them: a sheet that uses one imports
`winui-svelte/css/filter` (and with it Win2D, which no other group loads), and
the build lowers all five properties of an element to one write, the graph

- `filter` takes `blur()`, `drop-shadow()`, `grayscale()`, `sepia()`,
  `saturate()`, `hue-rotate()`, `invert()`, `opacity()`, `brightness()` and
  `contrast()`, in any order and number
  Neighbouring colour functions become one colour matrix (the Filter Effects
  spec's own), `blur()` a Gaussian blur of that standard deviation, and
  `drop-shadow()` a blurred, offset copy of the pixels' alpha in the colour
  given, under the pixels
  A `url()` reference is an error
- `backdrop-filter` takes the same list (but no `drop-shadow()`) and draws what
  is behind the element through it, under the element: a real filter of the
  backdrop, which the element's own translucent `background-color` shows
- `mix-blend-mode` takes `multiply`, `screen`, `overlay`, `darken`, `lighten`,
  `color-dodge`, `color-burn`, `hard-light`, `soft-light`, `difference`,
  `exclusion`, `hue`, `saturation`, `color` and `luminosity`, and blends the
  element with what is behind it
- `mask-image` (and the first image of a `mask` shorthand) takes a
  `linear-gradient()` or `radial-gradient()`, whose alpha is the mask, or a
  `url()` of an image (a file path or an `ms-appx://` or `https://` URI), whose
  alpha is
  `mask-position`, `mask-size`, `mask-repeat` and `mask-mode` are not read

How it is drawn: a sprite visual samples the element's visual through a visual
surface, which renders it whatever its `IsVisible`, so the element hides itself
and the sprite draws it; the sprite sits in the child visual slot of the
element's parent, since the element's own slot is part of what the surface
samples
That has three consequences
The element draws over the later siblings it overlaps
An element that already has a Composition child visual of its own, or whose
parent has one (set by `ElementCompositionPreview.SetElementChildVisual`),
cannot take a filter, and the window's stderr says so
A blur or a shadow draws outside the element, up to three deviations of the
blur

```css
.frosted { background-color: rgba(255, 255, 255, 0.3); backdrop-filter: blur(12px) saturate(180%) }
.sepia { filter: sepia(1) drop-shadow(4px 4px 6px #000) }
.fade-out { mask-image: linear-gradient(to bottom, #000, transparent) }
.multiplied { mix-blend-mode: multiply }
```

Svelte's `blur` transition uses the same blur: it animates the radius of the
element's blur (see Transitions in the API)

## Clip shapes: `clip-path`

`clip-path` is the Composition clip of the element's visual (a
`CompositionGeometricClip`), where `UIElement.Clip` takes only a rectangle: a
sheet that uses it imports `winui-svelte/css/clip`
`inset()` (with `round`, one to four radii, a slash and four more), `circle()`,
`ellipse()` (with `closest-side`, `farthest-side`, lengths and percentages, and
`at <position>`), `polygon()` (with `nonzero` or `evenodd`) and `path()` (SVG
path data in quotes, with its fill rule) are read; a geometry box after the
shape is ignored
A circle, an ellipse and a rounded rectangle are Composition's own geometries;
a polygon, a path and corners of different radii are made by Win2D
The shape is resolved against the element's size, and again when it changes
`rect()`, `xywh()` and `url()` are errors
An element with a filter, a blend or a mask is clipped on the sprite that
draws it

```css
.avatar { clip-path: circle(50%) }
.badge { clip-path: polygon(50% 0, 100% 100%, 0 100%) }
.card { clip-path: inset(0 round 12px) }
```

## Cursor: `cursor`

`cursor` is the pointer shape over an element: a sheet that uses it imports
`winui-svelte/css/cursor`
WinUI has no public cursor property; `UIElement.ProtectedCursor` is protected
in C#, but that is a language rule, and the property sits on the
`IUIElementProtected` interface of every element, which the binding reaches by
QueryInterface from outside; the value is an `InputSystemCursor` made by
`InputSystemCursor.Create`

| Keywords | Shape |
|---|---|
| `auto`, `default`, `context-menu` | Arrow |
| `pointer`, `grab`, `grabbing` | Hand |
| `text`, `vertical-text` | IBeam |
| `wait`, `progress` | Wait |
| `help` | Help |
| `not-allowed`, `no-drop` | UniversalNo |
| `crosshair`, `cell` | Cross |
| `move`, `all-scroll` | SizeAll |
| `n-resize`, `s-resize`, `ns-resize`, `row-resize` | SizeNorthSouth |
| `e-resize`, `w-resize`, `ew-resize`, `col-resize` | SizeWestEast |
| `ne-resize`, `sw-resize`, `nesw-resize` | SizeNortheastSouthwest |
| `nw-resize`, `se-resize`, `nwse-resize` | SizeNorthwestSoutheast |

Removing the rule gives the element no cursor of its own again

## Aspect ratio: `aspect-ratio`

`winui-svelte/css/effects` has `aspect-ratio` (`auto`, a number or `w / h`):
WinUI has none, so the element's Height follows its Width, as laid out, on
every size change
An element that also has a `height` gets the ratio's, which a warning says

## Styles for props: `styleOfClasses`

A prop that takes a Style (`itemContainerStyle`, `closeButtonStyle`, ...) is
not an element to style
A component given class names for it calls

```ts
styleOfClasses({ elementType: "list-view-item", classNames: "row picked" }): object | null
```

which picks the rules an element of that type and those classes would match
(type selectors included; `:hover` and the other state rules are ignored), builds
the Style through the cache elements use, and returns it, or null when no rule
applies
A Style with no base builds on the element's `Default<Type>Style`, as an
element's does
What only an element holds (a grid's columns, the focus ring,
the custom properties of a class) throws, naming the class
The Style is built
when called: a sheet registered later (hot reload) does not change it
Which
`elementType` a prop styles is `src/components/style-targets.ts`

## Layout: which CSS becomes which panel

A Style sets the properties of the element it styles and cannot reach its
parent or its children, so layout follows the element's type
The element is
the panel; the CSS names what it does

| CSS | WinUI | Decision |
|---|---|---|
| `display: flex` (`flex-direction` row or column) on `<stack-panel>` | `Orientation` | row is Horizontal, column Vertical; `-reverse` is an error |
| `gap`, `row-gap`, `column-gap` | stack `Spacing` (along its orientation), grid `RowSpacing` / `ColumnSpacing` | |
| `display: grid` on `<grid>`, `grid-template-*` | the grid's definitions | see Grid tracks |
| `grid-column`, `grid-row`, `grid-area` | `Grid.Column`, `Grid.Row`, `Grid.ColumnSpan`, `Grid.RowSpan` (lines are 1-based in CSS, 0-based in WinUI) | named areas, auto-placement and implicit tracks are errors |
| `flex: 1`, `flex-grow`, `flex-basis` on a child | a `*`, `Auto` or px track | lowered by the build when the container is a `<grid>` with `display: flex` (see Containers); on a `<stack-panel>` an error that points to it |
| `flex-wrap` | none | error: WinUI has no wrapping panel; the message names the two ways, a `<rich-text-block>` holding each chip in an `<inline-ui-container>` (any widths) or a `<variable-sized-wrap-grid>` (one cell size) |
| `align-self`, `justify-self`, `place-self` | `VerticalAlignment`, `HorizontalAlignment` (`start` is Top / Left) | on the child |
| `align-items`, `justify-items`, `place-items`, `justify-content`, `align-content` | each child's `align-self` / `justify-self`, or spacer tracks | lowered into the children by the build (see Containers) |
| `justify-content`, `align-items` on a control (`<expander>`, `<button>`, `<list-view-item>`) | `HorizontalContentAlignment`, `VerticalContentAlignment` (`start` is Left / Top) | on a panel they are lowered into the children instead (see Containers) |
| `width`, `height` in px, `calc()` of them, `auto`, `100%` | `Width`, `Height` (NaN for auto and 100%: a stretching element fills) | another % is an error: use a `*` track |
| `min-*`, `max-*` | `MinWidth`... | |
| `box-sizing: border-box` | nothing: WinUI's size includes padding and border | `content-box` is an error |
| `overflow` on `<scroll-viewer>` | scroll bar visibility (`scroll` Visible, `auto` Auto, `hidden` Disabled) | on any other element an error: wrap the content in a `<scroll-viewer>` |
| `order` | the children written in that order | by the build, for children fixed in the markup (see Containers); otherwise an error: sort the list in the script |
| `position`, `inset`, `z-index` | see Position | |

## Containers: alignment, flex sizes and order

A Style cannot see an element's children, but the markup is known at build
time: the component build matches a container's rules against the markup,
gives each child a generated class (`wsc-1`, in a rule of no specificity at the
start of the style, so every rule you write for the child wins), and takes the
lowered declarations out of the rule
It applies to a `<stack-panel>` or `<grid>` written in the component, in a rule
that is not inside an `@media`

| On the container | `<stack-panel>` (a flex row or column) | `<grid>` with `display: grid` | `<grid>` with `display: flex` |
|---|---|---|---|
| `align-items` | each child's `align-self` (row) or `justify-self` (column) | each child's `align-self` | each child's `align-self` (row) or `justify-self` (column) |
| `justify-items` | none, as in CSS flex | each child's `justify-self` | none |
| `place-items` | the `align-items` part | both | the `align-items` part |
| `justify-content`, `align-content`, `place-content` | `start` only (the panel lays out from the start); another value is an error that points to a grid | `normal`, `stretch`, `start` only; give the grid `1fr` tracks around the content | `start`, `end`, `center`, `space-between`, `space-around`, `space-evenly` become `1fr` spacer tracks (when no child grows) |
| `display: flex`, `flex-direction`, `flex-wrap: nowrap` | `Orientation` as before | | removed: the tracks are made from the children |

A flex row or column written as a `<grid>` gets a track for each child, in
`grid-template-columns` (row) or `grid-template-rows` (column), and each child
a `grid-column` or `grid-row`

| On the child | Track |
|---|---|
| `flex: 1`, `flex-grow: n` | `1fr`, `nfr` |
| `flex-grow` with a `flex-basis` in px | `minmax(Npx, nfr)` |
| `flex-basis: 80px` without growth | `80px` |
| `flex: none`, `flex: 0 0 auto`, nothing | `auto` |
| `flex-shrink` | accepted and ignored: a WinUI panel never shrinks a child |

On a `<stack-panel>` a child's `flex-basis` in px is its `width` (row) or
`height` (column), and `flex-grow` above 0 is an error that points to a `<grid>`
with `display: flex`

`order` writes the container's children in that order (a stable sort, `0` when
unwritten) by rewriting the markup, since WinUI lays children out in markup
order
Selectors such as `:nth-child()` still count the children as written
`order` needs children that are fixed in the markup: with an `{#each}`, an
`{#if}` or a component among them it is an error that names the line (sort the
list in the script)

Alignment needs a class on each child: children that an `{#each}` or `{#if}`
repeats get it on the repeated element, and a component among the children is
an error (set the alignment inside the component)
A flex `<grid>` makes its tracks from the children, so it rejects an `{#each}`,
an `{#if}` and components among them: write `grid-template-columns` and place
each child with `grid-column`

```svelte
<grid class="toolbar">
  <text-block class="title">Files</text-block>
  <button class="more">More</button>
</grid>

<style>
  .toolbar { display: flex; align-items: center; gap: 8px }
  .title { flex: 1 }
</style>
```

A declaration is taken out of a rule only when every element the rule reaches
was lowered: if `.row` also names an element that is not a `<stack-panel>` or a
`<grid>`, the declaration stays and the translator reports it
Where `gap` is on a flex `<grid>` with spacer tracks, it is added beside each
spacer as well

## Grid tracks: `grid-template-columns`, `grid-template-rows`

Tracks are written to the grid's definitions (a Style cannot hold them), as the
`columns` and `rows` props spell them, "Auto,*,2*,120"

| CSS track | WinUI |
|---|---|
| `auto` | `Auto` |
| `min-content`, `max-content` | `Auto`, with a warning: WinUI sizes to the content, it does not measure the minimum or maximum |
| `120px` | 120 pixels |
| `1fr`, `2fr` | `*`, `2*` |
| `minmax(100px, 1fr)` | `*` with MinWidth (MinHeight) 100 |
| `minmax(50px, 300px)`, `fit-content(200px)` | `Auto` with MinWidth 50 and MaxWidth 300 (200) |
| `repeat(3, 1fr)` | three tracks |
| `repeat(auto-fill, ...)`, `auto-fit`, `subgrid`, `masonry`, a named line (`[side]`), a % track | error: a grid has a fixed set of tracks; the message says what to write instead |

A bound is written after colons in the prop too: `columns="*:100:,Auto::300"`

## Position: `position`, `top`, `left`, `right`, `bottom`, `inset`

Opt-in (`winui-svelte/css/position`)
Offsets are lengths in px (or `auto`)

| CSS | WinUI |
|---|---|
| `position: absolute` or `fixed` with `left`, `top` | `Canvas.Left`, `Canvas.Top` (the parent is a `<canvas>`) |
| `position: relative` with offsets | `Translation` `x,y,0`: the element moves and the layout does not (`left` and `top` win over `right` and `bottom`); an error with `translate`, which sets the same property |
| `inset: a b c d` | the four offsets, top right bottom left |
| `position: static` | nothing |
| `right`, `bottom` on an absolute element | error: a canvas places from the top left; use `justify-self: end` / `align-self: end` in a grid cell |
| `position: sticky` | error: a ScrollViewer does not pin its children |
| offsets without `position` | warning, ignored (as in CSS) |

`z-index` is `Canvas.ZIndex`

## Lengths that depend on the layout

There are none: WinUI has no percentage, viewport, container or font-relative lengths
`calc()`, `min()`, `max()` and `clamp()` of px fold at build time; any other unit is an
error that says what to write (see Length units)
Size an element with a Grid `*` track, stretch alignment, a `@media` or
`@container` rule, or compute the number in script

## Entrances: `@starting-style`

The rules in `@starting-style { .a { opacity: 0 } }` (or `.a { @starting-style { opacity: 0 } }`)
style an element until it is loaded; then the normal style replaces them
The
second style is a change of properties, so a `transition` on them (the opt-in
transform group) animates the entrance; without one the element simply appears in
its final style
An element in the tree when it is styled settles at once

## Container size: `@container`

`container-type: size | inline-size`, `container-name` and `container: name / type`
(opt-in, `winui-svelte/css/container`) make an element a container
`@container [name] (min-width: 400px)`, `(max-width)`, `(min-height)`, `(max-height)`
(and `inline-size`, `block-size`, the range forms) around a rule make it apply while
the size of the nearest container ancestor (of that name; any, if unnamed) is inside
the bounds
The element listens to that container's `SizeChanged` (and to its own
`Loaded`, if it was styled before it was in the tree), exactly while one of its
matching rules asks
A style query (`@container style(...)`) and a container
unit are not supported

## Window size: `@media`

`@media (min-width: 600px)`, `(max-width)`, `(min-height)`, `(max-height)` (px;
`and` joins them, `(width >= 600px)` works, a leading `screen and` is ignored)
around a rule make it apply while the window's content is inside the bounds
Each rule keeps its `media` (`MediaCondition`), and an element that matches one
listens to its `XamlRoot` (`Changed`; before the control is loaded, its
`Loaded`) and is restyled when the size crosses a bound
An element none of
whose rules is under an `@media` listens to nothing

Only the properties a Style can hold change with the size; a grid's tracks are a
write and swap like the rest
Not supported, with the build error saying why:
a % bound, a `:root` custom property under a query (other than a scheme), and a
query inside another `@media`
`CssNative` gains
`viewportOf` and `watchViewport` for it

## Media features: preferences, display and input

Any other `@media` query is read by one evaluator (`src/css/media/query.ts`)
that `matchMedia` and `mediaQuery` share with the stylesheet: media types
(`all` and `screen` hold, `print`, `speech`, `tty` and `tv` parse and never hold),
`not`, `only`, `and`, `or`, comma lists, parentheses, the `min-` and `max-` forms,
the range syntax (`(400px <= width <= 700px)`), the boolean form
(`(prefers-reduced-motion)`), and the units px (any other length unit is a
compile error, see Length units), dppx, x, dpi and dpcm for a resolution, and
ratios
A feature the table does not know is a build error that names it, and
inside `matchMedia` a query that does not parse never holds
A rule keeps the query text in `media.query` and the element listens only to
what its matching rules ask about: a rule with no preference query listens to
no setting, one with `prefers-reduced-motion` listens to `UISettings` and
restyles live when the user flips the setting
The module `winui-svelte/css/environment` (imported by a sheet that has such a
rule, so an app that has none carries none of it) gives the runtime the answers

Every feature is one row of `MEDIA_FEATURES` (`src/css/media/features.ts`):
what it measures, where the answer comes from, and which change can flip it
Adding one is adding a row, and a test per row keeps the table honest
Where the answer is not read from Windows the table says so, and an app that
knows better supplies it (`installMatchMedia({ inputs: { devices: ... } })`)

| Feature | Kind | Answered from |
|---|---|---|
| `width` | range | the window's client area in a stylesheet; in matchMedia the size the app supplies (the primary monitor otherwise) |
| `height` | range | as width |
| `aspect-ratio` | range | as width |
| `orientation` | keyword | as width |
| `device-width` | range | the primary monitor (DisplayArea), in device pixels |
| `device-height` | range | as device-width |
| `device-aspect-ratio` | range | as device-width |
| `resolution` | range | the element's XamlRoot.RasterizationScale in a stylesheet; in matchMedia the scale the app supplies (1 otherwise); dppx, x, dpi and dpcm |
| `-webkit-device-pixel-ratio` | range | as resolution |
| `display-mode` | keyword | the presenter the app supplies (standalone otherwise); fullscreen and picture-in-picture for a full-screen or compact-overlay window |
| `color` | range | always 8: Windows composes in 8 bits per channel or wider |
| `color-index` | range | always 0: no display uses an indexed palette |
| `monochrome` | range | always 0: the display is a color one |
| `grid` | range | always 0: a window is a bitmap display |
| `color-gamut` | keyword | the primary monitor's EDID primaries (DisplayMonitor.RedPrimary, GreenPrimary, BluePrimary): srgb, p3 when their triangle is 1.25 times sRGB's, rec2020 at 1.75 times; srgb until the monitor has been opened |
| `dynamic-range`, `video-dynamic-range` | keyword | high when Windows shows the primary monitor in HDR (QueryDisplayConfig and DisplayConfigGetDeviceInfo with DISPLAYCONFIG_GET_ADVANCED_COLOR_INFO), read again when the displays change; standard otherwise |
| `hover`, `any-hover` | keyword | read from Windows.Devices.Input (`MouseCapabilities`, `TouchCapabilities`, `PointerDevice`) by the same reader as `winui-svelte/devices/input`, read again when an input device comes or goes; hover is none for touch only |
| `pointer`, `any-pointer` | keyword | read from Windows.Devices.Input: fine for a mouse, touchpad or pen, coarse when touch is the only pointer |
| `scan` | keyword | always progressive |
| `update` | keyword | always fast |
| `overflow-block`, `overflow-inline` | keyword | always scroll: a window has no pages |
| `scripting` | keyword | always enabled |
| `prefers-color-scheme` | keyword | the element's ActualTheme in a stylesheet (it follows RequestedTheme and the system); UISettings' foreground color in matchMedia |
| `prefers-contrast` | keyword | AccessibilitySettings.HighContrast: more while a contrast theme is on, else no-preference (less and custom never match) |
| `prefers-reduced-motion` | keyword | UISettings.AnimationsEnabled |
| `prefers-reduced-transparency` | keyword | UISettings.AdvancedEffectsEnabled (Transparency effects) |
| `forced-colors` | keyword | AccessibilitySettings.HighContrast |
| `prefers-reduced-data` | keyword | reduce on a metered connection (NetworkInformation.GetInternetConnectionProfile().GetConnectionCost(): a Fixed or Variable cost), read again on NetworkStatusChanged |
| `inverted-colors` | keyword | always none: Windows tells apps of no color inversion |
| `light-level` | keyword | always normal: no ambient light sensor is read |
| `nav-controls` | keyword | always back |
| `horizontal-viewport-segments`, `vertical-viewport-segments` | range | always 1: a window is one segment |
| `device-posture` | keyword | always continuous: no fold is reported |

`env(safe-area-inset-top|right|bottom|left)` is `0px` (a window has no notch)
`env(titlebar-area-x|y|width|height)` is an error: the custom title bar's
rectangle is known only at run time and WinUI has no run-time lengths (see
Lengths that depend on the layout); read `AppWindow.TitleBar` in script instead

### Preferences, in short

| Need | Write |
|---|---|
| Dark theme | `@media (prefers-color-scheme: dark)` on a rule, `light-dark(a, b)` or the same query around a custom property of `:root` |
| High contrast | `@media (forced-colors: active)` (or `(prefers-contrast: more)`) with system colors `Canvas`, `CanvasText`, `ButtonFace`, `ButtonText`, `GrayText`, `Highlight`, `HighlightText`, `LinkText` or `var(--system-color-...-color)` |
| Reduced motion | automatic (below), or `@media (prefers-reduced-motion: reduce)` |
| Reduced transparency | `@media (prefers-reduced-transparency: reduce)` with an opaque `background-color` |
| Theme of one subtree | `color-scheme: light`, `dark` or `normal` (RequestedTheme) |

`forced-color-adjust` has no WinUI meaning (WinUI's contrast theme recolors
controls through theme resources an element cannot opt out of) and is a build
error that says what to write instead

### Dark values follow the element's theme

A declaration that reads a custom property with a dark value, or `light-dark()`,
is written out for both themes: the rule keeps the light value and a copy under
`prefers-color-scheme: dark` has the dark one
WinUI does not read a Style's theme resource again when the theme of the element
changes (a `RequestedTheme` above it), while a rule under a media query
restyles live from `ActualThemeChanged`, so the color follows the theme as it
changes
The dictionaries stay for the controls' own templates

### Testing against fake settings

When the environment variable `WINUI_SVELTE_FAKE_SETTINGS` names a JSON file
(`isDark`, `isHighContrast`, `isAnimationEnabled`, `isTransparencyEnabled`
booleans and `textScaleFactor`, each optional), the settings store reads that file
instead of Windows' settings and notices a rewrite within a tenth of a second
Nothing is read when the variable is not set; `test/media.test.ts` drives a real
window through it

### Reduced motion is automatic

A rule with `transition` or `animation` is followed, at build time, by a copy
under `@media (prefers-reduced-motion: reduce)` that sets `transition: none` and
`animation: none`, so the user's Windows animation setting is honoured with no
work from the author (the copy is an ordinary rule: a later rule of yours wins
over it, and a rule you wrote for `prefers-reduced-motion` yourself gets no copy)
An element with the class `winui-motion-always` keeps its motion
Svelte's `transition:`, `in:`, `out:` and `animate:` follow the same setting
(duration 0 on any element without that class; `enableElementAnimation` takes
`isMotionReduced` to ask differently)
WinUI decides for its own theme animations, and has no property to force it

## Nesting

A rule nested in another is flattened at build time (CSS Nesting): `&` is each
selector of the parent (`.a, .b { &:hover { ... } &.on { ... } }` is four
rules), and a nested selector without `&` is a descendant, which stays an error
(a Style has no "inside")
`&` may stand anywhere in a nested selector
An
at-rule inside a rule (`.a { @media (min-width: 600px) { ... } }`) styles the
rule's own selector under that at-rule; `@supports` still has no WinUI meaning there
and says so

## Modern colors

`oklch()`, `oklab()`, `lab()`, `lch()`, `hwb()`, `color-mix()` and relative color
syntax are resolved to sRGB by the build, in rules and custom properties alike,
so the window carries no parser for them (out-of-gamut colors are clipped)

- `color-mix(in <space> [shorter|longer|increasing|decreasing hue], a 30%, b)`
  works in srgb, srgb-linear, xyz (xyz-d65), xyz-d50, lab, lch, oklab, oklch, hsl
  and hwb, interpolating premultiplied by alpha, with the hue method for the
  polar spaces
- `rgb(from <origin> r g b / 0.5)`, and `hsl`, `hwb`, `lab`, `lch`, `oklab`, `oklch`
  the same way: the origin's channels are keywords (`r g b`, `h s l`, `h w b`,
  `l a b`, `l c h`, `alpha`), written as they are or in a `calc()` of plain numbers
  (`calc(h + 120)`)
  The origin is a color or a `var(--c)` of a custom property the
  sheet sets outside any `@media`
- `light-dark()` is described below
  Not supported: the `color()` function, and a
  relative color whose origin is a `var()` set only per theme

## Logical properties

WinUI lays out left to right, top to bottom, so the inline axis is horizontal and
the block axis vertical: `margin-inline`, `margin-block`, `padding-inline`,
`padding-block` and their `-start` / `-end` forms are the left, right, top and
bottom longhands, and `inline-size` and `block-size` (with `min-` and `max-`) are
the width and height
`text-align: start` and `end` are Left and Right

## Selectors

A selector is a type, classes, one state (`:hover`, `:active`, `:focus`,
`:focus-visible`, `:disabled`, `:checked`), `:where()` and `:not(.a, .b)`
A Style
sets one element by its own type and classes, so a selector about its
surroundings is resolved at build time, against the component's markup:

```css
.list > .item:first-child { ... }   /* becomes .wsc-1 on exactly that element */
.card text-block { ... }            /* descendant, through {#if} and {#each} */
.a + .b, .a ~ .c { ... }            /* sibling combinators */
.item:nth-child(2n+1), :is(.a, .b) > .c { ... }
```

The build parses the component (Svelte's own parser), finds the elements each
descendant, child and sibling selector, `:first-child`, `:last-child`,
`:only-child`, `:nth-child()`, `:nth-last-child()` and `:is()` can match, adds a
generated class (`wsc-1`, in the element's `class`) to exactly those, and the
selector names that class instead, keeping a state of the last compound
(`.item:first-child:hover` is `.wsc-1:hover`)
Both Svelte's compile and the
sheet's use the rewritten source (`resolveRelationalSelectors`)

It is a build error, with the line, where the markup does not decide:

- an element's class is set by an expression, a `class:` directive or a spread, and
  the selector tests a class on it (when the element would otherwise match);
- a position (`:first-child`, `:nth-child()`, `+`, `~`) of an element whose siblings
  depend on an `{#if}`, an `{#each}`, a component or a snippet, or of the root of the
  component (its neighbours are the parent's);
- `:has()`, a state (`:hover`) on an element other than the styled one, and an id,
  attribute or pseudo-element

Elements inside a component's children, a snippet or `<svelte:element>` are not
seen

A rule nested in another is flattened first (`.list { > .item:first-child { ... } }`
is `.list > .item:first-child`) and matched like the rest
When a nested rule
needs the markup, it and everything nested in it are taken out of the parent and
written at the end of the `<style>` with their full selectors (so they come after
the rest in the cascade)
`@scope (.card) to (.limit) { ... }` is written out the
same way: `:scope` and `&` are the root, other selectors are under it, and an
element at or under the limit is left out
The root and the limit are
selectors; `@scope` holds style rules only

## Length units

WinUI measures in device-independent pixels, so the CSS writes what WinUI
understands and nothing is converted
Only the native units are CSS here: px, deg, s, ms, fr, auto and unitless
numbers
Any other unit is a compile error from both the compiler and stylelint
One table (`src/css/parse/units.ts`) holds the verdict per unit, and the parser,
the validator, the stylelint rule and the VS Code data all read it; adding a row
updates every channel

| Unit | Verdict | Why |
|---|---|---|
| `px` | native | WinUI lengths are device-independent pixels |
| `deg` | native | WinUI rotates, skews and aims gradients in degrees |
| `s`, `ms` | native | WinUI durations and delays are a TimeSpan |
| `fr` | native | a grid track of a share of the rest, a star size |
| a bare number | native | where WinUI takes a number: `opacity`, `flex` factors, `z-index`, `font-weight`, `letter-spacing` (thousandths of an em, WinUI's CharacterSpacing) |
| `rem`, `em`, `ch`, `ex`, `cap`, `ic`, `lh`, `rlh`, `rch`, `rex`, `rcap`, `ric` | error | WinUI has no relative font units: write px |
| `pt`, `pc`, `in`, `cm`, `mm`, `q` | error | WinUI measures only in px: write px |
| `vw`, `vh`, `vmin`, `vmax`, `vi`, `vb` and the `sv`, `lv`, `dv` variants | error | WinUI has no viewport units: write px, or a Grid `*` track or stretch alignment |
| `cqw`, `cqh`, `cqi`, `cqb`, `cqmin`, `cqmax` | error | WinUI has no container units: write px, or a Grid `*` track or stretch alignment |
| `rad`, `grad`, `turn` | error | WinUI angles are degrees: write deg |
| `dppx`, `dpi`, `dpcm`, `x` | error | a resolution is a media feature, not a length |
| `%` inside `calc()`, `min()`, `max()`, `clamp()` | error | WinUI has no percentage lengths: write px, a Grid `*` track, or compute it in script |
| any other unit | error | not a unit WinUI knows: write px, deg, s, ms or fr |

A percentage that is not a length stays: gradient stops, color channels and
`color-mix()` weights, `transform-origin`, keyframe selectors, and
`width: 100%` (a stretching element fills)

### Number or percentage

CSS writes three values either way; the CSS layer takes one form, and
`.stylelintrc.json` sets the same one, so the editor and the build never
disagree (`src/css/parse/notation.ts` is the table; a test in
`src/css/validate/notation.test.ts` runs stylelint and the compiler over the
same CSS)

| Value | Written | Rejected | stylelint rule |
|---|---|---|---|
| `opacity` and the alpha of a color | a number: `opacity: 0.5`, `rgb(0 0 0 / 0.5)` | `50%` | `alpha-value-notation: number` |
| the lightness of `lab()`, `lch()`, `oklab()`, `oklch()` | a number: `oklch(0.7 0.15 200deg)` | `70%` | `lightness-notation: number` |
| a keyframe selector | `from`, `to` or a percentage: `50%` is a share of the animation, not a length | any other word or a bare number | `keyframe-selector-notation: percentage-unless-within-keyword-only-block` |

A block that mixes `from` or `to` with percentages is valid CSS and builds;
stylelint asks for `0%` and `100%` there, so write the percentages

### Where a unit is checked

One validator reads every position, so the build, the preprocessor and
stylelint report the same code, message, line and column
A table-driven test (`src/css/validate/units.test.ts`) writes every unit of
the table in every position through every channel

| Position | Build (Vite plugin) | Preprocessor | stylelint |
|---|---|---|---|
| property values, shorthands, `calc()` operands, grid tracks, gradient stops, transforms, durations and delays | yes | yes | yes |
| `@media`, `@container`, `@supports` conditions | yes | yes | yes |
| custom property values | yes | yes | yes |
| `style="..."` attributes | yes | yes | yes (postcss-html reads them) |
| `style:name` directives | yes | yes | no: postcss-html does not read them |
| `<style>` of plain `.css` files | not part of a component | n/a | yes |
| `@keyframes` selectors | percentages are not lengths | n/a | n/a |

## Diagnostics in the editor, the linter and the build

WinUI's CSS is a dialect, the way `:global(...)` is Svelte's: some of it is not
valid CSS to an editor, and a misuse is a compile error to the build
Four channels read one validator (`src/css/validate/validate.ts`), which runs the
build's own translation and adds the explanations the tables hold, so a hand-coder
and an agent get the same message and the same position everywhere:

| Channel | How | What you see |
|---|---|---|
| Svelte language server and `svelte-check` | `winui-svelte/preprocess` in `svelte.config.js` | the declaration marked in the editor; `svelte-check` prints `file:line:column` and the message |
| Vite and the build | `winuiCss` and `winuiSvelte` | the same message with the frame of code around it and a `[winui-svelte/<code>]` suffix |
| stylelint | `winui-svelte/stylelint` | the rule `winui-svelte/no-unsupported-css`, which marks the exact range |
| VS Code's own CSS checker | `winui-svelte/vscode-css-data.json` | no false warning on `-winui-*` properties; completions and hovers say what WinUI allows |

```js
// svelte.config.js
import { winuiPreprocess } from "winui-svelte/preprocess";

export default { preprocess: [winuiPreprocess()] };
```

`winuiDiagnostics()` is that preprocessor plus the `warningFilter` for scoped
rules on component instances ([Scoped rules without false warnings](#scoped-rules-without-false-warnings))

The Svelte language server shows one error per file, the first, as a point in the
`<style>`; fix it and the next shows
stylelint and the build list them all

```json
{
  "plugins": ["winui-svelte/stylelint"],
  "rules": { "winui-svelte/no-unsupported-css": true }
}
```

The secondary option `{ "ignore": ["partial-support"] }` skips codes

```json
{
  "css.customData": ["./node_modules/winui-svelte/vscode-css-data.json"]
}
```

WebStorm reads the same data from `web-types.json` (no setting needed), so
`-winui-elevation`, `-winui-based-on` and the Windows font families of
`font-family` complete in a `<style>` and a `.css` file
Both editors also offer the keywords of every property that takes a fixed set
(`text-align`, `white-space`, `visibility`, `display` and the rest of the
keyword table), each with the WinUI value it stands for, and describe
`align-items` and `justify-content` as the build lowers them into the children
A property's hover in WinUI's own components names the CSS property that also
sets it, found by asking the translator, so `padding`, `border-radius` and
`border-width` are named as well as the single-member ones

A diagnostic is `{ code, severity, message, filename, start, end, frame, suggestion }`
with Svelte's position shape (`line` from 1, `column` from 0, `character`)
The codes: `unsupported-property`, `unsupported-at-rule`, `unsupported-unit`,
`unsupported-on-element`, `unsupported-grid-track`, `partial-support` (a warning)
and `invalid-css`
A rule that sets a property the element it styles lacks is `unsupported-on-element`:
`.icon { font-size: 16px }` on a `<PathIcon class="icon">` is reported at the rule as
`property font-size is not supported on <path-icon> (WinUI's PathIcon has no FontSize) (used by .icon on <path-icon> at Icon.svelte:4)`,
an error in the build and in the editor, instead of a failure when the window opens
It checks every WinUI element or imported component that statically carries the
class (a class shared by a `TextBlock` and a `PathIcon` is checked against both),
against the properties of the element and its parents; an attached property is
valid, and a class set by an expression or on a component of the app's own is
never guessed
For example, `repeat(auto-fill, 100px)` is reported as `repeat(auto-fill, ...) has
no WinUI equivalent: write explicit tracks, for example repeat(3, 1fr) or 1fr 1fr 1fr`

`vscode-css-data.json` is generated from the same tables by
`pnpm gen:css-data`, and `pnpm gen:css-data:check` (part of `pnpm lint`) fails when
it is stale
These modules run in the editor and the build only; an app's window bundle never
imports them

## At-rules without a WinUI meaning

`@supports`,
`@keyframes` and `@import` are build errors that say so

## What stays unsupported, and why

`unsupported-properties.ts` holds the reason shown for each property no group
handles
Declarations like these fail the build with it:

| Property | Why |
|---|---|
| `position`, `top`, `left`, `right`, `bottom`, `inset` in a style attribute | they are read from a component's `<style>` block (see Position); `right`, `bottom` and `position: sticky` have no WinUI counterpart |
| `filter`, `backdrop-filter`, `mix-blend-mode`, `mask`, `mask-image` in a style attribute | they are read from a component's `<style>` block, which opts the window into `winui-svelte/css/filter` (see Filters, blends and masks); `url()` filters, `mask-position`, `mask-size`, `mask-repeat` and `mask-mode` have no counterpart |
| `clip-path` as `rect()`, `xywh()` or `url()` | `inset()`, `circle()`, `ellipse()`, `polygon()` and `path()` have one (see Clip shapes) |
| `cursor` as a `url()` image, `none`, `copy`, `alias`, `zoom-in` and `zoom-out` | WinUI's cursors are the sixteen system shapes of `InputSystemCursorShape`; the other keywords have one (see Cursor) |
| `animation` without its module | see Animations |
| `animation-timeline` on a width, a color or a keyword, `timeline-scope`, `animation-timing-function` other than `linear` on a scroll-linked animation | Composition drives opacity, translate, scale and rotate from a scroll position, straight (see Scroll-driven animation) |
| `text-transform: uppercase`, `lowercase`, `capitalize` | the text an element shows is written through the change, in a `<text-block>`, a `<run>`, a button's content and the text of an inline element: the tree keeps the text as written, and the control reports the changed one (`none` is no change; an inherited transform is not: write it on the element that holds the text) |
| `user-select`, `object-fit`, `line-clamp` (`-webkit-line-clamp`), `word-break` | `IsTextSelectionEnabled`, an image's `Stretch` (`contain` is `Uniform`, `cover` `UniformToFill`; `scale-down` is an error), `MaxLines` (with `Wrap` and an ellipsis, which `text-wrap` and `text-overflow` override), `TextWrapping` |
| `caret-color`, `text-box-trim`, `background-clip: content-box` and `text` | the bindings have no `CaretBrush`, and no WinUI property trims the line box the way `text-box-trim` does; a WinUI background paints to the `OuterBorderEdge` (`border-box`) or the `InnerBorderEdge` (`padding-box`) only |
| `font-variation-settings` | WinUI has no API for a variable font's axes (see Typography) |
| `float`, `flex-wrap` other than `nowrap`, `content`, `list-style`, `text-indent` | no WinUI equivalent in a Style; each message names the nearest WinUI way |
| `text-transform: full-width` and `full-size-kana` | WinUI has no such transform of a string (`uppercase`, `lowercase` and `capitalize` work) |
| the container properties in an `@media`, in a stylesheet that is not a component, or on a container that is a component | the build lowers them against the component's markup; elsewhere the message says where they work |
