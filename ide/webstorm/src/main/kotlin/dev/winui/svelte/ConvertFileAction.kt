package dev.winui.svelte

import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.project.DumbAware

class ConvertFileAction :
  AnAction(),
  DumbAware {
  override fun getActionUpdateThread() = ActionUpdateThread.BGT

  override fun update(event: AnActionEvent) {
    val project = event.project
    val file = event.getData(CommonDataKeys.VIRTUAL_FILE)
    val hasEditor = event.getData(CommonDataKeys.EDITOR) != null
    val isWinuiSvelteFile =
      project != null && file != null && SvelteFiles.isSvelte(file) &&
        WinuiProjectService.of(project).isWinuiLocation(file)
    event.presentation.isEnabledAndVisible = hasEditor && isWinuiSvelteFile
  }

  override fun actionPerformed(event: AnActionEvent) {
    val project = event.project ?: return
    val file = event.getData(CommonDataKeys.PSI_FILE) ?: return
    val count = FileConverter.convertInCommand(project, file)
    Notices.show(project, "$count attributes converted in ${file.name}")
  }
}
