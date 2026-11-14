package dev.winui.svelte

import kotlin.math.floor
import kotlin.math.min
import kotlin.math.roundToLong

private class LinearStop(
  val position: Double,
  val value: Double
)

/** The progress an easing function reaches at a point in time, and a curve of it sampled at 21 points. */
internal object EasingMath {
  const val SAMPLE_COUNT = 21
  private const val BEZIER_WEIGHT = 3
  private const val END_Y_INDEX = 3
  private const val SOLVER_STEPS = 40
  private const val SAMPLE_SCALE = 1000.0
  private const val PERCENT_DIVISOR = 100.0
  private val whitespace = Regex("""\s+""")

  fun bezier(points: List<Double>) = sampled { bezierY(points, it) }

  fun steps(
    count: Int,
    jump: String
  ) = sampled { stepsY(count, jump, it) }

  /** The `linear()` function: its stops are numbers with up to two percentages each; empty when it has no number. */
  fun linear(argumentsText: String): List<Double> {
    val stops = linearStops(argumentsText)
    return when {
      stops.isEmpty() -> emptyList()
      else -> sampled { linearY(stops, it) }
    }
  }

  private fun sampled(valueAt: (Double) -> Double) =
    List(SAMPLE_COUNT) { i -> (valueAt(i.toDouble() / (SAMPLE_COUNT - 1)) * SAMPLE_SCALE).roundToLong() / SAMPLE_SCALE }

  private fun bezierAt(
    parameter: Double,
    first: Double,
    second: Double
  ): Double {
    val inverse = 1 - parameter
    return BEZIER_WEIGHT * inverse * inverse * parameter * first +
      BEZIER_WEIGHT * inverse * parameter * parameter * second + parameter * parameter * parameter
  }

  private fun bezierY(
    points: List<Double>,
    progress: Double
  ): Double {
    var low = 0.0
    var high = 1.0
    repeat(SOLVER_STEPS) {
      val middle = (low + high) / 2
      val isBefore = bezierAt(middle, points[0], points[2]) < progress
      when {
        isBefore -> low = middle
        else -> high = middle
      }
    }

    return bezierAt((low + high) / 2, points[1], points[END_Y_INDEX])
  }

  private fun stepsY(
    count: Int,
    jump: String,
    progress: Double
  ): Double {
    val isStart = jump == "start" || jump == "both"
    val jumps =
      when (jump) {
        "both" -> count + 1
        "none" -> count - 1
        else -> count
      }
    val startOffset =
      when {
        isStart -> 1
        else -> 0
      }
    val raw = floor(progress * count).toInt() + startOffset
    val isEnd = progress >= 1
    val reached =
      when {
        isEnd -> jumps
        else -> min(raw, jumps)
      }
    return reached.toDouble() / jumps
  }

  private fun linearY(
    stops: List<LinearStop>,
    progress: Double
  ): Double {
    val after = stops.indexOfFirst { it.position >= progress }
    val next = stops.getOrNull(after) ?: return stops.lastOrNull()?.value ?: 1.0
    val previous = stops.getOrNull(after - 1) ?: return next.value
    val span = next.position - previous.position
    val rise = (next.value - previous.value) * (progress - previous.position)
    return when {
      span <= 0 -> next.value
      else -> previous.value + rise / span
    }
  }

  private fun linearStops(argumentsText: String): List<LinearStop> {
    val items =
      CssSplit.commas(argumentsText).mapNotNull { item ->
        val parts = item.split(whitespace)
        val value = parts.first().toDoubleOrNull() ?: return@mapNotNull null
        value to parts.drop(1).map { (it.removeSuffix("%").toDoubleOrNull() ?: Double.NaN) / PERCENT_DIVISOR }
      }
    val last = items.size - 1
    val stops = mutableListOf<LinearStop>()
    for ((i, item) in items.withIndex()) {
      val fallback =
        when (last) {
          0 -> 1.0
          else -> i.toDouble() / last
        }
      val position = item.second.firstOrNull() ?: fallback
      stops.add(LinearStop(maxOf(position, stops.lastOrNull()?.position ?: 0.0), item.first))
      item.second.getOrNull(1)?.let { stops.add(LinearStop(it, item.first)) }
    }

    return stops
  }
}
