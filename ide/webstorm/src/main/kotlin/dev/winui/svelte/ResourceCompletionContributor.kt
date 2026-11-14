package dev.winui.svelte

import com.intellij.codeInsight.completion.CompletionContributor
import com.intellij.codeInsight.completion.CompletionParameters
import com.intellij.codeInsight.completion.CompletionResultSet
import com.intellij.codeInsight.completion.CompletionType
import com.intellij.lang.injection.InjectedLanguageManager

/** Completes the theme resource names where the library takes a resource */
class ResourceCompletionContributor : CompletionContributor() {
  override fun fillCompletionVariants(
    parameters: CompletionParameters,
    result: CompletionResultSet
  ) {
    val file = parameters.originalFile
    val project = file.project
    val reference = ResourceReferences.at(file.text, parameters.offset)
    val isBasic = parameters.completionType == CompletionType.BASIC
    if (!isBasic || reference == null || !Settings.of(project).isResourceHintsEnabled) {
      return
    }

    val topLevelFile = InjectedLanguageManager.getInstance(project).getTopLevelFile(file)
    if (!WinuiProjectService.of(project).isWinuiFile(topLevelFile)) {
      return
    }

    val prefixed = result.withPrefixMatcher(reference.textBefore(parameters.offset))
    WinuiIdeData.resources.forEach { prefixed.addElement(ResourceLookup.of(it)) }
  }
}
