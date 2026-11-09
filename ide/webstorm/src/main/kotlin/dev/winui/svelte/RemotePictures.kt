package dev.winui.svelte

import com.intellij.codeInsight.daemon.DaemonCodeAnalyzer
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.PathManager
import com.intellij.openapi.project.Project
import com.intellij.util.concurrency.AppExecutorUtil
import java.io.File
import java.security.MessageDigest
import java.util.concurrent.ConcurrentHashMap

/** A remote picture kept on disk: its bytes' file and the extension the sniffing found. */
internal class CachedPicture(
  val file: File,
  val extension: String
)

/**
 * The one remote policy: a picture is fetched only when the setting is on, in the background on a pool of the
 * spec's size, under [RemoteDownload]'s rules, and kept on disk for the hours the spec says. A failure is kept for
 * some minutes so that a dead URL is not asked again on every pass.
 */
internal object RemotePictures {
  private const val MILLIS_PER_HOUR = 3_600_000L
  private const val MILLIS_PER_MINUTE = 60_000L
  private val inFlight = ConcurrentHashMap.newKeySet<String>()
  private val failed = ConcurrentHashMap<String, Pair<RemoteFailure, Long>>()
  private val pool by lazy {
    AppExecutorUtil.createBoundedApplicationPoolExecutor("winui-svelte pictures", PictureSpec.remote.maxConcurrent)
  }

  /** The folder the previews keep fetched pictures and the pictures drawn for the hover in. */
  val folder: File by lazy {
    File(PathManager.getSystemPath(), PictureSpec.remote.cacheFolder).also { it.mkdirs() }
  }

  /** The fresh copy of the picture on disk, none while it is not fetched yet. */
  fun cached(url: String): CachedPicture? {
    val maxAge = PictureSpec.remote.maxAgeHours * MILLIS_PER_HOUR
    return PictureSpec.mimes.keys
      .map { CachedPicture(fileOf(url, it), it) }
      .firstOrNull { it.file.isFile && System.currentTimeMillis() - it.file.lastModified() < maxAge }
  }

  /** Why the picture was not fetched, none while it was not tried or the retry time has passed. */
  fun failureOf(url: String): RemoteFailure? {
    val (failure, at) = failed[url] ?: return null
    val retryAfter = PictureSpec.remote.failureRetryMinutes * MILLIS_PER_MINUTE
    return failure.takeIf { System.currentTimeMillis() - at < retryAfter }
  }

  /** Fetches the picture off the editor thread, then asks the editors to look again. */
  fun fetchLater(
    url: String,
    project: Project
  ) {
    val isStarted = inFlight.add(url)
    if (!isStarted) {
      return
    }

    pool.execute {
      try {
        settle(url)
      } finally {
        inFlight.remove(url)
        ApplicationManager.getApplication().invokeLater {
          if (!project.isDisposed) {
            DaemonCodeAnalyzer.getInstance(project).restart(RemotePictures)
          }
        }
      }
    }
  }

  private fun settle(url: String) {
    when (val result = RemoteDownload.fetch(url)) {
      is Download.Failed -> {
        failed[url] = result.failure to System.currentTimeMillis()
      }

      is Download.Fetched -> {
        failed.remove(url)
        fileOf(url, result.extension).writeBytes(result.bytes)
      }
    }
  }

  private fun fileOf(
    url: String,
    extension: String
  ): File {
    val digest = MessageDigest.getInstance("SHA-1").digest(url.toByteArray())
    return File(folder, "${digest.joinToString("") { "%02x".format(it) }}.$extension")
  }
}
