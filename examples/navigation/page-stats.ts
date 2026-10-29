// How many components each page of the example has made and ended: the proof
// that a page the cache keeps is not made again, and that one it lets go of
// ends.
interface PageCount {
  created: number;
  destroyed: number;
}

export const pageStats = {
  home: {
    created: 0,
    destroyed: 0
  } satisfies PageCount,
  counter: {
    created: 0,
    destroyed: 0
  } satisfies PageCount,
  about: {
    created: 0,
    destroyed: 0
  } satisfies PageCount,
  // The counter page's own count, and how to raise it (the example's commands
  // stand in for a click).
  counterValue: 0,
  bump: () => undefined
};
