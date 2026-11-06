package dev.winui.svelte

import com.intellij.testFramework.fixtures.BasePlatformTestCase
import org.junit.jupiter.api.Assertions.assertEquals

class ColorInlayTest : BasePlatformTestCase() {
  override fun setUp() {
    super.setUp()
    for (feature in PreviewFeature.entries) {
      Settings.of(project).setPreviewEnabled(feature, false)
    }
  }

  override fun tearDown() {
    try {
      for (feature in PreviewFeature.entries) {
        Settings.of(project).setPreviewEnabled(feature, true)
      }
    } finally {
      super.tearDown()
    }
  }

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

  fun testAStyleDirectiveColorGetsASwatchBeforeTheColor() {
    val markup = "<Border style:color=\"yellow\" />"
    assertEquals(listOf(markup.indexOf("yellow")), inlayOffsets(markup))
  }

  fun testAColorPropGetsASwatch() {
    val markup = "<Border background=\"#0af\" />"
    assertEquals(listOf(markup.indexOf("#0af")), inlayOffsets(markup))
  }

  fun testEachColorOfAStyleAttributeGetsOne() {
    val markup = "<Border style=\"color: red; width: 4px; background-color: blue\" />"
    assertEquals(listOf(markup.indexOf("red"), markup.indexOf("blue")), inlayOffsets(markup))
  }

  fun testNothingIsDrawnWithoutTheDependency() {
    assertEquals(emptyList<Int>(), inlayOffsets("<Border style:color=\"yellow\" />", TestManifests.UNRELATED))
  }
}
