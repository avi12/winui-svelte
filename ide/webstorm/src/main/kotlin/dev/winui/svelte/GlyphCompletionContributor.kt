package dev.winui.svelte

import com.intellij.codeInsight.completion.CompletionContributor
import com.intellij.codeInsight.completion.CompletionParameters
import com.intellij.codeInsight.completion.CompletionResultSet
import com.intellij.codeInsight.completion.CompletionType
import com.intellij.psi.xml.XmlAttributeValue

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
    return GlyphValues.isGlyphValue(value, parameters.originalFile)
  }
}
