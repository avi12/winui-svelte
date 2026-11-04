package dev.winui.svelte

import com.intellij.testFramework.fixtures.BasePlatformTestCase

class ConvertToStyleDirectiveTest : BasePlatformTestCase() {
  private val dependent = """{"dependencies":{"winui-svelte":"link:../winui-svelte"}}"""
  private val movePrefix = "Move to <style>"
  private val directivePrefix = "Convert to style:"

  override fun setUp() {
    super.setUp()
    myFixture.enableInspections(ConvertToStyleDirectiveInspection::class.java)
  }

  private fun fixesAt(text: String, manifest: String? = dependent): List<String> {
    if (manifest != null) {
      myFixture.addFileToProject("package.json", manifest)
    }

    myFixture.configureByText("App.svelte", text)
    myFixture.doHighlighting()
    return myFixture.availableIntentions.map { it.text }
      .filter { it.startsWith(movePrefix) || it.startsWith(directivePrefix) }
  }

  private fun apply(text: String, prefix: String, expected: String) {
    myFixture.addFileToProject("package.json", dependent)
    myFixture.configureByText("App.svelte", text)
    myFixture.doHighlighting()
    myFixture.launchAction(myFixture.availableIntentions.first { it.text.startsWith(prefix) })
    myFixture.checkResult(expected)
  }

  private fun move(before: String, after: String) = apply(before, movePrefix, after)

  fun testMovesToANewRuleWhenThereIsNoClassAndNoStyleBlock() {
    move(
      "<TextBlock visibility<caret>=\"Collapsed\" />",
      "<TextBlock class=\"text-block\" />\n\n<style>\n  .text-block {\n    display: none;\n  }\n</style>\n"
    )
  }

  fun testNamesTheActionAfterTheDeclaration() {
    assertEquals(
      listOf("Move to <style> as display: none"),
      fixesAt("<TextBlock visibility<caret>=\"Collapsed\" />")
    )
  }

  fun testMovesIntoAnExistingStyleBlock() {
    move(
      "<TextBlock visibility<caret>=\"Collapsed\" />\n\n<style>\n  .other {\n    color: red;\n  }\n</style>\n",
      "<TextBlock class=\"text-block\" />\n\n<style>\n  .other {\n    color: red;\n  }\n\n" +
        "  .text-block {\n    display: none;\n  }\n</style>\n"
    )
  }

  fun testUsesTheFirstClassWhenThereIsNoRule() {
    move(
      "<TextBlock class=\"note extra\" visibility<caret>=\"Collapsed\" />\n\n<style>\n</style>\n",
      "<TextBlock class=\"note extra\" />\n\n<style>\n  .note {\n    display: none;\n  }\n</style>\n"
    )
  }

  fun testAppendsToAnExistingRule() {
    move(
      "<TextBlock class=\"note\" visibility<caret>=\"Collapsed\" />\n\n" +
        "<style>\n  .note {\n    color: red;\n  }\n</style>\n",
      "<TextBlock class=\"note\" />\n\n" +
        "<style>\n  .note {\n    color: red;\n    display: none;\n  }\n</style>\n"
    )
  }

  fun testReplacesTheValueWhenThePropertyIsAlreadyDeclared() {
    move(
      "<TextBlock class=\"note\" visibility<caret>=\"Collapsed\" />\n\n" +
        "<style>\n  .note {\n    display: block;\n    color: red;\n  }\n</style>\n",
      "<TextBlock class=\"note\" />\n\n" +
        "<style>\n  .note {\n    display: none;\n    color: red;\n  }\n</style>\n"
    )
  }

  fun testAppendsAFreshNameWhenTheNameIsTaken() {
    move(
      "<TextBlock class=\"text-block\" /><TextBlock visibility<caret>=\"Collapsed\" />",
      "<TextBlock class=\"text-block\" /><TextBlock class=\"text-block-2\" />\n\n" +
        "<style>\n  .text-block-2 {\n    display: none;\n  }\n</style>\n"
    )
  }

