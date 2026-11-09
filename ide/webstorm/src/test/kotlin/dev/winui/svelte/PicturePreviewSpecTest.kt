package dev.winui.svelte

import com.google.gson.JsonObject
import com.google.gson.JsonParser
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import java.io.File

/** The logic spec both editors implement: `ide/picture-previews.spec.json`, which the VS Code core is tested against too. */
class PicturePreviewSpecTest {
  private val cases =
    JsonParser
      .parseString(
        File("../picture-previews.spec.json").readText()
      ).asJsonObject
      .getAsJsonObject("cases")
  private val start = 7
  private val names =
    PictureNames(
      setOf("icon", "image", "forLightTaskbar", "forDarkTaskbar"),
      mapOf("forLightTaskbar" to PictureVariant.LIGHT, "forDarkTaskbar" to PictureVariant.DARK)
    )

  private fun section(key: String) = cases.getAsJsonArray(key).map { it.asJsonObject }

  private fun JsonObject.text(key: String) = get(key).asString

  private fun bytesOf(header: JsonObject): ByteArray {
    val text = header.get("text")
    if (text != null) {
      return text.asString.toByteArray()
    }

    val hex = header.get("hex").asString
    return hex.chunked(2).map { it.toInt(16).toByte() }.toByteArray()
  }

  @Test
  fun `a picture value resolves to the places to look, a data URI, a remote URL or nothing`() {
    for (case in section("resolutions")) {
      val expected = case.getAsJsonObject("expected")
      val target = PicturePaths.targetOf(case.text("value"), case.text("file"), case.text("root"))
      assertEquals(expected.text("kind"), target.kind.name.lowercase(), case.text("value"))
      assertEquals(expected.text("extension"), target.extension, case.text("value"))
      assertEquals(expected.getAsJsonArray("candidates").map { it.asString }, target.candidates, case.text("value"))
    }
  }

  @Test
  fun `the size of a picture is read from its first bytes and an ico lists its frames`() {
    for (case in section("headers")) {
      val expected = case.getAsJsonObject("expected")
      val size = PictureImages.sizeOf(case.text("extension"), bytesOf(case))
      assertEquals(expected.get("width").asInt, size.width, case.text("name"))
      assertEquals(expected.get("height").asInt, size.height, case.text("name"))
      val frames = expected.getAsJsonArray("frames").map { listOf(it.asJsonArray[0].asInt, it.asJsonArray[1].asInt) }
      assertEquals(frames, size.frames.map { listOf(it.width, it.height) }, case.text("name"))
      val best = expected.get("best")
      if (best != null) {
        assertEquals(best.asInt, IconFrames.bestIndex(size.frames), case.text("name"))
      }
    }
  }

  @Test
  fun `a caption names the picture its pixel size file size and frames`() {
    val header = section("headers").first { it.text("name") == "ico" }
    val size = PictureImages.sizeOf("ico", bytesOf(header))
    assertEquals("tray.ico: 256 x 256 px, 4.2 KB, frames 16, 256, 32", PictureImages.caption("tray.ico", size, 4300))
  }

  @Test
  fun `the pictures written in an attribute an expression or an object key are found with their taskbar`() {
    for (case in section("spots")) {
      val text = case.text("text")
      val bindings =
        case
          .getAsJsonObject("bindings")
          ?.entrySet()
          ?.associate { it.key to it.value.asString }
          .orEmpty()
      val spots =
        when (case.text("kind")) {
          "plain" -> PictureSpots.plain(case.text("attribute"), text, start, names)
          "expression" -> PictureSpots.expression(case.text("attribute"), text, start, names, bindings)
          else -> PictureSpots.keys(text, names, bindings)
        }
      val expectedSpots = case.getAsJsonArray("expected").map { it.asJsonObject }
      val expected = expectedSpots.map { it.text("value") to it.text("variant") }
      assertEquals(expected, spots.map { it.value to it.variant.name.lowercase() }, text)
      val offset =
        when (case.text("kind")) {
          "keys" -> 0
          else -> start
        }
      for ((spot, written) in spots.zip(expectedSpots)) {
        val shown = written.get("text")?.asString ?: spot.value
        assertEquals(shown, text.substring(spot.range.startOffset - offset, spot.range.endOffset - offset).trim(), text)
      }
    }
  }

  @Test
  fun `the names a file binds to a picture are its image imports and constants`() {
    for (case in section("bindings")) {
      val expected = case.getAsJsonObject("expected").entrySet().associate { it.key to it.value.asString }
      assertEquals(expected, PictureBindings.of(case.text("text")), case.text("name"))
    }
  }

  @Test
  fun `only http and https URLs without credentials or a link-local host are fetchable`() {
    for (case in section("remoteUrls")) {
      assertEquals(case.get("expected").asBoolean, RemoteUrls.isFetchable(case.text("url")), case.text("url"))
    }

    assertEquals(false, RemoteUrls.isFetchable("https://example.com/${"a".repeat(3000)}.png"))
  }

  @Test
  fun `a redirect is followed only to a fetchable URL and never from https to http`() {
    for (case in section("redirects")) {
      val expected = case.get("expected").takeIf { !it.isJsonNull }?.asString
      assertEquals(expected, RemoteUrls.redirectTarget(case.text("from"), case.text("location")), case.text("location"))
    }
  }

  @Test
  fun `a fetched picture is named by its first bytes then its content type then its URL`() {
    for (case in section("sniffs")) {
      val actual = PictureSniffer.extensionOf(bytesOf(case), case.text("contentType"), case.text("urlExtension"))
      assertEquals(case.text("expected"), actual, case.text("name"))
    }
  }
}
