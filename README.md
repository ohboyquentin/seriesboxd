# SeriesBoxd

Suis tes séries, partage tes critiques, découvre ce que regardent tes amis.

Application web (PWA, pensée pour mobile) : bibliothèque de séries, épisodes vus, notes et critiques, listes, tags, badges, abonnements entre utilisateurs et fil d'activité des amis.

## Stack

- **Front** : React 19 + Vite — tout le code de l'app est dans [`src/seriesboxd.jsx`](src/seriesboxd.jsx)
- **Comptes et données** : [Supabase](https://supabase.com) (auth + tables `profiles`, `follows`, `list_likes`)
- **Séries** : API [TMDB](https://www.themoviedb.org), appelée via un proxy pour ne pas exposer la clé
  - en local : [`proxy.js`](proxy.js) (Express, port 3001)
  - en production : fonctions Vercel dans [`api/`](api/)
- **Hébergement** : Vercel

## Lancer en local

1. Installer les dépendances :
   ```bash
   npm install
   ```
2. Copier `.env.example` en `.env` et y mettre ta clé TMDB (`TMDB_KEY=...`).
3. Démarrer le proxy TMDB (terminal 1) :
   ```bash
   npm start
   ```
4. Démarrer l'app (terminal 2) :
   ```bash
   npm run dev
   ```
   puis ouvrir http://localhost:5173

En local, l'app appelle automatiquement le proxy sur le port 3001 (modifiable avec la variable `VITE_PROXY_URL`).

## Déployer

Chaque push sur `main` est déployé par Vercel. Variable d'environnement à définir dans Vercel :

| Variable   | Rôle                     |
|------------|--------------------------|
| `TMDB_KEY` | Clé API TMDB (fonctions `api/`) |

## Supabase

- Les données de chaque utilisateur sont stockées dans `profiles.data` (JSON). La copie locale du navigateur est allégée et ne remplace jamais les données en ligne.
- Les règles d'accès (RLS) de référence sont dans [`supabase/policies.sql`](supabase/policies.sql) : lecture publique, écriture uniquement sur ses propres lignes. Elles sont déjà en place sur la base de production.

## Scripts

| Commande          | Rôle                                   |
|-------------------|----------------------------------------|
| `npm run dev`     | Serveur de développement Vite          |
| `npm start`       | Proxy TMDB local (lit `.env`)          |
| `npm run build`   | Build de production dans `dist/`       |
| `npm run preview` | Prévisualiser le build                 |
| `npm run lint`    | ESLint                                 |
