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

  fun testAnIconNameGetsItsIconInsideTheStringBeforeTheName() {
    val markup = "<FontIcon glyph=\"Save\" />"
    assertEquals(listOf(markup.indexOf("Save")), inlayOffsets(markup))
  }

  fun testEveryKnownNameInAnExpressionGetsItsIcon() {
    val markup = "<FontIcon glyph={isReady ? \"Save\" : 'Play'} />"
    assertEquals(listOf(markup.indexOf("Save"), markup.indexOf("Play")), inlayOffsets(markup))
  }

  fun testAnUnknownNameInAnExpressionGetsNoIcon() {
    assertEquals(emptyList<Int>(), inlayOffsets("<FontIcon glyph={isReady ? \"Nope\" : count} />"))
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

  fun testAWrapperComponentWhoseGlyphPropIsAGlyphInputGetsTheIcon() {
    myFixture.addFileToProject("FeatureCard.svelte", component("glyph: GlyphInput"))
    val markup = usage("FeatureCard")
    assertEquals(listOf(markup.indexOf("Save")), inlayOffsets(markup))
  }

  fun testAWrapperComponentWhoseGlyphPropIsAStringGetsNoIcon() {
    myFixture.addFileToProject("Label.svelte", component("glyph: string"))
    assertEquals(emptyList<Int>(), inlayOffsets(usage("Label")))
  }

  private fun component(prop: String) = "<script lang=\"ts\">\n  interface Props { $prop; }\n</script>\n"

  private fun usage(name: String) =
    "<script lang=\"ts\">\n  import $name from \"./$name.svelte\";\n</script>\n<$name glyph=\"Save\" />"
}
