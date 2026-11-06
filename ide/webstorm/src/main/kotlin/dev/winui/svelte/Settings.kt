package dev.winui.svelte

import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project

@Service(Service.Level.PROJECT)
@State(name = "WinuiSvelteSettings", storages = [Storage("winui-svelte.xml")])
internal class Settings : PersistentStateComponent<SettingsState> {
  private var current = SettingsState()

  var destination: Destination
    get() = current.destination
    set(value) {
      current.destination = value
    }

  var isResourceHintsEnabled: Boolean
    get() = current.isResourceHintsEnabled
    set(value) {
      current.isResourceHintsEnabled = value
    }

  override fun getState() = current

  override fun loadState(state: SettingsState) {
    current = state
  }

  companion object {
    fun of(project: Project): Settings = project.service()
  }
}
