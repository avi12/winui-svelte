package dev.winui.svelte

import com.intellij.openapi.project.Project

internal fun withDestination(
  project: Project,
  destination: Destination,
  body: () -> Unit
) {
  val settings = Settings.of(project)
  val before = settings.destination
  settings.destination = destination
  try {
    body()
  } finally {
    settings.destination = before
  }
}
