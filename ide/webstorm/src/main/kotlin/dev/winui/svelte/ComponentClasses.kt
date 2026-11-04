package dev.winui.svelte

import com.intellij.lang.javascript.psi.JSArrayLiteralExpression
import com.intellij.lang.javascript.psi.JSLiteralExpression
import com.intellij.lang.javascript.psi.JSProperty
import com.intellij.openapi.util.TextRange
import com.intellij.patterns.PlatformPatterns
import com.intellij.patterns.StandardPatterns
import com.intellij.psi.AbstractElementManipulator
import com.intellij.psi.PsiElement
import com.intellij.psi.PsiFile
import com.intellij.psi.PsiReference
import com.intellij.psi.PsiReferenceBase
import com.intellij.psi.PsiReferenceContributor
import com.intellij.psi.PsiReferenceProvider
import com.intellij.psi.PsiReferenceRegistrar
import com.intellij.psi.css.CssClass
import com.intellij.psi.css.CssSelectorSuffix
import com.intellij.psi.css.CssSelectorSuffixType
import com.intellij.psi.css.usages.CssClassOrIdReferenceBasedUsagesProvider
import com.intellij.psi.impl.source.tree.LeafElement
import com.intellij.psi.impl.source.tree.LeafPsiElement
import com.intellij.psi.util.PsiTreeUtil
import com.intellij.psi.xml.XmlAttribute
import com.intellij.psi.xml.XmlTokenType
import com.intellij.util.ProcessingContext
import dev.blachut.svelte.lang.psi.SvelteHtmlAttribute

internal object ComponentClasses {
  private const val MUSTACHE_START = "{"
  private const val DIRECTIVE_PREFIX = "class:"
  private val token = Regex("""-?[_a-zA-Z][\w-]*""")

  fun quotedTextOf(element: PsiElement): String? {
    val text =
      when (element) {
        is JSLiteralExpression -> element.takeIf { it.isQuotedLiteral && it.parent is JSArrayLiteralExpression }?.text
        is JSProperty -> element.firstChild?.takeIf { it is LeafPsiElement }?.text
        else -> null
      }
    val isQuoted = text != null && text.length >= 2 && (text.first() == '"' || text.first() == '\'')
    return text.takeIf { isQuoted && isOnComponent(element) }
  }

  fun isClassHost(element: PsiElement) = quotedTextOf(element) != null

  fun directiveClassOf(element: PsiElement): String? {
    val attribute = PsiTreeUtil.getParentOfType(element, SvelteHtmlAttribute::class.java, false) ?: return null
    val name = attribute.name.removePrefix(DIRECTIVE_PREFIX).takeIf { it != attribute.name && it.isNotEmpty() }
    val isComponent =
      attribute.parent
        ?.name
        ?.firstOrNull()
        ?.isUpperCase() == true
    val isWinui = WinuiProjectService.of(element.project).isWinuiFile(element.containingFile)
    return name.takeIf { isComponent && isWinui }
  }

  private fun isOnComponent(element: PsiElement): Boolean {
    val attribute = PsiTreeUtil.getParentOfType(element, XmlAttribute::class.java)
    val isComponentClass =
      attribute != null && attribute.name == "class" && attribute.valueElement?.text?.startsWith(
        MUSTACHE_START
      ) == true &&
        attribute.parent
          ?.name
          ?.firstOrNull()
          ?.isUpperCase() == true
    return isComponentClass && WinuiProjectService.of(element.project).isWinuiFile(element.containingFile)
  }

  fun referencesOf(element: PsiElement): Array<PsiReference> {
    val text = quotedTextOf(element) ?: return PsiReference.EMPTY_ARRAY
    return token
      .findAll(text.substring(1, text.length - 1))
      .map { match ->
        ComponentClassReference(element, TextRange(match.range.first + 1, match.range.last + 2), match.value)
      }.toList()
      .toTypedArray()
  }

  fun classesIn(file: PsiFile): List<CssClass> = PsiTreeUtil.findChildrenOfType(file, CssClass::class.java).toList()
}

class ComponentClassReference(
  host: PsiElement,
  range: TextRange,
  private val name: String
) : PsiReferenceBase<PsiElement>(host, range, true) {
  override fun resolve(): PsiElement? =
    ComponentClasses.classesIn(element.containingFile).firstOrNull { it.name == name }

  override fun getVariants(): Array<Any> =
    ComponentClasses
      .classesIn(element.containingFile)
      .mapNotNull { it.name }
      .distinct()
      .toTypedArray()

  override fun handleElementRename(newElementName: String): PsiElement {
    val key = element.firstChild
    if (element is JSProperty && key is LeafElement) {
      key.replaceWithText(key.text.replaceRange(rangeInElement.startOffset, rangeInElement.endOffset, newElementName))
      return element
    }

    return super.handleElementRename(newElementName)
  }
}

class ComponentClassReferenceContributor : PsiReferenceContributor() {
  override fun registerReferenceProviders(registrar: PsiReferenceRegistrar) {
    registrar.registerReferenceProvider(
      StandardPatterns.or(
        PlatformPatterns.psiElement(JSLiteralExpression::class.java),
        PlatformPatterns.psiElement(JSProperty::class.java)
      ),
      object : PsiReferenceProvider() {
        override fun getReferencesByElement(
          element: PsiElement,
          context: ProcessingContext
        ): Array<PsiReference> = ComponentClasses.referencesOf(element)
      }
    )
  }
}

class ComponentClassUsagesProvider : CssClassOrIdReferenceBasedUsagesProvider() {
  override fun acceptElement(candidate: PsiElement) =
    ComponentClasses.isClassHost(candidate) || ComponentClasses.directiveClassOf(candidate) != null

  override fun isUsage(
    selectorSuffix: CssSelectorSuffix,
    candidate: PsiElement,
    offsetInCandidate: Int
  ): Boolean {
    val directive =
      ComponentClasses.directiveClassOf(candidate) ?: return super.isUsage(selectorSuffix, candidate, offsetInCandidate)
    return selectorSuffix.type == CssSelectorSuffixType.CLASS && selectorSuffix.name?.removePrefix(".") == directive
  }
}

class DirectiveNameManipulator : AbstractElementManipulator<SvelteHtmlAttribute>() {
  override fun handleContentChange(
    element: SvelteHtmlAttribute,
    range: TextRange,
    newContent: String
  ): SvelteHtmlAttribute {
    val name = element.node.findChildByType(XmlTokenType.XML_NAME)
    if (name is LeafElement) {
      name.replaceWithText(name.text.replaceRange(range.startOffset, range.endOffset, newContent))
    }

    return element
  }
}
