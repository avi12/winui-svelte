package dev.winui.svelte

import com.intellij.util.xmlb.SkipDefaultsSerializationFilter
import com.intellij.util.xmlb.XmlSerializer
import org.jdom.output.XMLOutputter
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class SettingsStateTest {
  @Test
  fun `the destination is the style block by default`() {
    assertEquals(Destination.STYLE_BLOCK, SettingsState().destination)
  }

  @Test
  fun `the destination survives being written and read`() {
    val state = SettingsState().apply { destination = Destination.STYLE_DIRECTIVE }
    val element = XmlSerializer.serialize(state)
    val written = XMLOutputter().outputString(element)
    assertEquals(true, written.contains("STYLE_DIRECTIVE"))
    assertEquals(Destination.STYLE_DIRECTIVE, XmlSerializer.deserialize(element, SettingsState::class.java).destination)
  }

  @Test
  fun `the default is not written`() {
    assertEquals(0, XmlSerializer.serialize(SettingsState(), SkipDefaultsSerializationFilter()).children.size)
  }

  @Test
  fun `the resource hints are on by default and survive being turned off`() {
    assertEquals(true, SettingsState().isResourceHintsEnabled)
    val state = SettingsState().apply { isResourceHintsEnabled = false }
    val element = XmlSerializer.serialize(state)
    assertEquals(false, XmlSerializer.deserialize(element, SettingsState::class.java).isResourceHintsEnabled)
  }
}
