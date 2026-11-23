// Remonte en haut un écran plein page à son ouverture.
// Fonction définie une seule fois : React ne l'appelle qu'au montage de l'écran,
// pas à chaque mise à jour (avec une fonction écrite directement dans le JSX,
// la page remontait en haut à chaque like, épisode coché, etc.).
export const scrollTopOnMount = (el) => {
  if (el) el.scrollTo(0, 0);
};
