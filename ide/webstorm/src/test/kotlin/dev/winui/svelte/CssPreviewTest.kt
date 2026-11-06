package dev.winui.svelte

import com.intellij.testFramework.fixtures.BasePlatformTestCase
import org.junit.jupiter.api.Assertions.assertEquals

class CssPreviewTest : BasePlatformTestCase() {
  private fun configure(
    markup: String,
    manifest: String = TestManifests.DEPENDENT
  ) {
    myFixture.addFileToProject("package.json", manifest)
    myFixture.configureByText("A.svelte", markup)
  }

  private fun inlayOffsets(
    markup: String,
    manifest: String = TestManifests.DEPENDENT
  ): List<Int> {
    configure(markup, manifest)
    myFixture.doHighlighting()
    return myFixture.editor.inlayModel
      .getInlineElementsInRange(0, myFixture.editor.document.textLength)
      .map { it.offset }
      .sorted()
  }

  private fun popup(
    markup: String,
    manifest: String = TestManifests.DEPENDENT
  ): String? {
    configure(markup, manifest)
    val provider = CssPreviewDocumentationProvider()
    val context = myFixture.file.findElementAt(myFixture.caretOffset)
    val element =
      provider.getCustomDocumentationElement(myFixture.editor, myFixture.file, context, myFixture.caretOffset)
        ?: return null
    return provider.generateDoc(element, context)
  }

  fun testAGradientGetsABarBeforeItAndAContrastRatioAfterTheTextColor() {
    val markup =
      "<style>\n.a { color: #767676; background: #fff; background-image: linear-gradient(red, blue) }\n</style>"
    val expected = listOf(markup.indexOf("#767676") + "#767676".length, markup.indexOf("linear-gradient"))
    assertEquals(expected.sorted(), inlayOffsets(markup))
  }

  fun testAnEasingGetsACurveAndAMediaConditionItsAnswer() {
    val markup = "<style>\n@media (min-width: 600px) { .a { transition: opacity 1s ease-in } }\n</style>"
    val expected = listOf(markup.indexOf("(min-width") + "(min-width: 600px)".length, markup.indexOf("opacity"))
    assertEquals(expected.sorted(), inlayOffsets(markup))
  }

  fun testNothingIsDrawnWithoutTheDependency() {
    assertEquals(
      emptyList<Int>(),
      inlayOffsets("<style>\n.a { background-image: linear-gradient(red, blue) }\n</style>", TestManifests.UNRELATED)
    )
  }

  fun testAPreviewTurnedOffDrawsNothing() {
    val settings = Settings.of(project)
    settings.setPreviewEnabled(PreviewFeature.GRADIENT, false)
    try {
      assertEquals(
        emptyList<Int>(),
        inlayOffsets("<style>\n.a { background-image: linear-gradient(red, blue) }\n</style>")
      )
    } finally {
      settings.setPreviewEnabled(PreviewFeature.GRADIENT, true)
    }
  }

  fun testThePopupOfPaddingDrawsTheBoxModel() {
    val doc = popup("<style>\n.a { padding: 8px 1<caret>2px }\n</style>")
    assertEquals(true, doc?.contains("<b>padding</b> 8, 12, 8, 12 px (top, right, bottom, left)") == true)
  }

  fun testThePopupOfAnUnsupportedPropertyGivesItsReason() {
    val doc = popup("<style>\n.a { fl<caret>oat: left }\n</style>")
    assertEquals(true, doc?.contains("has no WinUI meaning") == true)
  }

  fun testThePopupOfAMediaConditionSaysWhetherItHoldsNow() {
    val doc = popup("<style>\n@media (prefers-color-sch<caret>eme: dark) { .a { color: red } }\n</style>")
    assertEquals(true, doc?.contains("<b>now: yes</b>") == true)
  }

  fun testAValueNoPreviewDrawsGetsNoPopup() {
    assertNull(popup("<style>\n.a { --my-o<caret>wn: 4 }\n</style>"))
  }
}
