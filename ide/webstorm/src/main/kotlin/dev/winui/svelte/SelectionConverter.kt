package dev.winui.svelte

import com.intellij.openapi.command.WriteCommandAction
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.psi.PsiManager

internal object SelectionConverter {
  fun convert(
    project: Project,
    files: List<VirtualFile>,
    indicator: ProgressIndicator? = null
  ): Report {
    var attributes = 0
    var changed = 0
    val skipped = linkedMapOf<SkipReason, Int>()
    WriteCommandAction
      .writeCommandAction(project)
      .withName(FileConverter.COMMAND_NAME)
      .withGroupId(FileConverter.GROUP_ID)
      .run<RuntimeException> {
        for ((index, file) in files.withIndex()) {
          indicator?.fraction = index.toDouble() / files.size
          indicator?.text2 = file.name
          val count = convertOne(project, file)
          attributes += count.converted
          changed += count.changed
          count.skipReason?.let { skipped[it] = (skipped[it] ?: 0) + 1 }
        }
      }
    return Report(attributes, changed, skipped)
  }

  private fun convertOne(
    project: Project,
    file: VirtualFile
  ): Outcome {
    val psi = PsiManager.getInstance(project).findFile(file)
    val reason =
      when {
        !SvelteFiles.isSvelte(file) -> SkipReason.NOT_SVELTE
        psi == null -> SkipReason.NOTHING_TO_CONVERT
        !WinuiProjectService.of(project).isWinuiFile(psi) -> SkipReason.NO_DEPENDENCY
        else -> null
      }
    if (reason != null || psi == null) {
      return Outcome(0, 0, reason)
    }

    val converted = FileConverter.convertFile(project, psi)
    return when {
      converted > 0 -> Outcome(converted, 1, null)
      else -> Outcome(0, 0, SkipReason.NOTHING_TO_CONVERT)
    }
  }

  private data class Outcome(
    val converted: Int,
    val changed: Int,
    val skipReason: SkipReason?
  )
}
