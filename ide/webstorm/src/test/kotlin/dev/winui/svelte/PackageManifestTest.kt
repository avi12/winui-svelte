package dev.winui.svelte

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class PackageManifestTest {
  @Test
  fun `a dependency counts`() {
    assertEquals(true, PackageManifest.dependsOnLibrary("""{"dependencies":{"winui-svelte":"^0.0.3"}}"""))
  }

  @Test
  fun `a dev dependency counts`() {
    assertEquals(true, PackageManifest.dependsOnLibrary("""{"devDependencies":{"winui-svelte":"^0.0.3"}}"""))
  }

  @Test
  fun `a peer dependency counts`() {
    assertEquals(true, PackageManifest.dependsOnLibrary("""{"peerDependencies":{"winui-svelte":"*"}}"""))
  }

  @Test
  fun `a linked, file or workspace specifier counts`() {
    for (specifier in listOf("link:../winui-svelte", "file:../winui-svelte", "workspace:*")) {
      val text = """{"dependencies":{"winui-svelte":"$specifier"}}"""
      assertEquals(true, PackageManifest.dependsOnLibrary(text), specifier)
    }
  }

  @Test
  fun `another package or none does not count`() {
    assertEquals(false, PackageManifest.dependsOnLibrary("""{"dependencies":{"svelte":"^5"}}"""))
    assertEquals(false, PackageManifest.dependsOnLibrary("""{"name":"winui-svelte"}"""))
    assertEquals(false, PackageManifest.dependsOnLibrary("""{"scripts":{"winui-svelte":"x"}}"""))
    assertEquals(false, PackageManifest.dependsOnLibrary("{}"))
  }

  @Test
  fun `text that is not an object does not count`() {
    assertEquals(false, PackageManifest.dependsOnLibrary("not json"))
    assertEquals(false, PackageManifest.dependsOnLibrary("[1]"))
    assertEquals(false, PackageManifest.dependsOnLibrary(""))
  }
}
