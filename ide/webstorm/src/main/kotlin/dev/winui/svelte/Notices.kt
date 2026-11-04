package dev.winui.svelte

import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import com.intellij.openapi.project.Project

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
