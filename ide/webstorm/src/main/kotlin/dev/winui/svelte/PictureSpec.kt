package dev.winui.svelte

import com.google.gson.JsonParser

internal data class PictureLimits(
  val maxFileBytes: Long,
  val inlineSize: Int,
  val hoverSize: Int
)

internal data class RemotePolicy(
  val maxBytes: Int,
  val timeoutMillis: Int,
  val maxAgeHours: Int,
  val cacheFolder: String,
  val maxRedirects: Int,
  val failureRetryMinutes: Int,
  val maxConcurrent: Int,
  val maxUrlLength: Int
)

internal data class PictureSignature(
  val extension: String,
  val offset: Int,
  val hex: String
)

internal data class PathAlias(
  val prefix: String,
  val folder: String
)

/** The tables of `ide/picture-previews.spec.json`, which the VS Code extension reads too. */
internal object PictureSpec {
  private const val RESOURCE = "/picture-previews.spec.json"

  private val tables by lazy {
    val stream =
      PictureSpec::class.java.getResourceAsStream(RESOURCE)
        ?: error("$RESOURCE is missing from the plugin")
    JsonParser.parseString(stream.bufferedReader().use { it.readText() }).asJsonObject.getAsJsonObject("tables")
  }

  val mimes: Map<String, String> by lazy {
    tables.getAsJsonArray("formats").associate {
      it.asJsonObject.get("extension").asString to it.asJsonObject.get("mime").asString
    }
  }

  val appxScheme: String by lazy { tables.getAsJsonObject("schemes").get("appx").asString }

  val fileScheme: String by lazy { tables.getAsJsonObject("schemes").get("file").asString }

  val publicFolder: String by lazy { tables.get("publicFolder").asString }

  val aliases: List<PathAlias> by lazy {
    tables.getAsJsonArray("aliases").map {
      PathAlias(it.asJsonObject.get("prefix").asString, it.asJsonObject.get("folder").asString)
    }
  }

  val signatures: List<PictureSignature> by lazy {
    tables.getAsJsonArray("signatures").map {
      val entry = it.asJsonObject
      PictureSignature(entry.get("extension").asString, entry.get("offset").asInt, entry.get("hex").asString)
    }
  }

  val dataScheme: String by lazy { tables.getAsJsonObject("schemes").get("data").asString }

  val remoteSchemes: List<String> by lazy {
    tables.getAsJsonObject("schemes").getAsJsonArray("remote").map { it.asString }
  }

  val limits: PictureLimits by lazy {
    val limits = tables.getAsJsonObject("limits")
    PictureLimits(
      limits.get("maxFileBytes").asLong,
      limits.get("inlineSize").asInt,
      limits.get("hoverSize").asInt
    )
  }

  val remote: RemotePolicy by lazy {
    val remote = tables.getAsJsonObject("remote")
    RemotePolicy(
      remote.get("maxBytes").asInt,
      remote.get("timeoutMillis").asInt,
      remote.get("maxAgeHours").asInt,
      remote.get("cacheFolder").asString,
      remote.get("maxRedirects").asInt,
      remote.get("failureRetryMinutes").asInt,
      remote.get("maxConcurrent").asInt,
      remote.get("maxUrlLength").asInt
    )
  }

  /** The color of the taskbar a picture for the theme is drawn on, none for a picture that is for both. */
  fun backgroundOf(theme: PictureVariant): String? {
    val backgrounds = tables.getAsJsonObject("backgrounds")
    return when (theme) {
      PictureVariant.ANY -> null
      PictureVariant.LIGHT -> backgrounds.get("light").asString
      PictureVariant.DARK -> backgrounds.get("dark").asString
    }
  }
}
