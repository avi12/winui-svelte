package dev.winui.svelte

import com.intellij.openapi.application.ReadAction
import com.intellij.openapi.project.Project
import com.intellij.openapi.roots.ProjectFileIndex
import com.intellij.openapi.vfs.VfsUtilCore
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.openapi.vfs.VirtualFileVisitor

internal object SvelteFiles {
  private const val EXTENSION = "svelte"
  private val skippedFolders = setOf("node_modules", "dist", "build", ".svelte-kit", ".git", ".idea", ".verify")

  fun isSvelte(file: VirtualFile) = !file.isDirectory && file.extension.equals(EXTENSION, ignoreCase = true)

  fun collect(
    project: Project,
    roots: List<VirtualFile>
  ): List<VirtualFile> =
    ReadAction.computeBlocking<List<VirtualFile>, RuntimeException> {
      val index = ProjectFileIndex.getInstance(project)
      roots.flatMap { root -> filesUnder(root, index).sortedBy { it.path } }.distinct()
    }

  private fun filesUnder(
    root: VirtualFile,
    index: ProjectFileIndex
  ): List<VirtualFile> {
    val visited = mutableListOf<VirtualFile>()
    VfsUtilCore.visitChildrenRecursively(
      root,
      object : VirtualFileVisitor<Unit>() {
        override fun visitFileEx(file: VirtualFile): Result {
          val isSkipped = file.isDirectory && (file.name in skippedFolders || index.isExcluded(file))
          val isWanted = !file.isDirectory && (file == root || isSvelte(file))
          if (isWanted) {
            visited += file
          }

          return when {
            isSkipped -> SKIP_CHILDREN
            else -> CONTINUE
          }
        }
      }
    )
    return visited
  }
}
