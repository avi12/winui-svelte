package dev.winui.svelte

import com.intellij.openapi.command.WriteCommandAction
import com.intellij.openapi.project.Project
import com.intellij.psi.PsiDocumentManager
import com.intellij.psi.PsiFile

internal object FileConverter {
  const val COMMAND_NAME = "Convert winui-svelte Attributes to CSS"
  const val GROUP_ID = "winui-svelte.convert"
  private const val MAX_STEPS = 10_000

  fun hasConvertible(
    project: Project,
    file: PsiFile
  ): Boolean {
    val isWinui = WinuiProjectService.of(project).isWinuiFile(file)
    return isWinui && AttributeRewriter.firstConvertible(file, Settings.of(project).destination) != null
  }

  fun convertFile(
    project: Project,
    file: PsiFile
  ): Int {
    val manager = PsiDocumentManager.getInstance(project)
    val document = manager.getDocument(file) ?: return 0
    val destination = Settings.of(project).destination
    var count = 0
    var isProgressing = true
    while (isProgressing && count < MAX_STEPS) {
      manager.commitDocument(document)
      val before = document.text
      val step = AttributeRewriter.firstConvertible(file, destination)
      val edits = step?.let { AttributeRewriter.editsOf(it.first, it.second) }
      if (edits != null) {
        DocumentEdits.apply(project, file, edits)
      }

      isProgressing = document.text != before
      if (isProgressing) {
        count += 1
      }
    }

    return count
  }

  fun convertInCommand(
    project: Project,
    file: PsiFile
  ): Int {
    var count = 0
    WriteCommandAction
      .writeCommandAction(project, file)
      .withName(COMMAND_NAME)
      .withGroupId(GROUP_ID)
      .run<RuntimeException> { count = convertFile(project, file) }
    return count
  }
}
