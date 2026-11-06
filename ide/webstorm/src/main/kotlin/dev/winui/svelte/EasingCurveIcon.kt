package dev.winui.svelte

import com.intellij.ui.JBColor
import com.intellij.ui.scale.JBUIScale
import java.awt.BasicStroke
import java.awt.Color
import java.awt.Component
import java.awt.Graphics
import java.awt.Graphics2D
import java.awt.RenderingHints
import javax.swing.Icon

internal class EasingCurveIcon(
  private val samples: List<Double>
) : Icon {
  override fun getIconWidth() = JBUIScale.scale(SIZE)

  override fun getIconHeight() = JBUIScale.scale(SIZE)

  override fun paintIcon(
    component: Component?,
    graphics: Graphics,
    x: Int,
    y: Int
  ) {
    val canvas = graphics.create() as Graphics2D
    try {
      canvas.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON)
      canvas.color = JBColor.border()
      canvas.drawRect(x, y, iconWidth - 1, iconHeight - 1)
      canvas.color = ACCENT
      canvas.stroke = BasicStroke(JBUIScale.scale(STROKE))
      val last = samples.size - 1
      val inner = iconWidth - 2 * PADDING
      for (i in 1..last) {
        canvas.drawLine(
          pointX(x, i - 1, last, inner),
          pointY(y, samples[i - 1], inner),
          pointX(x, i, last, inner),
          pointY(y, samples[i], inner)
        )
      }
    } finally {
      canvas.dispose()
    }
  }

  private fun pointX(
    x: Int,
    i: Int,
    last: Int,
    inner: Int
  ) = x + PADDING + inner * i / last

  private fun pointY(
    y: Int,
    sample: Double,
    inner: Int
  ) = y + iconHeight - PADDING - (inner * sample).toInt()

  private companion object {
    const val SIZE = 14
    const val PADDING = 2
    const val STROKE = 1.5f
    val ACCENT = Color(0x00, 0x78, 0xd4)
  }
}
