package dev.winui.svelte

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import java.awt.Color

class ColorSpotsTest {
  private val table = ConversionTable.bundled

  @Test
  fun `names, hex, rgb and hsl all parse`() {
    assertEquals(Color(255, 255, 0), CssColors.parse("yellow"))
    assertEquals(Color(0, 170, 255), CssColors.parse("#0af"))
    assertEquals(Color(255, 0, 0, 128), CssColors.parse("#ff000080"))
    assertEquals(Color(10, 20, 30), CssColors.parse("rgb(10, 20, 30)"))
    assertEquals(Color(255, 0, 0), CssColors.parse("hsl(0 100% 50%)"))
    assertEquals(null, CssColors.parse("notacolor"))
  }

  @Test
  fun `a color prop of a component is a spot`() {
    assertEquals(listOf(ColorSpot(0, "red")), ColorSpots.of("background", "red", table))
  }

  @Test
  fun `a style directive on a color property is a spot, on another property is not`() {
    assertEquals(listOf(ColorSpot(0, "yellow")), ColorSpots.of("style:color", "yellow", table))
    assertEquals(emptyList<ColorSpot>(), ColorSpots.of("style:width", "yellow", table))
  }

  @Test
  fun `a style attribute gives a spot for each color declaration at its offset`() {
    val style = "color: red; width: 4px; background-color:#0af"
    assertEquals(
      listOf(ColorSpot(style.indexOf("red"), "red"), ColorSpot(style.indexOf("#0af"), "#0af")),
      ColorSpots.of("style", style, table)
    )
  }
}
