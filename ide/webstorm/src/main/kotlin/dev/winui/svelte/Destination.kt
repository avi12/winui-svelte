package dev.winui.svelte

internal enum class Destination(
  val label: String
) {
  STYLE_BLOCK("<style> block"),
  STYLE_DIRECTIVE("style: directive")
}
