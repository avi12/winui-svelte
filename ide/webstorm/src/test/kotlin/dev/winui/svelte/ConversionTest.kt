package dev.winui.svelte

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class ConversionTest {
  private val table = ConversionTable.bundled

  private fun rewrite(attribute: String, value: PropValue): String? {
    val mapping = table.mappingOf(attribute) ?: return null
    return Conversion.convert(mapping, value)?.let { Conversion.render(mapping.cssProperty, it) }
  }

  @Test
  fun `a keyword string becomes the CSS word`() {
    assertEquals("style:display=\"none\"", rewrite("visibility", PropValue.Text("Collapsed")))
    assertEquals("style:display=\"block\"", rewrite("visibility", PropValue.Text("Visible")))
  }

  @Test
  fun `an enum member becomes the CSS word`() {
    assertEquals(
      "style:display=\"none\"",
      rewrite("visibility", PropValue.Member("Visibility", "Collapsed"))
    )
  }

  @Test
  fun `a member of another enum is left alone`() {
    assertEquals(null, rewrite("visibility", PropValue.Member("Orientation", "Collapsed")))
  }

  @Test
  fun `a word the property does not take is left alone`() {
    assertEquals(null, rewrite("visibility", PropValue.Text("Sideways")))
  }

  @Test
  fun `a condition of two members keeps the condition`() {
    val value = PropValue.Conditional(
      "isOn",
      PropValue.Member("Visibility", "Visible"),
      PropValue.Member("Visibility", "Collapsed")
    )
    assertEquals("style:display={isOn ? \"block\" : \"none\"}", rewrite("visibility", value))
  }

  @Test
  fun `a condition with one branch that cannot convert is left alone`() {
    val value = PropValue.Conditional(
      "isOn",
      PropValue.Member("Visibility", "Visible"),
      PropValue.Member("Visibility", "Nowhere")
    )
    assertEquals(null, rewrite("visibility", value))
  }

  @Test
  fun `a nested condition converts`() {
    val inner = PropValue.Conditional("b", PropValue.Number("1"), PropValue.Number("2"))
    val value = PropValue.Conditional("a", PropValue.Number("3"), inner)
    assertEquals("style:width={a ? \"3px\" : b ? \"1px\" : \"2px\"}", rewrite("width", value))
  }

  @Test
  fun `a flag becomes pointer events`() {
    assertEquals("style:pointer-events=\"none\"", rewrite("isHitTestVisible", PropValue.Flag(false)))
    assertEquals("style:pointer-events=\"auto\"", rewrite("isHitTestVisible", PropValue.Flag(true)))
  }

  @Test
  fun `a number becomes pixels for a length and stays for a number`() {
    assertEquals("style:width=\"12px\"", rewrite("width", PropValue.Number("12")))
    assertEquals("style:font-size=\"-1.5px\"", rewrite("fontSize", PropValue.Number("-1.5")))
    assertEquals("style:opacity=\"0.5\"", rewrite("opacity", PropValue.Number("0.5")))
    assertEquals(null, rewrite("width", PropValue.Number("1e3")))
    assertEquals(null, rewrite("width", PropValue.Text("12")))
  }

  @Test
  fun `a font weight keeps the number or the name`() {
    assertEquals("style:font-weight=\"700\"", rewrite("fontWeight", PropValue.Number("700")))
    assertEquals("style:font-weight=\"bold\"", rewrite("fontWeight", PropValue.Text("Bold")))
  }

  @Test
  fun `a color passes through, with alpha moved last`() {
    assertEquals("style:color=\"#fff\"", rewrite("foreground", PropValue.Text("#fff")))
    assertEquals("style:background-color=\"#336699\"", rewrite("background", PropValue.Text("#336699")))
    assertEquals("style:color=\"#33669980\"", rewrite("foreground", PropValue.Text("#80336699")))
    assertEquals("style:color=\"transparent\"", rewrite("foreground", PropValue.Text("Transparent")))
    assertEquals(null, rewrite("foreground", PropValue.Text("#abcd")))
    assertEquals(null, rewrite("foreground", PropValue.Text("SystemAccentColor")))
  }

  @Test
  fun `a thickness reads a number, a CSS list, a XAML list and a tuple`() {
    assertEquals("style:padding=\"8px\"", rewrite("padding", PropValue.Number("8")))
    assertEquals("style:padding=\"4px 8px\"", rewrite("padding", PropValue.Text("4 8px")))
    assertEquals("style:padding=\"2px 1px 4px 3px\"", rewrite("padding", PropValue.Text("3,2,1,4")))
    assertEquals("style:padding=\"2px 1px\"", rewrite("padding", PropValue.Tuple(listOf("1", "2"))))
    assertEquals(
      "style:margin=\"2px 3px 4px 1px\"",
      rewrite("margin", PropValue.Tuple(listOf("1", "2", "3", "4")))
    )
    assertEquals(null, rewrite("padding", PropValue.Text("1 2 3 4 5")))
    assertEquals(null, rewrite("padding", PropValue.Text("auto")))
  }

  @Test
  fun `a corner radius keeps the order the corners are written in`() {
    assertEquals("style:border-radius=\"4px\"", rewrite("cornerRadius", PropValue.Number("4")))
    assertEquals(
      "style:border-radius=\"1px 2px 3px 4px\"",
      rewrite("cornerRadius", PropValue.Tuple(listOf("1", "2", "3", "4")))
    )
    assertEquals("style:border-radius=\"1px 2px\"", rewrite("cornerRadius", PropValue.Text("1,2")))
  }

  @Test
  fun `a font family keeps its name`() {
    assertEquals("style:font-family=\"Segoe UI\"", rewrite("fontFamily", PropValue.Text("Segoe UI")))
    assertEquals(null, rewrite("fontFamily", PropValue.Text("A\";b")))
  }

  @Test
  fun `a prop without a counterpart has no mapping`() {
    assertEquals(null, table.mappingOf("content"))
    assertEquals(null, table.mappingOf("lineHeight"))
    assertEquals(null, table.mappingOf("renderTransform"))
  }

  @Test
  fun `the table covers every kind`() {
    assertTrue(table.size > 50)
    for (kind in ConversionKind.entries.filter { it != ConversionKind.UNSUPPORTED }) {
      assertTrue(table.countOf(kind) > 0, kind.name)
    }
  }
}
