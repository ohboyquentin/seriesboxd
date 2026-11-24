import { describe, it, expect } from "vitest";
import { toPublicProfile, countWatchedEpisodes, PUBLIC_VITRINE_ENABLED } from "./publicProfile.js";

const full = {
  user: { name: "Quentin", pseudo: "q", avatar: "data:img", bio: "bio", favGenres: ["Drame"], favShows: [{ tmdbId: 1 }],
          location: "Paris", website: "https://exemple.fr", platforms: ["Netflix"], genres: ["Drame"], joinDate: "2026-06-10" },
  library: [{ tmdbId: 1, watched: true }, { tmdbId: 2, inWatchlist: true }],
  lists: [{ id: 1, name: "Cultes" }],
  pinnedBadgeIds: ["a"], unlockedBadgeIds: ["a", "b"],
  activityLog: Array.from({ length: 50 }, (_, i) => ({ id: i })),
  watchedEpisodes: { 1: { S1E1: true, S1E2: true, S1E3: false }, 2: { S1E1: true } },
  tags: { 1: ["culte"] }, posterClicks: { 1: 5 }, rewatchCounts: { 1: { count: 2 } }, watchHistory: { 1: "2026-01-01" },
};
const vitrine = toPublicProfile(full);

describe("Vitrine publique (ce que les autres utilisateurs peuvent lire)", () => {
  it("est bien activée", () => expect(PUBLIC_VITRINE_ENABLED).toBe(true));

  it("ne contient JAMAIS les données privées", () => {
    for (const k of ["location", "website", "platforms", "genres", "joinDate"]) expect(vitrine.user[k]).toBeUndefined();
    for (const k of ["watchedEpisodes", "tags", "posterClicks", "rewatchCounts", "watchHistory"]) expect(vitrine[k]).toBeUndefined();
  });

  it("contient le profil public, la bibliothèque et la watchlist", () => {
    expect(Object.keys(vitrine.user).sort()).toEqual(["avatar", "bio", "favGenres", "favShows", "name", "pseudo"]);
    expect(vitrine.library).toHaveLength(2);
    expect(vitrine.library.some(s => s.inWatchlist)).toBe(true);
    expect(vitrine.lists).toEqual([{ id: 1, name: "Cultes" }]);
  });

  it("limite l'activité aux 30 dernières entrées", () => expect(vitrine.activityLog).toHaveLength(30));
  it("remplace le détail des épisodes par leur total", () => expect(vitrine.episodesCount).toBe(3));
  it("est marquée comme vitrine", () => expect(vitrine._public).toBe(true));
});

describe("countWatchedEpisodes", () => {
  it("ne compte que les épisodes cochés", () => expect(countWatchedEpisodes({ 1: { a: true, b: false } })).toBe(1));
  it("supporte l'absence de données", () => expect(countWatchedEpisodes(undefined)).toBe(0));
});
