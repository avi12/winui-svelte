package dev.winui.svelte

import com.intellij.psi.PsiFile
import com.intellij.psi.util.PsiTreeUtil
import com.intellij.psi.xml.XmlAttribute
import com.intellij.psi.xml.XmlTag
import com.intellij.psi.xml.XmlTokenType

internal object AttributeRewriter {
  fun rewriteOf(
    attribute: XmlAttribute,
    destination: Destination,
    table: ConversionTable = ConversionTable.bundled
  ): Rewrite? {
    val tag = attribute.parent ?: return null
    val mapping = table.mappingOf(attribute.name) ?: return null
    if (!SvelteSyntax.isComponent(tag.name) || hasDirectiveFor(tag, mapping, destination)) {
      return null
    }

    val value = PropValueReader.read(attribute) ?: return null
    val converted = Conversion.convert(mapping, value) ?: return null
    return rewriteFor(mapping, converted, destination)?.takeIf { editsOf(attribute, it) != null }
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

  private fun hasDirectiveFor(
    tag: XmlTag,
    mapping: Mapping,
    destination: Destination
  ) = destination == Destination.STYLE_DIRECTIVE &&
    tag.getAttribute("${SvelteSyntax.STYLE_DIRECTIVE_PREFIX}${mapping.cssProperty}") != null

  private fun rewriteFor(
    mapping: Mapping,
    converted: CssValue,
    destination: Destination
  ): Rewrite? =
    when {
      destination == Destination.STYLE_DIRECTIVE -> {
        Rewrite.Directive(mapping.cssProperty, StyleDirectiveText.render(mapping.cssProperty, converted))
      }

      converted is CssValue.Plain -> {
        Rewrite.Rule(Declaration(mapping.cssProperty, converted.text))
      }

      else -> {
        Rewrite
          .Toggles(
            mapping.cssProperty,
            ConditionLeaves.togglesOf(mapping, converted)
          ).takeIf { it.leaves.isNotEmpty() }
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
    val classAttribute = tag.getAttribute(SvelteSyntax.CLASS_ATTRIBUTE)
    val valueElement = classAttribute?.valueElement
    val text = valueElement?.text.orEmpty()
    val isStatic = SvelteSyntax.isStaticQuoted(text)
    val classContext =
      valueElement?.takeIf { isStatic }?.let {
        ClassAttribute(
          valueStart = it.textRange.startOffset + 1,
          valueEnd = it.textRange.endOffset - 1,
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
}
