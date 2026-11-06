package dev.winui.svelte

import com.intellij.ui.JBColor
import com.intellij.ui.scale.JBUIScale
import java.awt.Component
import java.awt.Graphics
import java.awt.Graphics2D
import javax.swing.Icon

internal class GradientBarIcon(
  private val stops: List<GradientStop>
) : Icon {
  override fun getIconWidth() = JBUIScale.scale(WIDTH)

  override fun getIconHeight() = JBUIScale.scale(HEIGHT)

  override fun paintIcon(
    component: Component?,
    graphics: Graphics,
    x: Int,
    y: Int
  ) {
    val canvas = graphics.create() as Graphics2D
    try {
      for (column in 0 until iconWidth) {
        canvas.color = Gradients.colorAt(stops, column.toDouble() / (iconWidth - 1))
        canvas.fillRect(x + column, y, 1, iconHeight)
      }

      canvas.color = JBColor.border()
      canvas.drawRect(x, y, iconWidth - 1, iconHeight - 1)
    } finally {
      canvas.dispose()
    }
  }

  private companion object {
    const val WIDTH = 36
    const val HEIGHT = 12
  }
}
