package dev.winui.svelte

import com.intellij.ui.JBColor
import com.intellij.ui.scale.JBUIScale
import java.awt.BasicStroke
import java.awt.Component
import java.awt.Graphics
import java.awt.Graphics2D
import java.awt.RenderingHints
import javax.swing.Icon

/** A grey frame with a cross, drawn where a picture cannot be shown; the hover says why. */
internal class PlaceholderIcon(
  private val size: Int
) : Icon {
  override fun getIconWidth() = JBUIScale.scale(size)

  override fun getIconHeight() = JBUIScale.scale(size)

  override fun paintIcon(
    component: Component?,
    graphics: Graphics,
    x: Int,
    y: Int
  ) {
    val canvas = graphics.create() as Graphics2D
    try {
      canvas.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON)
      canvas.color = JBColor.GRAY
      canvas.stroke = BasicStroke(JBUIScale.scale(1f))
      val inset = iconWidth / INSET_DIVISOR
      val side = iconWidth - 2 * inset
      canvas.drawRect(x + inset, y + inset, side, side)
      canvas.drawLine(x + inset, y + inset, x + inset + side, y + inset + side)
      canvas.drawLine(x + inset + side, y + inset, x + inset, y + inset + side)
    } finally {
      canvas.dispose()
    }
  }

  private companion object {
    const val INSET_DIVISOR = 8
  }
}
