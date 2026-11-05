package dev.winui.svelte

internal data class ColorSpot(
  val offset: Int,
  val text: String
)

internal object ColorSpots {
  private const val STYLE = "style"
  private const val STYLE_DIRECTIVE = "style:"

  fun of(
    attributeName: String,
    value: String,
    table: ConversionTable
  ): List<ColorSpot> {
    val mapping = table.mappingOf(attributeName)
    if (mapping?.kind == ConversionKind.COLOR) {
      return listOfNotNull(spotOf(value, 0))
    }

    if (attributeName.startsWith(STYLE_DIRECTIVE)) {
      val isColor = table.isColorProperty(attributeName.removePrefix(STYLE_DIRECTIVE))
      return when {
        isColor -> listOfNotNull(spotOf(value, 0))
        else -> emptyList()
      }
    }

    if (attributeName != STYLE) {
      return emptyList()
    }

    return declarationsOf(
      value
    ).filter { (property, _) -> table.isColorProperty(property) }.mapNotNull { (_, spot) -> spot }
  }

  private fun declarationsOf(style: String): List<Pair<String, ColorSpot?>> {
    var start = 0
    return style.split(";").mapNotNull { declaration ->
      val declarationStart = start
      start += declaration.length + 1
      val colon = declaration.indexOf(':')
      if (colon == -1) {
        return@mapNotNull null
      }

      val property = declaration.substring(0, colon).trim().lowercase()
      property to spotOf(declaration.substring(colon + 1), declarationStart + colon + 1)
    }
  }

  private fun spotOf(
    text: String,
    offset: Int
  ): ColorSpot? {
    val leading = text.length - text.trimStart().length
    val trimmed = text.trim().removeSuffix("!important").trim()
    return trimmed.takeIf { CssColors.parse(it) != null }?.let { ColorSpot(offset + leading, it) }
  }
}
