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

  fun testAPropTypedFontFamilyInputIsRecognisedOnWinuiAndOnWrapperComponents() {
    assertEquals(true, isFontFamilyAtCaret("<TextBlock fontFamily=\"Ari<caret>\" />"))
    myFixture.addFileToProject("Label.svelte", component("face: FontFamilyInput"))
    val markup = usage("face")
    assertEquals(true, isFontFamilyAtCaret(markup))
    assertEquals(false, isFontFamilyAtCaret(usage("other")))
  }

  private fun component(prop: String) = "<script lang=\"ts\">\n  interface Props { $prop; }\n</script>\n"

  private fun usage(prop: String) =
    "<script lang=\"ts\">\n  import Label from \"./Label.svelte\";\n</script>\n<Label $prop=\"Ari<caret>\" />"
}
