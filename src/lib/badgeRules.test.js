import { describe, it, expect } from "vitest";
import { computeUnlockedBadgeIds } from "./badgeRules.js";
import { ALL_BADGES } from "../constants/badges.js";

// Profil vide, complété test par test
const base = (over = {}) => ({
  watchedEpisodes: {}, extraReviews: {}, library: [], activityLog: [], lists: [],
  user: { name: "Test", joinDate: "2026-07-01T00:00:00Z" },
  followingCount: 0, followerCount: 0, posterClicks: {}, tags: {}, friendsLibraries: [],
  pinnedBadgeIds: [], rewatchCounts: {}, watchlistPeak: 0, listLikeCounts: {}, authUserId: "moi",
  ...over,
});

describe("Règles des badges", () => {
  it("ne renvoie que des badges qui existent", () => {
    const known = new Set(ALL_BADGES.map(b => b.id));
    const ids = computeUnlockedBadgeIds(base({ watchedEpisodes: { 1: { S1E1: true } }, extraReviews: { 1: [{ text: "x" }] } }));
    for (const id of ids) expect(known.has(id)).toBe(true);
  });

  it("profil tout neuf : ni « Premiers pas » ni « Premier mot »", () => {
    const ids = computeUnlockedBadgeIds(base());
    expect(ids).not.toContain("premiers_pas");
    expect(ids).not.toContain("premier_mot");
  });

  it("un épisode coché → « Premiers pas »", () =>
    expect(computeUnlockedBadgeIds(base({ watchedEpisodes: { 1: { S1E1: true } } }))).toContain("premiers_pas"));

  it("une critique → « Premier mot »", () =>
    expect(computeUnlockedBadgeIds(base({ extraReviews: { 1: [{ text: "Super" }] } }))).toContain("premier_mot"));

  it("« Précurseur » pour un compte créé dans la première année", () => {
    expect(computeUnlockedBadgeIds(base({ user: { name: "T", joinDate: "2026-07-01T00:00:00Z" } }))).toContain("precurseur");
    expect(computeUnlockedBadgeIds(base({ user: { name: "T", joinDate: "2027-07-01T00:00:00Z" } }))).not.toContain("precurseur");
  });

  it("ne plante pas avec des données partielles", () => {
    expect(() => computeUnlockedBadgeIds(base({ library: [{ tmdbId: 1 }], activityLog: [{ type: "episode" }] }))).not.toThrow();
  });
});
