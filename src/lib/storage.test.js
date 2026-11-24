import { describe, it, expect, vi, beforeEach } from "vitest";

// Faux Supabase : chaque table renvoie ce qu'on lui prépare dans `tables`
const tables = {};
vi.mock("./supabase.js", () => {
  const query = (table) => {
    const q = { select: () => q, eq: () => q, maybeSingle: async () => tables[table] ?? { data: null, error: null } };
    return q;
  };
  return { supabase: { from: (table) => query(table) } };
});

const { mergeLocalIntoRemote, loadSavedData } = await import("./storage.js");

describe("mergeLocalIntoRemote — copie locale plus récente par-dessus les données en ligne", () => {
  const remote = {
    library: [{ tmdbId: 1, title: "A", backdrop: "img", watched: false }, { tmdbId: 2, title: "B" }],
    watchedEpisodes: { 1: { S1E1: true } },
    activityLog: [{ id: 1 }],
    lists: ["en ligne"],
  };
  const local = { library: [{ tmdbId: 1, title: "A", watched: true }], lists: ["local"] };
  const merged = mergeLocalIntoRemote(remote, local);

  it("ne touche jamais aux épisodes cochés ni au journal (absents de la copie locale)", () => {
    expect(merged.watchedEpisodes).toEqual({ 1: { S1E1: true } });
    expect(merged.activityLog).toEqual([{ id: 1 }]);
  });
  it("applique l'état local sur les séries en gardant les infos complètes", () => {
    expect(merged.library[0]).toEqual({ tmdbId: 1, title: "A", backdrop: "img", watched: true });
  });
  it("une série supprimée localement reste supprimée", () => {
    expect(merged.library.map(s => s.tmdbId)).toEqual([1]);
  });
  it("reprend les champs légers locaux (listes…)", () => {
    expect(merged.lists).toEqual(["local"]);
  });
});

describe("loadSavedData — d'où viennent les données au démarrage", () => {
  beforeEach(() => {
    for (const k of Object.keys(tables)) delete tables[k];
    localStorage.clear();
  });

  it("prend le coffre privé quand il existe", async () => {
    tables.private_profiles = { data: { data: { library: [{ tmdbId: 1 }], watchedEpisodes: { 1: {} } }, updated_at: "2026-01-02" }, error: null };
    tables.profiles = { data: { data: { _public: true, library: [] }, updated_at: "2026-01-03" }, error: null };
    const { data, remoteOk } = await loadSavedData("u1");
    expect(remoteOk).toBe(true);
    expect(data.library).toEqual([{ tmdbId: 1 }]);
    expect(data.watchedEpisodes).toBeDefined();
  });

  it("ne prend jamais une vitrine publique à la place du coffre, même plus récente", async () => {
    tables.private_profiles = { data: { data: { library: [{ tmdbId: 1 }] }, updated_at: "2026-01-01" }, error: null };
    tables.profiles = { data: { data: { _public: true, library: [] }, updated_at: "2026-06-01" }, error: null };
    const { data } = await loadSavedData("u1");
    expect(data.library).toEqual([{ tmdbId: 1 }]);
    expect(data._public).toBeUndefined();
  });

  it("prend un ancien profil complet s'il est plus récent que le coffre (transition)", async () => {
    tables.private_profiles = { data: { data: { library: [] }, updated_at: "2026-01-01" }, error: null };
    tables.profiles = { data: { data: { library: [{ tmdbId: 9 }] }, updated_at: "2026-02-01" }, error: null };
    const { data } = await loadSavedData("u1");
    expect(data.library).toEqual([{ tmdbId: 9 }]);
  });

  it("Supabase en erreur → mode hors-ligne : aucune écriture en ligne autorisée", async () => {
    tables.private_profiles = { data: null, error: { message: "réseau" } };
    const { remoteOk } = await loadSavedData("u1");
    expect(remoteOk).toBe(false);
  });

  it("copie locale non envoyée et plus récente → fusionnée sans perdre les épisodes", async () => {
    tables.private_profiles = { data: { data: { _savedAt: 1, library: [{ tmdbId: 1, watched: false }], watchedEpisodes: { 1: { S1E1: true } } }, updated_at: "2026-01-01" }, error: null };
    tables.profiles = { data: null, error: null };
    localStorage.setItem("seriesboxd_data_u1", JSON.stringify({ _savedAt: 2, _dirty: true, library: [{ tmdbId: 1, watched: true }] }));
    const { data } = await loadSavedData("u1");
    expect(data.library[0].watched).toBe(true);
    expect(data.watchedEpisodes).toEqual({ 1: { S1E1: true } });
  });

  it("copie locale déjà envoyée (pas « dirty ») → les données en ligne gagnent", async () => {
    tables.private_profiles = { data: { data: { _savedAt: 1, library: [{ tmdbId: 1, watched: false }] }, updated_at: "2026-01-01" }, error: null };
    tables.profiles = { data: null, error: null };
    localStorage.setItem("seriesboxd_data_u1", JSON.stringify({ _savedAt: 2, _dirty: false, library: [{ tmdbId: 1, watched: true }] }));
    const { data } = await loadSavedData("u1");
    expect(data.library[0].watched).toBe(false);
  });
});
