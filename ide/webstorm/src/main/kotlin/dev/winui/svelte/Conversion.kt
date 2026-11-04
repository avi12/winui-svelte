package dev.winui.svelte

sealed interface CssValue {
  data class Plain(
    val text: String,
    val label: String? = null
  ) : CssValue

  data class Conditional(
    val condition: String,
    val whenTrue: CssValue,
    val whenFalse: CssValue
  ) : CssValue
}

data class Leaf(
  val condition: String,
  val value: String,
  val modifier: String
)

private data class Guard(
  val text: String,
  val isNegated: Boolean
)

object Conversion {
  private val simpleCondition = Regex("""[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*""")
  private val lengthPattern = Regex("""-?(\d+(\.\d+)?|\.\d+)""")
  private val pixelPattern = Regex("""(-?(?:\d+(?:\.\d+)?|\.\d+))(?:px)?""")
  private val hexPattern = Regex("""#[0-9a-fA-F]+""")
  private val unsafeTextPattern = Regex("""["'{}\\;<>]""")
  private const val UNIT = "px"
  private const val TRANSPARENT = "transparent"
  private const val SHORT_HEX = 3
  private const val LONG_HEX = 6
  private const val ALPHA_HEX = 8
  private const val ALPHA_DIGITS = 2
  private const val XAML_SEPARATOR = ","
  private const val MAX_SIDES = 4

  fun convert(
    mapping: Mapping,
    value: PropValue
  ): CssValue? {
    if (value is PropValue.Conditional) {
      val whenTrue = convert(mapping, value.whenTrue) ?: return null
      val whenFalse = convert(mapping, value.whenFalse) ?: return null
      return CssValue.Conditional(value.condition, whenTrue, whenFalse)
    }

    val text =
      when (mapping.kind) {
        ConversionKind.KEYWORD -> keyword(mapping, value)
        ConversionKind.LENGTH -> length(value)
        ConversionKind.NUMBER -> number(value)
        ConversionKind.COLOR -> color(value)
        ConversionKind.THICKNESS -> sides(value, isCorner = false)
        ConversionKind.CORNER_RADIUS -> sides(value, isCorner = true)
        ConversionKind.TEXT -> plainText(value)
        ConversionKind.UNSUPPORTED -> null
      }
    val label =
      if (mapping.kind == ConversionKind.KEYWORD) {
        labelOf(value)
      } else {
        null
      }
    return text?.let { CssValue.Plain(it, label) }
  }

  fun togglesOf(
    mapping: Mapping,
    value: CssValue
  ): List<Leaf> = collect(value, emptyList(), mapping.cssProperty).filter { it.value != mapping.defaultValue }

  fun render(
    cssProperty: String,
    value: CssValue
  ): String =
    when (value) {
      is CssValue.Plain -> "style:$cssProperty=\"${value.text}\""
      is CssValue.Conditional -> "style:$cssProperty={${expression(value)}}"
    }

  private fun expression(value: CssValue): String =
    when (value) {
      is CssValue.Plain -> {
        "\"${value.text}\""
      }

      is CssValue.Conditional -> {
        "${value.condition} ? ${expression(value.whenTrue)} : ${expression(value.whenFalse)}"
      }
    }

  private fun labelOf(value: PropValue): String? =
    when (value) {
      is PropValue.Member -> value.name
      is PropValue.Text -> value.text.trim().takeIf { it.firstOrNull()?.isLetter() == true }
      else -> null
    }

  fun negated(condition: String): String =
    if (simpleCondition.matches(condition)) {
      "!$condition"
    } else {
      "!($condition)"
    }

  private fun collect(
    value: CssValue,
    path: List<Guard>,
    cssProperty: String
  ): List<Leaf> =
    when (value) {
      is CssValue.Plain -> {
        val modifier =
          value.label?.let { StyleBlock.kebab(it) }
            ?: "$cssProperty-${StyleBlock.slug(value.text.removeSuffix("px"))}"
        listOf(Leaf(conditionOf(path), value.text, modifier))
      }

      is CssValue.Conditional -> {
        collect(value.whenTrue, path + Guard(value.condition, isNegated = false), cssProperty) +
          collect(value.whenFalse, path + Guard(value.condition, isNegated = true), cssProperty)
      }
    }

  private fun conditionOf(path: List<Guard>): String =
    path.joinToString(" && ") { guard ->
      when {
        guard.isNegated -> negated(guard.text)
        path.size > 1 && !simpleCondition.matches(guard.text) -> "(${guard.text})"
        else -> guard.text
      }
    }

  private fun keyword(
    mapping: Mapping,
    value: PropValue
  ): String? {
    val key =
      when (value) {
        is PropValue.Text -> {
          value.text
        }

        is PropValue.Number -> {
          value.literal
        }

        is PropValue.Flag -> {
          if (value.isOn) {
            "True"
          } else {
            "False"
          }
        }

        is PropValue.Member -> {
          value.name.takeIf { value.qualifier in mapping.enumTypes }
        }

        else -> {
          null
        }
      }
    return key?.let { mapping.keywords[it.trim().lowercase()] }
  }

  private fun length(value: PropValue): String? {
    val literal = (value as? PropValue.Number)?.literal ?: return null
    return if (lengthPattern.matches(literal)) {
      "$literal$UNIT"
    } else {
      null
    }
  }

  private fun number(value: PropValue): String? {
    val literal = (value as? PropValue.Number)?.literal ?: return null
    return literal.takeIf { lengthPattern.matches(it) }
  }

  private fun plainText(value: PropValue): String? {
    val text = (value as? PropValue.Text)?.text?.trim() ?: return null
    return text.takeIf { it.isNotEmpty() && !unsafeTextPattern.containsMatchIn(it) }
  }

  private fun color(value: PropValue): String? {
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

  private fun pixels(tokens: List<String>): List<String>? {
    val numbers = tokens.map { pixelPattern.matchEntire(it.trim())?.groupValues?.get(1) }.filterNotNull()
    val isValid = numbers.size == tokens.size && numbers.isNotEmpty() && numbers.size <= MAX_SIDES
    return numbers.takeIf { isValid }
  }

  private fun sides(
    value: PropValue,
    isCorner: Boolean
  ): String? {
    val isXaml: Boolean
    val tokens: List<String>
    when (value) {
      is PropValue.Number -> {
        isXaml = false
        tokens = listOf(value.literal)
      }

      is PropValue.Tuple -> {
        isXaml = true
        tokens = value.numbers
      }

      is PropValue.Text -> {
        isXaml = value.text.contains(XAML_SEPARATOR)
        val separator =
          if (isXaml) {
            XAML_SEPARATOR
          } else {
            " "
          }
        tokens =
          value.text
            .trim()
            .split(separator)
            .filter { it.isNotBlank() }
      }

      else -> {
        return null
      }
    }
    val checked = pixels(tokens) ?: return null
    val ordered =
      if (isXaml && !isCorner) {
        xamlToCss(checked)
      } else {
        checked
      }
    return shortest(ordered).joinToString(" ") { "$it$UNIT" }
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
