import { describe, it, expect } from "vitest";
import { computeCompatibility, computeStats } from "./stats.js";
import { initialOf, formatTime, formatRelativeTime } from "./format.js";
import { notificationText } from "./notifications.js";
import { toReview, groupReviewsBySeries } from "./reviews.js";

describe("Compatibilité entre deux profils", () => {
  const me = [{ tmdbId: 1, genres: ["Drame"], userRating: 5 }, { tmdbId: 2, genres: ["Sci-Fi"], userRating: 4 }];
  it("profils identiques → 100 %", () => expect(computeCompatibility(me, me)).toBe(100));
  it("rien en commun → 0 %", () => expect(computeCompatibility(me, [{ tmdbId: 9, genres: ["Horreur"] }])).toBe(0));
  it("profil vide → 0 % sans plantage", () => expect(computeCompatibility(me, [])).toBe(0));
});

describe("Statistiques du profil", () => {
  it("compte 42 min par épisode coché", () => {
    const { totalMins } = computeStats([{ tmdbId: 1, episodes: 10 }], { 1: { a: true, b: true } });
    expect(totalMins).toBe(84);
  });
  it("moyenne des notes", () => {
    expect(computeStats([{ tmdbId: 1, userRating: 4 }, { tmdbId: 2, userRating: 5 }]).avgRating).toBe("4.5");
    expect(computeStats([]).avgRating).toBe("—");
  });
});

describe("Mise en forme", () => {
  it("initiale : nom vide ou absent → « ? » (ne plante plus)", () => {
    expect(initialOf("quin")).toBe("Q");
    expect(initialOf("  ")).toBe("?");
    expect(initialOf(undefined)).toBe("?");
  });
  it("durées", () => {
    expect(formatTime(45)).toBe("45m");
    expect(formatTime(120)).toBe("2h");
    expect(formatTime(60 * 24 * 153 + 60 * 21)).toBe("153j 21h");
  });
  it("dates relatives", () => {
    expect(formatRelativeTime(new Date().toISOString())).toBe("À l'instant");
    expect(formatRelativeTime(new Date(Date.now() - 5 * 60000).toISOString())).toBe("Il y a 5 min");
  });
});

describe("Notifications", () => {
  it("phrases neutres et complètes", () => {
    expect(notificationText({ type: "follow" })).toBe("te suit maintenant");
    expect(notificationText({ type: "review_like", seriesTitle: "Dark" })).toBe("a aimé ta critique de Dark");
    expect(notificationText({ type: "review_comment", seriesTitle: "Dark", commentText: "top" })).toBe("a commenté ta critique de Dark : « top »");
    expect(notificationText({ type: "list_like", list: { name: "Cultes" } })).toBe("a aimé ta liste « Cultes »");
    expect(notificationText({ type: "list_like", list: null })).toBe("a aimé ta liste « sans titre »");
  });
});

describe("Critiques", () => {
  const row = {
    id: "r1", user_id: "auteur", tmdb_id: 7, rating: "4.5", text: "Super", created_at: "2026-07-19T10:00:00Z",
    review_likes: [{ user_id: "moi" }, { user_id: "x" }],
    review_comments: [{ id: "c2", user_id: "x", text: "2e", created_at: "2026-07-20" }, { id: "c1", user_id: "moi", text: "1er", created_at: "2026-07-19" }],
  };
  const authors = { auteur: { name: "quin", initial: "Q", avatarUrl: null }, moi: { name: "Moi", initial: "M", avatarUrl: null } };
  const rv = toReview(row, authors, "moi");

  it("compte les likes et sait si je l'ai aimée", () => { expect(rv.likes).toBe(2); expect(rv.liked).toBe(true); });
  it("n'est pas ma critique", () => expect(rv.isMine).toBe(false));
  it("note convertie en nombre", () => expect(rv.rating).toBe(4.5));
  it("commentaires triés du plus ancien au plus récent", () => expect(rv.comments.map(c => c.text)).toEqual(["1er", "2e"]));
  it("auteur inconnu → « Utilisateur » sans planter", () => expect(toReview({ ...row, user_id: "?" }, {}, null).user).toBe("Utilisateur"));
  it("regroupement par série", () => expect(groupReviewsBySeries([rv, { ...rv, id: "r2" }])[7]).toHaveLength(2));
});
