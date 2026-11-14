package dev.winui.svelte

import com.intellij.codeInsight.completion.CompletionContributor
import com.intellij.codeInsight.completion.CompletionParameters
import com.intellij.codeInsight.completion.CompletionResultSet
import com.intellij.codeInsight.completion.CompletionType

/** Completes the font families an app can use */
class FontFamilyCompletionContributor : CompletionContributor() {
  override fun fillCompletionVariants(
    parameters: CompletionParameters,
    result: CompletionResultSet
  ) {
    val isFontFamily = FontFamilyContext.isFontFamily(parameters.position, parameters.offset)
    val isWinui = WinuiProjectService.of(parameters.position.project).isWinuiFile(parameters.originalFile)
    if (parameters.completionType != CompletionType.BASIC || !isFontFamily || !isWinui) {
      return
    }

    result.runRemainingContributors(parameters) { offering ->
      result.passResult(offering.withLookupElement(FontLookup.decorate(offering.lookupElement)))
    }
  }
}
