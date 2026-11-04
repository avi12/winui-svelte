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
import com.intellij.psi.util.PsiTreeUtil
import com.intellij.psi.xml.XmlAttribute
import com.intellij.psi.xml.XmlTag
import com.intellij.psi.xml.XmlTokenType

internal sealed interface Rewrite {
  val cssProperty: String

  data class Rule(
    val declaration: Declaration
  ) : Rewrite {
    override val cssProperty get() = declaration.property
  }

  data class Toggles(
    override val cssProperty: String,
    val leaves: List<Leaf>
  ) : Rewrite

  data class Directive(
    override val cssProperty: String,
    val text: String
  ) : Rewrite
}

internal object AttributeRewriter {
  private const val MUSTACHE_START = "{"

  fun rewriteOf(
    attribute: XmlAttribute,
    destination: Destination,
    table: ConversionTable = ConversionTable.bundled
  ): Rewrite? {
    val tag = attribute.parent ?: return null
    val mapping = table.mappingOf(attribute.name)
    if (mapping == null || !isComponent(tag.name)) {
      return null
    }

    val isDirective = destination == Destination.STYLE_DIRECTIVE
    if (isDirective && tag.getAttribute("style:${mapping.cssProperty}") != null) {
      return null
    }

    val value = PropValueReader.read(attribute) ?: return null
    val converted = Conversion.convert(mapping, value) ?: return null
    val rewrite =
      when {
        isDirective -> {
          Rewrite.Directive(mapping.cssProperty, Conversion.render(mapping.cssProperty, converted))
        }

        converted is CssValue.Plain -> {
          Rewrite.Rule(Declaration(mapping.cssProperty, converted.text))
        }

        else -> {
          Rewrite.Toggles(mapping.cssProperty, Conversion.togglesOf(mapping, converted))
        }
      }
    val isEmpty = rewrite is Rewrite.Toggles && rewrite.leaves.isEmpty()
    return rewrite.takeUnless { isEmpty }?.takeIf { editsOf(attribute, it) != null }
  }

  fun editsOf(
    attribute: XmlAttribute,
    rewrite: Rewrite
  ): List<TextEdit>? {
    if (rewrite is Rewrite.Directive) {
      return listOf(TextEdit(attribute.textRange.startOffset, attribute.textRange.endOffset, rewrite.text))
    }

    val tag = attribute.parent ?: return null
    val context = contextOf(attribute, tag) ?: return null
    val text = attribute.containingFile.text
    return when (rewrite) {
      is Rewrite.Rule -> StyleBlock.plan(text, context, rewrite.declaration)
      is Rewrite.Toggles -> StyleBlock.planToggles(text, context, rewrite.cssProperty, rewrite.leaves)
      is Rewrite.Directive -> null
    }
  }

  fun firstConvertible(
    file: PsiFile,
    destination: Destination
  ): Pair<XmlAttribute, Rewrite>? =
    PsiTreeUtil
      .findChildrenOfType(file, XmlAttribute::class.java)
      .firstNotNullOfOrNull { attribute -> rewriteOf(attribute, destination)?.let { attribute to it } }

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
    val valueElement = classAttribute?.valueElement
    val text = valueElement?.text.orEmpty()
    val isQuoted = text.length >= 2 && (text.startsWith("\"") || text.startsWith("'"))
    val isStatic = isQuoted && !text.contains(MUSTACHE_START)
    var classContext: ClassAttribute? = null
    if (valueElement != null && isStatic) {
      classContext =
        ClassAttribute(
          valueStart = valueElement.textRange.startOffset + 1,
          valueEnd = valueElement.textRange.endOffset - 1,
          value = text.substring(1, text.length - 1)
        )
    }

    return TagContext(
      tagName = tag.name,
      tagNameEnd = nameEnd,
      attributeStart = attribute.textRange.startOffset,
      attributeEnd = attribute.textRange.endOffset,
      classAttribute = classContext,
      hasDynamicClass = classAttribute != null && !isStatic
    )
  }

  private fun isComponent(tagName: String) = tagName.firstOrNull()?.isUpperCase() == true

  fun describe(rewrite: Rewrite): String =
    when (rewrite) {
      is Rewrite.Rule -> {
        "Move to <style> as ${rewrite.declaration.property}: ${rewrite.declaration.value}"
      }

      is Rewrite.Toggles -> {
        "Move to <style> as ${rewrite.cssProperty}: ${rewrite.leaves.map { it.value }.distinct().joinToString(" / ")}"
      }

      is Rewrite.Directive -> {
        "Convert to style:${rewrite.cssProperty}"
      }
    }
}

internal object Edits {
  fun apply(
    project: Project,
    file: PsiFile,
    edits: List<TextEdit>
  ) {
    val manager = PsiDocumentManager.getInstance(project)
    val document = manager.getDocument(file) ?: return
    for (edit in edits.sortedWith(compareByDescending<TextEdit> { it.start }.thenByDescending { it.end })) {
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

class CssCounterpartFix(
  attribute: XmlAttribute
) : LocalQuickFixOnPsiElement(attribute) {
  override fun getFamilyName() = "Convert winui-svelte attribute to CSS"

  override fun availableInBatchMode() = true

  override fun getText(): String {
    val attribute = startElement as? XmlAttribute ?: return familyName
    val destination = Settings.of(attribute.project).destination
    return AttributeRewriter.rewriteOf(attribute, destination)?.let { AttributeRewriter.describe(it) } ?: familyName
  }

  override fun isAvailable(
    project: Project,
    file: PsiFile,
    startElement: PsiElement,
    endElement: PsiElement
  ): Boolean {
    val attribute = startElement as? XmlAttribute ?: return false
    val isWinui = WinuiProjectService.of(project).isWinuiFile(file)
    return isWinui && AttributeRewriter.rewriteOf(attribute, Settings.of(project).destination) != null
  }

  override fun invoke(
    project: Project,
    file: PsiFile,
    startElement: PsiElement,
    endElement: PsiElement
  ) {
    val attribute = startElement as? XmlAttribute ?: return
    val rewrite = AttributeRewriter.rewriteOf(attribute, Settings.of(project).destination) ?: return
    val edits = AttributeRewriter.editsOf(attribute, rewrite) ?: return
    Edits.apply(project, file, edits)
  }
}
