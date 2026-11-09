package dev.winui.svelte

import com.intellij.openapi.options.BoundSearchableConfigurable
import com.intellij.openapi.project.Project
import com.intellij.ui.dsl.builder.Panel
import com.intellij.ui.dsl.builder.bindIntText
import com.intellij.ui.dsl.builder.bindItem
import com.intellij.ui.dsl.builder.bindSelected
import com.intellij.ui.dsl.builder.panel
import com.intellij.ui.dsl.listCellRenderer.textListCellRenderer

class SettingsConfigurable(
  private val project: Project
) : BoundSearchableConfigurable("winui-svelte", "winui.svelte.settings") {
  override fun createPanel() =
    panel {
      row {
        comment("Applies to projects whose package.json lists winui-svelte as a dependency")
      }
      row("Where converted CSS goes:") {
        comboBox(Destination.entries, textListCellRenderer { it?.label })
          .bindItem(
            { Settings.of(project).destination },
            { Settings.of(project).destination = it ?: Destination.STYLE_BLOCK }
          )
      }
      row {
        checkBox("Complete and preview WinUI resources written as var(--name)")
          .comment("The names list with a light and dark swatch beside each color")
          .bindSelected(
            { Settings.of(project).isResourceHintsEnabled },
            { Settings.of(project).isResourceHintsEnabled = it }
          )
      }
      group("CSS and layout previews") {
        for (feature in PreviewFeature.entries) {
          row {
            checkBox(feature.label)
              .comment(feature.description)
              .bindSelected(
                { Settings.of(project).isPreviewEnabled(feature) },
                { Settings.of(project).setPreviewEnabled(feature, it) }
              )
          }
        }
      }
      remotePicturesGroup()
      group("Environment the media query answer assumes") {
        row("Theme:") {
          comboBox(Theme.entries, textListCellRenderer { it?.id })
            .bindItem({ Settings.of(project).mediaTheme }, { Settings.of(project).mediaTheme = it ?: Theme.DARK })
        }
        row {
          checkBox("Reduced motion")
            .bindSelected({ Settings.of(project).isMediaReducedMotion }, {
              Settings.of(project).isMediaReducedMotion =
                it
            })
        }
        row("Window width in pixels:") {
          intTextField(1..MAX_PIXELS).bindIntText({ Settings.of(project).mediaWidth }, {
            Settings.of(project).mediaWidth =
              it
          })
        }
        row("Window height in pixels:") {
          intTextField(1..MAX_PIXELS).bindIntText({ Settings.of(project).mediaHeight }, {
            Settings.of(project).mediaHeight =
              it
          })
        }
      }
    }

  private fun Panel.remotePicturesGroup() {
    group("Remote pictures") {
      row {
        checkBox("Preview remote pictures")
          .comment(
            "Fetches an http or https picture named in a prop in the background, with a timeout, a size cap, no credentials and a cache on disk, in a trusted project only; off, nothing is fetched"
          ).bindSelected(
            { Settings.of(project).isRemotePicturesEnabled },
            { Settings.of(project).isRemotePicturesEnabled = it }
          )
      }
    }
  }

  private companion object {
    const val MAX_PIXELS = 20_000
  }
}
