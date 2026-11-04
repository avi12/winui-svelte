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
import com.intellij.psi.xml.XmlTag
import com.intellij.psi.xml.XmlTokenType

internal sealed interface Rewrite {
  val cssProperty: String

  data class Directive(
    override val cssProperty: String,
    val text: String
  ) : Rewrite

  data class Rule(
    val declaration: Declaration
  ) : Rewrite {
    override val cssProperty get() = declaration.property
  }
}

internal object AttributeRewriter {
  private const val MUSTACHE_START = "{"

  fun rewriteOf(
    attribute: XmlAttribute,
    table: ConversionTable = ConversionTable.bundled
  ): Rewrite? {
    val tag = attribute.parent ?: return null
    if (!isComponent(tag.name)) {
      return null
    }

    val mapping = table.mappingOf(attribute.name) ?: return null
    if (tag.getAttribute("style:${mapping.cssProperty}") != null) {
      return null
    }

    val value = PropValueReader.read(attribute) ?: return null
    val converted = Conversion.convert(mapping, value) ?: return null
    if (converted is CssValue.Plain) {
      return staticRewrite(attribute, Declaration(mapping.cssProperty, converted.text))
    }

    return Rewrite.Directive(mapping.cssProperty, Conversion.render(mapping.cssProperty, converted))
  }

  fun editsOf(
    attribute: XmlAttribute,
    declaration: Declaration
  ): List<TextEdit>? {
    val tag = attribute.parent ?: return null
    val context = contextOf(attribute, tag) ?: return null
    return StyleBlock.plan(attribute.containingFile.text, context, declaration)
  }

  private fun staticRewrite(
    attribute: XmlAttribute,
    declaration: Declaration
  ): Rewrite? {
    val edits = editsOf(attribute, declaration)
    return if (edits == null) {
      null
    } else {
      Rewrite.Rule(declaration)
    }
  }

  private fun contextOf(
    attribute: XmlAttribute,
    tag: XmlTag
  ): TagContext? {
    val nameEnd =
      tag.node
        .findChildByType(XmlTokenType.XML_NAME)
        ?.textRange
        ?.endOffset ?: return null
    val classAttribute = tag.getAttribute("class")
    var classContext: ClassAttribute? = null
    if (classAttribute != null) {
      val valueElement = classAttribute.valueElement ?: return null
      val text = valueElement.text
      val isStatic = !text.contains(MUSTACHE_START)
      if (!isStatic) {
        return null
      }

      val quoted = text.length >= 2 && (text.startsWith("\"") || text.startsWith("'"))
      if (!quoted) {
        return null
      }

      val start = valueElement.textRange.startOffset + 1
      classContext = ClassAttribute(start, valueElement.textRange.endOffset - 1, text.substring(1, text.length - 1))
    }

    return TagContext(
      tagName = tag.name,
      tagNameEnd = nameEnd,
      attributeStart = attribute.textRange.startOffset,
      attributeEnd = attribute.textRange.endOffset,
      classAttribute = classContext
    )
  }

  private fun isComponent(tagName: String) = tagName.firstOrNull()?.isUpperCase() == true
}

class ConvertToStyleDirectiveInspection : LocalInspectionTool() {
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
        val rewrite = AttributeRewriter.rewriteOf(attribute) ?: return
        when (rewrite) {
          is Rewrite.Rule -> {
            holder.registerProblem(
              attribute,
              "Can be written in the style block",
              ProblemHighlightType.GENERIC_ERROR_OR_WARNING,
              MoveToStyleBlockFix(attribute, rewrite.declaration)
            )
          }

          is Rewrite.Directive -> {
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
  }
}

class MoveToStyleBlockFix(
  attribute: XmlAttribute,
  private val declaration: Declaration
) : LocalQuickFixOnPsiElement(attribute) {
  override fun getFamilyName() = "Move to style block"

  override fun getText() = "Move to <style> as ${declaration.property}: ${declaration.value}"

  override fun invoke(
    project: Project,
    file: PsiFile,
    startElement: PsiElement,
    endElement: PsiElement
  ) {
    val attribute = startElement as? XmlAttribute ?: return
    val edits = AttributeRewriter.editsOf(attribute, declaration) ?: return
    val document = PsiDocumentManager.getInstance(project).getDocument(file) ?: return
    for (edit in edits.sortedWith(compareByDescending<TextEdit> { it.start }.thenByDescending { it.end })) {
      document.replaceString(edit.start, edit.end, edit.text)
    }

    PsiDocumentManager.getInstance(project).commitDocument(document)
  }
}

class ConvertToStyleDirectiveFix(
  attribute: XmlAttribute,
  private val cssProperty: String
) : LocalQuickFixOnPsiElement(attribute) {
  override fun getFamilyName() = "Convert to style directive"

  override fun getText() = "Convert to style:$cssProperty"

  override fun invoke(
    project: Project,
    file: PsiFile,
    startElement: PsiElement,
    endElement: PsiElement
  ) {
    val attribute = startElement as? XmlAttribute ?: return
    val rewrite = AttributeRewriter.rewriteOf(attribute) as? Rewrite.Directive ?: return
    val document = PsiDocumentManager.getInstance(project).getDocument(file) ?: return
    val range = attribute.textRange
    document.replaceString(range.startOffset, range.endOffset, rewrite.text)
    PsiDocumentManager.getInstance(project).commitDocument(document)
  }
}