  fun testASecondAttributeReusesTheClassAndTheRule() {
    myFixture.addFileToProject("package.json", dependent)
    myFixture.configureByText("App.svelte", "<TextBlock visibility<caret>=\"Collapsed\" opacity=\"0.5\" />")
    myFixture.doHighlighting()
    myFixture.launchAction(myFixture.availableIntentions.first { it.text.startsWith(movePrefix) })
    myFixture.checkResult(
      "<TextBlock class=\"text-block\" opacity=\"0.5\" />\n\n" +
        "<style>\n  .text-block {\n    display: none;\n  }\n</style>\n"
    )
  }

  fun testASecondNumberAttributeReusesTheClassAndTheRule() {
    move(
      "<TextBlock class=\"text-block\" opacity<caret>={0.5} />\n\n" +
        "<style>\n  .text-block {\n    display: none;\n  }\n</style>\n",
      "<TextBlock class=\"text-block\" />\n\n" +
        "<style>\n  .text-block {\n    display: none;\n    opacity: 0.5;\n  }\n</style>\n"
    )
  }

  fun testMovesAnEnumMember() {
    move(
      "<TextBlock visibility<caret>={Visibility.Collapsed} />",
      "<TextBlock class=\"text-block\" />\n\n<style>\n  .text-block {\n    display: none;\n  }\n</style>\n"
    )
  }

  fun testMovesALength() {
    move(
      "<Border width<caret>={12} />",
      "<Border class=\"border\" />\n\n<style>\n  .border {\n    width: 12px;\n  }\n</style>\n"
    )
  }

  fun testKeepsTheAttributesAroundTheOneMoved() {
    move(
      "<Border\n  text=\"a\"\n  width<caret>={12}\n  height={3}\n/>",
      "<Border class=\"border\"\n  text=\"a\"\n  height={3}\n/>\n\n<style>\n  .border {\n    width: 12px;\n  }\n</style>\n"
    )
  }

  fun testConvertsAConditionToADirective() {
    apply(
      "<TextBlock visibility<caret>={on ? Visibility.Visible : Visibility.Collapsed} />",
      directivePrefix,
      "<TextBlock style:display={on ? \"block\" : \"none\"} />"
    )
  }

  fun testOffersTheDirectiveNameForACondition() {
    assertEquals(
      listOf("Convert to style:display"),
      fixesAt("<TextBlock visibility<caret>={on ? Visibility.Visible : Visibility.Collapsed} />")
    )
  }

  fun testNoFixForAStaticValueWithADynamicClass() {
    assertEquals(
      emptyList<String>(),
      fixesAt("<TextBlock class={cls} visibility<caret>=\"Collapsed\" />")
    )
  }

  fun testNoStaticFixWhenTheStyleBlockIsNotCss() {
    assertEquals(
      emptyList<String>(),
      fixesAt("<TextBlock visibility<caret>=\"Collapsed\" />\n<style lang=\"scss\">\n</style>\n")
    )
  }

  fun testNoFixOnAnExpressionItCannotRead() {
    assertEquals(emptyList<String>(), fixesAt("<TextBlock visibility<caret>={pick()} />"))
  }

  fun testNoFixOnAWordOfAnotherEnum() {
    assertEquals(emptyList<String>(), fixesAt("<TextBlock visibility<caret>={Orientation.Collapsed} />"))
  }

  fun testNoFixOnAPropWithoutACounterpart() {
    assertEquals(emptyList<String>(), fixesAt("<TextBlock text<caret>=\"hi\" />"))
  }

  fun testNoFixOnAnHtmlElement() {
    assertEquals(emptyList<String>(), fixesAt("<div visibility<caret>=\"Collapsed\"></div>"))
  }

  fun testNoFixWhenTheDirectiveIsThere() {
    assertEquals(
      emptyList<String>(),
      fixesAt("<TextBlock visibility<caret>=\"Collapsed\" style:display=\"block\" />")
    )
  }

  fun testNoFixWithoutTheDependency() {
    assertEquals(
      emptyList<String>(),
      fixesAt("<TextBlock visibility<caret>=\"Collapsed\" />", """{"dependencies":{"svelte":"^5"}}""")
    )
  }

  fun testNoFixWithoutAManifest() {
    assertEquals(emptyList<String>(), fixesAt("<TextBlock visibility<caret>=\"Collapsed\" />", null))
  }
}
