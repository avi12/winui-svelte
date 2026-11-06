package dev.winui.svelte

internal data class EasingCurve(
  val text: String,
  val start: Int,
  val end: Int,
  val samples: List<Double>
)

/** The curve an easing a value writes draws. */
internal object Easings {
  private const val BEZIER_POINTS = 4
  private val function = Regex("""(?<name>cubic-bezier|linear|steps)\(""", RegexOption.IGNORE_CASE)
  private val keySpline = Regex("""^\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s+(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*$""")
  private val token = Regex("""\s+|\S+""")
  private val easingProperties = setOf("transition-timing-function", "animation-timing-function")

  /**
   * The first easing a value writes as the curve it draws (21 samples of progress against time): a `cubic-bezier()`,
   * `steps()` or `linear()` function, or a named easing of the data set; null when it writes none.
   */
  fun of(
    value: String,
    named: List<NamedEasing>
  ): EasingCurve? {
    val match = function.find(value)
    if (match != null) {
      val open = match.range.last
      val end = CssSplit.closingIndex(value, open)
      val name =
        match.groups["name"]
          ?.value
          .orEmpty()
          .lowercase()
      val samples =
        when (end) {
          -1 -> null
          else -> functionSamples(name, value.substring(open + 1, end - 1))
        }
      return samples?.let { EasingCurve(value.substring(match.range.first, end), match.range.first, end, it) }
    }

    return token.findAll(value).firstNotNullOfOrNull { word ->
      namedSamples(word.value, named)?.let { EasingCurve(word.value, word.range.first, word.range.last + 1, it) }
    }
  }

  /** The curve of a `KeySpline` value such as `0.1,0.9 0.2,1`, or null when it is not four numbers. */
  fun keySplineOf(value: String): List<Double>? {
    val points =
      keySpline
        .matchEntire(value)
        ?.groupValues
        ?.drop(1)
        ?.map { it.toDouble() } ?: return null
    return EasingMath.bezier(points)
  }

  /** The curve of a named easing (`ease`, `step-end`), or null when the word names none. */
  fun namedSamples(
    word: String,
    named: List<NamedEasing>
  ): List<Double>? {
    val easing = named.firstOrNull { it.name == word.lowercase() } ?: return null
    return when (easing.kind) {
      EasingKind.BEZIER -> EasingMath.bezier(easing.points)
      EasingKind.STEPS -> EasingMath.steps(easing.count, easing.jump)
    }
  }

  /** Whether a function name (`cubic-bezier`, `steps`, `linear`) is in the text. */
  fun hasFunction(word: String) = function.containsMatchIn(word)

  /** Whether a property writes an easing: the shorthands and the timing-function longhands. */
  fun isEasingProperty(property: String) = Timings.isTimingProperty(property) || property in easingProperties

  private fun functionSamples(
    name: String,
    argumentsText: String
  ): List<Double>? {
    val parts = CssSplit.commas(argumentsText)
    return when (name) {
      "cubic-bezier" -> bezierSamples(parts)
      "steps" -> stepsSamples(parts)
      else -> EasingMath.linear(argumentsText).takeIf { it.isNotEmpty() }
    }
  }

  private fun bezierSamples(parts: List<String>): List<Double>? {
    val points = parts.mapNotNull { it.toDoubleOrNull() }
    val isValid = parts.size == BEZIER_POINTS && points.size == BEZIER_POINTS
    return points.takeIf { isValid }?.let { EasingMath.bezier(it) }
  }

  private fun stepsSamples(parts: List<String>): List<Double>? {
    val count = parts.firstOrNull()?.toIntOrNull() ?: return null
    val jump = parts.getOrElse(1) { "end" }.replace("jump-", "")
    return EasingMath.steps(count, jump).takeIf { count > 0 }
  }
}
