package dev.winui.svelte

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class WinuiIdeDataTest {
  @Test
  fun `a color resource is found by its custom property with both swatches`() {
    val card = WinuiIdeData.resourceOf("--card-background-fill-color-default")
    assertEquals("CardBackgroundFillColorDefault", card?.name)
    assertEquals("Color", card?.kind)
    assertEquals("#ffffffb3", card?.light)
    assertEquals("#ffffff0d", card?.dark)
  }

  @Test
  fun `a resource that is no color has no swatch and an apps own property is unknown`() {
    assertEquals(false, WinuiIdeData.resourceOf("--control-corner-radius")?.isColor)
    assertNull(WinuiIdeData.resourceOf("--my-own"))
  }

  @Test
  fun `the documentation shows both themes over their own ground`() {
    val card = WinuiIdeData.resourceOf("--card-background-fill-color-default") ?: error("the card resource is missing")
    val html = ResourceDocumentation.html(card)
    assertEquals(true, html.contains("light #ffffffb3, dark #ffffff0d"))
    assertEquals(true, html.contains("<b>CardBackgroundFillColorDefault</b> Color"))
  }

  @Test
  fun `a color is blended over the ground and an unset one shows the ground`() {
    assertEquals("#7f7f7f", ResourceDocumentation.shownOver("#00000080", 0xFFFFFF))
    assertEquals("#202020", ResourceDocumentation.shownOver(null, 0x202020))
  }
}
