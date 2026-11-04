package dev.winui.svelte

internal object ColorValue {
  private const val TRANSPARENT = "transparent"
  private const val SHORT_HEX = 3
  private const val LONG_HEX = 6
  private const val ALPHA_HEX = 8
  private const val ALPHA_DIGITS = 2
  private val hexPattern = Regex("""#[0-9a-fA-F]+""")

  fun convert(value: PropValue): String? {
    val text = (value as? PropValue.Text)?.text?.trim() ?: return null
    if (text.equals(TRANSPARENT, ignoreCase = true)) {
      return TRANSPARENT
    }

    if (!hexPattern.matches(text)) {
      return null
    }

    return when (text.length - 1) {
      SHORT_HEX, LONG_HEX -> text
      ALPHA_HEX -> "#${text.substring(1 + ALPHA_DIGITS)}${text.substring(1, 1 + ALPHA_DIGITS)}"
      else -> null
    }
  }
}
