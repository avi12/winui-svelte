package dev.winui.svelte

import com.intellij.codeInsight.lookup.LookupElementPresentation
import com.intellij.testFramework.fixtures.BasePlatformTestCase
import org.junit.jupiter.api.Assertions.assertEquals

class ResourceCompletionTest : BasePlatformTestCase() {
  private fun complete(
    markup: String,
    manifest: String = TestManifests.DEPENDENT
  ): List<Pair<String, LookupElementPresentation>> {
    myFixture.addFileToProject("package.json", manifest)
    myFixture.configureByText("A.svelte", markup)
    return myFixture.completeBasic().orEmpty().map { it.lookupString to LookupElementPresentation.renderElement(it) }
  }

  fun testAVarCallIsCompletedWithTheResourcesAndAColorHasASwatch() {
    val items = complete("<style>\n.a { color: var(--card-back<caret>) }\n</style>").toMap()
    val card = items.getValue("--card-background-fill-color-default")
    assertEquals("Color", card.typeText)
    assertNotNull(card.icon)
  }

  fun testAResourceThatIsNoColorHasNoSwatch() {
    val items = complete("<style>\n.a { border-radius: var(--control-c<caret>) }\n</style>").toMap()
    assertNull(items.getValue("--control-corner-radius").icon)
  }

  fun testNothingIsOfferedOutsideAVarCall() {
    val items = complete("<style>\n.a { color: red<caret> }\n</style>")
    assertEquals(false, items.any { it.first.startsWith("--card") })
  }

  fun testNothingIsOfferedWithoutTheDependency() {
    val markup = "<style>\n.a { color: var(--card-back<caret>) }\n</style>"
    assertEquals(false, complete(markup, TestManifests.UNRELATED).any { it.first.startsWith("--card") })
  }

  fun testNothingIsOfferedWhenTheSettingIsOff() {
    Settings.of(project).isResourceHintsEnabled = false
    try {
      val items = complete("<style>\n.a { color: var(--card-back<caret>) }\n</style>")
      assertEquals(false, items.any { it.first.startsWith("--card-background") })
    } finally {
      Settings.of(project).isResourceHintsEnabled = true
    }
  }
}
