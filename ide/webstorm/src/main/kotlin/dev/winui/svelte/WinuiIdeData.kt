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

  /** The named easings (`ease`, `step-end`) with the curve each draws. */
  val easings: List<NamedEasing> by lazy {
    data.getAsJsonArray("easings").map { entry ->
      val easing = entry.asJsonObject
      NamedEasing(
        name = easing.string("name") ?: error("an easing has no name"),
        kind = EasingKind.entries.first { it.id == easing.string("kind") },
        points = easing.getAsJsonArray("points")?.map { it.asDouble }.orEmpty(),
        count = easing.get("count")?.asInt ?: 1,
        jump = easing.string("jump") ?: "end"
      )
    }
  }

  /** The shadow depths WinUI uses, shallow to deep. */
  val shadowDepths: List<ShadowDepth> by lazy {
    data.getAsJsonArray("shadowDepths").map { entry ->
      ShadowDepth(entry.asJsonObject.get("depth").asInt, entry.asJsonObject.string("use").orEmpty())
    }
  }

  /** The window materials with the light and dark color each shows. */
  val materials: List<WindowMaterial> by lazy {
    data.getAsJsonArray("materials").map { entry ->
      val material = entry.asJsonObject
      WindowMaterial(
        name = material.string("name").orEmpty(),
        light = material.string("light").orEmpty(),
        dark = material.string("dark").orEmpty(),
        isTranslucent = material.get("isTranslucent").asBoolean
      )
    }
  }

  /** Why a CSS property has no WinUI meaning, for every property the library names a reason for. */
  val unsupportedReasons: Map<String, String> by lazy {
    data.getAsJsonArray("unsupportedProperties").associate {
      it.asJsonObject.string("name").orEmpty() to it.asJsonObject.string("reason").orEmpty()
    }
  }

  private val pictureComponents: Map<String, Set<String>> by lazy {
    data
      .getAsJsonArray("pictureProps")
      .groupBy({ it.asJsonObject.string("name").orEmpty() }) { entry ->
        entry.asJsonObject.getAsJsonArray("components").map { it.asString }
      }.mapValues { (_, lists) -> lists.flatten().toSet() }
  }

  /** The member names the library types as a picture, and which of them are for one taskbar theme. */
  val pictureNames: PictureNames by lazy {
    PictureNames(
      pictureComponents.keys,
      data.getAsJsonArray("pictureVariants").associate {
        it.asJsonObject.string("name").orEmpty() to
          PictureVariant.valueOf(
            it.asJsonObject
              .string("theme")
              .orEmpty()
              .uppercase()
          )
      }
    )
  }

  /** Whether the component takes the attribute as a picture. */
  fun isPictureProp(
    tag: String,
    attribute: String
  ) = pictureComponents[attribute]?.contains(tag) == true

  private val translateKeys: Set<String> by lazy { data.getAsJsonArray("translateKeys").map { it.asString }.toSet() }

  /** Whether the CSS translation handles a property. */
  fun isHandledProperty(property: String) = property in translateKeys

  private val byProperty by lazy { resources.associateBy { it.property } }

  fun resourceOf(property: String) = byProperty[property]

  private fun JsonObject.string(key: String) = get(key)?.asString
}
