package dev.winui.svelte

import java.awt.Color
import kotlin.math.max
import kotlin.math.roundToInt

private class RawStop(
  val color: Color,
  val position: Double?
)

/**
 * The gradients written as `linear-gradient()` or `radial-gradient()` in a CSS value, or as a `LinearGradientBrush`
 * or `RadialGradientBrush` of `GradientStop`s in markup. A stop whose position is not a percentage is spaced evenly,
 * as one with none is; the library's parser (src/css/parse/gradients.ts) is the reference for what a gradient means.
 */
internal object Gradients {
  private val function = Regex("""(?:repeating-)?(linear|radial)-gradient\(""", RegexOption.IGNORE_CASE)
  private val brush = Regex("""<(Linear|Radial)GradientBrush\b[^>]*>(?<body>[\s\S]*?)</\1GradientBrush>""")
  private val gradientStop = Regex("""<GradientStop\b(?<attributes>[^>]*?)/?>""")
  private val colorAttribute = Regex("""\bcolor=["'{]+\s*["']?(?<value>[^"'}]+)""", RegexOption.IGNORE_CASE)
  private val offsetAttribute = Regex("""\boffset=["'{]+\s*["']?(?<value>[^"'}]+)""", RegexOption.IGNORE_CASE)
  private val percent = Regex("""^(-?\d*\.?\d+)%$""")
  private const val PERCENT_DIVISOR = 100.0
  private const val POSITION_SCALE = 10_000.0
  private const val MIN_STOPS = 2

  fun of(value: String): List<GradientPreview> =
    function
      .findAll(value)
      .mapNotNull { match ->
        val open = match.range.last
        val end = CssSplit.closingIndex(value, open)
        val isUnclosed = end == -1
        if (isUnclosed) {
          return@mapNotNull null
        }

        val items = CssSplit.commas(value.substring(open + 1, end - 1))
        val first = CssSplit.words(items.firstOrNull().orEmpty()).firstOrNull().orEmpty()
        val hasDirection = CssColors.parse(first) == null
        val kind =
          if (match.groupValues[1].lowercase() ==
            GradientKind.RADIAL.label
          ) {
            GradientKind.RADIAL
          } else {
            GradientKind.LINEAR
          }
        preview(
          kind,
          colorStops(
            if (hasDirection) {
              items.drop(1)
            } else {
              items
            }
          ),
          match.range.first,
          end
        )
      }.toList()

  fun brushes(text: String): List<GradientPreview> =
    brush
      .findAll(text)
      .mapNotNull { match ->
        val kind =
          if (match.groupValues[1] == "Radial") {
            GradientKind.RADIAL
          } else {
            GradientKind.LINEAR
          }
        preview(kind, xamlStops(match.groups["body"]?.value.orEmpty()), match.range.first, match.range.last + 1)
      }.toList()

  /** The color at [progress] from 0 to 1 along the stops, mixed straight in RGBA. */
  fun colorAt(
    stops: List<GradientStop>,
    progress: Double
  ): Color {
    val after = stops.indexOfFirst { it.position >= progress }
    val next = stops.getOrNull(after) ?: return stops.last().color
    val previous = stops.getOrNull(after - 1) ?: return next.color
    val span = next.position - previous.position
    val share =
      if (span <= 0) {
        1.0
      } else {
        (progress - previous.position) / span
      }

    fun mix(
      from: Int,
      to: Int
    ) = (from + (to - from) * share).roundToInt()
    return Color(
      mix(previous.color.red, next.color.red),
      mix(previous.color.green, next.color.green),
      mix(previous.color.blue, next.color.blue),
      mix(previous.color.alpha, next.color.alpha)
    )
  }

  private fun positionOf(word: String): Double? {
    val number =
      percent
        .matchEntire(word)
        ?.groupValues
        ?.get(1)
        ?.toDouble()
    if (number != null) {
      return number / PERCENT_DIVISOR
    }

    return if (word == "0") {
      0.0
    } else {
      null
    }
  }

  private fun colorStops(items: List<String>) =
    items.flatMap { item ->
      val words = CssSplit.words(item)
      val color = CssColors.parse(words.firstOrNull().orEmpty()) ?: return@flatMap emptyList()
      val places = words.drop(1).map { positionOf(it) }
      when {
        places.size > 1 -> places.map { RawStop(color, it) }
        else -> listOf(RawStop(color, places.firstOrNull()))
      }
    }

  private fun xamlStops(body: String) =
    gradientStop
      .findAll(body)
      .mapNotNull { stop ->
        val attributes = stop.groups["attributes"]?.value.orEmpty()
        val color =
          CssColors.parse(
            colorAttribute
              .find(attributes)
              ?.groups
              ?.get("value")
              ?.value
              .orEmpty()
          )
            ?: return@mapNotNull null
        RawStop(
          color,
          offsetAttribute
            .find(attributes)
            ?.groups
            ?.get("value")
            ?.value
            ?.trim()
            ?.toDoubleOrNull()
        )
      }.toList()

  private fun preview(
    kind: GradientKind,
    stops: List<RawStop>,
    start: Int,
    end: Int
  ): GradientPreview? {
    val hasStops = stops.size >= MIN_STOPS
    return if (hasStops) {
      GradientPreview(kind, start, end, resolved(stops))
    } else {
      null
    }
  }

  private fun anchorOf(
    i: Int,
    last: Int
  ) = when (i) {
    0 -> 0.0
    last -> 1.0
    else -> null
  }

  private fun resolved(stops: List<RawStop>): List<GradientStop> {
    val last = stops.size - 1
    val anchored = stops.mapIndexed { i, stop -> stop.position ?: anchorOf(i, last) }
    var ceiling = 0.0
    val positions = mutableListOf<Double>()
    for ((i, position) in anchored.withIndex()) {
      if (position == null) {
        val next = anchored.indices.first { it > i && anchored[it] != null }
        val gap = next - (positions.size - 1)
        val target = max(anchored[next] ?: 1.0, ceiling)
        ceiling += (target - ceiling) / gap
        positions.add(ceiling)
        continue
      }

      ceiling = max(ceiling, position)
      positions.add(ceiling)
    }

    return stops.mapIndexed { i, stop ->
      GradientStop(
        stop.color,
        (positions[i] * POSITION_SCALE).roundToInt() / POSITION_SCALE
      )
    }
  }
}
