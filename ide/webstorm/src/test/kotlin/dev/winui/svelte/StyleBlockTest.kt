package dev.winui.svelte

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class StyleBlockTest {
  private val hidden = Declaration("visibility", "hidden")

  private fun moved(source: String, declaration: Declaration = hidden): String? {
    val attribute = source.indexOf("visibility=")
    val end = source.indexOf("\"", source.indexOf("\"", attribute) + 1) + 1
    val tagName = Regex("""<([A-Za-z.]+)""").find(source)!!.groupValues[1]
    val classMatch = Regex("""class="([^"]*)"""").find(source)
    val context = TagContext(
      tagName = tagName,
      tagNameEnd = source.indexOf(tagName) + tagName.length,
      attributeStart = attribute,
      attributeEnd = end,
      classAttribute = classMatch?.let {
        ClassAttribute(it.groups[1]!!.range.first, it.groups[1]!!.range.last + 1, it.groupValues[1])
      }
    )
    val edits = StyleBlock.plan(source, context, declaration) ?: return null
    return StyleBlock.apply(source, edits)
  }

  @Test
  fun `a tag name becomes a kebab case class`() {
    assertEquals("text-block", StyleBlock.kebab("TextBlock"))
    assertEquals("border", StyleBlock.kebab("Border"))
    assertEquals("navigation-view-item", StyleBlock.kebab("NavigationViewItem"))
    assertEquals("grid-row", StyleBlock.kebab("Grid.Row"))
  }

  @Test
  fun `a taken name gets the first free number`() {
    assertEquals("text-block", StyleBlock.unusedClass("text-block", emptySet()))
    assertEquals("text-block-2", StyleBlock.unusedClass("text-block", setOf("text-block")))
    assertEquals("text-block-3", StyleBlock.unusedClass("text-block", setOf("text-block", "text-block-2")))
  }

  @Test
  fun `classes are read from class attributes and selectors`() {
    val text = "<A class=\"a b\" /><B class='c' />\n<style>\n  .d:hover { }\n</style>"
    assertEquals(setOf("a", "b", "c", "d"), StyleBlock.classesIn(text))
  }

  @Test
  fun `the first class token is the one used`() {
    assertEquals("a", StyleBlock.firstClassOf("a b"))
    assertEquals(null, StyleBlock.firstClassOf("9bad"))
  }

  @Test
  fun `a rule is added at the end of a style block`() {
    assertEquals(
      "<A class=\"a\" />\n<style>\n  .x {\n    y: z;\n  }\n\n  .a {\n    visibility: hidden;\n  }\n</style>",
      moved("<A class=\"a\" visibility=\"Collapsed\" />\n<style>\n  .x {\n    y: z;\n  }\n</style>")
    )
  }

  @Test
  fun `a declaration is appended to the rule of the class`() {
    assertEquals(
      "<A class=\"a\" />\n<style>\n  .a {\n    y: z;\n    visibility: hidden;\n  }\n</style>",
      moved("<A class=\"a\" visibility=\"Collapsed\" />\n<style>\n  .a {\n    y: z;\n  }\n</style>")
    )
  }

  @Test
  fun `a missing semicolon is added before the new declaration`() {
    assertEquals(
      "<A class=\"a\" />\n<style>\n  .a {\n    y: z;\n    visibility: hidden;\n  }\n</style>",
      moved("<A class=\"a\" visibility=\"Collapsed\" />\n<style>\n  .a {\n    y: z\n  }\n</style>")
    )
  }

  @Test
  fun `an empty rule gets its first declaration`() {
    assertEquals(
      "<A class=\"a\" />\n<style>\n  .a {\n    visibility: hidden;\n  }\n</style>",
      moved("<A class=\"a\" visibility=\"Collapsed\" />\n<style>\n  .a {\n  }\n</style>")
    )
  }

  @Test
  fun `the value of a declared property is replaced`() {
    assertEquals(
      "<A class=\"a\" />\n<style>\n  .a {\n    visibility: hidden;\n  }\n</style>",
      moved("<A class=\"a\" visibility=\"Collapsed\" />\n<style>\n  .a {\n    visibility: visible;\n  }\n</style>")
    )
  }

  @Test
  fun `a property whose name ends the same is not replaced`() {
    val moved = moved(
      "<A class=\"a\" visibility=\"Collapsed\" />\n<style>\n  .a {\n    x-visibility: 1;\n  }\n</style>"
    )
    assertEquals(
      "<A class=\"a\" />\n<style>\n  .a {\n    x-visibility: 1;\n    visibility: hidden;\n  }\n</style>",
      moved
    )
  }

  @Test
  fun `the indentation of the file is kept`() {
    assertEquals(
      "<A class=\"a\" />\n<style>\n\t.a {\n\t\ty: z;\n\t\tvisibility: hidden;\n\t}\n</style>",
      moved("<A class=\"a\" visibility=\"Collapsed\" />\n<style>\n\t.a {\n\t\ty: z;\n\t}\n</style>")
    )
  }

  @Test
  fun `a file without a style block gets one after a blank line`() {
    assertEquals(
      "<A class=\"a\" />\n\n<style>\n  .a {\n    visibility: hidden;\n  }\n</style>\n",
      moved("<A class=\"a\" visibility=\"Collapsed\" />\n")
    )
  }

  @Test
  fun `a style block in another language is left alone`() {
    assertNull(moved("<A visibility=\"Collapsed\" />\n<style lang=\"scss\">\n</style>"))
  }

  @Test
  fun `a class that is not an identifier is left alone`() {
    assertNull(moved("<A class=\"9\" visibility=\"Collapsed\" />"))
  }
}
