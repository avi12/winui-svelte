package dev.winui.svelte

import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.actionSystem.impl.SimpleDataContext
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.testFramework.TestActionEvent
import com.intellij.testFramework.fixtures.BasePlatformTestCase
import org.junit.jupiter.api.Assertions.assertEquals

class BulkConverterTest : BasePlatformTestCase() {
  private val intentionText = "Convert all winui-svelte attributes in this file to CSS"
  private val mixed =
    "<TextBlock visibility=\"Collapsed\" />\n" +
      "<Border width={12} class=\"b\" />\n" +
      "<TextBlock visibility={on ? Visibility.Visible : Visibility.Collapsed} />"

  override fun setUp() {
    super.setUp()
    myFixture.enableInspections(CssCounterpartInspection::class.java)
  }

  private fun convertFile(text: String): Int {
    myFixture.configureByText("App.svelte", text)
    return FileConverter.convertInCommand(project, myFixture.file)
  }

  fun testSeveralElementsWithoutAClassGetDistinctNames() {
    myFixture.addFileToProject("package.json", TestManifests.DEPENDENT)
    val count = convertFile("<TextBlock visibility=\"Collapsed\" />\n<TextBlock visibility=\"Collapsed\" />")
    assertEquals(2, count)
    myFixture.checkResult(
      "<TextBlock class=\"text-block\" />\n<TextBlock class=\"text-block-2\" />\n\n" +
        "<style>\n  .text-block {\n    display: none;\n  }\n\n  .text-block-2 {\n    display: none;\n  }\n</style>\n"
    )
  }

  fun testMixedStaticAndDynamicElementsInTheStyleBlockMode() {
    myFixture.addFileToProject("package.json", TestManifests.DEPENDENT)
    assertEquals(3, convertFile(mixed))
    myFixture.checkResult(
      "<TextBlock class=\"text-block\" />\n<Border class=\"b\" />\n" +
        "<TextBlock class:text-block--collapsed={!on} />\n\n" +
        "<style>\n  .text-block {\n    display: none;\n  }\n\n  .b {\n    width: 12px;\n  }\n\n" +
        "  .text-block--collapsed {\n    display: none;\n  }\n</style>\n"
    )
  }

  fun testMixedElementsInTheDirectiveMode() {
    myFixture.addFileToProject("package.json", TestManifests.DEPENDENT)
    withDestination(project, Destination.STYLE_DIRECTIVE) {
      assertEquals(3, convertFile(mixed))
      myFixture.checkResult(
        "<TextBlock style:display=\"none\" />\n<Border style:width=\"12px\" class=\"b\" />\n" +
          "<TextBlock style:display={on ? \"block\" : \"none\"} />"
      )
    }
  }

  fun testASecondRunChangesNothing() {
    myFixture.addFileToProject("package.json", TestManifests.DEPENDENT)
    convertFile(mixed)
    val converted = myFixture.editor.document.text
    assertEquals(0, FileConverter.convertInCommand(project, myFixture.file))
    assertEquals(converted, myFixture.editor.document.text)
  }

  fun testNothingChangesWithoutTheDependency() {
    myFixture.addFileToProject("package.json", TestManifests.UNRELATED)
    myFixture.configureByText("App.svelte", mixed)
    assertEquals(false, FileConverter.hasConvertible(project, myFixture.file))
    myFixture.checkResult(mixed)
  }

  fun testTheIntentionIsOfferedOnlyWhereSomethingConverts() {
    myFixture.addFileToProject("package.json", TestManifests.DEPENDENT)
    myFixture.configureByText("App.svelte", "<TextBlock text=\"a\" /><caret>")
    myFixture.doHighlighting()
    assertEquals(false, myFixture.availableIntentions.any { it.text == intentionText })
    myFixture.configureByText("App.svelte", "<TextBlock text=\"a\" /><Border width={3} /><caret>")
    myFixture.doHighlighting()
    val intention = myFixture.availableIntentions.first { it.text == intentionText }
    myFixture.launchAction(intention)
    myFixture.checkResult(
      "<TextBlock text=\"a\" /><Border class=\"border\" />\n\n<style>\n  .border {\n    width: 3px;\n  }\n</style>\n"
    )
  }

  fun testTheSelectionExpandsFoldersSkipsExcludedOnesAndIgnoresOtherFiles() {
    myFixture.addFileToProject("package.json", TestManifests.DEPENDENT)
    val page = myFixture.addFileToProject("pages/a.svelte", "<Border width={12} />")
    val nested = myFixture.addFileToProject("pages/deep/b.svelte", "<Border width={5} /><Border height={6} />")
    val skipped = myFixture.addFileToProject("pages/node_modules/c.svelte", "<Border width={9} />")
    val untouched = myFixture.addFileToProject("pages/plain.svelte", "<Border text=\"x\" />")
    val notes = myFixture.addFileToProject("pages/readme.md", "# notes")
    val other = myFixture.addFileToProject("other/d.svelte", "<Border width={1} />")
    val roots = listOf(page.parent!!.virtualFile, notes.virtualFile, other.virtualFile)
    val files = SvelteFiles.collect(project, roots)
    assertEquals(
      listOf(page.name, "b.svelte", "plain.svelte", "readme.md", "d.svelte"),
      files.map { it.name }
    )
    val report = SelectionConverter.convert(project, files)
    assertEquals(4, report.attributes)
    assertEquals(3, report.changedFiles)
    assertEquals(
      mapOf(SkipReason.NOTHING_TO_CONVERT to 1, SkipReason.NOT_SVELTE to 1),
      report.skipped
    )
    assertEquals(true, nested.text.contains(".border-2"))
    assertEquals("<Border width={9} />", skipped.text)
    assertEquals("<Border text=\"x\" />", untouched.text)
    assertEquals(true, other.text.contains("width: 1px"))
  }

