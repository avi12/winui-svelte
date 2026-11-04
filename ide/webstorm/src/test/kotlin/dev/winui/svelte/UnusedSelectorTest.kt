package dev.winui.svelte

import com.intellij.psi.css.inspections.CssUnusedSymbolInspection
import com.intellij.testFramework.fixtures.BasePlatformTestCase
import org.junit.jupiter.api.Assertions.assertEquals

class UnusedSelectorTest : BasePlatformTestCase() {
  private val markup =
    "<TextBlock class=\"static other\" />\n" +
      "<TextBlock class=\"note\" class:note--collapsed={x} class:dir={y} />\n" +
      "<TextBlock class={[\"arr\", { \"obj\": z, \"obj--mod\": z }]} />\n" +
      "<div class=\"html\"></div>\n<div class:htmldir={q}></div>\n"
  private val rules =
    "<style>\n  .static {}\n  .other {}\n  .note {}\n  .note--collapsed {}\n  .dir {}\n  .arr {}\n  .obj {}\n" +
      "  .obj--mod {}\n  .html {}\n  .htmldir {}\n  .unused {}\n</style>\n"

  private fun unusedSelectors(manifest: String): List<String> {
    myFixture.addFileToProject("package.json", manifest)
    myFixture.enableInspections(CssUnusedSymbolInspection())
    myFixture.configureByText("A.svelte", markup + rules)
    return myFixture
      .doHighlighting()
      .mapNotNull { it.description }
      .filter { it.endsWith("is never used") }
      .map { it.removePrefix("Selector ").removeSuffix(" is never used") }
      .sorted()
  }

  fun testEveryFormOfUsageOnAComponentCountsAndAnUnusedRuleIsStillReported() {
    assertEquals(listOf("unused"), unusedSelectors(TestManifests.DEPENDENT))
  }

  fun testNothingChangesInAProjectWithoutTheDependency() {
    assertEquals(
      listOf("arr", "dir", "note--collapsed", "obj", "obj--mod", "unused"),
      unusedSelectors(TestManifests.UNRELATED)
    )
  }
}
