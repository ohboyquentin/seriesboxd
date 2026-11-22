// ─── HELPERS ──────────────────────────────────────────────────────────────────

// ─── Avatar : redimensionnement ───────────────────────────────────────────────
// Un avatar est affiché en petit rond : 256×256 px en JPEG suffit (~20-40 Ko au lieu de plusieurs Mo).
const AVATAR_SIZE = 256;
export const AVATAR_MAX_CHARS = 100_000; // au-delà (~75 Ko), un avatar déjà enregistré est réduit automatiquement

export function resizeImageDataUrl(src, size = AVATAR_SIZE, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      // Recadrage carré centré, puis réduction
      const side = Math.min(img.width, img.height);
      const sx = (img.width - side) / 2, sy = (img.height - side) / 2;
      const out = Math.min(size, side);
      const canvas = document.createElement("canvas");
      canvas.width = out; canvas.height = out;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#080808"; // fond pour les PNG transparents (le JPEG n'a pas de transparence)
      ctx.fillRect(0, 0, out, out);
      ctx.drawImage(img, sx, sy, side, side, 0, 0, out, out);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => reject(new Error("Image illisible"));
    img.src = src;
  });
}
