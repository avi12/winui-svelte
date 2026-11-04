package dev.winui.svelte

import com.intellij.codeInspection.LocalInspectionTool
import com.intellij.codeInspection.LocalQuickFixOnPsiElement
import com.intellij.codeInspection.ProblemHighlightType
import com.intellij.codeInspection.ProblemsHolder
import com.intellij.openapi.editor.Document
import com.intellij.openapi.project.Project
import com.intellij.psi.PsiDocumentManager
import com.intellij.psi.PsiElement
import com.intellij.psi.PsiElementVisitor
import com.intellij.psi.PsiFile
import com.intellij.psi.XmlElementVisitor
import com.intellij.psi.xml.XmlAttribute

internal data class Rewrite(val cssProperty: String, val text: String)

internal object AttributeRewriter {
  fun rewriteOf(attribute: XmlAttribute, table: ConversionTable = ConversionTable.bundled): Rewrite? {
    val tag = attribute.parent ?: return null
    if (!isComponent(tag.name)) {
      return null
    }

    val mapping = table.mappingOf(attribute.name) ?: return null
    val directive = "style:${mapping.cssProperty}"
    if (tag.getAttribute(directive) != null) {
      return null
    }

    val value = PropValueReader.read(attribute) ?: return null
    val converted = Conversion.convert(mapping, value) ?: return null
    return Rewrite(mapping.cssProperty, Conversion.render(mapping.cssProperty, converted))
  }

  private fun isComponent(tagName: String) = tagName.firstOrNull()?.isUpperCase() == true
}

class ConvertToStyleDirectiveInspection : LocalInspectionTool() {
  override fun buildVisitor(holder: ProblemsHolder, isOnTheFly: Boolean): PsiElementVisitor {
    val isWinuiFile = WinuiProjectService.of(holder.project).isWinuiFile(holder.file)
    if (!isWinuiFile) {
      return PsiElementVisitor.EMPTY_VISITOR
    }

    return object : XmlElementVisitor() {
      override fun visitXmlAttribute(attribute: XmlAttribute) {
        val rewrite = AttributeRewriter.rewriteOf(attribute) ?: return
        holder.registerProblem(
          attribute,
          "Can be written as style:${rewrite.cssProperty}",
          ProblemHighlightType.GENERIC_ERROR_OR_WARNING,
          ConvertToStyleDirectiveFix(attribute, rewrite.cssProperty)
        )
      }
    }
  }
}

class ConvertToStyleDirectiveFix(
  attribute: XmlAttribute,
  private val cssProperty: String
) : LocalQuickFixOnPsiElement(attribute) {
  override fun getFamilyName() = "Convert to style directive"

  override fun getText() = "Convert to style:$cssProperty"

  override fun invoke(project: Project, file: PsiFile, startElement: PsiElement, endElement: PsiElement) {
    val attribute = startElement as? XmlAttribute ?: return
    val rewrite = AttributeRewriter.rewriteOf(attribute) ?: return
    val document = documentOf(file, project) ?: return
    val range = attribute.textRange
    document.replaceString(range.startOffset, range.endOffset, rewrite.text)
    PsiDocumentManager.getInstance(project).commitDocument(document)
  }

  private fun documentOf(file: PsiFile, project: Project): Document? =
    PsiDocumentManager.getInstance(project).getDocument(file)
}
