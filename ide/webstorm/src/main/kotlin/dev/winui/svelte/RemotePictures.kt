package dev.winui.svelte

import com.intellij.codeInsight.daemon.DaemonCodeAnalyzer
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.PathManager
import com.intellij.openapi.project.Project
import java.io.File
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.security.MessageDigest
import java.time.Duration
import java.util.concurrent.ConcurrentHashMap

/**
 * The one remote policy: a picture is fetched only when the setting is on, in the background, with a timeout and a
 * size cap, and kept on disk for the hours the spec says. Nothing is fetched while the setting is off.
 */
internal object RemotePictures {
  private const val MILLIS_PER_HOUR = 3_600_000L
  private val inFlight = ConcurrentHashMap.newKeySet<String>()
  private val failed = ConcurrentHashMap.newKeySet<String>()

  /** The folder the previews keep fetched pictures and the pictures drawn for the hover in. */
  val folder: File by lazy {
    File(PathManager.getSystemPath(), PictureSpec.remote.cacheFolder).also { it.mkdirs() }
  }

  /** The fresh copy of the picture on disk, none while it is not fetched yet. */
  fun cached(url: String): File? {
    val file = fileOf(url)
    val age = System.currentTimeMillis() - file.lastModified()
    val isFresh = file.isFile && age < PictureSpec.remote.maxAgeHours * MILLIS_PER_HOUR
    return file.takeIf { isFresh }
  }

  fun hasFailed(url: String) = url in failed

  /** Fetches the picture off the editor thread, then asks the editors to look again. */
  fun fetchLater(
    url: String,
    project: Project
  ) {
    val isStarted = inFlight.add(url)
    if (!isStarted) {
      return
    }

    ApplicationManager.getApplication().executeOnPooledThread {
      try {
        val isFetched = fetch(url)
        if (!isFetched) {
          failed.add(url)
        }
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

  private fun fileOf(url: String): File {
    val digest = MessageDigest.getInstance("SHA-1").digest(url.toByteArray())
    return File(folder, digest.joinToString("") { "%02x".format(it) })
  }

  private fun fetch(url: String): Boolean {
    val policy = PictureSpec.remote
    val client = HttpClient.newBuilder().connectTimeout(Duration.ofMillis(policy.timeoutMillis.toLong())).build()
    val request =
      HttpRequest
        .newBuilder(URI.create(url))
        .timeout(Duration.ofMillis(policy.timeoutMillis.toLong()))
        .build()
    return try {
      val response = client.send(request, HttpResponse.BodyHandlers.ofInputStream())
      val bytes = response.body().use { it.readNBytes(policy.maxBytes + 1) }
      val isUsable = response.statusCode() == HTTP_OK && bytes.size <= policy.maxBytes
      if (isUsable) {
        fileOf(url).writeBytes(bytes)
      }

      isUsable
    } catch (_: java.io.IOException) {
      false
    } catch (_: InterruptedException) {
      Thread.currentThread().interrupt()
      false
    } catch (_: IllegalArgumentException) {
      false
    }
  }

  private const val HTTP_OK = 200
}
