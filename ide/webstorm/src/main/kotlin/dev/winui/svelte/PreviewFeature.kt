package dev.winui.svelte

/** The CSS and layout previews, each with its own setting; the id is the key the settings and the manifest use. */
internal enum class PreviewFeature(
  val id: String,
  val label: String,
  val description: String
) {
  GRADIENT(
    "gradient",
    "Gradient bar",
    "A bar of the stops beside linear-gradient(), radial-gradient() and a LinearGradientBrush"
  ),
  CONTRAST(
    "contrast",
    "Contrast ratio",
    "The WCAG ratio and its AA or AAA verdict after a text color that sits with a background color"
  ),
  EASING(
    "easing",
    "Easing curve",
    "The curve of an easing beside its value, and the timeline of a transition or animation"
  ),
  BOX(
    "box",
    "Box model and grid tracks",
    "The box model of padding, margin, border-width and border-radius, and grid tracks, in pixels"
  ),
  DECLARATION(
    "declaration",
    "What a declaration becomes",
    "The WinUI property a CSS declaration sets, or why it has no meaning"
  ),
  MEDIA("media", "Media query answer", "Whether an @media condition holds in the assumed environment"),
  SHADOW(
    "shadow",
    "Shadow depth and material",
    "The shadow depth ladder of -winui-elevation and box-shadow, and the material of a backdrop"
  ),
  PICTURE(
    "picture",
    "Picture previews",
    "The picture beside the path of an icon or image (a tray menu item, a thumbnail button, an Image source), larger in the popup"
  )
}
