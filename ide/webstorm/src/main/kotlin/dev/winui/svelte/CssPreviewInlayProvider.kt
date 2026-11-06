package dev.winui.svelte

import com.intellij.codeInsight.hints.ChangeListener
import com.intellij.codeInsight.hints.FactoryInlayHintsCollector
import com.intellij.codeInsight.hints.ImmediateConfigurable
import com.intellij.codeInsight.hints.InlayHintsCollector
import com.intellij.codeInsight.hints.InlayHintsProvider
import com.intellij.codeInsight.hints.InlayHintsSink
import com.intellij.codeInsight.hints.NoSettings
import com.intellij.codeInsight.hints.SettingsKey
import com.intellij.openapi.editor.Editor
import com.intellij.psi.PsiElement
import com.intellij.psi.PsiFile
import javax.swing.JComponent
import javax.swing.JPanel

private const val INLAY_GAP = 3

/**
 * The previews that sit in the line: a bar beside a gradient, a curve beside an easing, the contrast ratio after a
 * text color and the answer after an `@media` condition. Each is a setting of the plugin, not of this provider.
 */
@Suppress("UnstableApiUsage")
class CssPreviewInlayProvider : InlayHintsProvider<NoSettings> {
  override val key = SettingsKey<NoSettings>("winui.svelte.css.previews")
  override val name = "winui-svelte CSS previews"
  override val previewText =
    "<style>\n.a { color: #767676; background: #fff; background-image: linear-gradient(red, blue) }\n</style>"

  override fun createSettings() = NoSettings()

  override fun createConfigurable(settings: NoSettings) =
    object : ImmediateConfigurable {
      override fun createComponent(listener: ChangeListener): JComponent = JPanel()
    }

  override fun getCollectorFor(
    file: PsiFile,
    editor: Editor,
    settings: NoSettings,
    sink: InlayHintsSink
  ): InlayHintsCollector? {
    val isWinui = WinuiProjectService.of(file.project).isWinuiFile(file)
    if (!isWinui) {
      return null
    }

    val previewSettings = Settings.of(file.project)
    return object : FactoryInlayHintsCollector(editor) {
      override fun collect(
        element: PsiElement,
        editor: Editor,
        sink: InlayHintsSink
      ): Boolean {
        val isFile = element is PsiFile
        if (!isFile) {
          return true
        }

        val previews = CssPreviews.of(element.text, previewSettings.enabledPreviews, previewSettings.mediaEnvironment)
        for (preview in previews) {
          preview.inline?.let { sink.addInlineElement(it.offset, true, inlineOf(it.visual), false) }
          preview.hint?.let {
            sink.addInlineElement(it.offset, true, factory.inset(factory.smallText(it.label), left = INLAY_GAP), false)
          }
        }

        return false
      }

      private fun inlineOf(visual: InlineVisual) =
        factory.inset(
          factory.icon(
            when (visual) {
              is InlineVisual.Gradient -> GradientBarIcon(visual.stops)
              is InlineVisual.Curve -> EasingCurveIcon(visual.samples)
            }
          ),
          right = INLAY_GAP
        )
    }
  }
}
