import { describe, it, expect, beforeEach } from "vitest";
import { useState } from "react";
import { renderHook, act } from "@testing-library/react";
import { useBackButton } from "./useBackButton.js";

const wait = (ms = 30) => new Promise(r => setTimeout(r, ms));

// Petite « app » : un ensemble de calques ouverts/fermés
function useFakeApp() {
  const [open, setOpen] = useState([]);
  useBackButton(open.map(key => ({ key, close: () => setOpen(o => o.filter(k => k !== key)) })));
  return {
    open,
    show: (key) => setOpen(o => [...o, key]),
    closeWithCross: (key) => setOpen(o => o.filter(k => k !== key)),
  };
}

const back = async () => { await act(async () => { window.history.back(); await wait(); }); };

describe("Bouton retour", () => {
  beforeEach(() => window.history.replaceState(null, ""));

  it("ferme les écrans dans l'ordre inverse d'ouverture", async () => {
    const { result } = renderHook(() => useFakeApp());
    for (const k of ["profil", "fiche", "confirmation"]) await act(async () => { result.current.show(k); await wait(5); });
    expect(result.current.open).toEqual(["profil", "fiche", "confirmation"]);
    await back(); expect(result.current.open).toEqual(["profil", "fiche"]);
    await back(); expect(result.current.open).toEqual(["profil"]);
    await back(); expect(result.current.open).toEqual([]);
  });

  it("fermer avec la croix ne laisse pas d'écran fantôme dans l'historique", async () => {
    const { result } = renderHook(() => useFakeApp());
    await act(async () => { result.current.show("profil"); await wait(5); });
    await act(async () => { result.current.show("fiche"); await wait(5); });
    await act(async () => { result.current.closeWithCross("fiche"); await wait(); });
    expect(result.current.open).toEqual(["profil"]);
    await back();
    expect(result.current.open).toEqual([]);
  });
});
