package dev.winui.svelte

import com.google.gson.JsonObject
import com.google.gson.JsonParser

/** The data set `pnpm gen:ide-data` writes, which the VS Code extension reads too. */
internal object WinuiIdeData {
  private const val RESOURCE = "/winui-ide-data.json"

  private val data by lazy {
    val stream =
      WinuiIdeData::class.java.getResourceAsStream(RESOURCE)
        ?: error("$RESOURCE is missing from the plugin")
    JsonParser.parseString(stream.bufferedReader().use { it.readText() }).asJsonObject
  }

  /** The WinUI resources a `var(--name)` can name, in name order. */
  val resources: List<WinuiResource> by lazy {
    data.getAsJsonArray("resources").map { entry ->
      val resource = entry.asJsonObject
      WinuiResource(
        name = resource.string("name") ?: error("a resource has no name"),
        property = resource.string("property") ?: error("a resource has no property"),
        kind = resource.string("kind") ?: error("a resource has no kind"),
        light = resource.string("light"),
        dark = resource.string("dark")
      )
    }
  }

  private val byProperty by lazy { resources.associateBy { it.property } }

  fun resourceOf(property: String) = byProperty[property]

  private fun JsonObject.string(key: String) = get(key)?.asString
}
