package dev.winui.svelte

import com.intellij.openapi.application.ReadAction
import com.intellij.openapi.command.WriteCommandAction
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.project.Project
import com.intellij.openapi.roots.ProjectFileIndex
import com.intellij.openapi.vfs.VfsUtilCore
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.openapi.vfs.VirtualFileVisitor
import com.intellij.psi.PsiDocumentManager
import com.intellij.psi.PsiFile
import com.intellij.psi.PsiManager

data class Report(
  val attributes: Int,
  val changedFiles: Int,
  val skipped: Map<String, Int>
) {
  fun summary(): String {
    val skippedText =
      if (skipped.isEmpty()) {
        ""
      } else {
        ", skipped " + skipped.entries.joinToString("; ") { "${it.value} (${it.key})" }
      }
    return "$attributes attributes converted in $changedFiles files$skippedText"
  }
}

object BulkConverter {
  const val COMMAND_NAME = "Convert winui-svelte Attributes to CSS"
  const val GROUP_ID = "winui-svelte.convert"
  const val NO_DEPENDENCY = "no winui-svelte dependency"
  const val NOTHING_TO_CONVERT = "nothing to convert"
  const val NOT_SVELTE = "not a Svelte file"
  private const val EXTENSION = "svelte"
  private const val MAX_STEPS = 10_000
  private val skippedFolders = setOf("node_modules", "dist", "build", ".svelte-kit", ".git", ".idea", ".verify")

  fun isSvelte(file: VirtualFile) = !file.isDirectory && file.extension.equals(EXTENSION, ignoreCase = true)

  fun hasConvertible(
    project: Project,
    file: PsiFile
  ): Boolean {
    val isWinui = WinuiProjectService.of(project).isWinuiFile(file)
    val destination = Settings.of(project).destination
    return isWinui && AttributeRewriter.firstConvertible(file, destination) != null
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
        Edits.apply(project, file, edits)
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

  fun collect(
    project: Project,
    roots: List<VirtualFile>
  ): List<VirtualFile> =
    ReadAction.compute<List<VirtualFile>, RuntimeException> {
      val index = ProjectFileIndex.getInstance(project)
      val found = linkedSetOf<VirtualFile>()
      for (root in roots) {
        val visited = mutableListOf<VirtualFile>()
        VfsUtilCore.visitChildrenRecursively(
          root,
          object : VirtualFileVisitor<Unit>() {
            override fun visitFileEx(file: VirtualFile): Result {
              val isSkipped = file.isDirectory && (file.name in skippedFolders || index.isExcluded(file))
              if (isSkipped) {
                return SKIP_CHILDREN
              }

              val isWanted = !file.isDirectory && (file == root || isSvelte(file))
              if (isWanted) {
                visited += file
              }

              return CONTINUE
            }
          }
        )
        found += visited.sortedBy { it.path }
      }

      found.toList()
    }

  fun convert(
    project: Project,
    files: List<VirtualFile>,
    indicator: ProgressIndicator? = null
  ): Report {
    var attributes = 0
    var changed = 0
    val skipped = linkedMapOf<String, Int>()
    val psiManager = PsiManager.getInstance(project)
    WriteCommandAction
      .writeCommandAction(project)
      .withName(COMMAND_NAME)
      .withGroupId(GROUP_ID)
      .run<RuntimeException> {
        for ((index, virtualFile) in files.withIndex()) {
          indicator?.fraction = index.toDouble() / files.size
          indicator?.text2 = virtualFile.name
          val reason = skipReason(project, virtualFile)
          val psi = psiManager.findFile(virtualFile)
          val isConvertible = reason == null && psi != null
          val count =
            if (isConvertible) {
              convertFile(project, psi!!)
            } else {
              0
            }
          attributes += count
          if (count > 0) {
            changed += 1
          } else {
            val why = reason ?: NOTHING_TO_CONVERT
            skipped[why] = (skipped[why] ?: 0) + 1
          }
        }
      }
    return Report(attributes, changed, skipped)
  }

  private fun skipReason(
    project: Project,
    file: VirtualFile
  ): String? {
    if (!isSvelte(file)) {
      return NOT_SVELTE
    }

    val psi = PsiManager.getInstance(project).findFile(file) ?: return NOTHING_TO_CONVERT
    return NO_DEPENDENCY.takeUnless { WinuiProjectService.of(project).isWinuiFile(psi) }
  }
}