  fun testASelectionOutsideAProjectThatDependsOnTheLibraryIsSkipped() {
    myFixture.addFileToProject("package.json", TestManifests.UNRELATED)
    val file = myFixture.addFileToProject("a.svelte", "<Border width={12} />")
    val report = SelectionConverter.convert(project, listOf(file.virtualFile))
    assertEquals(0, report.attributes)
    assertEquals(mapOf(SkipReason.NO_DEPENDENCY to 1), report.skipped)
    assertEquals("<Border width={12} />", file.text)
  }

  private fun editorOrNull(hasEditor: Boolean) =
    if (hasEditor) {
      myFixture.editor
    } else {
      null
    }

  private fun isVisible(
    action: AnAction,
    selected: List<VirtualFile>,
    hasEditor: Boolean
  ): Boolean {
    val context =
      SimpleDataContext
        .builder()
        .add(CommonDataKeys.PROJECT, project)
        .add(CommonDataKeys.VIRTUAL_FILE, selected.firstOrNull())
        .add(CommonDataKeys.VIRTUAL_FILE_ARRAY, selected.toTypedArray())
        .add(CommonDataKeys.EDITOR, editorOrNull(hasEditor))
        .build()
    val event = TestActionEvent.createTestEvent(action, context)
    action.update(event)
    return event.presentation.isEnabledAndVisible
  }

  fun testTheFileActionIsVisibleOnlyInAProjectThatDependsOnTheLibrary() {
    myFixture.addFileToProject("package.json", TestManifests.DEPENDENT)
    myFixture.configureByText("App.svelte", "<Border width={3} />")
    assertEquals(true, isVisible(ConvertFileAction(), listOf(myFixture.file.virtualFile), hasEditor = true))
    assertEquals(false, isVisible(ConvertFileAction(), listOf(myFixture.file.virtualFile), hasEditor = false))
  }

  fun testTheFileActionIsHiddenWithoutTheDependency() {
    myFixture.addFileToProject("package.json", """{"devDependencies":{"svelte":"^5"}}""")
    myFixture.configureByText("App.svelte", "<Border width={3} />")
    assertEquals(false, isVisible(ConvertFileAction(), listOf(myFixture.file.virtualFile), hasEditor = true))
  }

  fun testTheFileActionIsHiddenOnAFileThatIsNotSvelte() {
    myFixture.addFileToProject("package.json", TestManifests.DEPENDENT)
    myFixture.configureByText("notes.txt", "x")
    assertEquals(false, isVisible(ConvertFileAction(), listOf(myFixture.file.virtualFile), hasEditor = true))
  }

  fun testTheSelectionActionIsVisibleWhenOneSelectedPathQualifies() {
    myFixture.addFileToProject("package.json", TestManifests.DEPENDENT)
    val page = myFixture.addFileToProject("pages/a.svelte", "<Border width={1} />")
    val notes = myFixture.addFileToProject("pages/readme.md", "x")
    assertEquals(
      true,
      isVisible(ConvertSelectionAction(), listOf(notes.virtualFile, page.virtualFile), hasEditor = false)
    )
    assertEquals(true, isVisible(ConvertSelectionAction(), listOf(page.parent!!.virtualFile), hasEditor = false))
    assertEquals(false, isVisible(ConvertSelectionAction(), listOf(notes.virtualFile), hasEditor = false))
  }

  fun testTheSelectionActionIsHiddenWithoutTheDependency() {
    myFixture.addFileToProject("package.json", """{"peerDependencies":{"svelte":"^5"}}""")
    val page = myFixture.addFileToProject("pages/a.svelte", "<Border width={1} />")
    assertEquals(false, isVisible(ConvertSelectionAction(), listOf(page.virtualFile), hasEditor = false))
    assertEquals(false, isVisible(ConvertSelectionAction(), listOf(page.parent!!.virtualFile), hasEditor = false))
  }

  fun testEveryDependencyFieldMakesTheActionsVisible() {
    for ((i, field) in listOf(
      "dependencies",
      "devDependencies",
      "peerDependencies",
      "optionalDependencies"
    ).withIndex()) {
      val page = myFixture.addFileToProject("p$i/package.json", """{"$field":{"winui-svelte":"workspace:*"}}""")
      val svelte = myFixture.addFileToProject("p$i/a.svelte", "<Border width={1} />")
      assertEquals(field, true, isVisible(ConvertSelectionAction(), listOf(svelte.virtualFile), hasEditor = false))
      assertEquals(field, true, page.virtualFile != null)
    }
  }
}
