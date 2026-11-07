package dev.winui.svelte

internal class SettingsState {
  var destination: Destination = Destination.STYLE_BLOCK
  var isResourceHintsEnabled: Boolean = true
  var disabledPreviews: MutableList<String> = mutableListOf()
  var mediaTheme: String = Theme.DARK.id
  var isRemotePicturesEnabled: Boolean = false
  var isMediaReducedMotion: Boolean = false
  var mediaWidth: Int = MediaDefaults.WIDTH
  var mediaHeight: Int = MediaDefaults.HEIGHT
}

internal object MediaDefaults {
  const val WIDTH = 1024
  const val HEIGHT = 768
}
