package dev.winui.svelte

import com.intellij.psi.PsiFile

/** The pictures of a file, each looked up; the one place the inlay, the popup and the inspection read them from. */
internal object PictureViews {
  fun entriesOf(file: PsiFile): List<Pair<PictureSpot, Picture>> {
    val isWanted = Settings.of(file.project).isPreviewEnabled(PreviewFeature.PICTURE)
    val isWinui = isWanted && WinuiProjectService.of(file.project).isWinuiFile(file)
    val virtualFile = file.virtualFile ?: file.originalFile.virtualFile
    if (!isWinui || virtualFile == null) {
      return emptyList()
    }

    val root = nearestRoot(virtualFile.path, file)
    return PictureFileSpots.of(file).map { it to PictureLoader.load(it.value, virtualFile.path, root, file.project) }
  }

  /** The pictures the spot belongs with: itself, and for a light or dark one its partner in the same object. */
  fun withPartners(
    entries: List<Pair<PictureSpot, Picture>>,
    spot: PictureSpot
  ): List<Pair<PictureSpot, Picture>> {
    val isPaired = spot.variant != PictureVariant.ANY
    return entries.filter { (other, _) ->
      other == spot || (isPaired && other.group == spot.group && other.variant != PictureVariant.ANY)
    }
  }

  private fun nearestRoot(
    path: String,
    file: PsiFile
  ): String {
    val folder = generateSequence(file.virtualFile?.parent ?: file.originalFile.virtualFile?.parent) { it.parent }
    val manifestFolder = folder.firstOrNull { it.findChild(SvelteSyntax.MANIFEST_NAME) != null }
    return manifestFolder?.path ?: file.project.basePath ?: path.substringBeforeLast('/')
  }
}
