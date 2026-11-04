package dev.winui.svelte

import com.google.gson.JsonElement
import com.google.gson.JsonParser

object PackageManifest {
  const val LIBRARY_NAME = "winui-svelte"

  private val dependencyKeys =
    listOf(
      "dependencies",
      "devDependencies",
      "peerDependencies",
      "optionalDependencies"
    )

  fun dependsOnLibrary(text: String): Boolean {
    val root = runCatching { JsonParser.parseString(text) }.getOrNull() ?: return false
    if (!root.isJsonObject) {
      return false
    }

    return dependencyKeys.any { key -> declares(root.asJsonObject.get(key)) }
  }

  private fun declares(table: JsonElement?): Boolean =
    table != null && table.isJsonObject && table.asJsonObject.has(LIBRARY_NAME)
}
