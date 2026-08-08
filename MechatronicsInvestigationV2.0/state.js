export const GameState = {
  currentStory: null,
  visitedLocs: [],
  foundClues: [],
  accusation: { culprit: null, cause: null, location: null },
  currentTab: 'game',
  currentScreen: 'intro',
  lastGameScreen: 'intro',

  reset() {
    this.currentStory = null;
    this.visitedLocs = [];
    this.foundClues = [];
    this.accusation = { culprit: null, cause: null, location: null };
    this.currentTab = 'game';
    this.currentScreen = 'intro';
    this.lastGameScreen = 'intro';
  },

  setScreen(name) {
    if (name !== 'flow') {
      this.lastGameScreen = name;
    }
    this.currentScreen = name;
  },

  addVisitedLocation(locId) {
    if (!this.visitedLocs.includes(locId)) {
      this.visitedLocs.push(locId);
    }
  },

  addClue(clue) {
    if (!this.foundClues.some((entry) => entry.locId === clue.locId)) {
      this.foundClues.push(clue);
    }
  },

  canAccuse() {
    return this.visitedLocs.length >= 3;
  },

  resetAccusation() {
    this.accusation = { culprit: null, cause: null, location: null };
  }
};
