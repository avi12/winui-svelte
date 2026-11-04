package dev.winui.svelte

import com.intellij.openapi.options.BoundSearchableConfigurable
import com.intellij.openapi.project.Project
import com.intellij.ui.SimpleListCellRenderer
import com.intellij.ui.dsl.builder.bindItem
import com.intellij.ui.dsl.builder.panel

class SettingsConfigurable(
  private val project: Project
) : BoundSearchableConfigurable("winui-svelte", "winui.svelte.settings") {
  override fun createPanel() =
    panel {
      row {
        comment("Applies to projects whose package.json lists winui-svelte as a dependency")
      }
      row("Where converted CSS goes:") {
        comboBox(Destination.entries, SimpleListCellRenderer.create("") { it.label })
          .bindItem(
            { Settings.of(project).destination },
            { Settings.of(project).destination = it ?: Destination.STYLE_BLOCK }
          )
      }
    }
}
