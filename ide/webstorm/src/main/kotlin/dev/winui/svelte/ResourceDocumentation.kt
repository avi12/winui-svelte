package dev.winui.svelte

import java.awt.Color
import kotlin.math.roundToInt

internal object ResourceDocumentation {
  private const val LIGHT_GROUND = 0xF3F3F3
  private const val DARK_GROUND = 0x202020
  private const val BYTE_FLOAT = 255f
  private const val SWATCH_WIDTH = 64
  private const val SWATCH_HEIGHT = 28
  private const val FOLLOWS_SYSTEM = "follows the system"

  fun html(resource: WinuiResource): String {
    val heading = "<b>${resource.name}</b> ${resource.kind}"
    if (!resource.isColor) {
      return "<p>$heading</p>"
    }

    val cells = swatchCell(resource.light, LIGHT_GROUND) + swatchCell(resource.dark, DARK_GROUND)
    val values = "light ${resource.light ?: FOLLOWS_SYSTEM}, dark ${resource.dark ?: FOLLOWS_SYSTEM}"
    return "<table cellspacing=\"4\"><tr>$cells</tr></table><p>$heading<br>$values</p>"
  }

  private fun swatchCell(
    css: String?,
    ground: Int
  ) = "<td bgcolor=\"${shownOver(css, ground)}\" width=\"$SWATCH_WIDTH\" height=\"$SWATCH_HEIGHT\">&nbsp;</td>"

  /** The color as `#rrggbb` once drawn over the theme's ground, since the documentation cannot show a transparency. */
  fun shownOver(
    css: String?,
    ground: Int
  ): String {
    val below = Color(ground)
    val color = css?.let { CssColors.parse(it) } ?: below
    val alpha = color.alpha / BYTE_FLOAT
    val channels =
      listOf(color.red to below.red, color.green to below.green, color.blue to below.blue).map { (top, under) ->
        (top * alpha + under * (1 - alpha)).roundToInt()
      }
    return "#%02x%02x%02x".format(channels[0], channels[1], channels[2])
  }
}
