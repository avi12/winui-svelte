package dev.winui.svelte

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.junit.jupiter.api.Test
import java.awt.Color
import java.awt.image.BufferedImage

class GlyphIconTest {
  private fun paint(codePoint: Int): BufferedImage {
    val image = BufferedImage(SIZE, SIZE, BufferedImage.TYPE_INT_ARGB)
    val graphics = image.createGraphics()
    try {
      GlyphIcon(codePoint) { Color.BLACK }.paintIcon(null, graphics, 0, 0)
    } finally {
      graphics.dispose()
    }

    return image
  }

  private fun inked(image: BufferedImage) =
    (0 until SIZE).sumOf { y -> (0 until SIZE).count { x -> image.getRGB(x, y) ushr ALPHA_SHIFT != 0 } }

  @Test
  fun `a known code point paints pixels when a Fluent icon font is installed`() {
    assumeTrue(GlyphFont.family != null, "neither Segoe Fluent Icons nor Segoe MDL2 Assets is installed")
    assertTrue(inked(paint(FluentGlyphs.codePoints.getValue("Save"))) > 0)
  }

  @Test
  fun `a code point the font lacks paints nothing and does not throw`() {
    assertEquals(0, inked(paint(MISSING)))
  }

  @Test
  fun `the table has the code point of Save and the label is U plus four digits`() {
    assertEquals(0xE74E, FluentGlyphs.codePoints["Save"])
    assertEquals("U+E74E", FluentGlyphs.label(0xE74E))
    assertEquals(setOf("FontIcon", "FontIconSource"), FluentGlyphs.components)
  }

  private companion object {
    const val SIZE = 16
    const val ALPHA_SHIFT = 24
    const val MISSING = 0x10FFFF
  }
}
