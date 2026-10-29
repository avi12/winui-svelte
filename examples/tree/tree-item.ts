export interface TreeItem {
  id: string;
  name: string;
  children: TreeItem[];
}

function itemAt({ path, children }: {
  path: string;
  children: TreeItem[];
}) {
  return {
    id: path,
    name: `Node ${path.slice("node-".length)}`,
    children
  } satisfies TreeItem;
}

// `roots` items, each with `branching` children, `depth` levels down: the id
// of an item is its path ("node-2-1").
export function makeTree({ roots, branching, depth }: {
  roots: number;
  branching: number;
  depth: number;
}) {
  const rootItems: TreeItem[] = Array.from({ length: roots }, (_unused, index) => itemAt({
    path: `node-${index}`,
    children: []
  }));
  let level = rootItems;
  for (let i = 1; i < depth; i++) {
    const next: TreeItem[] = [];
    for (const parent of level) {
      for (let iChild = 0; iChild < branching; iChild++) {
        const child = itemAt({
          path: `${parent.id}-${iChild}`,
          children: []
        });
        parent.children.push(child);
        next.push(child);
      }
    }

    level = next;
  }

  return rootItems;
}
