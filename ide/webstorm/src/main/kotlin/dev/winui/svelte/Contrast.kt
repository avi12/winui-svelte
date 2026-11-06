package dev.winui.svelte

import java.awt.Color
import kotlin.math.floor
import kotlin.math.pow

private class Rgb(
  val red: Double,
  val green: Double,
  val blue: Double
)

internal enum class ContrastVerdict(
  val label: String
) {
  AAA("AAA"),
  AA("AA"),
  AA_LARGE("AA large"),
  FAIL("fail")
}

internal data class ContrastPair(
  val foreground: CssDeclaration,
  val background: CssDeclaration,
  val foregroundColor: Color,
  val backgroundColor: Color,
  val ratio: Double
) {
  val verdict get() = Contrast.verdictOf(ratio)
  val label get() = "${Contrast.ratioText(ratio)} ${verdict.label}"
}

/** The WCAG 2 contrast of the colors a rule or a tag declares. */
internal object Contrast {
  private const val FOREGROUND = "color"
  private val backgrounds = setOf("background-color", "background")
  private const val BYTE = 255.0
  private const val LINEAR_THRESHOLD = 0.03928
  private const val LINEAR_DIVISOR = 12.92
  private const val GAMMA_OFFSET = 0.055
  private const val GAMMA_DIVISOR = 1.055
  private const val GAMMA_EXPONENT = 2.4
  private const val RED_WEIGHT = 0.2126
  private const val GREEN_WEIGHT = 0.7152
  private const val BLUE_WEIGHT = 0.0722
  private const val FLARE = 0.05
  private const val AAA_RATIO = 7.0
  private const val AA_RATIO = 4.5
  private const val AA_LARGE_RATIO = 3.0
  private const val TENTHS = 10.0
  private val white = Rgb(BYTE, BYTE, BYTE)

  /**
   * The ratio between a foreground and a background color, from 1 to 21. A translucent background is seen over white,
   * and a translucent foreground over that background.
   */
  fun ratio(
    foreground: Color,
    background: Color
  ): Double {
    val ground = over(background.toRgb(), background.alpha / BYTE, white)
    val text = over(foreground.toRgb(), foreground.alpha / BYTE, ground)
    val (lighter, darker) = listOf(luminanceOf(text), luminanceOf(ground)).sortedDescending()
    return (lighter + FLARE) / (darker + FLARE)
  }

  /** The WCAG level a ratio reaches: AAA from 7, AA from 4.5, AA for large text from 3. */
  fun verdictOf(ratio: Double) =
    when {
      ratio >= AAA_RATIO -> ContrastVerdict.AAA
      ratio >= AA_RATIO -> ContrastVerdict.AA
      ratio >= AA_LARGE_RATIO -> ContrastVerdict.AA_LARGE
      else -> ContrastVerdict.FAIL
    }

  /** The ratio cut, never rounded up, to a tenth: `4.8:1`. */
  fun ratioText(ratio: Double) = "%.1f:1".format(java.util.Locale.ROOT, floor(ratio * TENTHS) / TENTHS)

  /** The pair a rule or a tag declares, or null when it declares only one of the colors, or one that is not plain. */
  fun ofGroup(group: List<CssDeclaration>): ContrastPair? {
    val foreground = group.lastOrNull { it.property == FOREGROUND && CssColors.parse(it.value) != null }
    val background = group.lastOrNull { it.property in backgrounds && CssColors.parse(it.value) != null }
    val foregroundColor = foreground?.let { CssColors.parse(it.value) }
    val backgroundColor = background?.let { CssColors.parse(it.value) }
    val isIncomplete = foreground == null || background == null || foregroundColor == null || backgroundColor == null
    if (isIncomplete) {
      return null
    }

    return ContrastPair(
      foreground,
      background,
      foregroundColor,
      backgroundColor,
      ratio(foregroundColor, backgroundColor)
    )
  }

  private fun Color.toRgb() = Rgb(red.toDouble(), green.toDouble(), blue.toDouble())

  private fun over(
    top: Rgb,
    alpha: Double,
    below: Rgb
  ) = Rgb(
    top.red * alpha + below.red * (1 - alpha),
    top.green * alpha + below.green * (1 - alpha),
    top.blue * alpha + below.blue * (1 - alpha)
  )

  private fun linear(channel: Double): Double {
    val unit = channel / BYTE
    return if (unit <=
      LINEAR_THRESHOLD
    ) {
      unit / LINEAR_DIVISOR
    } else {
      ((unit + GAMMA_OFFSET) / GAMMA_DIVISOR).pow(GAMMA_EXPONENT)
    }
  }

  private fun luminanceOf(color: Rgb) =
    RED_WEIGHT * linear(color.red) + GREEN_WEIGHT * linear(color.green) + BLUE_WEIGHT * linear(color.blue)
}
