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

  var mediaTheme: Theme
    get() = Theme.named(current.mediaTheme)
    set(value) {
      current.mediaTheme = value.id
    }

  var isMediaReducedMotion: Boolean
    get() = current.isMediaReducedMotion
    set(value) {
      current.isMediaReducedMotion = value
    }

  var mediaWidth: Int
    get() = current.mediaWidth
    set(value) {
      current.mediaWidth = value
    }

  var mediaHeight: Int
    get() = current.mediaHeight
    set(value) {
      current.mediaHeight = value
    }

  /** The environment the media preview assumes; the OS is never asked. */
  val mediaEnvironment get() = MediaEnvironment(mediaTheme, isMediaReducedMotion, mediaWidth, mediaHeight)

  fun isPreviewEnabled(feature: PreviewFeature) = feature.id !in current.disabledPreviews

  fun setPreviewEnabled(
    feature: PreviewFeature,
    isEnabled: Boolean
  ) {
    current.disabledPreviews = (current.disabledPreviews - feature.id).toMutableList()
    if (!isEnabled) {
      current.disabledPreviews.add(feature.id)
    }
  }

  val enabledPreviews get() = PreviewFeature.entries.filter { isPreviewEnabled(it) }.toSet()

  override fun getState() = current

  override fun loadState(state: SettingsState) {
    current = state
  }

  companion object {
    fun of(project: Project): Settings = project.service()
  }
}
