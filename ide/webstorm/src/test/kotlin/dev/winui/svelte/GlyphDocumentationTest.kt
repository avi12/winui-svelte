package dev.winui.svelte

import com.intellij.testFramework.fixtures.BasePlatformTestCase
import org.junit.Assume.assumeTrue
import org.junit.jupiter.api.Assertions.assertEquals

class GlyphDocumentationTest : BasePlatformTestCase() {
  private fun hover(
    markup: String,
    manifest: String = TestManifests.DEPENDENT
  ): String? {
    myFixture.addFileToProject("package.json", manifest)
    myFixture.configureByText("A.svelte", markup)
    val provider = GlyphDocumentationProvider()
    val context = myFixture.file.findElementAt(myFixture.caretOffset)
    val element =
      provider.getCustomDocumentationElement(myFixture.editor, myFixture.file, context, myFixture.caretOffset)
        ?: return null
    return provider.generateDoc(element, context)
  }

  override fun setUp() {
    super.setUp()
    assumeTrue("no Fluent icon font is installed", GlyphFont.family != null)
  }

  fun testANamePreviewsItsIconAndCodePoint() {
    val doc = hover("<FontIcon glyph=\"Sa<caret>ve\" />")
    assertEquals(true, doc?.contains("&#59214;") == true)
    assertEquals(true, doc?.contains("U+E74E") == true)
  }

  fun testAStringInAnExpressionPreviewsItsOwnIcon() {
    val doc = hover("<FontIcon glyph={isReady ? \"Save\" : \"Pl<caret>ay\"} />")
    assertEquals(true, doc?.contains("U+E768") == true)
  }

  fun testAnotherComponentGetsNoPreview() {
    assertEquals(null, hover("<TextBlock glyph=\"Sa<caret>ve\" />"))
  }

  fun testAnUnknownNameGetsNoPreview() {
    assertEquals(null, hover("<FontIcon glyph=\"Nope<caret>\" />"))
  }

  fun testNothingIsPreviewedWithoutTheDependency() {
    assertEquals(null, hover("<FontIcon glyph=\"Sa<caret>ve\" />", TestManifests.UNRELATED))
  }
}
