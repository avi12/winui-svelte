package dev.winui.svelte

internal object MappingResource {
  private const val RESOURCE = "/winui-css-mappings.json"

  val text: String by lazy {
    val stream =
      MappingResource::class.java.getResourceAsStream(RESOURCE)
        ?: error("$RESOURCE is missing from the plugin")
    stream.bufferedReader().use { it.readText() }
  }
}
