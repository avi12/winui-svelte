package dev.winui.svelte

import com.intellij.codeInspection.LocalInspectionTool
import com.intellij.codeInspection.LocalQuickFixOnPsiElement
import com.intellij.codeInspection.ProblemHighlightType
import com.intellij.codeInspection.ProblemsHolder
import com.intellij.openapi.project.Project
import com.intellij.psi.PsiDocumentManager
import com.intellij.psi.PsiElement
import com.intellij.psi.PsiElementVisitor
import com.intellij.psi.PsiFile
import com.intellij.psi.XmlElementVisitor
import com.intellij.psi.xml.XmlAttribute

internal object DocumentEdits {
  fun apply(
    project: Project,
    file: PsiFile,
    edits: List<TextEdit>
  ) {
    val manager = PsiDocumentManager.getInstance(project)
    val document = manager.getDocument(file) ?: return
    for (edit in TextEdits.inApplicationOrder(edits)) {
      document.replaceString(edit.start, edit.end, edit.text)
    }

    manager.commitDocument(document)
  }
}

class CssCounterpartInspection : LocalInspectionTool() {
  override fun buildVisitor(
    holder: ProblemsHolder,
    isOnTheFly: Boolean
  ): PsiElementVisitor {
    val isWinuiFile = WinuiProjectService.of(holder.project).isWinuiFile(holder.file)
    if (!isWinuiFile) {
      return PsiElementVisitor.EMPTY_VISITOR
    }

    return object : XmlElementVisitor() {
      override fun visitXmlAttribute(attribute: XmlAttribute) {
        val isOffered = Destination.entries.any { AttributeRewriter.rewriteOf(attribute, it) != null }
        if (isOffered) {
          holder.registerProblem(
            attribute,
            "Can be written as CSS",
            ProblemHighlightType.GENERIC_ERROR_OR_WARNING,
            CssCounterpartFix(attribute)
          )
        }
      }
    }
  }
}

internal class CssCounterpartFix(
  attribute: XmlAttribute
) : LocalQuickFixOnPsiElement(attribute) {
  override fun getFamilyName() = "Convert winui-svelte attribute to CSS"

  override fun availableInBatchMode() = true

  override fun getText(): String {
    val attribute = startElement as? XmlAttribute ?: return familyName
    return rewriteOf(attribute)?.title ?: familyName
  }

  override fun isAvailable(
    project: Project,
    file: PsiFile,
    startElement: PsiElement,
    endElement: PsiElement
  ): Boolean {
    val attribute = startElement as? XmlAttribute ?: return false
    val isWinui = WinuiProjectService.of(project).isWinuiFile(file)
    return isWinui && rewriteOf(attribute) != null
  }

  override fun invoke(
    project: Project,
    file: PsiFile,
    startElement: PsiElement,
    endElement: PsiElement
  ) {
    val attribute = startElement as? XmlAttribute ?: return
    val rewrite = rewriteOf(attribute) ?: return
    val edits = AttributeRewriter.editsOf(attribute, rewrite) ?: return
    DocumentEdits.apply(project, file, edits)
  }

  private fun rewriteOf(attribute: XmlAttribute) =
    AttributeRewriter.rewriteOf(attribute, Settings.of(attribute.project).destination)
}
