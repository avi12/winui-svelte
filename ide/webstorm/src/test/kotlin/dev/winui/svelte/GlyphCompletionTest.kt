package dev.winui.svelte

import com.intellij.codeInsight.lookup.LookupElementPresentation
import com.intellij.testFramework.fixtures.BasePlatformTestCase
import org.junit.Assume.assumeTrue
import org.junit.jupiter.api.Assertions.assertEquals

class GlyphCompletionTest : BasePlatformTestCase() {
  private fun complete(
    markup: String,
    manifest: String = TestManifests.DEPENDENT,
    isFirst: Boolean = true
  ): List<Pair<String, LookupElementPresentation>> {
    if (isFirst) {
      myFixture.addFileToProject("package.json", manifest)
    }

    myFixture.configureByText("A.svelte", markup)
    return myFixture.completeBasic().orEmpty().map { it.lookupString to LookupElementPresentation.renderElement(it) }
  }

  override fun setUp() {
    super.setUp()
    assumeTrue("no Fluent icon font is installed", GlyphFont.family != null)
  }

  fun testAStringInAnExpressionIsCompletedWithTheIconNamesOnly() {
    val items = complete("<FontIcon glyph={isReady ? \"<caret>\" : \"Play\"} />").toMap()
    assertEquals(true, items.size > 100)
    assertEquals(emptyList<String>(), items.filter { it.value.icon == null }.keys.toList())
    val typed = complete("<FontIcon glyph={isReady ? \"Sav<caret>\" : \"Play\"} />", isFirst = false)
    assertEquals(true, typed.any { it.first == "Save" })
  }

  fun testTheNamesCarryTheIconAndTheCodePoint() {
    val items = complete("<FontIcon glyph=\"<caret>\" />").toMap()
    assertEquals(true, items.size > 100)
    assertEquals(emptyList<String>(), items.filter { it.value.icon == null }.keys.toList())
    val save =
      complete(
        "<FontIcon glyph=\"Sav<caret>\" />",
        TestManifests.DEPENDENT,
        isFirst = false
      ).toMap().getValue("Save")
    assertEquals("U+E74E", save.typeText)
    assertNotNull(save.icon)
  }

  fun testTheNamesAreNotDuplicated() {
    val names = complete("<FontIcon glyph=\"<caret>\" />").map { it.first }
    assertEquals(names.size, names.toSet().size)
  }

  fun testTypingFiltersAndKeepsTheIcons() {
    val items = complete("<FontIcon glyph=\"Sa<caret>\" />")
    assertEquals(true, items.isNotEmpty())
    assertEquals(true, items.any { it.first == "Save" })
    assertEquals(
      emptyList<String>(),
      items
        .filter {
          it.second.icon == null ||
            it.second.typeText?.startsWith("U+") != true
        }.map { it.first + "/" + it.second.typeText }
    )
  }

  fun testAnotherComponentGetsNoFluentNames() {
    assertEquals(
      true,
      complete("<TextBlock glyph=\"<caret>\" />").none { it.second.typeText?.startsWith("U+") == true }
    )
  }

  fun testNothingIsAddedWithoutTheDependency() {
    val items = complete("<FontIcon glyph=\"<caret>\" />", TestManifests.UNRELATED)
    assertEquals(true, items.none { it.second.typeText?.startsWith("U+") == true })
  }
}
