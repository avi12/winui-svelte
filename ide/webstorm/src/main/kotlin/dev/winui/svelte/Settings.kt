package dev.winui.svelte

import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project

enum class Destination(
  val label: String
) {
  STYLE_BLOCK("<style> block"),
  STYLE_DIRECTIVE("style: directive")
}

class SettingsState {
  var destination: Destination = Destination.STYLE_BLOCK
}

@Service(Service.Level.PROJECT)
@State(name = "WinuiSvelteSettings", storages = [Storage("winui-svelte.xml")])
class Settings : PersistentStateComponent<SettingsState> {
  private var current = SettingsState()

  var destination: Destination
    get() = current.destination
    set(value) {
      current.destination = value
    }

  override fun getState() = current

  override fun loadState(state: SettingsState) {
    current = state
  }

  companion object {
    fun of(project: Project): Settings = project.service()
  }
}
