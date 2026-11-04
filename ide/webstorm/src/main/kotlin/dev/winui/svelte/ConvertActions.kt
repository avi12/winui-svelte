package dev.winui.svelte

import com.intellij.codeInsight.intention.IntentionAction
import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.progress.ProgressManager
import com.intellij.openapi.progress.Task
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.psi.PsiFile

internal object Notices {
  private const val GROUP = "winui-svelte"

  fun show(
    project: Project,
    text: String
  ) {
    NotificationGroupManager
      .getInstance()
      .getNotificationGroup(GROUP)
      .createNotification(text, NotificationType.INFORMATION)
      .notify(project)
  }
}

class ConvertAllInFileIntention : IntentionAction {
  override fun getText() = "Convert all winui-svelte attributes in this file to CSS"

  override fun getFamilyName() = "winui-svelte"

  override fun isAvailable(
    project: Project,
    editor: Editor?,
    file: PsiFile?
  ) = file != null && file.virtualFile?.let { BulkConverter.isSvelte(it) } == true &&
    BulkConverter.hasConvertible(project, file)

  override fun invoke(
    project: Project,
    editor: Editor?,
    file: PsiFile?
  ) {
    if (file != null) {
      BulkConverter.convertFile(project, file)
    }
  }

  override fun startInWriteAction() = true
}

class ConvertFileAction :
  AnAction(),
  DumbAware {
  override fun getActionUpdateThread() = ActionUpdateThread.BGT

  override fun update(event: AnActionEvent) {
    val file = event.getData(CommonDataKeys.VIRTUAL_FILE)
    val project = event.project
    event.presentation.isEnabledAndVisible =
      project != null && event.getData(CommonDataKeys.EDITOR) != null && file != null &&
      BulkConverter.isSvelte(file) && WinuiProjectService.of(project).isWinuiLocation(file)
  }

  override fun actionPerformed(event: AnActionEvent) {
    val project = event.project ?: return
    val file = event.getData(CommonDataKeys.PSI_FILE) ?: return
    val count = BulkConverter.convertInCommand(project, file)
    Notices.show(project, "$count attributes converted in ${file.name}")
  }
}

class ConvertSelectionAction :
  AnAction(),
  DumbAware {
  override fun getActionUpdateThread() = ActionUpdateThread.BGT

  override fun update(event: AnActionEvent) {
    val selected = event.getData(CommonDataKeys.VIRTUAL_FILE_ARRAY).orEmpty()
    val project = event.project
    event.presentation.isEnabledAndVisible =
      project != null &&
      selected.any {
        (it.isDirectory || BulkConverter.isSvelte(it)) && WinuiProjectService.of(project).isWinuiLocation(it)
      }
  }

  override fun actionPerformed(event: AnActionEvent) {
    val project = event.project ?: return
    val roots: List<VirtualFile> = event.getData(CommonDataKeys.VIRTUAL_FILE_ARRAY).orEmpty().toList()
    ProgressManager.getInstance().run(
      object : Task.Modal(project, "Converting winui-svelte attributes to CSS", true) {
        override fun run(indicator: ProgressIndicator) {
          indicator.text = "Looking for Svelte files"
          val files = BulkConverter.collect(project, roots)
          var report: Report? = null
          ApplicationManager.getApplication().invokeAndWait {
            report = BulkConverter.convert(project, files, indicator)
          }

          report?.let { Notices.show(project, it.summary()) }
        }
      }
    )
  }
}
