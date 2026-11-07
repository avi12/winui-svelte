package dev.winui.svelte

import com.intellij.openapi.project.Project
import java.awt.image.BufferedImage
import java.io.File
import java.util.Base64

/** What a picture value is once looked up. */
internal sealed interface Picture {
  val name: String

  /** The picture is there; [image] is none for a kind the IDE cannot decode, which shows a neutral marker. */
  data class Shown(
    override val name: String,
    val image: BufferedImage?,
    val size: ImageSize,
    val byteSize: Long,
    val extension: String
  ) : Picture

  data class Missing(
    override val name: String,
    val candidates: List<String>
  ) : Picture

  data class TooLarge(
    override val name: String,
    val byteSize: Long
  ) : Picture

  /** A remote picture while the setting is off: nothing is fetched. */
  data class RemoteOff(
    override val name: String
  ) : Picture

  data class RemotePending(
    override val name: String
  ) : Picture

  data class RemoteFailed(
    override val name: String
  ) : Picture
}

/** Looks a picture value up: on disk, in a data URI, or in the cache of fetched pictures. */
internal object PictureLoader {
  fun load(
    value: String,
    file: String,
    root: String,
    project: Project
  ): Picture {
    val target = PicturePaths.targetOf(value, file, root)
    return when (target.kind) {
      PictureKind.DATA -> fromDataUri(value, target.extension)
      PictureKind.REMOTE -> fromRemote(value, project)
      PictureKind.NONE -> Picture.Missing(value, emptyList())
      PictureKind.LOCAL, PictureKind.APPX -> fromFiles(value, target.candidates)
    }
  }

  private fun fromFiles(
    value: String,
    candidates: List<String>
  ): Picture {
    val found = candidates.map { File(it) }.firstOrNull { it.isFile } ?: return Picture.Missing(value, candidates)
    val isTooLarge = found.length() > PictureSpec.limits.maxFileBytes
    if (isTooLarge) {
      return Picture.TooLarge(value, found.length())
    }

    return shown(found.name, found.extension.lowercase(), found.readBytes(), found)
  }

  private fun fromDataUri(
    value: String,
    extension: String
  ): Picture {
    val payload = value.substringAfter("base64,", "")
    val bytes =
      runCatching { Base64.getDecoder().decode(payload) }.getOrNull() ?: return Picture.Missing(value, emptyList())
    return shown(extension, extension, bytes, null)
  }

  private fun fromRemote(
    url: String,
    project: Project
  ): Picture {
    if (!Settings.of(project).isRemotePicturesEnabled) {
      return Picture.RemoteOff(url)
    }

    val cached = RemotePictures.cached(url)
    if (cached == null) {
      if (RemotePictures.hasFailed(url)) {
        return Picture.RemoteFailed(url)
      }

      RemotePictures.fetchLater(url, project)
      return Picture.RemotePending(url)
    }

    val extension = PicturePaths.targetOf(url, "/", "/").extension
    return shown(url, extension, cached.readBytes(), cached)
  }

  private fun shown(
    name: String,
    extension: String,
    bytes: ByteArray,
    file: File?
  ) = Picture.Shown(
    name,
    runCatching { PictureDecoder.decode(extension, bytes, file) }.getOrNull(),
    PictureImages.sizeOf(extension, bytes),
    bytes.size.toLong(),
    extension
  )
}
