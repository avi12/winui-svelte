package dev.winui.svelte

import com.google.gson.JsonParser
import java.awt.Color
import kotlin.math.roundToInt

internal object CssColors {
  private const val HEX_RADIX = 16
  private const val BYTE = 255
  private const val SHORT_HEX = 3
  private const val SHORT_ALPHA_HEX = 4
  private const val LONG_HEX = 6
  private const val LONG_ALPHA_HEX = 8
  private const val DEGREES = 360f
  private const val PERCENT = 100f
  private const val HUE_SECTORS = 6
  private const val HUE_THIRD = 4
  private val hexPattern = Regex("""#([0-9a-fA-F]+)""")
  private val functionPattern = Regex("""(rgba?|hsla?)\(([^)]*)\)""", RegexOption.IGNORE_CASE)
  private val numberPattern = Regex("""-?\d*\.?\d+%?""")

  private val named: Map<String, String> by lazy {
    JsonParser
      .parseString(MappingResource.text)
      .asJsonObject
      .getAsJsonObject("namedColors")
      .entrySet()
      .associate { (name, hex) -> name to hex.asString }
  }

  fun parse(text: String): Color? {
    val value = text.trim().lowercase()
    named[value]?.let { return fromHex(it) }
    hexPattern.matchEntire(value)?.let { return fromHex(it.groupValues[1]) }
    return functionPattern.matchEntire(value)?.let { fromFunction(it.groupValues[1], it.groupValues[2]) }
  }

  private fun fromHex(digits: String): Color? {
    val expanded =
      when (digits.length) {
        in SHORT_HEX..SHORT_ALPHA_HEX -> digits.map { "$it$it" }.joinToString("")
        else -> digits
      }
    if (expanded.length != LONG_HEX && expanded.length != LONG_ALPHA_HEX) {
      return null
    }

    val channels = expanded.chunked(2).map { it.toInt(HEX_RADIX) }
    return Color(channels[0], channels[1], channels[2], channels.getOrElse(3) { BYTE })
  }

  private fun fromFunction(
    name: String,
    arguments: String
  ): Color? {
    val numbers = numberPattern.findAll(arguments).map { it.value }.toList()
    if (numbers.size < 3) {
      return null
    }

    val alpha = numbers.getOrNull(3)?.let { channel(it, 1f) } ?: 1f
    if (name.startsWith("rgb")) {
      val (red, green, blue) = numbers.take(3).map { channel(it, BYTE.toFloat()).toInt().coerceIn(0, BYTE) }
      return Color(red, green, blue, (alpha * BYTE).roundToInt().coerceIn(0, BYTE))
    }

    return hsl(numbers[0].removeSuffix("%").toFloat(), channel(numbers[1], 1f), channel(numbers[2], 1f), alpha)
  }

  private fun channel(
    text: String,
    full: Float
  ): Float {
    val isPercent = text.endsWith("%")
    val number = text.removeSuffix("%").toFloat()
    return when {
      isPercent -> number / PERCENT * full
      else -> number
    }
  }

  private fun hsl(
    hue: Float,
    saturation: Float,
    lightness: Float,
    alpha: Float
  ): Color {
    val chroma = (1 - kotlin.math.abs(2 * lightness - 1)) * saturation
    val sector = (hue % DEGREES + DEGREES) % DEGREES / (DEGREES / HUE_SECTORS)
    val second = chroma * (1 - kotlin.math.abs(sector % 2 - 1))
    val (red, green, blue) =
      when (sector.toInt()) {
        0 -> Triple(chroma, second, 0f)
        1 -> Triple(second, chroma, 0f)
        2 -> Triple(0f, chroma, second)
        3 -> Triple(0f, second, chroma)
        HUE_THIRD -> Triple(second, 0f, chroma)
        else -> Triple(chroma, 0f, second)
      }
    val shift = lightness - chroma / 2

    fun byte(value: Float) = ((value + shift) * BYTE).toInt().coerceIn(0, BYTE)
    return Color(byte(red), byte(green), byte(blue), (alpha * BYTE).roundToInt().coerceIn(0, BYTE))
  }
}
