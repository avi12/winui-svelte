package dev.winui.svelte

import com.intellij.psi.css.CssClass
import com.intellij.testFramework.fixtures.BasePlatformTestCase

class ComponentClassReferenceTest : BasePlatformTestCase() {
  private val dependent = """{"dependencies":{"winui-svelte":"link:../winui-svelte"}}"""
  private val style = "\n<style>\n  .note {\n    color: red;\n  }\n</style>\n"

  private fun configure(
    markup: String,
    manifest: String = dependent
  ) {
    myFixture.addFileToProject("package.json", manifest)
    myFixture.configureByText("A.svelte", markup + style)
  }

  fun testAClassStringInAComponentArrayResolvesToItsRule() {
    configure("<TextBlock class={[\"no<caret>te\", { \"b\": y }]} />")
    val target = myFixture.getReferenceAtCaretPositionWithAssertion().resolve()
    assertEquals(true, target is CssClass)
    assertEquals("note", (target as CssClass).name)
  }

  fun testAnObjectKeyInAComponentArrayResolvesToItsRule() {
    configure("<TextBlock class={[\"a\", { \"no<caret>te\": y }]} />")
    assertEquals(true, myFixture.getReferenceAtCaretPositionWithAssertion().resolve() is CssClass)
  }

  fun testRenamingFromTheMarkupRenamesTheRuleToo() {
    configure("<TextBlock class={[\"no<caret>te\", { \"b\": y }]} />")
    myFixture.renameElementAtCaret("memo")
    myFixture.checkResult(
      "<TextBlock class={[\"memo\", { \"b\": y }]} />\n<style>\n  .memo {\n    color: red;\n  }\n</style>\n"
    )
  }

  fun testRenamingTheRuleRenamesTheComponentUsagesAndTheHtmlOnes() {
    configure(
      "<TextBlock class={[\"note\", { \"b\": y }]} />\n<div class=\"note\"></div>\n<TextBlock class=\"note\" />"
    )
    myFixture.editor.caretModel.moveToOffset(
      myFixture.editor.document.text
        .indexOf(".note") + 3
    )
    myFixture.renameElementAtCaret("memo")
    myFixture.checkResult(
      "<TextBlock class={[\"memo\", { \"b\": y }]} />\n<div class=\"memo\"></div>\n<TextBlock class=\"memo\" />" +
        "\n<style>\n  .memo {\n    color: red;\n  }\n</style>\n"
    )
  }

  fun testRenamingTheRuleRenamesAClassDirectiveAsAWholeToken() {
    myFixture.addFileToProject("package.json", dependent)
    myFixture.configureByText(
      "A.svelte",
      "<TextBlock class:note--collapsed={x} />\n<style>\n  .note--coll<caret>apsed {\n    display: none;\n  }\n</style>\n"
    )
    myFixture.renameElementAtCaret("note--hidden")
    myFixture.checkResult(
      "<TextBlock class:note--hidden={x} />\n<style>\n  .note--hidden {\n    display: none;\n  }\n</style>\n"
    )
  }

  fun testFindUsagesOfTheRuleIncludesTheComponentArray() {
    configure("<TextBlock class={[\"note\", { \"b\": y }]} />\n<div class=\"note\"></div>")
    myFixture.editor.caretModel.moveToOffset(
      myFixture.editor.document.text
        .indexOf(".note") + 3
    )
    val target = myFixture.elementAtCaret
    val usages = myFixture.findUsages(target).map { it.element?.containingFile?.name + ":" + it.element?.text }
    assertEquals(true, usages.any { it.contains("\"note\"") })
    assertEquals(true, usages.size >= 2)
  }

  fun testGoToDeclarationFromTheMarkupReachesTheRule() {
    configure("<TextBlock class={[\"no<caret>te\"]} />")
    val target = myFixture.getReferenceAtCaretPositionWithAssertion().resolve() as CssClass
    assertEquals(true, target.textRange.startOffset > myFixture.editor.caretModel.offset)
  }

  fun testNoReferenceWithoutTheDependency() {
    configure("<TextBlock class={[\"no<caret>te\"]} />", """{"dependencies":{"svelte":"^5"}}""")
    val references = myFixture.file.findReferenceAt(myFixture.caretOffset)
    assertEquals(false, references?.resolve() is CssClass)
  }

  fun testNoReferenceOnAnHtmlElementArray() {
    configure("<div class={[\"no<caret>te\"]}></div>")
    val reference = myFixture.file.findReferenceAt(myFixture.caretOffset)
    assertEquals(false, reference?.resolve() is CssClass)
  }

  fun testCompletionInAComponentArrayOffersTheRules() {
    configure("<TextBlock class={[\"<caret>\"]} />")
    val variants = myFixture.completeBasic()?.map { it.lookupString }.orEmpty()
    assertEquals(true, "note" in variants)
  }
}
