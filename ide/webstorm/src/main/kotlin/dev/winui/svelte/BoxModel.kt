package dev.winui.svelte

import kotlin.math.roundToLong

internal enum class BoxKind {
  SIDES,
  CORNERS
}

internal data class Box(
  val kind: BoxKind,
  val property: String,
  val values: List<Double>
)

internal enum class TrackKind(
  val id: String
) {
  PIXELS("px"),
  FRACTION("fr"),
  AUTO("auto")
}

internal data class GridTrack(
  val kind: TrackKind,
  val amount: Double,
  val share: Double
)

/** The values a box model diagram draws, in pixels, and the tracks of a grid with their share of a bar. */
internal object BoxModel {
  private val sideProperties = setOf("padding", "margin", "border-width")
  private val cornerProperties = setOf("border-radius")
  private val gridProperties = setOf("grid-template-columns", "grid-template-rows")
  private val fraction = Regex("""^(\d*\.?\d+)(fr|\*)$""", RegexOption.IGNORE_CASE)
  private const val STAR = "*"
  private const val MAX_VALUES = 4
  private const val THREE = 3
  private const val BAR_WIDTH = 240.0
  private const val AUTO_WIDTH = 48.0
  private const val FIXED_LIMIT = 150.0
  private const val SHARE_SCALE = 1000.0

  /** Whether the property is a grid track list. */
  fun isTrackProperty(property: String) = property in gridProperties

  /**
   * The four values of a `padding`, `margin`, `border-width` or `border-radius` written in pixels (one to four, in
   * CSS order) as top, right, bottom, left (corners: top left, top right, bottom right, bottom left); null when
   * the value uses any other unit, since WinUI's units are native pixels only.
   */
  fun boxOf(
    property: String,
    value: String
  ): Box? {
    val isBox = property in sideProperties || property in cornerProperties
    val pixels = CssSplit.words(value.replace(",", " ")).map { CssSplit.pixelsOf(it) }
    val isReadable = isBox && pixels.size in 1..MAX_VALUES && pixels.all { it != null }
    if (!isReadable) {
      return null
    }

    val kind =
      if (property in cornerProperties) {
        BoxKind.CORNERS
      } else {
        BoxKind.SIDES
      }
    return Box(kind, property, expanded(pixels.filterNotNull()))
  }

  /**
   * The tracks of a `grid-template-columns` or `-rows` value (or a `columns` or `rows` prop) made of `auto`, pixels
   * and `fr` (`*` counts as 1fr), each with its share of a bar: pixels as written (squeezed together when they pass
   * 150), auto a fixed width, the fractions the rest in proportion; null when any track is anything else.
   */
  fun tracksOf(value: String): List<GridTrack>? {
    val tracks = CssSplit.words(value.replace(",", " ")).map { trackOf(it) }
    val isReadable = tracks.isNotEmpty() && tracks.all { it != null }
    if (!isReadable) {
      return null
    }

    val read = tracks.filterNotNull()
    val fixed = read.filter { it.first == TrackKind.PIXELS }.sumOf { it.second }
    val fractions = read.filter { it.first == TrackKind.FRACTION }.sumOf { it.second }
    val scale =
      if (fixed > FIXED_LIMIT) {
        FIXED_LIMIT / fixed
      } else {
        1.0
      }
    val autos = read.count { it.first == TrackKind.AUTO }
    val rest = maxOf(BAR_WIDTH - fixed * scale - autos * AUTO_WIDTH, 0.0)
    val widths =
      read.map { (kind, amount) ->
        when (kind) {
          TrackKind.PIXELS -> amount * scale
          TrackKind.AUTO -> AUTO_WIDTH
          TrackKind.FRACTION -> rest * amount / fractions
        }
      }
    val total = widths.sum()
    return read.mapIndexed { i, (kind, amount) ->
      GridTrack(
        kind,
        amount,
        (widths[i] / total * SHARE_SCALE).roundToLong() / SHARE_SCALE
      )
    }
  }

  private fun expanded(values: List<Double>): List<Double> {
    val first = values[0]
    val second = values.getOrElse(1) { first }
    val third = values.getOrElse(2) { first }
    val fourth = values.getOrElse(THREE) { second }
    return listOf(
      first,
      second,
      third,
      if (values.size == THREE) {
        second
      } else {
        fourth
      }
    )
  }

  private fun trackOf(word: String): Pair<TrackKind, Double>? {
    val lower = word.lowercase()
    val match = fraction.matchEntire(lower)
    return when {
      lower == TrackKind.AUTO.id -> TrackKind.AUTO to 0.0
      lower == STAR || match != null -> TrackKind.FRACTION to (match?.groupValues?.get(1)?.toDouble() ?: 1.0)
      else -> CssSplit.pixelsOf(lower)?.let { TrackKind.PIXELS to it }
    }
  }
}
