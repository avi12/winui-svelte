package dev.winui.svelte

import com.intellij.codeInsight.lookup.LookupElementBuilder
import com.intellij.codeInsight.lookup.LookupElementPresentation
import com.intellij.testFramework.fixtures.BasePlatformTestCase
import org.junit.jupiter.api.Assertions.assertEquals

class FontFamilyCompletionTest : BasePlatformTestCase() {
  private fun isFontFamilyAtCaret(markup: String): Boolean {
    myFixture.configureByText("A.svelte", markup)
    val position = myFixture.file.findElementAt(myFixture.caretOffset - 1) ?: return false
    return FontFamilyContext.isFontFamily(position, myFixture.caretOffset)
  }

  private fun hasSample(name: String) =
    LookupElementPresentation.renderElement(FontLookup.decorate(LookupElementBuilder.create(name))).icon != null

  fun testAnInstalledFamilyShowsItsSampleQuotedOrNot() {
    assertEquals(true, hasSample("Arial"))
    assertEquals(true, hasSample("\"Arial\""))
  }

  fun testAFamilyThatIsNotInstalledShowsNone() {
    assertEquals(false, hasSample("serif"))
    assertEquals(false, hasSample("NoSuchFontFamily"))
  }

  fun testTheFontFamilyOfAStyleAttributeAndOfADirectiveIsRecognised() {
    assertEquals(true, isFontFamilyAtCaret("<Border style=\"color: red; font-family: Ari<caret>\" />"))
    assertEquals(true, isFontFamilyAtCaret("<Border style:font-family=\"Ari<caret>\" />"))
  }

  fun testAnotherPropIsNotAFontFamily() {
    assertEquals(false, isFontFamilyAtCaret("<Border style=\"width: Ari<caret>\" />"))
    assertEquals(false, isFontFamilyAtCaret("<Border style:width=\"Ari<caret>\" />"))
  }

  fun testTheFontFamilyOfAStyleBlockIsRecognised() {
    assertEquals(true, isFontFamilyAtCaret("<style>\n.a { font-family: Ari<caret> }\n</style>"))
  }
}
