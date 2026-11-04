package dev.winui.svelte

internal object SidesValue {
  const val UNIT = "px"
  private const val XAML_SEPARATOR = ","
  private const val MAX_SIDES = 4
  private val pixelPattern = Regex("""(-?(?:\d+(?:\.\d+)?|\.\d+))(?:px)?""")

  fun convert(
    value: PropValue,
    isCorner: Boolean
  ): String? {
    val (tokens, isXaml) = tokensOf(value) ?: return null
    val checked = pixels(tokens) ?: return null
    val ordered =
      when {
        isXaml && !isCorner -> xamlToCss(checked)
        else -> checked
      }
    return shortest(ordered).joinToString(" ") { "$it$UNIT" }
  }

  private fun tokensOf(value: PropValue): Pair<List<String>, Boolean>? =
    when (value) {
      is PropValue.Number -> listOf(value.literal) to false
      is PropValue.Tuple -> value.numbers to true
      is PropValue.Text -> textTokens(value.text)
      else -> null
    }

  private fun textTokens(text: String): Pair<List<String>, Boolean> {
    val isXaml = text.contains(XAML_SEPARATOR)
    val separator =
      when {
        isXaml -> XAML_SEPARATOR
        else -> " "
      }
    return text.trim().split(separator).filter { it.isNotBlank() } to isXaml
  }

  private fun pixels(tokens: List<String>): List<String>? {
    val numbers = tokens.mapNotNull { pixelPattern.matchEntire(it.trim())?.groupValues?.get(1) }
    val isValid = numbers.size == tokens.size && numbers.isNotEmpty() && numbers.size <= MAX_SIDES
    return numbers.takeIf { isValid }
  }

  private fun xamlToCss(values: List<String>): List<String> {
    val left = values[0]
    val top = values.getOrElse(1) { left }
    val right = values.getOrElse(2) { left }
    val bottom = values.getOrElse(3) { top }
    return listOf(top, right, bottom, left)
  }

  private fun shortest(values: List<String>): List<String> {
    val top = values[0]
    val right = values.getOrElse(1) { top }
    val bottom = values.getOrElse(2) { top }
    val left = values.getOrElse(3) { right }
    return when {
      top == right && right == bottom && bottom == left -> listOf(top)
      top == bottom && right == left -> listOf(top, right)
      right == left -> listOf(top, right, bottom)
      else -> listOf(top, right, bottom, left)
    }
  }
}
