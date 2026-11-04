package dev.winui.svelte

import com.intellij.openapi.editor.colors.EditorColorsManager
import com.intellij.ui.scale.JBUIScale
import java.awt.Color
import java.awt.Component
import java.awt.Font
import java.awt.Graphics
import java.awt.Graphics2D
import java.awt.RenderingHints
import javax.swing.Icon

internal object GlyphFont {
  private val families = listOf("Segoe Fluent Icons", "Segoe MDL2 Assets")
  private const val PROBE_SIZE = 1

  val family: String? by lazy {
    families.firstOrNull { Font(it, Font.PLAIN, PROBE_SIZE).family.equals(it, ignoreCase = true) }
  }

  @Volatile
  private var cached: Font? = null

  fun font(size: Float): Font? {
    val name = family ?: return null
    val last = cached
    if (last != null && last.size2D == size) {
      return last
    }

    return Font(name, Font.PLAIN, 1).deriveFont(size).also { cached = it }
  }
}

internal class GlyphIcon(
  private val codePoint: Int,
  private val color: () -> Color = { EditorColorsManager.getInstance().globalScheme.defaultForeground }
) : Icon {
  override fun getIconWidth() = JBUIScale.scale(SIZE)

  override fun getIconHeight() = JBUIScale.scale(SIZE)

  override fun paintIcon(
    component: Component?,
    graphics: Graphics,
    x: Int,
    y: Int
  ) {
    val font = GlyphFont.font(JBUIScale.scale(GLYPH_SIZE)) ?: return
    if (!font.canDisplay(codePoint)) {
      return
    }

    val canvas = graphics.create() as Graphics2D
    try {
      canvas.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON)
      canvas.font = font
      canvas.color = color()
      val text = String(Character.toChars(codePoint))
      val metrics = canvas.fontMetrics
      val left = x + (iconWidth - metrics.stringWidth(text)) / 2
      val baseline = y + (iconHeight - metrics.height) / 2 + metrics.ascent
      canvas.drawString(text, left, baseline)
    } finally {
      canvas.dispose()
    }
  }

  private companion object {
    const val SIZE = 16
    const val GLYPH_SIZE = 14f
  }
}
