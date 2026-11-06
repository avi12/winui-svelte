package dev.winui.svelte

import com.intellij.testFramework.fixtures.BasePlatformTestCase
import org.junit.jupiter.api.Assertions.assertEquals

class ResourceDocumentationProviderTest : BasePlatformTestCase() {
  private fun hover(
    markup: String,
    manifest: String = TestManifests.DEPENDENT
  ): String? {
    myFixture.addFileToProject("package.json", manifest)
    myFixture.configureByText("A.svelte", markup)
    val provider = ResourceDocumentationProvider()
    val context = myFixture.file.findElementAt(myFixture.caretOffset)
    val element =
      provider.getCustomDocumentationElement(myFixture.editor, myFixture.file, context, myFixture.caretOffset)
        ?: return null
    return provider.generateDoc(element, context)
  }

  fun testAResourceNameShowsItsLightAndDarkValue() {
    val doc = hover("<style>\n.a { color: var(--card-background-fill-color-d<caret>efault) }\n</style>")
    assertEquals(true, doc?.contains("light #ffffffb3, dark #ffffff0d") == true)
  }

  fun testAnAppsOwnPropertyGetsNone() {
    assertNull(hover("<style>\n.a { color: var(--my-ow<caret>n) }\n</style>"))
  }

  fun testNothingIsShownWithoutTheDependency() {
    val markup = "<style>\n.a { color: var(--card-background-fill-<caret>color-default) }\n</style>"
    assertNull(hover(markup, TestManifests.UNRELATED))
  }
}
