package dev.winui.svelte

import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.openapi.roots.ProjectRootManager
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.openapi.vfs.VirtualFileManager
import com.intellij.psi.PsiFile
import com.intellij.psi.PsiManager
import com.intellij.psi.util.CachedValueProvider
import com.intellij.psi.util.CachedValuesManager

@Service(Service.Level.PROJECT)
class WinuiProjectService(
  private val project: Project
) {
  fun isWinuiFile(file: PsiFile): Boolean =
    CachedValuesManager.getCachedValue(file) {
      val manifests = manifestsFor(file.virtualFile ?: file.originalFile.virtualFile)
      val isDependent = manifests.any { dependsOnLibrary(it) }
      CachedValueProvider.Result.create(
        isDependent,
        manifests + VirtualFileManager.VFS_STRUCTURE_MODIFICATIONS
      )
    }

  private fun manifestsFor(file: VirtualFile?): List<PsiFile> {
    val nearest =
      generateSequence(file?.parent) { it.parent }
        .mapNotNull { it.findChild(MANIFEST_NAME) }
        .firstOrNull()
    val roots = ProjectRootManager.getInstance(project).contentRoots.mapNotNull { it.findChild(MANIFEST_NAME) }
    val psiManager = PsiManager.getInstance(project)
    return (listOfNotNull(nearest) + roots).distinct().mapNotNull { psiManager.findFile(it) }
  }

  private fun dependsOnLibrary(manifest: PsiFile) = PackageManifest.dependsOnLibrary(manifest.text)

  companion object {
    private const val MANIFEST_NAME = "package.json"

    fun of(project: Project): WinuiProjectService = project.service()
  }
}
