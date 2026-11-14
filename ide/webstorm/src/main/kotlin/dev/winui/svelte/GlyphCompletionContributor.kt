package dev.winui.svelte

import com.intellij.codeInsight.completion.CompletionContributor
import com.intellij.codeInsight.completion.CompletionParameters
import com.intellij.codeInsight.completion.CompletionResultSet
import com.intellij.codeInsight.completion.CompletionType
import com.intellij.lang.injection.InjectedLanguageManager

/** Completes icon glyph names where the library takes a glyph */
class GlyphCompletionContributor : CompletionContributor() {
  override fun fillCompletionVariants(
    parameters: CompletionParameters,
    result: CompletionResultSet
  ) {
    val isBasic = parameters.completionType == CompletionType.BASIC
    val value = GlyphValues.valueAt(parameters.position)
    if (!isBasic || value == null || GlyphFont.family == null) {
      return
    }

    val file = InjectedLanguageManager.getInstance(value.project).getTopLevelFile(parameters.originalFile)
    if (!GlyphValues.isGlyphValue(value, file)) {
      return
    }

    if (GlyphValues.isInsideString(parameters.position)) {
      offerEvery(result)
      result.stopHere()
      return
    }

    var offered = 0
    result.runRemainingContributors(parameters) { offering ->
      offered += 1
      result.passResult(offering.withLookupElement(GlyphLookup.decorate(offering.lookupElement)))
    }
    if (offered == 0) {
      offerEvery(result)
    }
  }

  private fun offerEvery(result: CompletionResultSet) {
    FluentGlyphs.codePoints.forEach { (name, codePoint) -> result.addElement(GlyphLookup.own(name, codePoint)) }
  }
}
