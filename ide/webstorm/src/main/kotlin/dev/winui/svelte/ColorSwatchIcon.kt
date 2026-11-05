package dev.winui.svelte

import com.intellij.ui.JBColor
import com.intellij.ui.scale.JBUIScale
import java.awt.Color
import java.awt.Component
import java.awt.Graphics
import java.awt.Graphics2D
import java.awt.RenderingHints
import javax.swing.Icon

internal class ColorSwatchIcon(
  private val color: Color
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
      val arc = JBUIScale.scale(ARC)
      canvas.color = color
      canvas.fillRoundRect(x, y, iconWidth - 1, iconHeight - 1, arc, arc)
      canvas.color = JBColor.border()
      canvas.drawRoundRect(x, y, iconWidth - 1, iconHeight - 1, arc, arc)
    } finally {
      canvas.dispose()
    }
  }

  private companion object {
    const val SIZE = 12
    const val ARC = 3
  }
}
