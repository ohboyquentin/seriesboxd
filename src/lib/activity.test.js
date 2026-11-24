import { describe, it, expect } from "vitest";
import { activityText, activitySeries } from "./activity.js";

describe("Phrases d'activité selon qui regarde", () => {
  const add = { act: "watchlist_add", tmdbId: 1, title: "Lost", label: "Tu as ajouté Lost à ta Watchlist" };

  it("moi : « Tu as … ta watchlist »", () => expect(activityText(add, "self")).toBe("Tu as ajouté Lost à ta watchlist"));
  it("fil des amis : « a … sa watchlist »", () => expect(activityText(add, "name")).toBe("a ajouté Lost à sa watchlist"));
  it("profil public : « A … sa watchlist »", () => expect(activityText(add, "profile")).toBe("A ajouté Lost à sa watchlist"));

  it("épisode, note avec demi-étoile, liste", () => {
    expect(activityText({ act: "episode", title: "Lost", episodeCode: "S1E2", episodeTitle: "Pilote" }, "name")).toBe("a vu Lost S1E2 – Pilote");
    expect(activityText({ act: "rate", title: "Lost", rating: 3.5 }, "name")).toBe("a noté Lost ★★★½");
    expect(activityText({ act: "list_create", listName: "Cultes" }, "profile")).toBe("A créé la liste « Cultes »");
  });

  it("anciennes phrases converties (sans action enregistrée)", () => {
    expect(activityText({ label: "Tu as vu Dark" }, "name")).toBe("a vu Dark");
    expect(activityText({ label: "Tu as ajouté Dark à ta Watchlist" }, "profile")).toBe("A ajouté Dark à sa watchlist");
    expect(activityText({ label: "Tu as rewatchBreaking Bad" }, "name")).toBe("a revu Breaking Bad");
    expect(activityText({ label: "Tu as review Dark" }, "name")).toBe("a publié une critique de Dark");
    expect(activityText({ label: "Tu as vu Dark" }, "self")).toBe("Tu as vu Dark");
  });

  it("ne plante pas sur une entrée vide", () => expect(activityText({}, "name")).toBe(""));
});

describe("Série d'une activité", () => {
  const library = [{ tmdbId: 1, title: "Lost" }, { tmdbId: 2, title: "Lost Girl" }];
  it("par identifiant quand il existe", () => expect(activitySeries({ tmdbId: 1, label: "Tu as vu Lost Girl" }, library).tmdbId).toBe(1));
  it("anciennes entrées : le titre le plus long (« Lost Girl » et pas « Lost »)", () =>
    expect(activitySeries({ label: "Tu as vu Lost Girl" }, library).tmdbId).toBe(2));
  it("aucune série trouvée → null", () => expect(activitySeries({ label: "Tu as vu Dark" }, library)).toBeNull());
});
