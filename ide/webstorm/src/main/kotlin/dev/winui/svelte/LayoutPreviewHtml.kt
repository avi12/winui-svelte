package dev.winui.svelte

import kotlin.math.roundToInt

/** The documentation popup's drawings of layout: the box model, grid tracks and the shadow depth ladder. */
internal object LayoutPreviewHtml {
  private const val TRACKS_WIDTH = 220
  private const val PERCENT = 100.0
  private const val ACCENT = "#0078d4"
  private const val ELEMENT = "#808080"
  private const val LEVELS = 255
  private const val LEFT_INDEX = 3

  fun box(box: Box): String {
    val sides = box.values.map { PreviewText.number(it) }
    val (top, right, bottom) = sides
    val left = sides[LEFT_INDEX]
    return "<table border=\"1\" cellspacing=\"0\" cellpadding=\"8\">" +
      "<tr><td colspan=\"3\" align=\"center\">$top</td></tr>" +
      "<tr><td>$left</td><td bgcolor=\"$ELEMENT\" align=\"center\">${box.property}</td><td>$right</td></tr>" +
      "<tr><td colspan=\"3\" align=\"center\">$bottom</td></tr></table>"
  }

  fun tracks(tracks: List<GridTrack>): String {
    val cells =
      tracks.joinToString("") { track ->
        val percent = (track.share * PERCENT).roundToInt()
        val color =
          if (track.kind == TrackKind.PIXELS) {
            " bgcolor=\"$ACCENT\""
          } else {
            ""
          }
        val text =
          if (track.kind == TrackKind.AUTO) {
            "auto"
          } else {
            "${PreviewText.number(track.amount)}${track.kind.id}"
          }
        "<td$color width=\"$percent%\" align=\"center\">$text</td>"
      }
    return "<table border=\"1\" cellspacing=\"0\" cellpadding=\"6\" width=\"$TRACKS_WIDTH\"><tr>$cells</tr></table>"
  }

  fun ladder(
    steps: List<ShadowDepth>,
    nearest: Int
  ): String {
    val cells =
      steps.withIndex().joinToString("") { (i, step) ->
        val text =
          if (i == nearest) {
            "<b>${step.depth}</b>"
          } else {
            "${step.depth}"
          }
        "<td align=\"center\" bgcolor=\"${shade(i, steps.size)}\">$text<br>${step.use}</td>"
      }
    return "<table border=\"1\" cellspacing=\"0\" cellpadding=\"8\"><tr>$cells</tr></table>"
  }

  private fun shade(
    index: Int,
    count: Int
  ): String {
    val level = (LEVELS * (1 - (index + 1).toDouble() / (count + 1))).roundToInt()
    return "#%02x%02x%02x".format(level, level, level)
  }
}
