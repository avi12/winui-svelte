package dev.winui.svelte

import kotlin.math.roundToInt

/** The documentation popup's drawings of motion: the easing curve as a plot of cells and the timeline of timings. */
internal object MotionPreviewHtml {
  private const val PLOT_ROWS = 8
  private const val PLOT_CELL = 6
  private const val TIMELINE_WIDTH = 220
  private const val BAR_HEIGHT = 18
  private const val ACCENT = "#0078d4"
  private const val DELAY = "#808080"

  fun curve(samples: List<Double>): String {
    val rows =
      (PLOT_ROWS - 1 downTo 0).joinToString("") { row ->
        val cells =
          samples.joinToString("") { sample ->
            val level = (sample.coerceIn(0.0, 1.0) * (PLOT_ROWS - 1)).roundToInt()
            val color =
              if (level == row) {
                " bgcolor=\"$ACCENT\""
              } else {
                ""
              }
            "<td$color width=\"$PLOT_CELL\" height=\"$PLOT_CELL\"></td>"
          }
        "<tr>$cells</tr>"
      }
    return "<table cellspacing=\"0\" cellpadding=\"0\" border=\"1\">$rows</table>"
  }

  fun timeline(timings: List<Timing>): String {
    val total = timings.maxOf { it.delayMs + it.durationMs }.coerceAtLeast(1.0)
    val rows =
      timings.joinToString("") { timing ->
        val delay = (timing.delayMs / total * TIMELINE_WIDTH).roundToInt()
        val duration = (timing.durationMs / total * TIMELINE_WIDTH).roundToInt().coerceAtLeast(1)
        val wait =
          if (delay > 0) {
            "<td width=\"$delay\" bgcolor=\"$DELAY\"></td>"
          } else {
            ""
          }
        "<tr><td>${nameOf(timing)}</td><td><table cellspacing=\"0\" cellpadding=\"0\"><tr>$wait" +
          "<td width=\"$duration\" height=\"$BAR_HEIGHT\" bgcolor=\"$ACCENT\"></td></tr></table></td></tr>"
      }
    val caption =
      timings.joinToString("<br>") {
        "${nameOf(it)}: ${PreviewText.millis(it.durationMs)} after ${PreviewText.millis(it.delayMs)}"
      }
    return "<table cellspacing=\"4\">$rows</table>$caption"
  }

  private fun nameOf(timing: Timing) = timing.name.ifEmpty { "animation" }
}
