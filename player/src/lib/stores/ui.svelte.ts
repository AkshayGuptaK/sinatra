export type AppDeck = "explore" | "curate" | "vibe" | "settings";
export type LibraryViewMode = "list" | "map";
export type VisualizerViewMode = "timeline" | "fluid";

class UIStore {
  activeDeck = $state<AppDeck>("curate");
  libraryView = $state<LibraryViewMode>("list");
  visualizerView = $state<VisualizerViewMode>("timeline");

  isLyricsOpen = $state(false);
  isLyricsEditing = $state(false);

  setDeck = (deck: AppDeck) => {
    this.activeDeck = deck;
  }

  setLibraryView = (view: LibraryViewMode) => {
    this.activeDeck = "curate";
    this.libraryView = view;
  }

  setVisualizerView = (view: VisualizerViewMode) => {
    this.activeDeck = "vibe";
    this.visualizerView = view;
  }

  toggleLyrics = () => {
    this.activeDeck = "vibe";
    this.isLyricsOpen = !this.isLyricsOpen;
  }
}

export const ui = new UIStore();
