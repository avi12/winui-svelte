package dev.winui.svelte

internal object Conversion {
  private val lengthPattern = Regex("""-?(\d+(\.\d+)?|\.\d+)""")
  private val unsafeTextPattern = Regex("""["'{}\\;<>]""")

  fun convert(
    mapping: Mapping,
    value: PropValue
  ): CssValue? {
    if (value is PropValue.Conditional) {
      val whenTrue = convert(mapping, value.whenTrue) ?: return null
      val whenFalse = convert(mapping, value.whenFalse) ?: return null
      return CssValue.Conditional(value.condition, whenTrue, whenFalse)
    }

    val text = textOf(mapping, value) ?: return null
    val isKeyword = mapping.kind == ConversionKind.KEYWORD
    return CssValue.Plain(text, labelOf(value).takeIf { isKeyword })
  }

  private fun textOf(
    mapping: Mapping,
    value: PropValue
  ) = when (mapping.kind) {
    ConversionKind.KEYWORD -> keyword(mapping, value)
    ConversionKind.LENGTH -> number(value)?.let { "$it${SidesValue.UNIT}" }
    ConversionKind.NUMBER -> number(value)
    ConversionKind.COLOR -> ColorValue.convert(value)
    ConversionKind.THICKNESS -> SidesValue.convert(value, isCorner = false)
    ConversionKind.CORNER_RADIUS -> SidesValue.convert(value, isCorner = true)
    ConversionKind.TEXT -> plainText(value)
    ConversionKind.UNSUPPORTED -> null
  }

  private fun labelOf(value: PropValue) =
    when (value) {
      is PropValue.Member -> value.name
      is PropValue.Text -> value.text.trim().takeIf { it.firstOrNull()?.isLetter() == true }
      else -> null
    }

  private fun keyword(
    mapping: Mapping,
    value: PropValue
  ): String? {
    val key =
      when (value) {
        is PropValue.Text -> value.text
        is PropValue.Number -> value.literal
        is PropValue.Flag -> flagKey(value)
        is PropValue.Member -> value.name.takeIf { value.qualifier in mapping.enumTypes }
        else -> null
      }
    return key?.let { mapping.keywords[it.trim().lowercase()] }
  }

  private fun flagKey(flag: PropValue.Flag) =
    when {
      flag.isOn -> "True"
      else -> "False"
    }

  private fun number(value: PropValue): String? {
    val literal = (value as? PropValue.Number)?.literal ?: return null
    return literal.takeIf { lengthPattern.matches(it) }
  }

  private fun plainText(value: PropValue): String? {
    val text = (value as? PropValue.Text)?.text?.trim() ?: return null
    return text.takeIf { it.isNotEmpty() && !unsafeTextPattern.containsMatchIn(it) }
  }
}
