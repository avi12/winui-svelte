package dev.winui.svelte

import com.intellij.openapi.editor.colors.EditorColorsManager
import com.intellij.ui.scale.JBUIScale
import java.awt.Component
import java.awt.Font
import java.awt.Graphics
import java.awt.Graphics2D
import java.awt.RenderingHints
import javax.swing.Icon

internal class FontSampleIcon(
  private val family: String
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
      canvas.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON)
      canvas.font = Font(family, Font.PLAIN, 1).deriveFont(JBUIScale.scale(FONT_SIZE))
      canvas.color = EditorColorsManager.getInstance().globalScheme.defaultForeground
      val metrics = canvas.fontMetrics
      val left = x + (iconWidth - metrics.stringWidth(SAMPLE)) / 2
      val baseline = y + (iconHeight - metrics.height) / 2 + metrics.ascent
      canvas.drawString(SAMPLE, left, baseline)
    } finally {
      canvas.dispose()
    }
  }

  private companion object {
    const val SAMPLE = "Aa"
    const val WIDTH = 22
    const val HEIGHT = 16
    const val FONT_SIZE = 13f
  }
}
