package dev.winui.svelte

internal data class Timing(
  val name: String,
  val durationMs: Double,
  val delayMs: Double,
  val easing: String
)

/** The durations and delays a `transition` or an `animation` sets. */
internal object Timings {
  private const val MILLISECONDS = 1000.0
  private const val ANIMATION = "animation"
  private val time = Regex("""^(-?\d*\.?\d+)(ms|s)$""", RegexOption.IGNORE_CASE)
  private val properties = setOf("transition", ANIMATION)
  private val animationWords =
    setOf(
      "infinite",
      "normal",
      "reverse",
      "alternate",
      "alternate-reverse",
      "forwards",
      "backwards",
      "both",
      "none",
      "running",
      "paused"
    )

  /** Whether a property is a shorthand that sets timings. */
  fun isTimingProperty(property: String) = property in properties

  /** The timings a `transition` or `animation` value sets, one per comma: the first time is the duration, the second the delay. */
  fun of(
    property: String,
    value: String,
    named: List<NamedEasing>
  ): List<Timing> {
    if (!isTimingProperty(property)) {
      return emptyList()
    }

    return CssSplit.commas(value).mapNotNull { timingOf(it, named, property == ANIMATION) }
  }

  private fun millisecondsOf(word: String): Double? {
    val match = time.matchEntire(word) ?: return null
    val unit =
      when (match.groupValues[2].lowercase()) {
        "s" -> MILLISECONDS
        else -> 1.0
      }
    return match.groupValues[1].toDouble() * unit
  }

  private fun isTimingName(
    word: String,
    easing: String?
  ): Boolean {
    val isOther = millisecondsOf(word) != null || word == easing
    return !isOther && word !in animationWords && word.toDoubleOrNull() == null
  }

  private fun timingOf(
    item: String,
    named: List<NamedEasing>,
    isAnimation: Boolean
  ): Timing? {
    val words = CssSplit.words(item)
    val times = words.mapNotNull { millisecondsOf(it) }
    val easing = words.firstOrNull { Easings.namedSamples(it, named) != null || Easings.hasFunction(it) }
    val name = words.firstOrNull { isTimingName(it, easing) }
    val duration = times.firstOrNull() ?: return null
    val fallbackName =
      when {
        isAnimation -> ""
        else -> "all"
      }
    return Timing(name ?: fallbackName, duration, times.getOrElse(1) { 0.0 }, easing ?: "ease")
  }
}
