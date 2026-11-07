package dev.winui.svelte

import com.intellij.ui.scale.JBUIScale
import java.awt.Color
import java.awt.Component
import java.awt.Graphics
import java.awt.Graphics2D
import java.awt.RenderingHints
import java.awt.image.BufferedImage
import javax.swing.Icon

/** A picture scaled into a square, over the color of the taskbar it is for when it is for one. */
internal class PictureIcon(
  private val image: BufferedImage,
  private val size: Int,
  private val background: Color? = null
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
      canvas.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR)
      background?.let {
        canvas.color = it
        canvas.fillRect(x, y, iconWidth, iconHeight)
      }

      val scale = minOf(iconWidth.toDouble() / image.width, iconHeight.toDouble() / image.height)
      val width = (image.width * scale).toInt()
      val height = (image.height * scale).toInt()
      canvas.drawImage(image, x + (iconWidth - width) / 2, y + (iconHeight - height) / 2, width, height, null)
    } finally {
      canvas.dispose()
    }
  }
}
