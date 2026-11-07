package dev.winui.svelte

import com.intellij.codeInspection.InspectionManager
import com.intellij.codeInspection.LocalInspectionTool
import com.intellij.codeInspection.ProblemDescriptor
import com.intellij.codeInspection.ProblemHighlightType
import com.intellij.psi.PsiFile

/** A warning on the path of a picture whose local file is not there; remote pictures are never looked at. */
class MissingPictureInspection : LocalInspectionTool() {
  override fun checkFile(
    file: PsiFile,
    manager: InspectionManager,
    isOnTheFly: Boolean
  ): Array<ProblemDescriptor>? {
    val isFirstRoot = file.viewProvider.baseLanguage == file.language
    if (!isFirstRoot) {
      return null
    }

    val missing =
      PictureViews.entriesOf(file).filter { (_, picture) ->
        picture is Picture.Missing &&
          picture.candidates.isNotEmpty()
      }
    return missing
      .map { (spot, picture) ->
        manager.createProblemDescriptor(
          file,
          spot.range,
          "Picture file not found: ${picture.name}",
          ProblemHighlightType.WARNING,
          isOnTheFly
        )
      }.toTypedArray()
      .takeIf { it.isNotEmpty() }
  }
}
