package dev.winui.svelte

import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.openapi.roots.ProjectRootManager
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.psi.PsiFile
import com.intellij.psi.PsiManager
import com.intellij.psi.util.CachedValueProvider
import com.intellij.psi.util.CachedValuesManager

@Service(Service.Level.PROJECT)
class WinuiProjectService(
  private val project: Project
) {
  fun isWinuiFile(file: PsiFile): Boolean = isWinuiLocation(file.virtualFile ?: file.originalFile.virtualFile)

  fun isWinuiLocation(location: VirtualFile?): Boolean {
    val start =
      if (location?.isDirectory == true) {
        location
      } else {
        location?.parent
      }
    val nearest =
      generateSequence(start) { it.parent }
        .mapNotNull { it.findChild(MANIFEST_NAME) }
        .firstOrNull()
    val roots = ProjectRootManager.getInstance(project).contentRoots.mapNotNull { it.findChild(MANIFEST_NAME) }
    return (listOfNotNull(nearest) + roots).distinct().any { dependsOnLibrary(it) }
  }

  private fun dependsOnLibrary(manifest: VirtualFile): Boolean {
    val psi = PsiManager.getInstance(project).findFile(manifest) ?: return false
    return CachedValuesManager.getCachedValue(psi) {
      CachedValueProvider.Result.create(PackageManifest.dependsOnLibrary(psi.text), psi)
    }
  }

  companion object {
    private const val MANIFEST_NAME = "package.json"

    fun of(project: Project): WinuiProjectService = project.service()
  }
}
