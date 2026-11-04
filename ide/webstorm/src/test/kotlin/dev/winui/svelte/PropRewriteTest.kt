package dev.winui.svelte

import com.intellij.testFramework.fixtures.BasePlatformTestCase

class PropRewriteTest : BasePlatformTestCase() {
  private val dependent = """{"dependencies":{"winui-svelte":"link:../winui-svelte"}}"""
  private val movePrefix = "Move to <style>"

  override fun setUp() {
    super.setUp()
    myFixture.enableInspections(CssCounterpartInspection::class.java)
  }

  private fun fixesAt(
    text: String,
    manifest: String? = dependent
  ): List<String> {
    if (manifest != null) {
      myFixture.addFileToProject("package.json", manifest)
    }

    myFixture.configureByText("App.svelte", text)
    myFixture.doHighlighting()
    return myFixture.availableIntentions
      .map { it.text }
      .filter { it.startsWith(movePrefix) || it.startsWith("Convert to style:") }
  }

  private fun apply(
    text: String,
    prefix: String,
    expected: String
  ) {
    myFixture.addFileToProject("package.json", dependent)
    myFixture.configureByText("App.svelte", text)
    myFixture.doHighlighting()
    myFixture.launchAction(myFixture.availableIntentions.first { it.text.startsWith(prefix) })
    myFixture.checkResult(expected)
  }

  private fun move(
    before: String,
    after: String
  ) = apply(before, movePrefix, after)

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

  private val ternary = "{on ? Visibility.Visible : Visibility.Collapsed}"

  private fun withDestination(
    destination: Destination,
    body: () -> Unit
  ) {
    val settings = Settings.of(project)
    val before = settings.destination
    settings.destination = destination
    try {
      body()
    } finally {
      settings.destination = before
    }
  }

  fun testMovesAConditionToAClassDirectiveAndARule() {
    move(
      "<TextBlock visibility<caret>=$ternary />",
      "<TextBlock class:text-block--collapsed={!on} />\n\n" +
        "<style>\n  .text-block--collapsed {\n    display: none;\n  }\n</style>\n"
    )
  }

  fun testKeepsAStaticClassAndNamesTheModifierAfterIt() {
    move(
      "<TextBlock class=\"note\" visibility<caret>={hasNote ? Visibility.Visible : Visibility.Collapsed}>{note}</TextBlock>",
      "<TextBlock class=\"note\" class:note--collapsed={!hasNote}>{note}</TextBlock>\n\n" +
        "<style>\n  .note--collapsed {\n    display: none;\n  }\n</style>\n"
    )
  }

  fun testAConditionBesideADynamicClass() {
    move(
      "<TextBlock class={cls} visibility<caret>=$ternary />",
      "<TextBlock class={cls} class:text-block--collapsed={!on} />\n\n" +
        "<style>\n  .text-block--collapsed {\n    display: none;\n  }\n</style>\n"
    )
  }

  fun testAConditionAppendsToTheRuleThatExists() {
    move(
      "<TextBlock class=\"note\" visibility<caret>=$ternary />\n\n" +
        "<style>\n  .note--collapsed {\n    color: red;\n  }\n</style>\n",
      "<TextBlock class=\"note\" class:note--collapsed={!on} />\n\n" +
        "<style>\n  .note--collapsed {\n    color: red;\n    display: none;\n  }\n</style>\n"
    )
  }

  fun testAConditionAddsItsRuleToAnExistingStyleBlock() {
    move(
      "<TextBlock visibility<caret>=$ternary />\n\n<style>\n  .other {\n    color: red;\n  }\n</style>\n",
      "<TextBlock class:text-block--collapsed={!on} />\n\n<style>\n  .other {\n    color: red;\n  }\n\n" +
        "  .text-block--collapsed {\n    display: none;\n  }\n</style>\n"
    )
  }

  fun testAComplexConditionIsNegatedInParentheses() {
    move(
      "<TextBlock visibility<caret>={a && b ? Visibility.Visible : Visibility.Collapsed} />",
      "<TextBlock class:text-block--collapsed={!(a && b)} />\n\n" +
        "<style>\n  .text-block--collapsed {\n    display: none;\n  }\n</style>\n"
    )
  }

  fun testANestedConditionAndsThePathAndJoinsLeavesOfOneModifier() {
    move(
      "<TextBlock visibility<caret>={a ? Visibility.Collapsed : b ? Visibility.Visible : Visibility.Collapsed} />",
      "<TextBlock class:text-block--collapsed={(a) || (!a && !b)} />\n\n" +
        "<style>\n  .text-block--collapsed {\n    display: none;\n  }\n</style>\n"
    )
  }

  fun testNoFixForAConditionOfDefaultsOnly() {
    assertEquals(
      emptyList<String>(),
      fixesAt("<TextBlock visibility<caret>={on ? Visibility.Visible : Visibility.Visible} />")
    )
  }

  fun testNoFixForAConditionWhenTheStyleBlockIsNotCss() {
    assertEquals(
      emptyList<String>(),
      fixesAt("<TextBlock visibility<caret>=$ternary />\n<style lang=\"scss\">\n</style>\n")
    )
  }

  fun testTheDirectiveModeWritesAStaticValueAsAStyleDirective() {
    withDestination(Destination.STYLE_DIRECTIVE) {
      apply(
        "<TextBlock visibility<caret>=\"Collapsed\" />",
        "Convert to style:display",
        "<TextBlock style:display=\"none\" />"
      )
    }
  }

  fun testTheDirectiveModeKeepsEveryLeafOfACondition() {
    withDestination(Destination.STYLE_DIRECTIVE) {
      apply(
        "<TextBlock visibility<caret>=$ternary />",
        "Convert to style:display",
        "<TextBlock style:display={on ? \"block\" : \"none\"} />"
      )
    }
  }

  fun testTheDirectiveModeOffersNothingWhenTheDirectiveIsThere() {
    withDestination(Destination.STYLE_DIRECTIVE) {
      assertEquals(
        emptyList<String>(),
        fixesAt("<TextBlock visibility<caret>=\"Collapsed\" style:display=\"block\" />")
      )
    }
  }

  fun testTheActionNameFollowsTheSetting() {
    assertEquals(
      listOf("Move to <style> as display: none"),
      fixesAt("<TextBlock visibility<caret>=\"Collapsed\" />")
    )
    withDestination(Destination.STYLE_DIRECTIVE) {
      assertEquals(listOf("Convert to style:display"), fixesAt("<TextBlock visibility<caret>=\"Collapsed\" />", null))
    }
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
