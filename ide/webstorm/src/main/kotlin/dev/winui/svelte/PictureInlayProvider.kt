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
import java.awt.Color
import java.awt.image.BufferedImage
import javax.swing.JComponent
import javax.swing.JPanel

private const val PICTURE_GAP = 3

/**
 * The picture beside the path of every prop, option or object key the library types as a picture: small in the line,
 * a marker where there is nothing to draw. Which members those are comes from the shared IDE data, not from here.
 */
@Suppress("UnstableApiUsage")
abstract class PictureInlayProviderBase(
  final override val key: SettingsKey<NoSettings>,
  final override val name: String
) : InlayHintsProvider<NoSettings> {
  override val previewText = "<TrayMenuItem label=\"Open\" icon=\"open.ico\" />"

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

        for ((spot, picture) in PictureViews.entriesOf(file)) {
          val presentation = factory.inset(presentationOf(spot, picture), right = PICTURE_GAP)
          sink.addInlineElement(spot.range.startOffset, true, presentation, false)
        }

        return false
      }

      private fun iconOf(
        spot: PictureSpot,
        image: BufferedImage
      ) = PictureIcon(
        image,
        PictureSpec.limits.inlineSize,
        PictureSpec.backgroundOf(spot.variant)?.let { Color.decode(it) }
      )

      private fun presentationOf(
        spot: PictureSpot,
        picture: Picture
      ) = when {
        picture is Picture.Shown && picture.image != null -> {
          factory.icon(iconOf(spot, picture.image))
        }

        picture is Picture.Shown -> {
          factory.smallText(MarkerText.of(picture))
        }

        else -> {
          factory.withTooltip(
            MarkerText.of(picture),
            factory.icon(PlaceholderIcon(PictureSpec.limits.inlineSize))
          )
        }
      }
    }
  }
}

class PictureInlayProvider :
  PictureInlayProviderBase(SettingsKey("winui.svelte.picture.previews"), "winui-svelte pictures")

class TypeScriptPictureInlayProvider :
  PictureInlayProviderBase(
    SettingsKey("winui.svelte.picture.previews.typescript"),
    "winui-svelte pictures in TypeScript"
  )

class JavaScriptPictureInlayProvider :
  PictureInlayProviderBase(
    SettingsKey("winui.svelte.picture.previews.javascript"),
    "winui-svelte pictures in JavaScript"
  )
