package dev.winui.svelte

import com.intellij.codeInsight.completion.CompletionContributor
import com.intellij.codeInsight.completion.CompletionParameters
import com.intellij.codeInsight.completion.CompletionResultSet
import com.intellij.codeInsight.completion.CompletionType
import com.intellij.codeInsight.lookup.LookupElement
import com.intellij.codeInsight.lookup.LookupElementBuilder
import com.intellij.codeInsight.lookup.LookupElementDecorator
import com.intellij.codeInsight.lookup.LookupElementPresentation
import com.intellij.codeInsight.lookup.LookupElementRenderer
import com.intellij.psi.xml.XmlAttribute
import com.intellij.psi.xml.XmlAttributeValue

internal object GlyphLookup {
  fun decorate(element: LookupElement): LookupElement {
    val codePoint = FluentGlyphs.codePoints[element.lookupString] ?: return element
    val icon = GlyphIcon(codePoint)
    return LookupElementDecorator.withRenderer(
      element,
      object : LookupElementRenderer<LookupElementDecorator<LookupElement>>() {
        override fun renderElement(
          element: LookupElementDecorator<LookupElement>,
          presentation: LookupElementPresentation
        ) {
          element.delegate.renderElement(presentation)
          presentation.icon = icon
          presentation.typeText = FluentGlyphs.label(codePoint)
        }
      }
    )
  }

  fun own(
    name: String,
    codePoint: Int
  ): LookupElement =
    LookupElementBuilder
      .create(name)
      .withIcon(GlyphIcon(codePoint))
      .withTypeText(FluentGlyphs.label(codePoint), true)
}

class GlyphCompletionContributor : CompletionContributor() {
  override fun fillCompletionVariants(
    parameters: CompletionParameters,
    result: CompletionResultSet
  ) {
    if (parameters.completionType != CompletionType.BASIC || !isGlyphValue(parameters) || GlyphFont.family == null) {
      return
    }

    var offered = 0
    result.runRemainingContributors(parameters) { offering ->
      offered += 1
      result.passResult(offering.withLookupElement(GlyphLookup.decorate(offering.lookupElement)))
    }
    if (offered == 0) {
      FluentGlyphs.codePoints.forEach { (name, codePoint) -> result.addElement(GlyphLookup.own(name, codePoint)) }
    }
  }

  private fun isGlyphValue(parameters: CompletionParameters): Boolean {
    val value = parameters.position.parent as? XmlAttributeValue ?: return false
    val attribute = value.parent as? XmlAttribute ?: return false
    val isGlyphOfIcon = attribute.name == "glyph" && attribute.parent?.name in FluentGlyphs.components
    return isGlyphOfIcon && WinuiProjectService.of(parameters.position.project).isWinuiFile(parameters.originalFile)
  }
}
