package dev.winui.svelte

internal object GlyphDocumentation {
  private const val PREVIEW_SIZE = 40

  fun html(
    codePoint: Int,
    family: String
  ): String {
    val name =
      FluentGlyphs.codePoints.entries
        .filter { it.value == codePoint }
        .joinToString(", ") { it.key }
    return "<div style=\"font-family: '$family'; font-size: ${PREVIEW_SIZE}px;\">&#$codePoint;</div>" +
      "<p><b>$name</b> ${FluentGlyphs.label(codePoint)}</p>"
  }
}
