package dev.winui.svelte

import com.intellij.codeInsight.intention.IntentionAction
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.project.Project
import com.intellij.psi.PsiFile

/** Offers to convert every CSS value of the file that has a WinUI counterpart */
class ConvertAllInFileIntention : IntentionAction {
  override fun getText() = "Convert all winui-svelte attributes in this file to CSS"

  override fun getFamilyName() = "winui-svelte"

  override fun isAvailable(
    project: Project,
    editor: Editor?,
    file: PsiFile?
  ): Boolean {
    val virtualFile = file?.virtualFile ?: return false
    return SvelteFiles.isSvelte(virtualFile) && FileConverter.hasConvertible(project, file)
  }

  override fun invoke(
    project: Project,
    editor: Editor?,
    file: PsiFile?
  ) {
    if (file != null) {
      FileConverter.convertFile(project, file)
    }
  }

  override fun startInWriteAction() = true
}
