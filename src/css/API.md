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
import { cssHash } from "winui-svelte/css/sheet-module";

svelte({ compilerOptions: { cssHash, ...theRest } })   // the SAME options below
winuiCss({ root, compilerOptions: { cssHash, ...theRest }, runtimeModule: "winui-svelte/css" })
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
`cssHash` is exported because Svelte's default scoping class depends on
`rootDir`; the component and its sheet must agree on it

Without Vite (tests, the window kit), `compileSheetModule({ filename, source,
sheetId, resources, runtimeModule })` returns the module's code (or null for no
`<style>`); append it to the compiled component

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
The component's own compile gets the instance's `class` with the scope class
added (`class="title svelte-x"`, `class={[expr, "svelte-x"]}`; `scopeClassOf`
and `scopedMarkup` in `runtime/sheet-module.ts`), so the Style registered
under `.title.svelte-<hash>` matches only this component's `.title`
The hash comes from the file's path, so an edit re-registers the sheet and
re-scopes the markup with no stale class
A parent's scope does not reach the inside of a child; a child that forwards
its `class` prop to an element gets the scope class with the value, so
`clsx`-style arrays and objects are the way to pass classes on
With a spread and no `class` attribute the scope class goes before the spread,
so a `class` inside the spread replaces it

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
Properties the translation writes outside the Style (effects, grid tracks,
dynamic lengths) have no prop to compete with
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

| Module | Properties | Section |
|---|---|---|
| `winui-svelte/css/gradients` | `background-image` | Gradients |
| `winui-svelte/css/transform` | `transform`, `translate`, `scale`, `rotate`, `transform-origin`, `transition` | Transforms |
| `winui-svelte/css/animation` | `animation`, `animation-*`, `@keyframes` | Animations |
| `winui-svelte/css/effects` | `clip-path: inset()`, `aspect-ratio` | Clip and aspect ratio |
| `winui-svelte/css/focus` | `outline`, `outline-offset` | Focus ring |
| `winui-svelte/css/surface` | `-winui-elevation`, `backdrop-filter` | Elevation and backdrop |
| `winui-svelte/css/position` | `position`, `top`, `left`, `right`, `bottom`, `inset` | Position |
| `winui-svelte/css/queries` | `@media`, `@container` and `@starting-style` rules (a group with no property of its own) | Responsive rules |
| `winui-svelte/css/environment` | the `@media` features beyond the size (preferences, display, input; a group with no property of its own) | Media features |
| `winui-svelte/css/compat` | `text-transform`, `word-break`, `user-select`, `object-fit`, `line-clamp`, `box-sizing`, `cursor` (ignored) | Unsupported |
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
@keyframes pulse { from { opacity: 1 } 50% { opacity: 0.4 } to { opacity: 1 } }
.badge { animation: pulse 1.2s ease-in-out infinite }
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

`solid` and `auto` are the styles; the others are errors
`UseSystemFocusVisuals`
exists on a `Control` and not on other types, so a write sets it where the
element has it
The module is `winui-svelte/css/focus`

```css
button:focus-visible { outline: 2px solid #0af; outline-offset: 2px }
.quiet { outline: none }
```

## Elevation and backdrop: `-winui-elevation`, `box-shadow`, `backdrop-filter`

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

`backdrop-filter: blur(<length>px)` makes the Background an `AcrylicBrush`,
which blurs what is behind the element
The brush has a blur of its own, so the
radius is ignored (a warning says so); the tint is the element's literal
`background-color`, its alpha the `TintOpacity`
Without a `background-color` the
acrylic is untinted
Other filter functions are errors, and so is `filter`

```css
.card { -winui-elevation: 16px }
.sheet { background-color: rgba(32, 32, 32, 0.6); backdrop-filter: blur(20px) }
```

