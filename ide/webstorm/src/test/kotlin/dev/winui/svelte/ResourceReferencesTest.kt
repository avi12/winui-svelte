package dev.winui.svelte

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class ResourceReferencesTest {
  private val style = ".card { background: var(--card-background-fill-color-default); color: var(--my-own) }"

  @Test
  fun `an offset inside the name finds the whole name`() {
    val start = style.indexOf("--card")
    val reference = ResourceReferences.at(style, start + "--card".length)
    assertEquals("--card-background-fill-color-default", reference?.property)
    assertEquals(start, reference?.start)
    assertEquals("--card", reference?.textBefore(start + "--card".length))
  }

  @Test
  fun `the end of a half typed name is still inside it`() {
    val text = "a { color: var(--card-b"
    assertEquals("--card-b", ResourceReferences.at(text, text.length)?.property)
  }

  @Test
  fun `an offset outside every var call finds nothing`() {
    assertNull(ResourceReferences.at(style, style.indexOf("background")))
    assertNull(ResourceReferences.at(style, style.indexOf(')') + 1))
  }
}
