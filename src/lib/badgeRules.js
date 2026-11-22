import { ALL_BADGES, APP_LAUNCH_DATE } from "../constants/badges.js";
import { GENRE_MAP } from "./tmdb.js";
import { computeCompatibility } from "./stats.js";

// Règles de déblocage des badges : calcul pur à partir des données de l'utilisateur.
// Renvoie la liste des ids de badges débloqués. Appelée par App à chaque changement de données.
export function computeUnlockedBadgeIds({ watchedEpisodes, extraReviews, library, activityLog, lists, user, followingCount, followerCount, posterClicks, tags, friendsLibraries, pinnedBadgeIds, rewatchCounts, watchlistPeak, listLikeCounts, authUserId }) {
  // Sources de données
  const totalEpisodes  = Object.values(watchedEpisodes).reduce((acc, eps) => acc + Object.values(eps).filter(Boolean).length, 0);
  const allReviews     = Object.values(extraReviews).flat();
  const totalReviews   = allReviews.length;
  const totalLikesGiven = activityLog.filter(a => a.type === "like").length;
  const totalCommentsGiven = activityLog.filter(a => a.type === "comment").length;
  const watchedSeries  = library.filter(s => s.watched);
  const libSize        = library.filter(s => s.watched).length;
  const watchlistSize  = library.filter(s => s.inWatchlist).length;
  const nettoyeurWatchlistCondition = watchlistPeak >= 10 && watchlistSize === 0;

  // Genres uniques des séries vues
  // Helper pour récupérer les genres d'une série — tableau si dispo, sinon genre string comme fallback
  const getGenres = (s) => (s.genres && s.genres.length > 0) ? s.genres : (s.genre && s.genre !== "Série" ? [s.genre] : []);

  const genresSeen = [...new Set(watchedSeries.flatMap(s => getGenres(s)))];

  // Séries terminées = tous les épisodes cochés
  const completedSeries = library.filter(s => {
    const eps = watchedEpisodes[s.tmdbId] || {};
    const done = Object.values(eps).filter(Boolean).length;
    const total = s.episodes > 0 ? s.episodes : null;
    if (total !== null) return done >= total && total > 0;
    return s.watched; // fallback si le total réel n'est pas encore connu
  });

  // Séries vues par genre
  const seriesByGenre = (genre) => completedSeries.filter(s => getGenres(s).some(g => g.toLowerCase().includes(genre.toLowerCase())));

  // Notes données
  const ratings      = watchedSeries.filter(s => s.userRating).map(s => s.userRating);
  const avgRating    = ratings.length > 0 ? ratings.reduce((a,b) => a+b, 0) / ratings.length : 0;
  const fiveStars    = watchedSeries.filter(s => s.userRating === 5);
  const oneStar      = watchedSeries.filter(s => s.userRating === 1);
  const allStarValues = [0.5,1,1.5,2,2.5,3,3.5,4,4.5,5];
  const usedRatings  = new Set(ratings);

  // Ancienneté du compte
  const joinDate     = user.joinDate ? new Date(user.joinDate) : new Date();
  const daysSince    = Math.floor((Date.now() - joinDate) / 86400000);

  // Séries "pilote" = 1 seul épisode coché
  const pilotOnly = library.filter(s => {
    const eps = watchedEpisodes[s.tmdbId] || {};
    return Object.values(eps).filter(Boolean).length === 1;
  });

  // Jours d'activité consécutifs
  const activityDays = [...new Set(activityLog.map(a => a.ts?.slice(0,10)))].filter(Boolean).sort();
  const maxStreak = (() => {
    let streak = 1, max = 0;
    for (let i = 1; i < activityDays.length; i++) {
      const diff = (new Date(activityDays[i]) - new Date(activityDays[i-1])) / 86400000;
      if (diff === 1) { streak++; max = Math.max(max, streak); }
      else streak = 1;
    }
    return activityDays.length > 0 ? Math.max(max, streak) : 0;
  })();

  // Heure d'activité (depuis activityLog timestamps)
  const hours = activityLog.map(a => a.ts ? new Date(a.ts).getHours() : -1);
  const hasNightActivity      = hours.some(h => h >= 0 && h < 5);
  const hasStrictNightActivity = hours.some(h => h >= 0 && h < 4); // 0h-3h59, dédié à "Oiseau de nuit" pour ne pas chevaucher "Lève-tôt"
  const hasEarlyActivity   = hours.some(h => h >= 4 && h <= 6);
  const hasMorningActivity   = hours.some(h => h >= 5 && h < 12);
  const hasAfternoonActivity = hours.some(h => h >= 12 && h < 18);
  const hasEveningActivity   = hours.some(h => h >= 18 && h < 24);
  const cycleCompletCondition = hasNightActivity && hasMorningActivity && hasAfternoonActivity && hasEveningActivity;

  // Pays des séries (via s.origin_country ou s.country)
  const countries = [...new Set(watchedSeries.flatMap(s => s.origin_country || s.countries || []))];
  const localCondition = watchedSeries.length >= 5 && countries.length === 1;
  const genreCounts = {};
  watchedSeries.forEach(s => { getGenres(s).forEach(g => { genreCounts[g] = (genreCounts[g] || 0) + 1; }); });
  const totalGenreTags = Object.values(genreCounts).reduce((a, b) => a + b, 0);
  const maxGenreCount = Math.max(0, ...Object.values(genreCounts));
  const monogenreCondition = watchedSeries.length >= 5 && totalGenreTags > 0 && (maxGenreCount / totalGenreTags) >= 0.8;

  // Décennies des séries vues (basé sur l'année de sortie)
  const decadesSeen = new Set(watchedSeries.filter(s => s.year && s.year !== "—").map(s => Math.floor(s.year / 10) * 10));
  const currentYear = new Date().getFullYear();
  const retourFuturCondition = watchedSeries.some(s => s.year && s.year !== "—" && (currentYear - s.year) > 30);

  // Formats d'épisodes (courts / longs) parmi les séries terminées
  const formatCourtCondition = completedSeries.some(s => (s.episodes || 0) > 0 && s.episodes < 10);
  const feuilletonCondition  = completedSeries.some(s => (s.episodes || 0) > 300);

  // Tags
  const uniqueTagsCount = new Set(Object.values(tags).flat()).size;
  const taggedSeriesCount = Object.values(tags).filter(arr => (arr || []).length > 0).length;

  // Dates spéciales
  const jourJCondition = activityLog.some(a => a.type === "episode" && a.airDate && new Date(a.ts||0).toDateString() === new Date(a.airDate).toDateString());
  const formatXxlCondition = activityLog.some(a => a.type === "episode" && a.durationMin && a.durationMin > 90);
  const nouvelAnCondition = activityLog.some(a => { const d = new Date(a.ts||0); return d.getDate() === 1 && d.getMonth() === 0; });
  const marathonNoelCondition = activityLog.filter(a => { const d = new Date(a.ts||0); return a.type === "episode" && d.getDate() === 25 && d.getMonth() === 11; }).length >= 3;
  const horrorSeriesTitles = watchedSeries.filter(s => getGenres(s).some(g => g.toLowerCase().includes("horreur"))).map(s => s.title);
  const vendredi13Condition = activityLog.some(a => {
    if (a.type !== "episode") return false;
    const d = new Date(a.ts||0);
    if (d.getDate() !== 13 || d.getDay() !== 5) return false;
    return horrorSeriesTitles.some(t => a.label?.includes(t));
  });

  // Perfectionniste / Anti-fan (toutes les séries terminées notées pareil, minimum 10)
  const perfectionnisteCondition = completedSeries.length >= 10 && completedSeries.every(s => s.userRating === 5);
  const antiFanCondition = completedSeries.length >= 10 && completedSeries.every(s => s.userRating === 1);

  // Retour après 60 jours d'inactivité totale
  const sortedAllActs = [...activityLog].sort((a,b) => new Date(a.ts||0) - new Date(b.ts||0));
  const retourBatonCondition = sortedAllActs.some((a, i) => {
    if (i === 0) return false;
    const gap = (new Date(a.ts||0) - new Date(sortedAllActs[i-1].ts||0)) / 86400000;
    return gap >= 60;
  });

  // Compatibilité / favoris communs avec des amis
  const myWatchedForCompat = watchedSeries;
  const ameSoeurCondition = friendsLibraries.some(f => computeCompatibility(myWatchedForCompat, f.watched || []) >= 90);
  const myFavIds = new Set((user.favShows || []).map(s => s.tmdbId));
  const jumeauxSeriesCondition = myFavIds.size >= 3 && friendsLibraries.some(f => {
    const theirFavIds = new Set((f.favShows || []).map(s => s.tmdbId));
    if (theirFavIds.size !== myFavIds.size) return false;
    return [...myFavIds].every(id => theirFavIds.has(id));
  });

  // Listes
  const listsCount = lists.length;

  // Profil complet
  const profileFilled = !!(user.bio && user.location && user.avatar);
  const profilDoreCondition = !!(user.bio && user.location && user.website && user.avatar && (user.favGenres || []).length > 0 && (user.favShows || []).length > 0);
  const vitrineCompleteCondition = pinnedBadgeIds.length >= 4;
  const fierteSecreteCondition = pinnedBadgeIds.some(id => ALL_BADGES.find(b => b.id === id)?.secret);
  const totalRewatchesCumules = Object.values(rewatchCounts).reduce((a, r) => a + (r.count || 0), 0);
  const habitueRerunsCondition = totalRewatchesCumules >= 10;
  const critiqueAssiduCondition = completedSeries.length >= 5 && completedSeries.every(s => (extraReviews[s.tmdbId] || []).length > 0);
  const opposesCondition = watchedSeries.length >= 5 && friendsLibraries.some(f => (f.watched || []).length >= 5 && computeCompatibility(watchedSeries, f.watched || []) < 10);

  // ─── Données temporelles supplémentaires (basées sur les vrais timestamps d'activityLog) ────
  const sortedEpActs = [...activityLog].filter(a => a.type === "episode").sort((a,b) => new Date(a.ts||0) - new Date(b.ts||0));
  let count48 = 0;
  let count24 = 0;
  for (let i = 0; i < sortedEpActs.length; i++) {
    const start = new Date(sortedEpActs[i].ts||0).getTime();
    const inWindow48 = sortedEpActs.filter(a => { const t = new Date(a.ts||0).getTime(); return t >= start && t <= start + 172800000; }).length;
    const inWindow24 = sortedEpActs.filter(a => { const t = new Date(a.ts||0).getTime(); return t >= start && t <= start + 86400000; }).length;
    count48 = Math.max(count48, inWindow48);
    count24 = Math.max(count24, inWindow24);
  }
  // Épisodes regroupés par jour calendaire réel (timestamp direct, plus d'estimation/devinette)
  const epsByCalendarDay = {};
  sortedEpActs.forEach(a => {
    const date = new Date(a.ts || 0).toDateString();
    epsByCalendarDay[date] = (epsByCalendarDay[date] || 0) + 1;
  });
  const call911Condition = count48 >= 50;
  const sprinteur = count24 >= 10; // 10 épisodes vus en moins de 24h glissantes

  const epsByWeekday = {};
  activityLog.filter(a => a.type === "episode").forEach(a => {
    const d = new Date(a.ts || 0);
    const day = d.getDay();
    const date = d.toDateString();
    if (!epsByWeekday[date]) epsByWeekday[date] = { day, count: 0 };
    epsByWeekday[date].count++;
  });
  const weekendDays = Object.values(epsByWeekday).filter(d => d.day === 0 || d.day === 5 || d.day === 6);
  const weekendTotal = weekendDays.reduce((a, d) => a + d.count, 0);

  const nightDays = [...new Set(
    activityLog.filter(a => { const h = new Date(a.ts||0).getHours(); return h >= 0 && h < 5; })
      .map(a => new Date(a.ts||0).toDateString())
  )].sort();
  let maxNightStreak = 0, curNightStreak = 0;
  for (let i = 0; i < nightDays.length; i++) {
    if (i === 0) { curNightStreak = 1; continue; }
    const prev = new Date(nightDays[i-1]), cur = new Date(nightDays[i]);
    const diff = (cur - prev) / 86400000;
    curNightStreak = diff === 1 ? curNightStreak + 1 : 1;
    maxNightStreak = Math.max(maxNightStreak, curNightStreak);
  }
  const seasonsSeen = new Set();
  activityLog.forEach(a => {
    const m = new Date(a.ts||0).getMonth();
    if (m >= 2 && m <= 4) seasonsSeen.add("printemps");
    else if (m >= 5 && m <= 7) seasonsSeen.add("ete");
    else if (m >= 8 && m <= 10) seasonsSeen.add("automne");
    else seasonsSeen.add("hiver");
  });

  const autumnEps = activityLog.filter(a => {
    const m = new Date(a.ts||0).getMonth();
    return a.type === "episode" && m >= 8 && m <= 10;
  }).length;

  const summerEps = activityLog.filter(a => {
    const m = new Date(a.ts||0).getMonth();
    return a.type === "episode" && m >= 5 && m <= 7;
  }).length;

  const hibernationDone = Object.entries(epsByCalendarDay).some(([dateStr, count]) => {
    const m = new Date(dateStr).getMonth();
    return (m === 11 || m === 0 || m === 1) && count >= 8;
  });

  const abandonCount = pilotOnly.length;
  const nostalgicCount = Object.values(rewatchCounts).filter(r => r.count >= 1).length;

  const totalEpsAll = Object.values(watchedEpisodes).reduce((a, eps) => a + Object.values(eps||{}).filter(Boolean).length, 0);
  const maxSingleSeriesEps = Math.max(0, ...Object.values(watchedEpisodes).map(eps => Object.values(eps||{}).filter(Boolean).length));
  const leFideleCondition = totalEpsAll > 0 && (maxSingleSeriesEps / totalEpsAll) >= 0.5;
  const lePuristeCondition = completedSeries.length >= 20;

  // Séries "en cours" = mêmes critères que la section Keep watching (au moins 1 épisode coché, pas encore marquée "vue")
  const startedSeries = library.filter(s => {
    const eps = watchedEpisodes[s.tmdbId];
    return eps && Object.values(eps).some(Boolean);
  });
  const keepWatchingInProgress = startedSeries.filter(s => !completedSeries.find(c => c.tmdbId === s.tmdbId));
  const centPourcentCondition = startedSeries.length > 0 && keepWatchingInProgress.length === 0;

  const premiers_pas =   totalEpisodes >= 1;
  const accro =          totalEpisodes >= 50;
  const seriphile =      totalEpisodes >= 100;
  const binge_master =   totalEpisodes >= 200;
  const marathonien =    totalEpisodes >= 500;
  const legende_canape = totalEpisodes >= 1000;
  const oiseau_nuit =    hasStrictNightActivity;
  const leve_tot =       hasEarlyActivity;
  const adieu =          completedSeries.some(s => (s.episodes || 0) > 100);
  const speedrunner =    completedSeries.some(s => {
    const seriesActs = activityLog.filter(a => a.label?.includes(s.title));
    if (seriesActs.length < 2) return false;
    const times = seriesActs.map(a => new Date(a.ts||0).getTime()).sort();
    return (times[times.length-1] - times[0]) < 86400000;
  });
  const weekend =        weekendTotal >= 15;
  const insomniaque =    maxNightStreak >= 7;
  const session_canap =  (count24 * 42) >= 300; // ~42min/épisode, 5h cumulées sur une fenêtre glissante de 24h

  const survivantCondition = completedSeries.filter(s => s.rawStatus === "Canceled").length >= 10;
  const batHours = activityLog.filter(a => { const d = new Date(a.ts||0); return d.getHours() >= 3 && d.getHours() < 5; }).map(a => new Date(a.ts||0).getDay());
  const batmanCondition = hours.some(h => h >= 3 && h < 5) && batHours.some(d => d >= 1 && d <= 4);

  const rules = {
      // Visionnage
      premiers_pas, accro, seriphile, binge_master, marathonien, legende_canape,
      oiseau_nuit, leve_tot, sprinteur, adieu, speedrunner, weekend, insomniaque, session_canap,
      jour_j:           jourJCondition,
      format_xxl:       formatXxlCondition,
      cycle_complet:    cycleCompletCondition,
      retour_futur:     retourFuturCondition,
      multi_decennies:  decadesSeen.size >= 5,
      format_court:     formatCourtCondition,
      feuilleton:       feuilletonCondition,

      // Notation
      premiere_opinion: ratings.length >= 1,
      coup_coeur:       fiveStars.length >= 20,
      sans_pitie:       oneStar.length >= 10,
      "sévère":         avgRating > 0 && avgRating < 2.5,
      equilibre:        allStarValues.every(v => usedRatings.has(v)),
      gout_luxe:        avgRating >= 4 && ratings.length >= 5,
      mauvais_gout:     watchedSeries.some(s => s.userRating === 5 && (s.rating || 0) > 0 && (s.rating || 0) < 2),
      pourquoi:         library.some(s => s.userRating === 1 && watchedEpisodes[s.tmdbId] && Object.values(watchedEpisodes[s.tmdbId]).filter(Boolean).length > 1),
      fond_trou:        fiveStars.filter(s => (s.genres || []).some(g => g.toLowerCase().includes("drame"))).length >= 5,
      pepite_cachee:    fiveStars.some(s => typeof s.voteCount === "number" && s.voteCount > 0 && s.voteCount < 300),

      // Critiques
      premier_mot:      totalReviews >= 1,
      critique_herbe:   totalReviews >= 10,
      chroniqueur:      totalReviews >= 25,
      plume_aceree:     totalReviews >= 50,
      journaliste:      totalReviews >= 100,
      cineaste:         totalReviews >= 200,
      roman:            allReviews.some(r => (r.text || "").length > 1000),
      critique_pop:     allReviews.some(r => (r.likes || 0) >= 50),
      influenceur:      allReviews.reduce((a,r) => a + (r.likes||0), 0) >= 500,
      concis:           allReviews.some(r => (r.text||"").length < 100 && (r.likes||0) >= 20),
      spoiler:          (() => {
        const episodeActs = activityLog.filter(a => a.type === "episode" && a.ts);
        const reviewActs  = activityLog.filter(a => a.type === "review" && a.ts);
        return reviewActs.some(r => {
          const rt = new Date(r.ts).getTime();
          return episodeActs.some(e => Math.abs(rt - new Date(e.ts).getTime()) <= 60 * 60 * 1000);
        });
      })(),
      critique_assidu:  critiqueAssiduCondition,

      // Genres
      curieux:          genresSeen.length >= 5,
      explorateur:      genresSeen.length >= 10,
      cameleon:         genresSeen.length >= 15,
      omnivore:         [...new Set(Object.values(GENRE_MAP))].every(g => genresSeen.includes(g)),
      galactique:       watchedSeries.length >= 20 && genresSeen.length >= 10,
      fan_crime:        (watchedSeries.filter(s => getGenres(s).some(g=>g.toLowerCase().includes("crime"))).reduce((a,s) => a + Object.values(watchedEpisodes[s.tmdbId]||{}).filter(Boolean).length, 0)) >= 50,
      profiler:         seriesByGenre("crime").length >= 10,
      spatial:          (watchedSeries.filter(s => getGenres(s).some(g=>g.toLowerCase().includes("sci"))).reduce((a,s) => a + Object.values(watchedEpisodes[s.tmdbId]||{}).filter(Boolean).length, 0)) >= 50,
      seul_mars:        seriesByGenre("sci").length >= 10,
      clown:            seriesByGenre("comédie").length >= 10,
      detective:        (watchedSeries.filter(s => getGenres(s).some(g=>g.toLowerCase().includes("thriller")||g.toLowerCase().includes("crime"))).reduce((a,s) => a + Object.values(watchedEpisodes[s.tmdbId]||{}).filter(Boolean).length, 0)) >= 50,
      briseur:          seriesByGenre("drame").length >= 10,
      ghostbuster:      seriesByGenre("horreur").length >= 10,
      lover:            seriesByGenre("romance").length >= 10,
      bagarreur:        seriesByGenre("action").length >= 10,
      Magicien:         (watchedSeries.filter(s => getGenres(s).some(g=>g.toLowerCase().includes("fantasy")||g.toLowerCase().includes("fantaisie"))).reduce((a,s) => a + Object.values(watchedEpisodes[s.tmdbId]||{}).filter(Boolean).length, 0)) >= 50,
      chirurgien:       seriesByGenre("médical").length >= 5,
      historien:        seriesByGenre("historique").length >= 10,
      aventurier:       countries.length >= 10,
      globe_trotter:    countries.length >= 20,
      local:            localCondition,
      monogenre:        monogenreCondition,

      // Bibliothèque
      partez:           libSize >= 1,
      collectionneur:   libSize >= 10,
      bibliothecaire:   libSize >= 50,
      archiviste:       libSize >= 100,
      conservateur:     libSize >= 200,
      watchlist_nais:   watchlistSize >= 10,
      liste_100:        watchlistSize >= 100,
      collection_sec:   listsCount >= 10,
      curateur:         Object.entries(listLikeCounts).some(([k, c]) => k.startsWith(`${authUserId}:`) && c >= 3),
      organise:         watchlistSize >= 5 && listsCount >= 3,
      nettoyeur_watchlist: nettoyeurWatchlistCondition,
      etiqueteur:       uniqueTagsCount >= 10,
      taxonomiste:      taggedSeriesCount >= 25,

      // Complétion
      bienvenue:        profileFilled,
      profil_dore:      profilDoreCondition,
      vitrine_complete: vitrineCompleteCondition,
      fierte_secrete:   fierteSecreteCondition,
      jusqu_bout:       completedSeries.length >= 1,
      finisseur:        completedSeries.length >= 10,
      sans_repit:       completedSeries.length >= 25,
      papillonneur:     completedSeries.length >= 50,
      collec_fins:      completedSeries.length >= 100,
      cent_pourcent:    centPourcentCondition,
      legende:          totalEpisodes >= 5000,
      un_pourcent:      false, // badge admin uniquement

      // Social
      enchante:         followingCount >= 1,
      reseau:           followingCount >= 25,
      cercle:           followingCount >= 10,
      populaire:        followerCount >= 50,
      diva:             followerCount >= 100,
      rok_star:         followerCount >= 200,
      fan:              totalLikesGiven >= 10,
      ambassadeur:      totalLikesGiven >= 25,
      premier_echange:  totalCommentsGiven >= 1,
      debatteur:        totalCommentsGiven >= 50,
      prem_interaction: totalLikesGiven >= 1,
      ame_soeur:        ameSoeurCondition,
      opposes:          opposesCondition,
      jumeaux_series:   jumeauxSeriesCondition,

      // Spéciaux
      noctambule:       hasNightActivity,
      en_bonne_voie:    maxStreak >= 7,
      bonne_reso:       maxStreak >= 30,
      inarretable:      maxStreak >= 100,
      inépuisable:      maxStreak >= 365,
      fidele:           daysSince >= 30,
      ancien:           daysSince >= 365,
      veteran:          daysSince >= 1095,
      precurseur:       joinDate.getTime() >= APP_LAUNCH_DATE.getTime() && (joinDate.getTime() - APP_LAUNCH_DATE.getTime()) <= 365 * 86400000,
      survivant:        survivantCondition,
      parieur:          library.some(s => (s.voteCount || s.popularity || 9999) < 100),
      testeur:          pilotOnly.length >= 20,
      nostalgique:      nostalgicCount >= 5,
      habitue_reruns:   habitueRerunsCondition,
      mauvaise_dec:     library.filter(s => !completedSeries.find(c=>c.tmdbId===s.tmdbId)).length >= 50,
      abandon:          abandonCount >= 1,
      rewatch:          Object.values(rewatchCounts).some(r => r.count >= 1),
      printemps:        seasonsSeen.size >= 4,
      automne:          autumnEps >= 50,
      hibernation:      hibernationDone,
      derniere_min:     false, // nécessite dates de sortie saisons TMDB
      noel:             activityLog.some(a => { const d = new Date(a.ts||0); return d.getDate()===25 && d.getMonth()===11; }),
      halloween:        activityLog.some(a => {
        const d = new Date(a.ts||0);
        return a.type === "episode" && d.getMonth() === 9 && d.getDate() === 31;
      }),
      st_valentin:      activityLog.some(a => { const d = new Date(a.ts||0); return d.getDate()===14 && d.getMonth()===1; }),
      summer:           summerEps >= 100,
      nouvel_an:        nouvelAnCondition,
      vendredi_13:      vendredi13Condition,
      marathon_noel:    marathonNoelCondition,

      // Secrets
      oeuf_paques:      Object.values(posterClicks).some(c => c >= 100),
      encore_reveillé:  hours.some(h => h >= 4 && h < 5),
      boucle_inf:       Object.values(rewatchCounts).some(r => r.count >= 3),
      amour_eternel:    false, // nécessite notes par saison
      couch_potato:     count24 >= 20,
      call_911:         call911Condition,
      batman:           batmanCondition,
      indecis:          keepWatchingInProgress.length >= 20,
      i_did_it:         completedSeries.some(s => (s.rating || 0) <= 1 && (s.rating || 0) > 0),
      guilty_pleasure:  watchedSeries.some(s => s.userRating === 5 && (s.rating || 0) > 0 && (s.rating || 0) < 1),
      le_fidele:        leFideleCondition,
      le_puriste:       lePuristeCondition,
      perfectionniste:  perfectionnisteCondition,
      anti_fan:         antiFanCondition,
      retour_baton:     retourBatonCondition,
    };

  const newIds = Object.entries(rules).filter(([,v]) => v).map(([k]) => k);
  return newIds;
}
