import type { DownloadItem, DownloadQuery } from "./download-types.ts";

const DEFAULT_LIMIT = 1000;
const DESCENDING_PREFIX = "-";

const EXACT_FIELDS = [
  "id",
  "url",
  "finalUrl",
  "filename",
  "mime",
  "startTime",
  "endTime",
  "state",
  "paused",
  "error",
  "bytesReceived",
  "totalBytes",
  "fileSize",
  "exists"
] as const;

function millisecondsOf(time: string | number) {
  return new Date(time).getTime();
}

function includesTerm({ item, term }: {
  item: DownloadItem;
  term: string;
}) {
  const needle = term.toLowerCase();
  return `${item.filename}\n${item.url}`.toLowerCase().includes(needle);
}

function matchesTerms({ item, terms }: {
  item: DownloadItem;
  terms: readonly string[];
}) {
  return terms.every(term => {
    const isExcluded = term.startsWith(DESCENDING_PREFIX);
    return isExcluded ? !includesTerm({
      item,
      term: term.slice(1)
    }) : includesTerm({
      item,
      term
    });
  });
}

function isBefore({ time, limit }: {
  time: string | undefined;
  limit: string | number | undefined;
}) {
  const isUnbounded = limit === undefined;
  if (isUnbounded) {
    return true;
  }

  return time !== undefined && millisecondsOf(time) < millisecondsOf(limit);
}

function isAfter({ time, limit }: {
  time: string | undefined;
  limit: string | number | undefined;
}) {
  const isUnbounded = limit === undefined;
  if (isUnbounded) {
    return true;
  }

  return time !== undefined && millisecondsOf(time) > millisecondsOf(limit);
}

function matchesPattern({ text, pattern }: {
  text: string;
  pattern: string | undefined;
}) {
  return pattern === undefined || new RegExp(pattern, "u").test(text);
}

function matchesExactFields({ item, query }: {
  item: DownloadItem;
  query: DownloadQuery;
}) {
  return EXACT_FIELDS.every(field => query[field] === undefined || query[field] === item[field]);
}

function matchesRanges({ item, query }: {
  item: DownloadItem;
  query: DownloadQuery;
}) {
  const { totalBytesGreater, totalBytesLess } = query;
  const isGreaterEnough = totalBytesGreater === undefined || item.totalBytes > totalBytesGreater;
  const isLessEnough = totalBytesLess === undefined || item.totalBytes < totalBytesLess;
  const isStartInside = isBefore({
    time: item.startTime,
    limit: query.startedBefore
  }) && isAfter({
    time: item.startTime,
    limit: query.startedAfter
  });
  const isEndInside = isBefore({
    time: item.endTime,
    limit: query.endedBefore
  }) && isAfter({
    time: item.endTime,
    limit: query.endedAfter
  });
  return isGreaterEnough && isLessEnough && isStartInside && isEndInside;
}

function matchesQuery({ item, query }: {
  item: DownloadItem;
  query: DownloadQuery;
}) {
  const isTextMatch = matchesTerms({
    item,
    terms: query.query ?? []
  }) && matchesPattern({
    text: item.filename,
    pattern: query.filenameRegex
  }) && matchesPattern({
    text: item.url,
    pattern: query.urlRegex
  }) && matchesPattern({
    text: item.finalUrl,
    pattern: query.finalUrlRegex
  });
  return isTextMatch && matchesExactFields({
    item,
    query
  }) && matchesRanges({
    item,
    query
  });
}

function orderOf({ left, right }: {
  left: unknown;
  right: unknown;
}) {
  const isNumbers = typeof left === "number" && typeof right === "number";
  const isStrings = typeof left === "string" && typeof right === "string";
  const isOrdered = isNumbers || isStrings;
  if (!isOrdered) {
    return 0;
  }

  return left < right ? -1 : Number(left > right);
}

function compareBy({ first, second, field }: {
  first: DownloadItem;
  second: DownloadItem;
  field: string;
}) {
  const isDescending = field.startsWith(DESCENDING_PREFIX);
  const key = isDescending ? field.slice(1) : field;
  const firstFields: Record<string, unknown> = { ...first };
  const secondFields: Record<string, unknown> = { ...second };
  const left = firstFields[key];
  const right = secondFields[key];
  const order = orderOf({
    left,
    right
  });
  return isDescending ? -order : order;
}

/**
 * The items a query selects, as `chrome.downloads.search` selects them: every
 * given field must match, `query` terms are searched in the file name and the
 * address (a leading `-` excludes), `orderBy` sorts and `limit` cuts.
 *
 * @param options - The items, oldest first, and the query.
 * @returns The matching items in the requested order.
 */
export function selectItems({ items, query }: {
  items: readonly DownloadItem[];
  query: DownloadQuery;
}) {
  const matching = items.filter(item => matchesQuery({
    item,
    query
  }));
  const orderBy = query.orderBy ?? [];
  const sorted = matching.toSorted((first, second) => {
    for (const field of orderBy) {
      const order = compareBy({
        first,
        second,
        field
      });
      const isDecided = order !== 0;
      if (isDecided) {
        return order;
      }
    }

    return 0;
  });
  return sorted.slice(0, query.limit ?? DEFAULT_LIMIT);
}
