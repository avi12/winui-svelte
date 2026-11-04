package dev.winui.svelte

import com.intellij.lang.javascript.psi.JSArrayLiteralExpression
import com.intellij.lang.javascript.psi.JSLiteralExpression
import com.intellij.lang.javascript.psi.JSProperty
import com.intellij.openapi.util.TextRange
import com.intellij.psi.PsiElement
import com.intellij.psi.PsiFile
import com.intellij.psi.PsiReference
import com.intellij.psi.css.CssClass
import com.intellij.psi.impl.source.tree.LeafPsiElement
import com.intellij.psi.util.PsiTreeUtil
import com.intellij.psi.xml.XmlAttribute
import dev.blachut.svelte.lang.psi.SvelteHtmlAttribute

internal object ComponentClasses {
  private val token = Regex("""-?[_a-zA-Z][\w-]*""")

  fun isClassHost(element: PsiElement) = quotedTextOf(element) != null

  fun quotedTextOf(element: PsiElement): String? {
    val text =
      when (element) {
        is JSLiteralExpression -> element.takeIf { it.isQuotedLiteral && it.parent is JSArrayLiteralExpression }?.text
        is JSProperty -> element.firstChild?.takeIf { it is LeafPsiElement }?.text
        else -> null
      }
    return text?.takeIf { SvelteSyntax.isQuoted(it) && isInClassValue(element) }
  }

  fun directiveClassOf(element: PsiElement): String? {
    val attribute = PsiTreeUtil.getParentOfType(element, SvelteHtmlAttribute::class.java, false) ?: return null
    val name = attribute.name.removePrefix(SvelteSyntax.CLASS_DIRECTIVE_PREFIX)
    val isDirective = name != attribute.name && name.isNotEmpty()
    return name.takeIf { isDirective && isOnComponentInWinuiFile(attribute) }
  }

  fun referencesOf(element: PsiElement): Array<PsiReference> {
    val text = quotedTextOf(element) ?: return PsiReference.EMPTY_ARRAY
    return token
      .findAll(text.substring(1, text.length - 1))
      .map { ComponentClassReference(element, TextRange(it.range.first + 1, it.range.last + 2), it.value) }
      .toList()
      .toTypedArray()
  }

  fun classesIn(file: PsiFile) = PsiTreeUtil.findChildrenOfType(file, CssClass::class.java).toList()

  private fun isInClassValue(element: PsiElement): Boolean {
    val attribute = PsiTreeUtil.getParentOfType(element, XmlAttribute::class.java) ?: return false
    val isClassExpression =
      attribute.name == SvelteSyntax.CLASS_ATTRIBUTE &&
        attribute.valueElement?.text?.startsWith(SvelteSyntax.MUSTACHE_START) == true
    return isClassExpression && isOnComponentInWinuiFile(attribute)
  }

  private fun isOnComponentInWinuiFile(attribute: XmlAttribute): Boolean {
    val isComponent = attribute.parent?.name?.let { SvelteSyntax.isComponent(it) } == true
    return isComponent && WinuiProjectService.of(attribute.project).isWinuiFile(attribute.containingFile)
  }
}
