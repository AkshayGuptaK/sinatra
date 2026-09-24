import type { Track } from "./track";

export type MetadataFields = Partial<
  Pick<Track, "title" | "artist" | "album" | "mood" | "tags">
>;
