package dev.winui.svelte

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class StyleBlockTest {
  private val hidden = Declaration("visibility", "hidden")

  private fun contextOf(source: String): TagContext {
    val attribute = source.indexOf("visibility=")
    val end = source.indexOf("\"", source.indexOf("\"", attribute) + 1) + 1
    val tagName = Regex("""<([A-Za-z.]+)""").find(source)!!.groupValues[1]
    val classMatch = Regex("""class="([^"]*)"""").find(source)
    return TagContext(
      tagName = tagName,
      tagNameEnd = source.indexOf(tagName) + tagName.length,
      attributeStart = attribute,
      attributeEnd = end,
      classAttribute =
        classMatch?.let {
          ClassAttribute(
            valueStart = it.groups[1]!!.range.first,
            valueEnd = it.groups[1]!!.range.last + 1,
            value = it.groupValues[1]
          )
        }
    )
  }

  private fun moved(
    source: String,
    declaration: Declaration = hidden
  ): String? {
    val edits = StyleBlock.plan(source, contextOf(source), declaration) ?: return null
    return TextEdits.apply(source, edits)
  }

  @Test
  fun `a tag name becomes a kebab case class`() {
    assertEquals("text-block", ClassNaming.kebab("TextBlock"))
    assertEquals("border", ClassNaming.kebab("Border"))
    assertEquals("navigation-view-item", ClassNaming.kebab("NavigationViewItem"))
    assertEquals("grid-row", ClassNaming.kebab("Grid.Row"))
  }

  @Test
  fun `a taken name gets the first free number`() {
    assertEquals("text-block", ClassNaming.unusedClass("text-block", emptySet()))
    assertEquals("text-block-2", ClassNaming.unusedClass("text-block", setOf("text-block")))
    assertEquals("text-block-3", ClassNaming.unusedClass("text-block", setOf("text-block", "text-block-2")))
  }

  @Test
  fun `classes are read from class attributes and selectors`() {
    val text = "<A class=\"a b\" /><B class='c' />\n<style>\n  .d:hover { }\n</style>"
    assertEquals(setOf("a", "b", "c", "d"), ClassNaming.classesIn(text))
  }

  @Test
  fun `the first class token is the one used`() {
    assertEquals("a", ClassNaming.firstClassOf("a b"))
    assertEquals(null, ClassNaming.firstClassOf("9bad"))
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
    val moved =
      moved(
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

  @Test
  fun `a plain condition is negated with a bang and any other in parentheses`() {
    assertEquals("!hasNote", ConditionLeaves.negated("hasNote"))
    assertEquals("!item.shown", ConditionLeaves.negated("item.shown"))
    assertEquals("!(a && b)", ConditionLeaves.negated("a && b"))
    assertEquals("!(!a)", ConditionLeaves.negated("!a"))
  }

  private val table = ConversionTable.bundled

  private fun togglesOf(
    attribute: String,
    value: CssValue
  ) = ConditionLeaves.togglesOf(table.mappingOf(attribute)!!, value)

  @Test
  fun `a leaf that is the default of the property is left out`() {
    assertEquals(
      listOf(Leaf("!hasNote", "none", "collapsed")),
      togglesOf(
        "visibility",
        CssValue.Conditional(
          "hasNote",
          CssValue.Plain("block", "Visible"),
          CssValue.Plain("none", "Collapsed")
        )
      )
    )
  }

  @Test
  fun `a ternary of defaults only has nothing left`() {
    val both = CssValue.Conditional("a", CssValue.Plain("block", "Visible"), CssValue.Plain("block", "Visible"))
    assertEquals(emptyList<Leaf>(), togglesOf("visibility", both))
  }

  @Test
  fun `a leaf takes its modifier from the member or from the property and the value`() {
    val sizes = CssValue.Conditional("big", CssValue.Plain("14px"), CssValue.Plain("11px"))
    assertEquals(
      listOf(Leaf("big", "14px", "font-size-14"), Leaf("!big", "11px", "font-size-11")),
      togglesOf("fontSize", sizes)
    )
    val weights = CssValue.Conditional("bold", CssValue.Plain("bold", "SemiBold"), CssValue.Plain("normal", "Normal"))
    assertEquals(
      listOf(Leaf("bold", "bold", "semi-bold")),
      togglesOf("fontWeight", weights)
    )
  }

  @Test
  fun `each leaf of a nested condition carries the conditions on its path`() {
    val nested =
      CssValue.Conditional(
        "a",
        CssValue.Plain("1px"),
        CssValue.Conditional("b || c", CssValue.Plain("2px"), CssValue.Plain("3px"))
      )
    assertEquals(
      listOf(
        Leaf("a", "1px", "width-1"),
        Leaf("!a && (b || c)", "2px", "width-2"),
        Leaf("!a && !(b || c)", "3px", "width-3")
      ),
      togglesOf("width", nested)
    )
  }

  private fun toggled(
    source: String,
    leaves: List<Leaf>
  ): String? {
    val edits = StyleBlock.planToggles(source, contextOf(source), "display", leaves) ?: return null
    return TextEdits.apply(source, edits)
  }

  private val collapsed = listOf(Leaf("!hasNote", "none", "collapsed"))

  @Test
  fun `a condition becomes a class directive and a rule without a class attribute`() {
    assertEquals(
      "<A class:a--collapsed={!hasNote} />\n\n<style>\n  .a--collapsed {\n    display: none;\n  }\n</style>\n",
      toggled("<A visibility=\"x\" />", collapsed)
    )
  }

  @Test
  fun `the first static class is the base and stays as it is`() {
    assertEquals(
      "<A class=\"note extra\" class:note--collapsed={!hasNote} />\n" +
        "<style>\n  .note--collapsed {\n    display: none;\n  }\n</style>",
      toggled("<A class=\"note extra\" visibility=\"x\" />\n<style>\n</style>", collapsed)
    )
  }

  @Test
  fun `a rule that exists is appended to`() {
    assertEquals(
      "<A class=\"note\" class:note--collapsed={!hasNote} />\n" +
        "<style>\n  .note--collapsed {\n    color: red;\n    display: none;\n  }\n</style>",
      toggled(
        "<A class=\"note\" visibility=\"x\" />\n<style>\n  .note--collapsed {\n    color: red;\n  }\n</style>",
        collapsed
      )
    )
  }

  @Test
  fun `two leaves of one modifier share a directive and join their conditions`() {
    val same = listOf(Leaf("a", "none", "collapsed"), Leaf("!a && b", "none", "collapsed"))
    val text = toggled("<A visibility=\"x\" />", same)!!
    assertEquals(true, text.contains("class:a--collapsed={(a) || (!a && b)}"))
  }

  @Test
  fun `a style block in another language gets no toggles`() {
    assertNull(toggled("<A visibility=\"x\" />\n<style lang=\"scss\">\n</style>", collapsed))
  }

  @Test
  fun `no leaf gets no toggles`() {
    assertNull(toggled("<A visibility=\"x\" />", emptyList()))
  }
}
