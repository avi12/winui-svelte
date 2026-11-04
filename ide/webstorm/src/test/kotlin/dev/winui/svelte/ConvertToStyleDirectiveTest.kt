package dev.winui.svelte

import com.intellij.testFramework.fixtures.BasePlatformTestCase

class ConvertToStyleDirectiveTest : BasePlatformTestCase() {
  private val dependent = """{"dependencies":{"winui-svelte":"link:../winui-svelte"}}"""

  override fun setUp() {
    super.setUp()
    myFixture.enableInspections(ConvertToStyleDirectiveInspection::class.java)
  }

  private fun fixesAt(text: String, manifest: String?): List<String> {
    if (manifest != null) {
      myFixture.addFileToProject("package.json", manifest)
    }

    myFixture.configureByText("App.svelte", text)
    myFixture.doHighlighting()
    return myFixture.availableIntentions.map { it.text }.filter { it.startsWith("Convert to style:") }
  }

  private fun convert(text: String, expected: String) {
    myFixture.addFileToProject("package.json", dependent)
    myFixture.configureByText("App.svelte", text)
    myFixture.doHighlighting()
    val action = myFixture.availableIntentions.first { it.text.startsWith("Convert to style:") }
    myFixture.launchAction(action)
    myFixture.checkResult(expected)
  }

  fun testOffersTheFixOnAStaticKeyword() {
    assertEquals(
      listOf("Convert to style:visibility"),
      fixesAt("""<TextBlock visibility<caret>="Collapsed" />""", dependent)
    )
  }

  fun testRewritesAStaticKeyword() {
    convert(
      """<TextBlock visibility<caret>="Collapsed" />""",
      """<TextBlock style:visibility="hidden" />"""
    )
  }

  fun testRewritesAnEnumMember() {
    convert(
      """<TextBlock visibility<caret>={Visibility.Collapsed} />""",
      """<TextBlock style:visibility="hidden" />"""
    )
  }

  fun testRewritesACondition() {
    convert(
      """<TextBlock visibility<caret>={on ? Visibility.Visible : Visibility.Collapsed} />""",
      """<TextBlock style:visibility={on ? "visible" : "hidden"} />"""
    )
  }

  fun testRewritesALength() {
    convert("""<Border width<caret>={12} />""", """<Border style:width="12px" />""")
  }

  fun testRewritesANegativeLength() {
    convert("""<Border margin<caret>={-4} />""", """<Border style:margin="-4px" />""")
  }

  fun testRewritesAColor() {
    convert(
      """<Border background<caret>="#336699" />""",
      """<Border style:background-color="#336699" />"""
    )
  }

  fun testRewritesAThicknessTuple() {
    convert(
      """<Border padding<caret>={[1, 2, 3, 4]} />""",
      """<Border style:padding="2px 3px 4px 1px" />"""
    )
  }

  fun testRewritesABareBoolean() {
    convert(
      """<Border isHitTestVisible<caret>={false} />""",
      """<Border style:pointer-events="none" />"""
    )
  }

  fun testNoFixOnAnExpressionItCannotRead() {
    assertEquals(emptyList<String>(), fixesAt("""<TextBlock visibility<caret>={pick()} />""", dependent))
  }

  fun testNoFixOnAWordOfAnotherEnum() {
    assertEquals(
      emptyList<String>(),
      fixesAt("""<TextBlock visibility<caret>={Orientation.Collapsed} />""", dependent)
    )
  }

  fun testNoFixOnAPropWithoutACounterpart() {
    assertEquals(emptyList<String>(), fixesAt("""<TextBlock text<caret>="hi" />""", dependent))
  }

  fun testNoFixOnAnHtmlElement() {
    assertEquals(emptyList<String>(), fixesAt("""<div visibility<caret>="Collapsed"></div>""", dependent))
  }

  fun testNoFixWhenTheDirectiveIsThere() {
    assertEquals(
      emptyList<String>(),
      fixesAt("""<TextBlock visibility<caret>="Collapsed" style:visibility="visible" />""", dependent)
    )
  }

  fun testNoFixWithoutTheDependency() {
    assertEquals(
      emptyList<String>(),
      fixesAt("""<TextBlock visibility<caret>="Collapsed" />""", """{"dependencies":{"svelte":"^5"}}""")
    )
  }

  fun testNoFixWithoutAManifest() {
    assertEquals(emptyList<String>(), fixesAt("""<TextBlock visibility<caret>="Collapsed" />""", null))
  }
}
