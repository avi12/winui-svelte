package dev.winui.svelte

import com.intellij.testFramework.fixtures.BasePlatformTestCase
import org.junit.Assume.assumeTrue
import org.junit.jupiter.api.Assertions.assertEquals

class GlyphInlayTest : BasePlatformTestCase() {
  private fun inlayOffsets(
    markup: String,
    manifest: String = TestManifests.DEPENDENT
  ): List<Int> {
    myFixture.addFileToProject("package.json", manifest)
    myFixture.configureByText("A.svelte", markup)
    myFixture.doHighlighting()
    return myFixture.editor.inlayModel
      .getInlineElementsInRange(0, myFixture.editor.document.textLength)
      .map { it.offset }
  }

  override fun setUp() {
    super.setUp()
    assumeTrue("no Fluent icon font is installed", GlyphFont.family != null)
  }

  fun testAnIconNameGetsItsIconRightAfterTheValue() {
    val markup = "<FontIcon glyph=\"Save\" />"
    assertEquals(listOf(markup.indexOf("\" />") + 1), inlayOffsets(markup))
  }

  fun testAnotherComponentGetsNoIcon() {
    assertEquals(emptyList<Int>(), inlayOffsets("<TextBlock glyph=\"Save\" />"))
  }

  fun testAnUnknownNameGetsNoIcon() {
    assertEquals(emptyList<Int>(), inlayOffsets("<FontIcon glyph=\"Nope\" />"))
  }

  fun testNothingIsDrawnWithoutTheDependency() {
    assertEquals(emptyList<Int>(), inlayOffsets("<FontIcon glyph=\"Save\" />", TestManifests.UNRELATED))
  }
}
