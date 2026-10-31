import { projectAs } from "#winui/lifetime";
import type { ListViewBase } from "#winui/microsoft/ui/xaml/controls/ListViewBase";
import { ListViewItem } from "#winui/microsoft/ui/xaml/controls/ListViewItem";

// The first container of a list, as the padding and minimum height it ended up with; null before it is realized.
export function containerOf(view: ListViewBase) {
  const container = view.containerFromIndex(0);
  const isRealized = container !== null;
  if (!isRealized) {
    return null;
  }

  const item = projectAs(container, ListViewItem);
  return {
    minHeight: item.minHeight,
    left: item.padding.left,
    top: item.padding.top
  };
}
