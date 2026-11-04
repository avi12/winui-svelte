package dev.winui.svelte

import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.progress.ProgressManager
import com.intellij.openapi.progress.Task
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile

class ConvertSelectionAction :
  AnAction(),
  DumbAware {
  override fun getActionUpdateThread() = ActionUpdateThread.BGT

  override fun update(event: AnActionEvent) {
    val project = event.project
    val selected = event.getData(CommonDataKeys.VIRTUAL_FILE_ARRAY).orEmpty()
    event.presentation.isEnabledAndVisible = project != null && selected.any { isConvertibleSelection(project, it) }
  }

  override fun actionPerformed(event: AnActionEvent) {
    val project = event.project ?: return
    val roots = event.getData(CommonDataKeys.VIRTUAL_FILE_ARRAY).orEmpty().toList()
    ProgressManager.getInstance().run(ConversionTask(project, roots))
  }

  private fun isConvertibleSelection(
    project: Project,
    file: VirtualFile
  ) = (file.isDirectory || SvelteFiles.isSvelte(file)) && WinuiProjectService.of(project).isWinuiLocation(file)

  private class ConversionTask(
    private val project: Project,
    private val roots: List<VirtualFile>
  ) : Task.Modal(project, "Converting winui-svelte attributes to CSS", true) {
    override fun run(indicator: ProgressIndicator) {
      indicator.text = "Looking for Svelte files"
      val files = SvelteFiles.collect(project, roots)
      var report: Report? = null
      ApplicationManager.getApplication().invokeAndWait {
        report = SelectionConverter.convert(project, files, indicator)
      }

      report?.let { Notices.show(project, it.summary()) }
    }
  }
}