Both are in `winui-svelte/css/surface`

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
| `flex-wrap` | none | error: WinUI has no wrapping panel |
| `align-self`, `justify-self`, `place-self` | `VerticalAlignment`, `HorizontalAlignment` (`start` is Top / Left) | on the child |
| `align-items`, `justify-items`, `place-items`, `justify-content`, `align-content` | each child's `align-self` / `justify-self`, or spacer tracks | lowered into the children by the build (see Containers) |
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
(`(prefers-reduced-motion)`), and the units px, em, rem, dppx, x, dpi, dpcm and
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
| `color-gamut` | keyword | srgb, or what the app supplies: the display's advanced color info needs QueryDisplayConfig and DisplayConfigGetDeviceInfo (DISPLAYCONFIG_GET_ADVANCED_COLOR_INFO) through native structs, which the bindings do not wrap yet |
| `dynamic-range`, `video-dynamic-range` | keyword | standard, or what the app supplies: the display's advanced color info needs QueryDisplayConfig and DisplayConfigGetDeviceInfo (DISPLAYCONFIG_GET_ADVANCED_COLOR_INFO) through native structs, which the bindings do not wrap yet |
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
| `prefers-reduced-data` | keyword | no-preference, or what the app supplies: Windows.Networking.Connectivity.NetworkInformation is not in the generated bindings (only ConnectionCost is) |
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
- `rgb(from <origin> r g b / 50%)`, and `hsl`, `hwb`, `lab`, `lch`, `oklab`, `oklch`
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

A percentage that is not a length stays: `opacity: 70%`, gradient stops, colors,
`transform-origin`, keyframe selectors, and `width: 100%` (a stretching element fills)

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

A diagnostic is `{ code, severity, message, filename, start, end, frame, suggestion }`
with Svelte's position shape (`line` from 1, `column` from 0, `character`)
The codes: `unsupported-property`, `unsupported-at-rule`, `unsupported-unit`,
`unsupported-grid-track`, `partial-support` (a warning) and
`invalid-css`
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
| `box-shadow` | `ThemeShadow` takes no blur, offset, spread or color: use `-winui-elevation` |
| `filter`, `mix-blend-mode`, `mask`, `mask-image` | blur, grayscale, brightness, drop-shadow, blend modes and opacity masks are Composition effects on a visual over the element, which a Style cannot attach or aim at a sibling. Call `applyEffect` of `winui-svelte/win2d` from an attachment (see Win2D in the API), or use `backdrop-filter: blur()` or an acrylic or Mica backdrop |
| `clip-path` other than `inset()` (circle, ellipse, polygon, path), `inset(... round ...)` | `UIElement.Clip` is a `RectangleGeometry` with square corners |
| `cursor` | accepted and ignored with a warning: `IUIElementProtected.ProtectedCursor` is in the bindings, but the `InputCursor` it takes can only be made by `Microsoft.UI.Input.InputSystemCursor.Create(InputSystemCursorShape)`, and the bindings have neither `InputSystemCursor` nor `InputSystemCursorShape` (add them to the bindings and it becomes a write like the others) |
| `animation` without its module | see Animations |
| `text-transform: uppercase`, `lowercase`, `capitalize` | the text an element shows is written through the change, in a `<text-block>`, a `<run>`, a button's content and the text of an inline element: the tree keeps the text as written, and the control reports the changed one (`none` is no change; an inherited transform is not: write it on the element that holds the text) |
| `user-select`, `object-fit`, `line-clamp` (`-webkit-line-clamp`), `word-break` | `IsTextSelectionEnabled`, an image's `Stretch` (`contain` is `Uniform`, `cover` `UniformToFill`; `scale-down` is an error), `MaxLines` (with `Wrap` and an ellipsis, which `text-wrap` and `text-overflow` override), `TextWrapping` |
| `float`, `flex-wrap` other than `nowrap`, `content`, `list-style`, `text-indent` | no WinUI equivalent in a Style; each message names the nearest WinUI way |
| `text-transform: full-width` and `full-size-kana` | WinUI has no such transform of a string (`uppercase`, `lowercase` and `capitalize` work) |
| the container properties in an `@media`, in a stylesheet that is not a component, or on a container that is a component | the build lowers them against the component's markup; elsewhere the message says where they work |
