import { useEffect, useRef } from "react";

// Bouton retour (Android), geste « glisser pour revenir » et bouton Précédent du navigateur.
//
// L'app affiche ses écrans comme des calques par-dessus l'accueil, sans changer d'adresse :
// pour le téléphone il n'y a qu'une seule page, donc « retour » fermait l'app.
// Ce hook ajoute une entrée dans l'historique du navigateur pour chaque calque ouvert,
// et ferme le calque du dessus quand l'utilisateur fait « retour ».
//
// layers : liste des calques ACTUELLEMENT ouverts, [{ key, close }]. L'ordre d'ouverture est
// mémorisé ici : « retour » ferme toujours le dernier ouvert.
export function useBackButton(layers) {
  const stackRef = useRef([]);        // clés des calques ouverts, dans l'ordre d'ouverture
  const closersRef = useRef({});      // dernière fonction de fermeture connue pour chaque clé
  const ignorePopRef = useRef(0);     // retours déclenchés par nous (à ne pas traiter)

  const openKeys = layers.map(l => l.key).join("|");

  // Garde à jour les fonctions de fermeture (après chaque rendu)
  useEffect(() => {
    closersRef.current = Object.fromEntries(layers.map(l => [l.key, l.close]));
  });

  // Synchronise l'historique avec les calques ouverts (ouverture ou fermeture par l'interface)
  useEffect(() => {
    const open = openKeys ? openKeys.split("|") : [];
    const stack = stackRef.current;
    const removed = stack.filter(k => !open.includes(k));
    const added = open.filter(k => !stack.includes(k));
    if (!removed.length && !added.length) return;

    stackRef.current = [...stack.filter(k => open.includes(k)), ...added];

    // On ajuste l'historique du nombre net de calques : jamais de « retour » et d'ajout
    // en même temps (ils sont asynchrones et pourraient se croiser).
    const delta = added.length - removed.length;
    for (let i = 0; i < delta; i++) window.history.pushState({ seriesboxdLayer: true }, "");
    if (delta < 0) {
      ignorePopRef.current += 1;
      window.history.go(delta);
    }
  }, [openKeys]);

  // « Retour » de l'utilisateur : on ferme le calque du dessus
  useEffect(() => {
    const onPopState = () => {
      if (ignorePopRef.current > 0) { ignorePopRef.current -= 1; return; }
      const top = stackRef.current[stackRef.current.length - 1];
      if (!top) return; // rien d'ouvert : le navigateur fait son retour normal
      stackRef.current = stackRef.current.slice(0, -1);
      closersRef.current[top]?.();
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
}
