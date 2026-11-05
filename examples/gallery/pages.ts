import AccessibilityPage from "./pages/AccessibilityPage.svelte";
import AnimationPage from "./pages/AnimationPage.svelte";
import CssLayoutPage from "./pages/CssLayoutPage.svelte";
import DataPage from "./pages/DataPage.svelte";
import DataTransferPage from "./pages/DataTransferPage.svelte";
import DevicesPage from "./pages/DevicesPage.svelte";
import FormsPage from "./pages/FormsPage.svelte";
import FormSubmissionPage from "./pages/FormSubmissionPage.svelte";
import ImageSourcesPage from "./pages/ImageSourcesPage.svelte";
import InputPage from "./pages/InputPage.svelte";
import LayoutPage from "./pages/LayoutPage.svelte";
import ListsPage from "./pages/ListsPage.svelte";
import MediaPage from "./pages/MediaPage.svelte";
import OverlaysPage from "./pages/OverlaysPage.svelte";
import ServicesPage from "./pages/ServicesPage.svelte";
import SettingsPage from "./pages/SettingsPage.svelte";
import StatePage from "./pages/StatePage.svelte";
import TemplatesPage from "./pages/TemplatesPage.svelte";
import TextPage from "./pages/TextPage.svelte";
import ThemingPage from "./pages/ThemingPage.svelte";
import TrayPage from "./pages/TrayPage.svelte";
import Win2dPage from "./pages/Win2dPage.svelte";
import WindowPage from "./pages/WindowPage.svelte";
import type { Component } from "svelte";

/** One entry of the gallery's menu: add a page by adding a row here. */
export interface GalleryPage {
  readonly key: string;
  readonly title: string;
  readonly page: Component;
}

export const GALLERY_PAGES: readonly GalleryPage[] = [
  {
    key: "state",
    title: "State management",
    page: StatePage
  },
  {
    key: "forms",
    title: "Forms and binding",
    page: FormsPage
  },
  {
    key: "form-submission",
    title: "Form submission",
    page: FormSubmissionPage
  },
  {
    key: "layout",
    title: "Layout",
    page: LayoutPage
  },
  {
    key: "lists",
    title: "Lists",
    page: ListsPage
  },
  {
    key: "overlays",
    title: "Overlays",
    page: OverlaysPage
  },
  {
    key: "accessibility",
    title: "Accessibility and theming",
    page: AccessibilityPage
  },
  {
    key: "theming",
    title: "Theming and CSS",
    page: ThemingPage
  },
  {
    key: "templates",
    title: "Templates",
    page: TemplatesPage
  },
  {
    key: "window",
    title: "Window",
    page: WindowPage
  },
  {
    key: "services",
    title: "App services",
    page: ServicesPage
  },
  {
    key: "data-transfer",
    title: "Drag, drop and clipboard",
    page: DataTransferPage
  },
  {
    key: "media",
    title: "Media",
    page: MediaPage
  },
  {
    key: "image-sources",
    title: "Image sources and audio",
    page: ImageSourcesPage
  },
  {
    key: "text",
    title: "Text and documents",
    page: TextPage
  },
  {
    key: "input",
    title: "Input",
    page: InputPage
  },
  {
    key: "data",
    title: "Data",
    page: DataPage
  },
  {
    key: "animation",
    title: "Animation and transitions",
    page: AnimationPage
  },
  {
    key: "css-layout",
    title: "CSS layout",
    page: CssLayoutPage
  },
  {
    key: "win2d",
    title: "Win2D canvas",
    page: Win2dPage
  },
  {
    key: "devices",
    title: "Devices",
    page: DevicesPage
  },
  {
    key: "settings-cards",
    title: "Settings cards",
    page: SettingsPage
  },
  {
    key: "tray",
    title: "Tray icon",
    page: TrayPage
  }
];
