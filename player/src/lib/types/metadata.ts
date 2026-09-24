import type { Track } from "./track";

export type MetadataFields = Partial<
  Pick<Track, "title" | "artist" | "album" | "mood" | "tags">
>;

export type FilterableField = "title" | "artist" | "album" | "mood" | "tags";

export type SortableField = "title" | "artist" | "album" | "mood" | "duration";
export type SortDirection = 'asc' | 'desc' | null;
