package dev.winui.svelte

import java.awt.Color
import kotlin.math.roundToInt

/** The documentation popup's drawings of colors (a gradient bar, a text sample, a material), as tables of cells. */
internal object ColorPreviewHtml {
  private const val BAR_CELLS = 32
  private const val BAR_CELL_WIDTH = 6
  private const val BAR_HEIGHT = 18
  private const val BYTE = 255.0
  private const val MATERIAL_WIDTH = 64
  private const val MATERIAL_HEIGHT = 28
  private const val LIGHT_GROUND = 0xF3F3F3
  private const val DARK_GROUND = 0x202020

  fun gradientBar(stops: List<GradientStop>): String {
    val cells =
      (0 until BAR_CELLS).joinToString("") { i ->
        val color = Gradients.colorAt(stops, i.toDouble() / (BAR_CELLS - 1))
        "<td bgcolor=\"${shown(color)}\" width=\"$BAR_CELL_WIDTH\" height=\"$BAR_HEIGHT\"></td>"
      }
    return "<table cellspacing=\"0\" cellpadding=\"0\"><tr>$cells</tr></table>"
  }

  fun stopList(stops: List<GradientStop>): String {
    val items =
      stops.joinToString("") {
        "<li><code>${it.color.toHexWithAlpha()}</code> at ${PreviewText.percent(it.position)}</li>"
      }
    return "<ul>$items</ul>"
  }

  fun sample(pair: ContrastPair) =
    "<table cellspacing=\"0\" cellpadding=\"6\"><tr><td bgcolor=\"${shown(pair.backgroundColor)}\">" +
      "<font color=\"${shown(
        pair.foregroundColor,
        pair.backgroundColor
      )}\" size=\"5\"><b>Aa Bb</b></font></td></tr></table>"

  fun material(material: WindowMaterial): String {
    val light = ResourceDocumentation.shownOver(material.light, LIGHT_GROUND)
    val dark = ResourceDocumentation.shownOver(material.dark, DARK_GROUND)
    return "<table cellspacing=\"4\"><tr>" +
      "<td bgcolor=\"$light\" width=\"$MATERIAL_WIDTH\" height=\"$MATERIAL_HEIGHT\">&nbsp;</td>" +
      "<td bgcolor=\"$dark\" width=\"$MATERIAL_WIDTH\" height=\"$MATERIAL_HEIGHT\">&nbsp;</td></tr></table>"
  }

  /** The color as `#rrggbb` once seen over [ground] (white by default), since the popup cannot show a transparency. */
  private fun shown(
    color: Color,
    ground: Color = Color.WHITE
  ): String {
    val alpha = color.alpha / BYTE

    fun mix(
      top: Int,
      under: Int
    ) = (top * alpha + under * (1 - alpha)).roundToInt()
    return "#%02x%02x%02x".format(
      mix(color.red, ground.red),
      mix(color.green, ground.green),
      mix(color.blue, ground.blue)
    )
  }
}
