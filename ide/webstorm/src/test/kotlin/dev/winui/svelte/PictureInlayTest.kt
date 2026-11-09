package dev.winui.svelte

import com.intellij.testFramework.fixtures.BasePlatformTestCase
import org.junit.jupiter.api.Assertions.assertEquals
import java.awt.image.BufferedImage
import java.io.ByteArrayOutputStream
import java.nio.file.Files
import javax.imageio.ImageIO

class PictureInlayTest : BasePlatformTestCase() {
  private var path = ""

  private fun pngBytes(): ByteArray {
    val image = BufferedImage(4, 4, BufferedImage.TYPE_INT_ARGB)
    return ByteArrayOutputStream().also { ImageIO.write(image, "png", it) }.toByteArray()
  }

  private fun inlayOffsets(markup: String): List<Int> {
    myFixture.addFileToProject("package.json", TestManifests.DEPENDENT)
    myFixture.configureByText("A.svelte", markup)
    myFixture.doHighlighting()
    return myFixture.editor.inlayModel
      .getInlineElementsInRange(0, myFixture.editor.document.textLength)
      .map { it.offset }
  }

  override fun setUp() {
    super.setUp()
    val file = Files.createTempFile("tray", ".png").toFile().also { it.deleteOnExit() }
    file.writeBytes(pngBytes())
    path = file.absolutePath.replace('\\', '/')
  }

  fun testAPictureOfATrayMenuItemGetsItsPictureBeforeThePath() {
    val markup = "<TrayMenuItem id=\"a\" label=\"A\" icon=\"$path\" />"
    assertEquals(listOf(markup.indexOf(path)), inlayOffsets(markup))
  }

  fun testAMissingFileGetsAMarkerAndAWarning() {
    myFixture.enableInspections(MissingPictureInspection())
    val markup = "<TrayMenuItem id=\"a\" label=\"A\" icon=\"gone.png\" />"
    assertEquals(listOf(markup.indexOf("gone.png")), inlayOffsets(markup))
    assertEquals(true, myFixture.doHighlighting().any { it.description == "Picture file not found: gone.png" })
  }

  fun testTheLightAndDarkPicturesOfATrayIconGetOneEach() {
    val markup = "<TrayIcon icon={{ forLightTaskbar: \"$path\", forDarkTaskbar: \"$path\" }} />"
    assertEquals(
      listOf(markup.indexOf(path), markup.lastIndexOf(path)),
      inlayOffsets(markup)
    )
  }

  fun testAComponentWhosePropIsNotAPictureGetsNothing() {
    assertEquals(emptyList<Int>(), inlayOffsets("<TextBlock icon=\"$path\" />"))
  }

  fun testAGlyphNameIsNotAPicture() {
    assertEquals(emptyList<Int>(), inlayOffsets("<TrayMenuItem id=\"a\" label=\"A\" icon=\"Save\" />"))
  }

  fun testARemotePictureShowsAPlaceholderAndFetchesNothingWhileTheSettingIsOff() {
    Settings.of(project).isRemotePicturesEnabled = false
    try {
      val markup = "<TrayMenuItem id=\"a\" label=\"A\" icon=\"https://example.com/a.png\" />"
      assertEquals(listOf(markup.indexOf("https")), inlayOffsets(markup))
      assertEquals(null, RemotePictures.cached("https://example.com/a.png"))
    } finally {
      Settings.of(project).isRemotePicturesEnabled = true
    }
  }

  fun testAnImportedPictureGetsItsPictureAtTheNameWhereItIsUsed() {
    val markup = "<script>import logo from \"$path\";</script>\n<TrayMenuItem id=\"a\" label=\"A\" icon={logo} />"
    assertEquals(listOf(markup.indexOf("{logo}") + 1), inlayOffsets(markup))
  }

  fun testANewUrlConstantGetsItsPictureAtTheNameWhereItIsUsed() {
    val markup =
      "<script>const logo = new URL(\"$path\", import.meta.url);</script>\n<TrayMenuItem id=\"a\" label=\"A\" icon={logo.href} />"
    assertEquals(listOf(markup.indexOf("{logo.href}") + 1), inlayOffsets(markup))
  }

  fun testANewUrlInAnAttributeExpressionGetsItsPictureBeforeTheString() {
    val markup = "<TrayMenuItem id=\"a\" label=\"A\" icon={new URL(\"$path\", import.meta.url).href} />"
    assertEquals(listOf(markup.indexOf(path)), inlayOffsets(markup))
  }

  fun testNothingIsDrawnWithThePreviewOff() {
    Settings.of(project).setPreviewEnabled(PreviewFeature.PICTURE, false)
    try {
      assertEquals(emptyList<Int>(), inlayOffsets("<TrayMenuItem id=\"a\" label=\"A\" icon=\"$path\" />"))
    } finally {
      Settings.of(project).setPreviewEnabled(PreviewFeature.PICTURE, true)
    }
  }

  fun testThePopupNamesThePictureAndItsSize() {
    val markup = "<TrayMenuItem id=\"a\" label=\"A\" icon=\"$path\" />"
    inlayOffsets(markup)
    val offset = markup.indexOf(path) + 2
    val leaf = myFixture.file.findElementAt(offset)
    val provider = PictureDocumentationProvider()
    val element = provider.getCustomDocumentationElement(myFixture.editor, myFixture.file, leaf, offset)
    val html = element?.let { provider.generateDoc(it, null) }.orEmpty()
    assertEquals(true, html.contains(": 4 x 4 px"))
  }
}
