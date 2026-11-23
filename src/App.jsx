import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { lazyPage } from "./components/lazyPage.jsx";
import { HexBadge } from "./components/HexBadge.jsx";
import { ContinueWatchingSection, HomeSection, PopularWithFriends } from "./components/HomeSections.jsx";
import { GenreDonut, RatingBars } from "./components/charts.jsx";
import { ConfirmDialog, PosterCard, Spinner } from "./components/ui.jsx";
import { ALL_BADGES } from "./constants/badges.js";
import { profileNavItems } from "./constants/genres.js";
import { ORANGE, ORANGE_BORDER, ORANGE_DIM } from "./constants/theme.js";
import { AVATAR_MAX_CHARS, resizeImageDataUrl } from "./lib/avatar.js";
import { formatRelativeTime, formatTime, initialOf } from "./lib/format.js";
import { fetchFollows, fetchListLikes, listLikeKey } from "./lib/social.js";
import { computeStats } from "./lib/stats.js";
import { computeUnlockedBadgeIds } from "./lib/badgeRules.js";
import { deleteReview, fetchUserReviews, groupReviewsBySeries } from "./lib/reviews.js";
import { deleteMyAccount, downloadJson, exportMyData } from "./lib/account.js";
import { loadSavedData, persistData } from "./lib/storage.js";
import { OPENED_FROM_RECOVERY_LINK, supabase } from "./lib/supabase.js";
import { adaptShow, tmdbViaClaude } from "./lib/tmdb.js";
import { AuthScreen } from "./pages/AuthScreen.jsx";
import { NewPasswordScreen } from "./pages/NewPasswordScreen.jsx";
import { Onboarding } from "./pages/Onboarding.jsx";
import { SearchPage } from "./pages/SearchPage.jsx";
import { SeriesDetailPage } from "./pages/SeriesDetailPage.jsx";
import { scrollTopOnMount } from "./lib/dom.js";

// Écrans secondaires : chargés seulement à leur première ouverture
const BadgesPage = lazyPage(() => import("./pages/BadgesPage.jsx"), "BadgesPage");
const FollowListPage = lazyPage(() => import("./pages/FollowListPage.jsx"), "FollowListPage");
const PublicProfilePage = lazyPage(() => import("./pages/PublicProfilePage.jsx"), "PublicProfilePage");
const ReviewsPage = lazyPage(() => import("./pages/ReviewsPage.jsx"), "ReviewsPage");
const SeeAllPage = lazyPage(() => import("./pages/SeeAllPage.jsx"), "SeeAllPage");
const SettingsPage = lazyPage(() => import("./pages/SettingsPage.jsx"), "SettingsPage");
const PrivacyPage = lazyPage(() => import("./pages/PrivacyPage.jsx"), "PrivacyPage");
const TVShowsPage = lazyPage(() => import("./pages/TVShowsPage.jsx"), "TVShowsPage");
const TagsPage = lazyPage(() => import("./pages/TagsPage.jsx"), "TagsPage");
const UpcomingPage = lazyPage(() => import("./pages/UpcomingPage.jsx"), "UpcomingPage");
const WatchlistPage = lazyPage(() => import("./pages/WatchlistPage.jsx"), "WatchlistPage");

export default function SeriesBoxd() {
  const [onboarded, setOnboarded] = useState(false);
  const [user, setUser] = useState({ name: "Alex", genres: [], platforms: [] });
  const [tab, setTab] = useState("home");
  const mainScrollRef = useRef(null);
  useEffect(() => {
    mainScrollRef.current?.scrollTo({ top: 0, behavior: "instant" });
  }, [tab]);

  const [profileTab, setProfileTab] = useState("TV Shows");
  const [showWatchlistPage, setShowWatchlistPage] = useState(false);
  const [showTVShowsPage, setShowTVShowsPage] = useState(false);
  const [showUpcomingPage, setShowUpcomingPage] = useState(false);
  // { title, endpoint?, inProgressList? }
  const [seeAllPage, setSeeAllPage] = useState(null);
  const [showListsPage, setShowListsPage] = useState(false);
  const [showBadgesPage, setShowBadgesPage] = useState(false);
  const [viewingProfile, setViewingProfile] = useState(null);
  const [showFollowersPage, setShowFollowersPage] = useState(false);
  const [showFollowingPage, setShowFollowingPage] = useState(false);
  const [followingIds, setFollowingIds] = useState([]);
  const [followerCount, setFollowerCount] = useState(0);
  const [friendsActivity, setFriendsActivity] = useState([]);
  const [friendsLibraries, setFriendsLibraries] = useState([]); // [{ id, watched, favShows }] — pour Âme sœur / Jumeaux de séries
  const [friendsActivityLoading, setFriendsActivityLoading] = useState(false);
  const [showReviewsPage, setShowReviewsPage] = useState(false);
  const [showSettingsPage, setShowSettingsPage] = useState(false);
  const [showTagsPage, setShowTagsPage] = useState(false);
  const [tags, setTags] = useState({}); // { tmdbId: ["cozy", "culte", ...] }
  const [unlockedBadgeIds, setUnlockedBadgeIds] = useState(["premiers_pas","bienvenue","fidele","premier_mot","enchante"]);
  const [badgeQueue, setBadgeQueue]             = useState([]); // file d'attente des badges à afficher
  const [newlyUnlocked, setNewlyUnlocked]       = useState(null); // badge actuellement affiché en toast
  const prevUnlockedRef = useRef(null);
  const [confirm, setConfirm] = useState(null);
  const [epPopup, setEpPopup] = useState(null); // { ep, seasonN, tmdbId }
  const [rewatchCounts, setRewatchCounts] = useState({}); // { message, onConfirm }
  const [posterClicks, setPosterClicks] = useState({}); // { tmdbId: nombre de clics cumulés sur ce poster }
  const [watchlistPeak, setWatchlistPeak] = useState(0); // plus grand nombre de séries jamais eues en watchlist en même temps
  const askConfirm = (message, onConfirm, opts = {}) => setConfirm({ message, onConfirm, ...opts });

  const [pinnedBadgeIds, setPinnedBadgeIds] = useState([]);
  const [lists, setLists] = useState([]);
  const [listLikeCounts, setListLikeCounts] = useState({}); // { "ownerId:listId": nombre de likes }
  const [likedListKeys, setLikedListKeys] = useState(new Set()); // clés "ownerId:listId" likées par le compte connecté
  const [showCreateList, setShowCreateList] = useState(false);
  const [viewingList, setViewingList] = useState(null);
  const [library, setLibrary] = useState([]);
  const [detailSeries, setDetailSeries] = useState(null);
  // Mes critiques (table Supabase « reviews »). extraReviews = les mêmes, regroupées par série
  // (format utilisé par les badges, l'écran « Mes critiques » et le compteur du profil).
  const [myReviews, setMyReviews] = useState([]);
  const extraReviews = useMemo(() => groupReviewsBySeries(myReviews), [myReviews]);
  const [watchHistory, setWatchHistory] = useState({});
  const [activityLog, setActivityLog] = useState([]);
  const [diaryTab, setDiaryTab] = useState("mine");
  const [watchedEpisodes, setWatchedEpisodes] = useState({}); // { tmdbId: { "S1E3": true } }
  const [dataLoaded, setDataLoaded] = useState(false);
  // false si Supabase n'a pas pu être lu au chargement → aucune écriture en ligne cette session
  const remoteOkRef = useRef(false);
  const [authUser, setAuthUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  // Écran « nouveau mot de passe » : "recovery" (arrivée par le lien de l'e-mail), "change" (depuis les paramètres) ou null
  const [passwordScreen, setPasswordScreen] = useState(OPENED_FROM_RECOVERY_LINK ? "recovery" : null);
  const [showPrivacy, setShowPrivacy] = useState(false);          // page « Confidentialité »
  const [accountDeleted, setAccountDeleted] = useState(false);    // message après suppression du compte

  // ─── Calcul automatique des badges ───────────────────────────────────────────
  useEffect(() => {
    if (!dataLoaded) return;

    const newIds = computeUnlockedBadgeIds({ watchedEpisodes, extraReviews, library, activityLog, lists, user, followingCount: followingIds.length, followerCount, posterClicks, tags, friendsLibraries, pinnedBadgeIds, rewatchCounts, watchlistPeak, listLikeCounts, authUserId: authUser?.id });

    // Détecter les nouveaux déblocages pour le toast
    // On utilise une ref pour éviter les faux positifs au rechargement
    const prevIds = prevUnlockedRef.current;
    if (prevIds !== null) {
      const justUnlocked = newIds.filter(id => !prevIds.includes(id));
      if (justUnlocked.length > 0) {
        const newBadges = justUnlocked.map(id => ALL_BADGES.find(b => b.id === id)).filter(Boolean);
        if (newBadges.length > 0) setBadgeQueue(prev => [...prev, ...newBadges]);
      }
    }
    prevUnlockedRef.current = newIds;
    setUnlockedBadgeIds(newIds);
  }, [dataLoaded, watchedEpisodes, extraReviews, library, activityLog, lists, user, followingIds.length, followerCount, posterClicks, tags, friendsLibraries, pinnedBadgeIds, rewatchCounts, watchlistPeak, listLikeCounts, authUser?.id]);

  // ── Auth + chargement initial ────────────────────────────────────────────
  const loadAllDataFor = async (uid) => {
    // Ferme toutes les pages/modales ouvertes pour éviter d'afficher
    // l'état visuel de l'ancien compte pendant le chargement du nouveau
    setShowSettingsPage(false);
    setShowWatchlistPage(false);
    setShowTVShowsPage(false);
    setShowUpcomingPage(false);
    setShowListsPage(false);
    setShowBadgesPage(false);
    setShowReviewsPage(false);
    setShowTagsPage(false);
    setShowCreateList(false);
    setViewingList(null);
    setDetailSeries(null);
    setSeeAllPage(null);
    setViewingProfile(null);
    setShowFollowersPage(false);
    setShowFollowingPage(false);
    setEpPopup(null);
    setConfirm(null);
    setTab("home");

    const { data: saved, remoteOk } = await loadSavedData(uid);
    remoteOkRef.current = remoteOk;
    setOnboarded(saved.onboarded || false);
    setUser(saved.user || { name: "Alex", genres: [], platforms: [] });
    // Avatar trop lourd enregistré avant le redimensionnement → on le réduit une fois
    const oldAvatar = saved.user?.avatar;
    if (typeof oldAvatar === "string" && oldAvatar.length > AVATAR_MAX_CHARS) {
      resizeImageDataUrl(oldAvatar)
        .then(small => setUser(prev => prev?.avatar === oldAvatar ? { ...prev, avatar: small } : prev))
        .catch(e => console.warn("Réduction avatar :", e.message));
    }
    setLibrary(saved.library || []);
    setWatchHistory(saved.watchHistory || {});
    setActivityLog(saved.activityLog || []);
    setWatchedEpisodes(saved.watchedEpisodes || {});
    setLists(saved.lists || []);
    setTags(saved.tags || {});
    setUnlockedBadgeIds(saved.unlockedBadgeIds || ["premiers_pas","bienvenue","fidele","premier_mot","enchante"]);
    setPinnedBadgeIds(saved.pinnedBadgeIds || []);
    setRewatchCounts(saved.rewatchCounts || {});
    setPosterClicks(saved.posterClicks || {});
    setWatchlistPeak(saved.watchlistPeak || 0);
    prevUnlockedRef.current = null; // évite un faux toast de badges au changement de compte
    if (uid) {
      try { setMyReviews(await fetchUserReviews(uid)); }
      catch (e) { console.warn("Mes critiques :", e.message); setMyReviews([]); }
    } else {
      setMyReviews([]);
    }
    if (uid) {
      try {
        const { followingIds: fids, followerIds } = await fetchFollows(uid);
        setFollowingIds(fids);
        setFollowerCount(followerIds.length);
      } catch(e) { console.warn("fetchFollows:", e); }
    } else {
      setFollowingIds([]);
      setFollowerCount(0);
      setFriendsActivity([]);
    }
    setDataLoaded(true);
  };

  const currentUidRef = useRef(undefined); // undefined = pas encore initialisé

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id || null;
      currentUidRef.current = uid;
      setAuthUser(session?.user || null);
      setAuthReady(true);
      await loadAllDataFor(uid);
    };
    init();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "PASSWORD_RECOVERY") setPasswordScreen("recovery");
      const newUid = session?.user?.id || null;
      setAuthUser(session?.user || null);
      if (newUid !== currentUidRef.current) {
        currentUidRef.current = newUid;
        setDataLoaded(false);
        await loadAllDataFor(newUid);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const authUserId = authUser?.id;

  // Recharge le nombre de likes (et mes likes) pour les listes d'un utilisateur
  const refreshListLikes = useCallback(async (ownerId, listIds) => {
    if (!ownerId || !listIds || listIds.length === 0) return;
    const { rows } = await fetchListLikes(ownerId, listIds);
    setListLikeCounts(prev => {
      const next = { ...prev };
      listIds.forEach(id => { next[listLikeKey(ownerId, id)] = 0; });
      rows.forEach(r => { const k = listLikeKey(ownerId, r.list_id); next[k] = (next[k] || 0) + 1; });
      return next;
    });
    if (authUserId) {
      setLikedListKeys(prev => {
        const next = new Set(prev);
        listIds.forEach(id => next.delete(listLikeKey(ownerId, id)));
        rows.filter(r => r.user_id === authUserId).forEach(r => next.add(listLikeKey(ownerId, r.list_id)));
        return next;
      });
    }
  }, [authUserId]);

  // ── Rafraîchissement des likes sur mes propres listes (badge Curateur) ──────
  const myListIdsKey = lists.map(l => l.id).join(",");
  useEffect(() => {
    if (!authUserId || !myListIdsKey) return;
    refreshListLikes(authUserId, myListIdsKey.split(","));
  }, [authUserId, myListIdsKey, refreshListLikes]);

  // ── Suivi du pic historique de la watchlist (pour le badge Nettoyeur de watchlist) ──
  useEffect(() => {
    if (!dataLoaded) return;
    const currentWatchlistSize = library.filter(s => s.inWatchlist).length;
    setWatchlistPeak(prev => Math.max(prev, currentWatchlistSize));
  }, [library, dataLoaded]);

  // ── Sauvegarde automatique dans localStorage ───────────────────────────────
  useEffect(() => {
    if (!dataLoaded) return; // Ne pas écraser avec des valeurs vides au 1er render
    persistData({ onboarded, user, library, watchHistory, activityLog, watchedEpisodes, lists, tags, unlockedBadgeIds, pinnedBadgeIds, rewatchCounts, posterClicks, watchlistPeak }, authUserId, remoteOkRef.current);
  }, [onboarded, user, library, watchHistory, activityLog, watchedEpisodes, lists, tags, unlockedBadgeIds, pinnedBadgeIds, rewatchCounts, posterClicks, watchlistPeak, dataLoaded, authUserId]);

  // Clé stable de la liste des abonnements (change seulement si la liste change vraiment)
  const followingKey = followingIds.join(",");
  useEffect(() => {
    const ids = followingKey ? followingKey.split(",") : [];
    if (!authUserId || ids.length === 0) { setFriendsActivity([]); setFriendsLibraries([]); return; }
    let cancelled = false; // passe à true si les abonnements changent avant la réponse
    setFriendsActivityLoading(true);
    (async () => {
      try {
        // Uniquement les parties du profil utiles au fil (pas les épisodes, critiques, etc.)
        const { data: rows } = await supabase.from("profiles")
          .select("id, user:data->user, library:data->library, activityLog:data->activityLog, favShows:data->favShows")
          .in("id", ids);
        if (cancelled) return;
        const profiles = (rows || []).map(r => ({ id: r.id, data: { user: r.user, library: r.library, activityLog: r.activityLog, favShows: r.favShows } }));
        const acts = [];
        const libs = [];
        (profiles || []).forEach(p => {
          const u      = p.data?.user || {};
          const name   = u.name || "Utilisateur";
          const avatar = u.avatar || null;
          const lib    = p.data?.library || [];
          libs.push({ id: p.id, watched: lib.filter(s => s.watched), favShows: u.favShows || p.data?.favShows || [] });
          (p.data?.activityLog || []).slice(0, 15).forEach(a => {
            const series = lib.find(s => s.title && a.label?.includes(s.title)) || null;
            acts.push({ userId: p.id, name, avatar, series, ...a });
          });
        });
        acts.sort((a, b) => new Date(b.ts || 0) - new Date(a.ts || 0));
        setFriendsActivity(acts.slice(0, 30));
        setFriendsLibraries(libs);
      } catch(e) { console.warn("Friends activity:", e); }
      if (!cancelled) setFriendsActivityLoading(false);
    })();
    return () => { cancelled = true; };
  }, [authUserId, followingKey]);

  const addActivity = (type, label, extra = {}) => {
    setActivityLog(prev => [{
      id: Date.now() + Math.random(),
      type,
      label,
      ts: new Date().toISOString(),
      ...extra,
    }, ...prev]);
  };

  const handleRate = (id, rating, seriesData) => {
    setLibrary(prev => {
      const exists = prev.find(s => s.tmdbId === id);
      const base = exists ? prev : [...prev, { ...seriesData, tmdbId: id }];
      const updated = base.map(s => s.tmdbId === id ? { ...s, userRating: rating } : s);
      const series = updated.find(s => s.tmdbId === id);
      if (series) addActivity("rate", `Tu as noté ${series.title} ${"★".repeat(Math.floor(rating))}${rating % 1 ? "½" : ""}`);
      return updated;
    });
  };
  const handleMarkWatched = (id, seriesData, seasonsData) => {
    setLibrary(prev => {
      const exists = prev.find(s => s.tmdbId === id);
      const base = exists ? prev : [...prev, { ...seriesData, tmdbId: id }];
      const isCurrentlyWatched = exists?.watched || false;
      const updated = base.map(s => s.tmdbId === id ? { ...s, watched: !isCurrentlyWatched } : s);
      const series = updated.find(s => s.tmdbId === id);
      if (series?.watched) addActivity("watch", `Tu as vu ${series.title}`);
      return updated;
    });
    setWatchHistory(prev => {
      const isCurrentlyWatched = library.find(s => s.tmdbId === id)?.watched || false;
      if (isCurrentlyWatched) {
        const next = { ...prev };
        delete next[id];
        return next;
      }
      return { ...prev, [id]: new Date().toISOString().slice(0, 10) };
    });
    // Coche automatiquement tous les épisodes si on marque comme vu
    if (seasonsData && seasonsData.length > 0) {
      const isCurrentlyWatched = library.find(s => s.tmdbId === id)?.watched || false;
      if (!isCurrentlyWatched) {
        const allEps = {};
        seasonsData.forEach(season => {
          season.episodes.forEach(ep => {
            allEps[`S${season.n}E${ep.ep}`] = true;
          });
        });
        setWatchedEpisodes(prev => ({ ...prev, [id]: allEps }));
      } else {
        // On dé-marque : vider les épisodes aussi
        setWatchedEpisodes(prev => { const next = { ...prev }; delete next[id]; return next; });
      }
    }
  };
  const handleToggleWatchlist = (id, seriesData) => {
    setLibrary(prev => {
      const exists = prev.find(s => s.tmdbId === id);
      if (exists) {
        const updated = prev.map(s => s.tmdbId === id ? { ...s, inWatchlist: !s.inWatchlist } : s);
        const series = updated.find(s => s.tmdbId === id);
        if (series?.inWatchlist) addActivity("watchlist", `Tu as ajouté ${series.title} à ta Watchlist`);
        else addActivity("watchlist", `Tu as retiré ${series.title} de ta Watchlist`);
        return updated;
      } else if (seriesData) {
        addActivity("watchlist", `Tu as ajouté ${seriesData.title} à ta Watchlist`);
        return [...prev, { ...seriesData, inWatchlist: true }];
      }
      return prev;
    });
  };
  const openSeries = useCallback(s => {
    const existing = library.find(l => l.tmdbId === s.tmdbId);
    setDetailSeries(existing || s);
    setPosterClicks(prev => ({ ...prev, [s.tmdbId]: (prev[s.tmdbId] || 0) + 1 }));
  }, [library]);
  // Recharge mes critiques après une publication / un like (badges, compteur, écran « Mes critiques »)
  const reloadMyReviews = useCallback(async () => {
    if (!authUserId) return;
    try { setMyReviews(await fetchUserReviews(authUserId)); }
    catch (e) { console.warn("Mes critiques :", e.message); }
  }, [authUserId]);
  const handleSeriesMetaLoaded = (tmdbId, meta) => {
    setLibrary(prev => prev.map(s => s.tmdbId === tmdbId ? { ...s, ...meta } : s));
  };

  const handleRewatch = (id, title) => {
    setRewatchCounts(prev => {
      const cur = prev[id] || { count: 0, lastDate: null };
      return { ...prev, [id]: { count: cur.count + 1, lastDate: new Date().toISOString().slice(0, 10) } };
    });
    addActivity("rewatch", "Tu as rewatch " + title);
  };

  const handleDeleteReview = async (_sid, rid) => {
    try {
      await deleteReview(rid);
      setMyReviews(prev => prev.filter(r => r.id !== rid));
    } catch (e) {
      console.warn("Suppression de la critique :", e.message);
    }
  };

  const toggleListLikeRemote = async (ownerId, listId) => {
    if (!authUser?.id) return;
    const key = listLikeKey(ownerId, listId);
    const wasLiked = likedListKeys.has(key);
    // Mise à jour optimiste
    setLikedListKeys(prev => { const n = new Set(prev); wasLiked ? n.delete(key) : n.add(key); return n; });
    setListLikeCounts(prev => ({ ...prev, [key]: Math.max(0, (prev[key] || 0) + (wasLiked ? -1 : 1)) }));
    try {
      if (wasLiked) {
        const { error } = await supabase.from("list_likes").delete().eq("owner_id", ownerId).eq("list_id", String(listId)).eq("user_id", authUser.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("list_likes").insert({ owner_id: ownerId, list_id: String(listId), user_id: authUser.id });
        if (error) throw error;
      }
    } catch (e) {
      console.warn("toggleListLikeRemote:", e.message);
      // Rollback en cas d'échec (ex: policy RLS manquante côté Supabase)
      setLikedListKeys(prev => { const n = new Set(prev); wasLiked ? n.add(key) : n.delete(key); return n; });
      setListLikeCounts(prev => ({ ...prev, [key]: Math.max(0, (prev[key] || 0) + (wasLiked ? 1 : -1)) }));
    }
  };

  const handleAddTag = (tmdbId, tag) => {
    setTags(prev => {
      const existing = prev[tmdbId] || [];
      if (existing.includes(tag)) return prev;
      return { ...prev, [tmdbId]: [...existing, tag] };
    });
  };
  const handleRemoveTag = (tmdbId, tag) => {
    setTags(prev => ({ ...prev, [tmdbId]: (prev[tmdbId] || []).filter(t => t !== tag) }));
  };

  // Défile les badges un par un : quand aucun toast n'est affiché, on prend le suivant de la file
  useEffect(() => {
    if (badgeQueue.length === 0 || newlyUnlocked) return;
    setNewlyUnlocked(badgeQueue[0]);
    setBadgeQueue(prev => prev.slice(1));
  }, [badgeQueue, newlyUnlocked]);

  // Masque le toast affiché au bout de 3 secondes.
  // (Effet séparé : avant, le minuteur était annulé dès le rendu suivant et le toast restait affiché.)
  useEffect(() => {
    if (!newlyUnlocked) return;
    const timer = setTimeout(() => setNewlyUnlocked(null), 3000);
    return () => clearTimeout(timer);
  }, [newlyUnlocked]);

  const watched = library.filter(s => s.watched);
  const NAV_ICONS = {
    home: (a) => (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={a?ORANGE:"#444"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9.5z"/><path d="M9 21V12h6v9"/></svg>),
    diary: (a) => (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={a?ORANGE:"#444"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="16" x2="12" y2="16"/></svg>),
    search: (a) => (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={a?ORANGE:"#444"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/></svg>),
    profile: (a) => (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={a?ORANGE:"#444"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>),
  };
  const tabs = [
    { id: "home",    label: "Accueil" },
    { id: "diary",   label: "Diary" },
    { id: "search",  label: "Chercher" },
    { id: "profile", label: "Profil" },
  ];

  if (!authReady || (authUser && !dataLoaded)) return (
    <div style={{ height:"100vh", background:"#080808", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <Spinner size={32} />
    </div>
  );

  if (authUser && passwordScreen) return (
    <NewPasswordScreen mode={passwordScreen} onDone={() => setPasswordScreen(null)} onCancel={() => setPasswordScreen(null)} />
  );

  if (!authUser) return (
    <div style={{ position: "fixed", inset: 0, zIndex: 99999 }}>
      <AuthScreen onOpenPrivacy={() => setShowPrivacy(true)} notice={accountDeleted ? "Ton compte et toutes tes données ont été supprimés." : ""} />
      {showPrivacy && <PrivacyPage onClose={() => setShowPrivacy(false)} />}
    </div>
  );

  if (!onboarded) return (
    <div style={{ height: "100vh", background: "#080808", display: "flex", justifyContent: "center", fontFamily: "'DM Sans',system-ui,sans-serif" }}>
      <style>{`*{box-sizing:border-box;margin:0;padding:0}::-webkit-scrollbar{display:none}input::placeholder{color:#444}`}</style>
      <Onboarding onComplete={d => { setUser({ ...d, joinDate: new Date().toISOString() }); setOnboarded(true); }} />
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#080808", display: "flex", justifyContent: "center", fontFamily: "'DM Sans',system-ui,sans-serif" }}>
      <style>{`
        @keyframes slideInRight{from{transform:translateX(30px);opacity:0}to{transform:translateX(0);opacity:1}}
        @keyframes slideInUp{from{transform:translateX(-50%) translateY(20px);opacity:0}to{transform:translateX(-50%) translateY(0);opacity:1}}
        @keyframes spin{to{transform:rotate(360deg)}}
        *{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
        ::-webkit-scrollbar{display:none}
        input::placeholder,textarea::placeholder{color:#444}
      `}</style>

      <div style={{ width: "100%", maxWidth: 440, position: "relative", height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {detailSeries && <SeriesDetailPage series={detailSeries} library={library} onClose={() => setDetailSeries(null)} onRate={handleRate} onMarkWatched={handleMarkWatched} onToggleWatchlist={handleToggleWatchlist} watchHistory={watchHistory} onReviewsChanged={reloadMyReviews} onActivity={addActivity} watchedEpisodes={watchedEpisodes[detailSeries?.tmdbId] || {}} rewatchData={rewatchCounts[detailSeries?.tmdbId] || null} onRewatch={(title) => askConfirm('Veux-tu ajouter un rewatch pour ' + title + ' ?', () => handleRewatch(detailSeries.tmdbId, title), { title: 'Rewatch', confirmLabel: 'Confirmer', danger: false })} onAskConfirm={askConfirm} onSeriesMetaLoaded={handleSeriesMetaLoaded} onEpPopup={(ep, seasonN) => setEpPopup({ ep, seasonN, tmdbId: detailSeries?.tmdbId })} friendsData={friendsActivity.filter(f => f.series?.tmdbId === detailSeries?.tmdbId)} currentUserId={authUser?.id} onWatchedEpisodesChange={(eps) => {
          setWatchedEpisodes(prev => ({ ...prev, [detailSeries.tmdbId]: eps }));
          // Auto-ajouter à la library si pas encore présente et qu'on coche un épisode
          const hasAny = Object.values(eps).some(Boolean);
          if (hasAny) {
            setLibrary(prev => {
              if (prev.find(s => s.tmdbId === detailSeries.tmdbId)) return prev;
              return [...prev, { ...detailSeries }];
            });
          }
        }} onOpen={openSeries} />}

        {/* Header — fixed */}
        <div style={{ position: "fixed", top: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 440, zIndex: 40, background: "#080808", padding: "52px 20px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 24, fontWeight: 700, color: "#fff", fontFamily: "'Playfair Display',Georgia,serif", letterSpacing: "-.5px" }}>Series<span style={{ color: ORANGE }}>Boxd</span></div>
            {tab === "home" && <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>Bienvenue, {user.name} 👋</div>}
          </div>
          {tab === "profile" && (
          <div onClick={() => setShowSettingsPage(true)} style={{ width: 38, height: 38, borderRadius: "50%", background: "#111", border: "1px solid #1e1e1e", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#eca6ee" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </div>
        )}  
        </div>

        <div ref={mainScrollRef} style={{ flex: 1, overflowY: "auto", paddingBottom: 90, paddingTop: 96 }}>

          {/* HOME */}
          {tab === "home" && (
            <div style={{ paddingTop: 16 }}>

              <ContinueWatchingSection library={library} watchedEpisodes={watchedEpisodes} onOpen={openSeries} onSeeAll={() => setSeeAllPage({ title: "⏳ En cours de visionnage", inProgressList: library.filter(s => { const eps = watchedEpisodes[s.tmdbId]; return eps && Object.values(eps).some(Boolean) && !s.watched; }) })} />
              <HomeSection title="🔥 Popular this week" endpoint="/trending/tv/week" onOpen={openSeries} onSeeAll={() => setSeeAllPage({ title: "🔥 Popular this week", endpoint: "/trending/tv/week" })} />
              <HomeSection title="⭐ Best rated"  endpoint="/tv/top_rated"     onOpen={openSeries} onSeeAll={() => setSeeAllPage({ title: "⭐ Best rated", endpoint: "/tv/top_rated" })} />
              <HomeSection title="📡 Nouveautés"        endpoint="/tv/on_the_air"    onOpen={openSeries} onSeeAll={() => setSeeAllPage({ title: "📡 Nouveautés", endpoint: "/tv/on_the_air" })} />
              <PopularWithFriends friendsActivity={friendsActivity} followingIds={followingIds} onOpen={openSeries} onSeeAll={() => setSeeAllPage({ title: "👥 Popular with friends", inProgressList: friendsActivity.reduce((acc, a) => { if (a.series && !acc.find(s => s.tmdbId === a.series.tmdbId)) { const { watched, userRating, inWatchlist, ...clean } = a.series; acc.push(clean); } return acc; }, []) })} />
            </div>
          )}

          {/* DIARY */}
          {tab === "diary" && (() => {
            const formatRelative = (iso) => {
              const diff = Date.now() - new Date(iso).getTime();
              const m = Math.floor(diff / 60000);
              if (m < 1) return "À l'instant";
              if (m < 60) return `Il y a ${m} min`;
              const h = Math.floor(m / 60);
              if (h < 24) return `Il y a ${h}h`;
              const d = Math.floor(h / 24);
              if (d < 7) return `Il y a ${d}j`;
              return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
            };
            return (
              <div>
                {/* Onglets Mine / Friends */}
                <div style={{ display: "flex", borderBottom: "1px solid #161616", marginBottom: 0 }}>
                  {["mine", "friends"].map(t => (
                    <button key={t} onClick={() => setDiaryTab(t)} style={{ flex: 1, padding: "14px 0", background: "none", border: "none", borderBottom: diaryTab === t ? `2px solid ${ORANGE}` : "2px solid transparent", color: diaryTab === t ? "#fff" : "#555", fontSize: 14, fontWeight: diaryTab === t ? 700 : 400, cursor: "pointer", letterSpacing: ".02em" }}>
                      {t === "mine" ? "Mine" : "Friends"}
                    </button>
                  ))}
                </div>

                {/* MINE */}
                {diaryTab === "mine" && (
                  <div style={{ padding: "12px 20px 40px" }}>
                    {activityLog.length === 0 ? (
                      <div style={{ textAlign: "center", padding: "60px 0" }}>
                        <div style={{ fontSize: 36, marginBottom: 16 }}>📖</div>
                        <div style={{ color: "#333", fontSize: 14 }}>Ton activité apparaîtra ici</div>
                        <div style={{ color: "#2a2a2a", fontSize: 12, marginTop: 8 }}>Note une série, coche des épisodes...</div>
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {activityLog.map((entry, i) => (
                          <div key={entry.id || i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: "#0e0e0e", borderRadius: 12, border: "1px solid #181818" }}>
                            {/* Avatar */}
                            <div style={{ width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg, #c026d3, #f0abfc)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14, color: "#fff", flexShrink: 0, overflow: "hidden" }}>
                              {user.avatar ? <img src={user.avatar} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span>{(user.name||"?")[0].toUpperCase()}</span>}
                            </div>
                            {/* Contenu */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <span style={{ color: "#fff", fontWeight: 600, fontSize: 13 }}>{user.pseudo || user.name}</span>
                              <span style={{ color: "#666", fontSize: 13 }}> {entry.label}</span>
                            </div>
                            {/* Temps */}
                            <div style={{ fontSize: 11, color: "#444", flexShrink: 0 }}>{formatRelative(entry.ts)}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* FRIENDS */}
                {diaryTab === "friends" && (
                  <div style={{ padding: "12px 20px 40px" }}>
                    {followingIds.length === 0 ? (
                      <div style={{ textAlign: "center", padding: "60px 0" }}>
                        <div style={{ fontSize: 36, marginBottom: 16 }}>👥</div>
                        <div style={{ color: "#333", fontSize: 14 }}>Suis des amis pour voir leur activité</div>
                        <div style={{ color: "#2a2a2a", fontSize: 12, marginTop: 8 }}>Recherche des amis dans l'onglet Chercher</div>
                      </div>
                    ) : friendsActivityLoading ? (
                      <div style={{ display: "flex", justifyContent: "center", padding: 24 }}>
                        <div style={{ width: 22, height: 22, border: "2px solid #1a1a1a", borderTop: `2px solid ${ORANGE}`, borderRadius: "50%", animation: "spin .8s linear infinite" }} />
                      </div>
                    ) : friendsActivity.length === 0 ? (
                      <div style={{ textAlign: "center", padding: "60px 0" }}>
                        <div style={{ color: "#333", fontSize: 14 }}>Aucune activité récente de tes amis</div>
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {friendsActivity.map((f, i) => (
                          <div key={i} onClick={() => setViewingProfile({ userId: f.userId })} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: "#0e0e0e", borderRadius: 12, border: "1px solid #181818", cursor: "pointer" }}>
                            {/* Avatar */}
                            <div style={{ width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg, #c026d3, #f0abfc)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 14, flexShrink: 0, overflow: "hidden" }}>
                              {f.avatar ? <img src={f.avatar} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span>{(f.name||"?")[0].toUpperCase()}</span>}
                            </div>
                            {/* Contenu */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <span style={{ color: "#fff", fontWeight: 600, fontSize: 13 }}>{f.name}</span>
                              <span style={{ color: "#666", fontSize: 13 }}> {(f.label || "").replace(/^Tu as /, "a ").replace(/^Tu /, "")}</span>
                            </div>
                            {/* Temps */}
                            <div style={{ fontSize: 11, color: "#444", flexShrink: 0 }}>{formatRelativeTime(f.ts)}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

                    {/* SEARCH */}
          {tab === "search" && <SearchPage onOpen={openSeries} onViewProfile={uid => setViewingProfile({ userId: uid })} currentUserId={authUser?.id} />}

          {/* PROFILE */}
          {tab === "profile" && (
            <div>
              <div style={{ textAlign: "center", marginBottom: 20, padding: "0 20px" }}>
                {/* Avatar */}
                <div style={{ width: 80, height: 80, borderRadius: "50%", background: "linear-gradient(135deg, #c026d3, #f0abfc)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 30, color: "#fff", margin: "0 auto 14px", overflow: "hidden", border: "3px solid #1a1a1a" }}>
                  {user.avatar
                    ? <img src={user.avatar} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : <span>{initialOf(user.name)}</span>
                  }
                </div>
                {/* Nom complet */}
                <div style={{ fontSize: 22, fontWeight: 700, color: "#fff", fontFamily: "'Playfair Display',Georgia,serif" }}>{user.name}</div>
                {/* Bio */}
                {user.bio && <div style={{ fontSize: 13, color: "#888", marginTop: 8, lineHeight: 1.5, maxWidth: 280, margin: "8px auto 0" }}>{user.bio}</div>}
                {/* Pseudo + membre depuis */}
                <div style={{ fontSize: 12, color: "#555", marginTop: 8 }}>
                  @{user.pseudo || user.name}
                  {user.location && <span style={{ color: "#444" }}> · 📍 {user.location}</span>}
                  {user.joinDate && <span style={{ color: "#444" }}> · membre depuis {new Date(user.joinDate).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}</span>}
                </div>
                {/* Website */}
                {user.website && <div style={{ marginTop: 6 }}><a href={user.website} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: ORANGE, textDecoration: "none" }}>{user.website.replace(/^https?:\/\//, "")}</a></div>}
              </div>

              {/* Genres favoris encart — au-dessus des stats */}
              {(user.favGenres || user.genres || []).length > 0 && (
                <div style={{ margin: "0 20px 16px", padding: "14px 16px", background: "#1a1a1a", border: "1px solid rgba(219, 157, 228, 0.94)", borderRadius: 14 }}>
                  <div style={{ fontSize: 10, color: "#fff", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 10 }}>✦ Genres favoris</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                    {(user.favGenres || user.genres || []).map(g => (
                      <span key={g} style={{ background: "#2a2a2a", border: `1px solid ${ORANGE_BORDER}`, color: "#fff", fontSize: 12, padding: "5px 12px", borderRadius: 20, fontWeight: 500 }}>{g}</span>
                    ))}
                  </div>
                </div>
              )}

              {(() => {
                const stats = computeStats(watched, watchedEpisodes);
                return (
                  <>
                    {/* Stats */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 8, padding: "0 20px" }}>
                      {[
                        { n: watched.length, label: "Vues" },
                        { n: Object.values(watchedEpisodes).reduce((acc, eps) => acc + Object.values(eps).filter(Boolean).length, 0), label: "Épisodes" },
                        { n: formatTime(stats.totalMins), label: "Temps" },
                        { n: "12", label: "Abonnés" },
                      ].map((stat, i) => (
                        <div key={i} style={{ background: "#0e0e0e", borderRadius: 12, padding: "10px 6px", textAlign: "center", border: "1px solid #181818" }}>
                          <div style={{ fontSize: 9, color: "#555", marginBottom: 4, textTransform: "uppercase", letterSpacing: ".04em" }}>{stat.label}</div>
                          <div style={{ fontSize: 18, fontWeight: 700, color: ORANGE, fontFamily: "'Playfair Display',Georgia,serif", lineHeight: 1 }}>{stat.n}</div>
                        </div>
                      ))}
                    </div>
                    {/* Badges épinglés */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 24, padding: "0 20px" }}>
                      {[0,1,2,3].map(i => {
                        const bid = pinnedBadgeIds[i];
                        const badge = bid ? ALL_BADGES.find(b => b.id === bid) : null;
                        return (
                          <div key={i} onClick={() => setShowBadgesPage(true)} style={{ background: "#0e0e0e", borderRadius: 12, padding: "10px 6px", border: badge ? `1px solid ${badge.color}33` : "1px dashed #1e1e1e", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, cursor: "pointer" }}>
                            {badge
                              ? <><HexBadge badge={badge} unlocked size={38} /><div style={{ fontSize: 8, color: badge.color, textAlign: "center", lineHeight: 1.2, fontWeight: 600 }}>{badge.name}</div></>
                              : <><span style={{ fontSize: 16, opacity: 0.12 }}>⬡</span><div style={{ fontSize: 8, color: "#2a2a2a", textTransform: "uppercase", letterSpacing: ".04em" }}>Vide</div></>
                            }
                          </div>
                        );
                      })}
                    </div>
                  </>
                );
              })()}

              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", marginBottom: 12, padding: "0 20px" }}>Favorite TV Shows</div>
                {(() => {
                  const favs = (user.favShows && user.favShows.length > 0) ? user.favShows : watched.slice(0,4);
                  return favs.length === 0
                    ? <div style={{ padding: "0 20px", color: "#333", fontSize: 13 }}>Marque des séries comme vues pour les afficher ici</div>
                    : <div style={{ display: "flex", gap: 10, padding: "0 20px" }}>{favs.map(s => <div key={s.tmdbId} style={{ flex: 1 }}><PosterCard series={s} onOpen={openSeries} /></div>)}</div>;
                })()}
              </div>

              <div style={{ marginBottom: 24 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "0 20px", marginBottom: 12 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>Activités récentes</div>
                  {(() => {
                    const activityMap = {};
                    activityLog.filter(a => ["watch","rate","review"].includes(a.type)).forEach(a => {
                      const series = library.find(s => a.label?.includes(s.title));
                      if (!series) return;
                      const key = series.tmdbId;
                      if (!activityMap[key]) activityMap[key] = { series, watched: false, rated: false, reviewed: false, ts: a.ts };
                      if (a.type === "watch")  activityMap[key].watched  = true;
                      if (a.type === "rate")   activityMap[key].rated    = true;
                      if (a.type === "review") activityMap[key].reviewed = true;
                      if (a.ts > activityMap[key].ts) activityMap[key].ts = a.ts;
                    });
                    const allItems = Object.values(activityMap).sort((a, b) => (b.ts || "").localeCompare(a.ts || ""));
                    if (allItems.length <= 4) return null;
                    return (
                      <div onClick={() => setSeeAllPage({ title: "Activités récentes", inProgressList: allItems.map(i => ({ ...i.series, _hasReview: i.reviewed, _hideRating: true })) })} style={{ fontSize: 12, color: ORANGE, cursor: "pointer" }}>Tout voir</div>
                    );
                  })()}
                </div>
                {(() => {
                  const activityMap = {};
                  activityLog.filter(a => ["watch","rate","review"].includes(a.type)).forEach(a => {
                    const series = library.find(s => a.label?.includes(s.title));
                    if (!series) return;
                    const key = series.tmdbId;
                    if (!activityMap[key]) activityMap[key] = { series, watched: false, rated: false, reviewed: false, ts: a.ts };
                    if (a.type === "watch")  activityMap[key].watched  = true;
                    if (a.type === "rate")   activityMap[key].rated    = true;
                    if (a.type === "review") activityMap[key].reviewed = true;
                    if (a.ts > activityMap[key].ts) activityMap[key].ts = a.ts;
                  });
                  const recentItems = Object.values(activityMap).sort((a, b) => (b.ts || "").localeCompare(a.ts || "")).slice(0, 4);

                  if (recentItems.length === 0) {
                    return <div style={{ padding: "0 20px", color: "#333", fontSize: 13 }}>Aucune activité pour l'instant</div>;
                  }

                  return (
                    <div style={{ display: "flex", gap: 12, padding: "0 20px", overflowX: "auto", WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}>
                      {recentItems.map(({ series: s, rated, reviewed }) => (
                        <div key={s.tmdbId} style={{ width: 90, flexShrink: 0 }}>
                          <div onClick={() => openSeries(s)} style={{ width: 90, height: 135, borderRadius: 10, overflow: "hidden", background: "#1a1a1a", cursor: "pointer" }}>
                            {s.poster && <img src={s.poster} style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                          </div>
                          {(rated || reviewed) && (
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5, marginTop: 5 }}>
                              {rated && s.userRating && (
                                <span style={{ color: ORANGE, fontSize: 11, letterSpacing: 1 }}>
                                  {"★".repeat(Math.floor(s.userRating))}{s.userRating % 1 ? "½" : ""}
                                </span>
                              )}
                              {reviewed && <span style={{ fontSize: 11 }}>💬</span>}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>

              {(() => {
                const stats = computeStats(watched, watchedEpisodes);
                return (
                  <>
                    <div style={{ marginBottom: 24, padding: "0 20px" }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", marginBottom: 4 }}>Genres regardés</div>
                      <div style={{ fontSize: 11, color: "#555", marginBottom: 16 }}>Répartition de tes séries vues</div>
                      <div style={{ background: "#0c0c0c", borderRadius: 16, padding: "18px 16px", border: "1px solid #181818" }}>
                        {stats.genreData.length > 0 ? <GenreDonut genreData={stats.genreData} /> : <div style={{ color: "#333", fontSize: 13, textAlign: "center", padding: "16px 0" }}>Aucune série vue pour l'instant</div>}
                      </div>
                    </div>
                    <div style={{ marginBottom: 24, padding: "0 20px" }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", marginBottom: 4 }}>Distribution des notes</div>
                      <div style={{ fontSize: 11, color: "#555", marginBottom: 16 }}>Comment tu notes tes séries</div>
                      <div style={{ background: "#0c0c0c", borderRadius: 16, padding: "18px 16px", border: "1px solid #181818" }}>
                        <RatingBars ratingDist={stats.ratingDist} avgRating={stats.avgRating} />
                      </div>
                    </div>
                  </>
                );
              })()}

              <div style={{ borderTop: "1px solid #161616", marginBottom: 4 }}>
                {profileNavItems.map(item => {
                  const isActive = profileTab === item;

                  // Compteur par onglet
                  const countMap = {
                    "TV Shows":     watched.length,
                    "Watchlist":    library.filter(s => s.inWatchlist).length,
                    "Badges":       unlockedBadgeIds.length,
                    "Reviews":      Object.values(extraReviews).flat().length,
                    "Lists":        lists.length,
                    "Tags":         [...new Set(Object.values(tags).flat())].length,
                    "Abonnements":  followingIds.length,
                    "Abonnés":      followerCount,
                  };
                  const count = countMap[item] ?? 0;

                  return (
                    <button key={item} onClick={() => {
                      if (item === "Watchlist") { setShowWatchlistPage(true); return; }
                      if (item === "TV Shows")  { setShowTVShowsPage(true);  return; }
                      if (item === "À venir")   { setShowUpcomingPage(true); return; }
                      if (item === "Lists")    { setShowListsPage(true);    return; }
                      if (item === "Badges")   { setShowBadgesPage(true);  return; }
                      if (item === "Reviews")  { setShowReviewsPage(true); return; }
                      if (item === "Tags")        { setShowTagsPage(true);      return; }
                      if (item === "Abonnés")    { setShowFollowersPage(true); return; }
                      if (item === "Abonnements") { setShowFollowingPage(true); return; }
                      setProfileTab(item);
                    }} style={{
                      display: "flex", alignItems: "center", width: "100%",
                      padding: "14px 20px", background: "none", border: "none",
                      borderBottom: "1px solid #111",
                      borderLeft: `3px solid ${isActive ? ORANGE : "transparent"}`,
                      cursor: "pointer", transition: "border-color .15s",
                    }}>
                      <span style={{ fontSize: 13, fontWeight: isActive ? 600 : 400, color: isActive ? "#fff" : "#555", flex: 1, textAlign: "left" }}>{item}</span>
                      {count > 0 && <span style={{ fontSize: 13, fontWeight: isActive ? 600 : 400, color: isActive ? "#fff" : "#555", marginRight: 10 }}>{count}</span>}
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={isActive ? ORANGE : "#2a2a2a"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                    </button>
                  );
                })}
              </div>

            </div>
          )}
        </div>

        {/* TV Shows Page */}
        {/* Toast badge débloqué */}
        {newlyUnlocked && (
          <div onClick={() => setNewlyUnlocked(null)} style={{ position: "fixed", bottom: 100, left: "50%", transform: "translateX(-50%)", zIndex: 9999, background: "#111", border: `1px solid ${newlyUnlocked.color}66`, borderRadius: 16, padding: "14px 20px", display: "flex", alignItems: "center", gap: 12, boxShadow: `0 8px 32px rgba(0,0,0,.8), 0 0 20px ${newlyUnlocked.color}33`, maxWidth: 320, cursor: "pointer", animation: "slideInUp .3s ease", width: "calc(100% - 40px)" }}>
            <HexBadge badge={newlyUnlocked} unlocked size={44} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, color: newlyUnlocked.color, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em" }}>Badge débloqué 🎉</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginTop: 2 }}>{newlyUnlocked.name}</div>
              <div style={{ fontSize: 11, color: "#555", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{newlyUnlocked.desc}</div>
            </div>
            {badgeQueue.length > 0 && (
              <div style={{ background: newlyUnlocked.color + "33", border: `1px solid ${newlyUnlocked.color}66`, borderRadius: 12, padding: "3px 8px", fontSize: 11, color: newlyUnlocked.color, fontWeight: 700, flexShrink: 0 }}>+{badgeQueue.length}</div>
            )}
          </div>
        )}
        {showSettingsPage && <SettingsPage user={user} onSave={u => { setUser(u); }} onClose={() => setShowSettingsPage(false)} watched={watched} library={library} authEmail={authUser?.email} onChangePassword={() => { setShowSettingsPage(false); setPasswordScreen("change"); }} onLogout={async () => { await supabase.auth.signOut(); }}
          onExportData={async () => downloadJson(`seriesboxd-mes-donnees-${new Date().toISOString().slice(0, 10)}.json`, await exportMyData(authUserId))}
          onDeleteAccount={async () => { await deleteMyAccount(authUserId); setAccountDeleted(true); setShowSettingsPage(false); }}
          onOpenPrivacy={() => setShowPrivacy(true)} />}
        {showPrivacy && <PrivacyPage onClose={() => setShowPrivacy(false)} />}
        {seeAllPage && <SeeAllPage title={seeAllPage.title} endpoint={seeAllPage.endpoint} inProgressList={seeAllPage.inProgressList} onOpen={(s) => openSeries(s)} onClose={() => setSeeAllPage(null)} />}
        {showUpcomingPage && <UpcomingPage library={library} watchedEpisodes={watchedEpisodes} />}
        {showTVShowsPage && <TVShowsPage watched={watched} watchHistory={watchHistory} openSeries={openSeries} rewatchCounts={rewatchCounts} />}

        {/* Watchlist Page */}
        {showWatchlistPage && <WatchlistPage library={library} openSeries={openSeries} />}


        {/* ── LISTS PAGE ──────────────────────────────────────────────── */}
        {showListsPage && !showCreateList && !viewingList && (
          <div ref={scrollTopOnMount} style={{ position: "fixed", inset: 0, background: "#080808", zIndex: 900, overflowY: "auto", paddingBottom: 90, maxWidth: 440, margin: "0 auto" }}>
            {/* Header */}
            <div style={{ padding: "52px 20px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#fff", fontFamily: "'Playfair Display',Georgia,serif" }}>Lists</div>
                <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>{lists.length} liste{lists.length !== 1 ? "s" : ""}</div>
              </div>
              <button onClick={() => setShowCreateList(true)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={ORANGE} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              </button>
            </div>

            {lists.length === 0 ? (
              <div />
            ) : (
              <div style={{ padding: "0 20px" }}>
                {lists.map(list => (
                  <div key={list.id} onClick={() => setViewingList(list)} style={{ padding: "16px 0", borderBottom: "1px solid #111", cursor: "pointer" }}>
                    <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                      {/* Mini poster collage */}
                      <div style={{ width: 72, height: 72, borderRadius: 12, overflow: "hidden", background: "#111", flexShrink: 0, display: "grid", gridTemplateColumns: list.items.length >= 2 ? "1fr 1fr" : "1fr", gridTemplateRows: list.items.length >= 3 ? "1fr 1fr" : "1fr", gap: 1 }}>
                        {list.items.length === 0
                          ? <div style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "#2a2a2a", fontSize: 22 }}>☰</div>
                          : list.items.slice(0, 4).map((s, i) => (
                            <div key={i} style={{ overflow: "hidden", background: "#1a1a1a" }}>
                              {s.poster ? <img src={s.poster} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <div style={{ width: "100%", height: "100%", background: "#1a1a1a" }} />}
                            </div>
                          ))
                        }
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ color: "#fff", fontWeight: 600, fontSize: 15, fontFamily: "'Playfair Display',Georgia,serif", lineHeight: 1.3 }}>{list.name}</div>
                        {list.description ? <div style={{ color: "#555", fontSize: 12, marginTop: 4, lineHeight: 1.4 }}>{list.description}</div> : null}
                        <div style={{ color: "#444", fontSize: 11, marginTop: 6 }}>{list.items.length} série{list.items.length !== 1 ? "s" : ""} · {new Date(list.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}{(listLikeCounts[`${authUser?.id}:${list.id}`] || 0) > 0 && <span style={{ color: likedListKeys.has(`${authUser?.id}:${list.id}`) ? ORANGE : "#444" }}> · {likedListKeys.has(`${authUser?.id}:${list.id}`) ? "♥" : "♡"} {listLikeCounts[`${authUser?.id}:${list.id}`] || 0}</span>}</div>
                      </div>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: 4, flexShrink: 0 }}><polyline points="9 18 15 12 9 6"/></svg>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── CREATE LIST PAGE ─────────────────────────────────────────── */}
        {showListsPage && showCreateList && (() => {
          const CreateListView = () => {
            const [listName, setListName] = useState("");
            const [listDesc, setListDesc] = useState("");
            const [searchQ, setSearchQ] = useState("");
            const [searchResults, setSearchResults] = useState([]);
            const [searching, setSearching] = useState(false);
            const [selectedItems, setSelectedItems] = useState([]);
            const debounceRef = useRef(null);

            useEffect(() => {
              clearTimeout(debounceRef.current);
              if (!searchQ.trim()) { setSearchResults([]); return; }
              setSearching(true);
              debounceRef.current = setTimeout(async () => {
                try {
                  const data = await tmdbViaClaude("/search/tv", { query: searchQ, language: "fr-FR" });
                  setSearchResults((data.results || []).slice(0, 8).map(adaptShow));
                } catch { setSearchResults([]); }
                setSearching(false);
              }, 450);
            }, [searchQ]);

            const toggleItem = (s) => {
              setSelectedItems(prev =>
                prev.find(i => i.tmdbId === s.tmdbId)
                  ? prev.filter(i => i.tmdbId !== s.tmdbId)
                  : [...prev, s]
              );
            };

            const handleSave = () => {
              if (!listName.trim()) return;
              const newList = {
                id: Date.now(),
                name: listName.trim(),
                description: listDesc.trim(),
                items: selectedItems,
                createdAt: new Date().toISOString(),
              };
              setLists(prev => [newList, ...prev]);
              addActivity("list", `Tu as créé la liste "${newList.name}"`);
              setShowCreateList(false);
            };

            const canSave = listName.trim().length > 0;

            return (
              <div ref={scrollTopOnMount} style={{ position: "fixed", inset: 0, background: "#080808", zIndex: 910, overflowY: "auto", paddingBottom: 100, maxWidth: 440, margin: "0 auto" }}>
                {/* Header */}
                <div style={{ padding: "52px 20px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: "#fff", fontFamily: "'Playfair Display',Georgia,serif" }}>Nouvelle liste</div>
                  <button onClick={handleSave} disabled={!canSave} style={{ padding: "8px 18px", background: canSave ? ORANGE_DIM : "#111", border: `1px solid ${canSave ? ORANGE_BORDER : "#222"}`, borderRadius: 20, color: canSave ? ORANGE : "#444", fontSize: 13, fontWeight: 600, cursor: canSave ? "pointer" : "default", transition: "all .2s" }}>
                    Enregistrer
                  </button>
                </div>

                <div style={{ padding: "0 20px" }}>
                  {/* List name */}
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 8 }}>List name</div>
                    <input
                      value={listName}
                      onChange={e => setListName(e.target.value)}
                      placeholder="Ex. Séries à regarder cet hiver…"
                      style={{ width: "100%", padding: "14px 16px", background: "#0e0e0e", border: `1px solid ${listName.trim() ? ORANGE_BORDER : "#1e1e1e"}`, borderRadius: 14, color: "#fff", fontSize: 15, outline: "none", fontFamily: "'DM Sans',system-ui,sans-serif", transition: "border-color .2s" }}
                    />
                  </div>

                  {/* Description */}
                  <div style={{ marginBottom: 28 }}>
                    <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 8 }}>Add description</div>
                    <textarea
                      value={listDesc}
                      onChange={e => setListDesc(e.target.value)}
                      placeholder="Décris ta liste en quelques mots…"
                      rows={3}
                      style={{ width: "100%", padding: "14px 16px", background: "#0e0e0e", border: "1px solid #1e1e1e", borderRadius: 14, color: "#fff", fontSize: 14, outline: "none", resize: "none", fontFamily: "'DM Sans',system-ui,sans-serif", lineHeight: 1.5 }}
                    />
                  </div>

                  {/* Selected items preview */}
                  {selectedItems.length > 0 && (
                    <div style={{ marginBottom: 24 }}>
                      <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 10 }}>{selectedItems.length} série{selectedItems.length > 1 ? "s" : ""} ajoutée{selectedItems.length > 1 ? "s" : ""}</div>
                      <div style={{ display: "flex", gap: 10, overflowX: "auto" }}>
                        {selectedItems.map(s => (
                          <div key={s.tmdbId} style={{ flexShrink: 0, position: "relative", width: 64 }}>
                            <div style={{ width: 64, height: 96, borderRadius: 10, overflow: "hidden", background: "#1a1a1a" }}>
                              {s.poster ? <img src={s.poster} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <div style={{ width: "100%", height: "100%", background: "#1a1a1a" }} />}
                            </div>
                            <button onClick={() => toggleItem(s)} style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: "50%", background: "#c026d3", border: "none", color: "#fff", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>×</button>
                            <div style={{ fontSize: 9, color: "#888", marginTop: 4, textAlign: "center", lineHeight: 1.2, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{s.title}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Search */}
                  <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 10 }}>Ajouter des séries</div>
                  <div style={{ position: "relative", marginBottom: 16 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)" }}><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/></svg>
                    <input
                      value={searchQ}
                      onChange={e => setSearchQ(e.target.value)}
                      placeholder="Chercher une série à ajouter…"
                      style={{ width: "100%", padding: "12px 14px 12px 40px", background: "#0e0e0e", border: "1px solid #1e1e1e", borderRadius: 12, color: "#fff", fontSize: 14, outline: "none", fontFamily: "'DM Sans',system-ui,sans-serif" }}
                    />
                  </div>

                  {/* Search results */}
                  {searching && (
                    <div style={{ display: "flex", justifyContent: "center", padding: "16px 0" }}>
                      <div style={{ width: 22, height: 22, border: "2px solid #1a1a1a", borderTop: `2px solid ${ORANGE}`, borderRadius: "50%", animation: "spin .8s linear infinite" }} />
                    </div>
                  )}
                  {!searching && searchResults.map(s => {
                    const added = !!selectedItems.find(i => i.tmdbId === s.tmdbId);
                    return (
                      <div key={s.tmdbId} onClick={() => toggleItem(s)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid #0e0e0e", cursor: "pointer" }}>
                        <div style={{ width: 44, height: 66, borderRadius: 8, overflow: "hidden", background: "#1a1a1a", flexShrink: 0 }}>
                          {s.poster && <img src={s.poster} style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ color: "#fff", fontWeight: 600, fontSize: 14, fontFamily: "'Playfair Display',Georgia,serif" }}>{s.title}</div>
                          <div style={{ color: "#555", fontSize: 12, marginTop: 2 }}>{s.year} · {s.genre}</div>
                        </div>
                        <div style={{ width: 26, height: 26, borderRadius: "50%", background: added ? ORANGE_DIM : "#111", border: `1.5px solid ${added ? ORANGE_BORDER : "#2a2a2a"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all .2s" }}>
                          {added
                            ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={ORANGE} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                            : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                          }
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          };
          return <CreateListView />;
        })()}

        {/* ── VIEW LIST PAGE ───────────────────────────────────────────── */}
        {showListsPage && viewingList && !showCreateList && (() => {
          const list = lists.find(l => l.id === viewingList.id) || viewingList;
          return (
            <div ref={scrollTopOnMount} style={{ position: "fixed", inset: 0, background: "#080808", zIndex: 910, overflowY: "auto", paddingBottom: 90, maxWidth: 440, margin: "0 auto" }}>
              <div style={{ padding: "52px 20px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: "#fff", fontFamily: "'Playfair Display',Georgia,serif" }}>{list.name}</div>
                  <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>{list.items.length} série{list.items.length !== 1 ? "s" : ""}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <button onClick={() => toggleListLikeRemote(authUser?.id, list.id)} style={{ display: "flex", alignItems: "center", gap: 5, background: likedListKeys.has(`${authUser?.id}:${list.id}`) ? ORANGE_DIM : "transparent", border: `1px solid ${likedListKeys.has(`${authUser?.id}:${list.id}`) ? ORANGE_BORDER : "#252525"}`, borderRadius: 20, padding: "6px 12px", cursor: "pointer", color: likedListKeys.has(`${authUser?.id}:${list.id}`) ? ORANGE : "#555", fontSize: 12, flexShrink: 0 }}>
                    <span>{likedListKeys.has(`${authUser?.id}:${list.id}`) ? "♥" : "♡"}</span><span>{listLikeCounts[`${authUser?.id}:${list.id}`] || 0}</span>
                  </button>
                  <button onClick={() => askConfirm(`Supprimer la liste "${list.name}" ?`, () => { setLists(prev => prev.filter(l => l.id !== list.id)); setViewingList(null); })} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                  </button>
                </div>
              </div>
              {list.description ? (
                <div style={{ padding: "0 20px 20px", color: "#666", fontSize: 13, lineHeight: 1.6, borderBottom: "1px solid #111" }}>{list.description}</div>
              ) : null}
              {list.items.length === 0 ? (
                <div style={{ textAlign: "center", padding: "60px 20px", color: "#333", fontSize: 14 }}>Cette liste est vide</div>
              ) : (
                <div style={{ padding: "0 20px" }}>
                  {list.items.map((s, idx) => (
                    <div key={s.tmdbId} onClick={() => { openSeries(s); }} style={{ display: "flex", gap: 14, padding: "14px 0", borderBottom: "1px solid #111", cursor: "pointer", alignItems: "flex-start" }}>
                      <div style={{ width: 12, color: "#333", fontSize: 13, fontWeight: 600, paddingTop: 4, flexShrink: 0, textAlign: "right" }}>{idx + 1}</div>
                      <div style={{ width: 52, height: 78, borderRadius: 8, overflow: "hidden", background: "#1a1a1a", flexShrink: 0 }}>
                        {s.poster && <img src={s.poster} style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ color: "#fff", fontWeight: 600, fontSize: 14, fontFamily: "'Playfair Display',Georgia,serif", lineHeight: 1.3 }}>{s.title}</div>
                        <div style={{ color: "#555", fontSize: 12, marginTop: 4 }}>{s.year} · {s.genre}</div>
                        <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 6 }}>
                          <span style={{ color: ORANGE, fontSize: 11 }}>★</span>
                          <span style={{ color: "#888", fontSize: 12 }}>{s.rating}</span>
                          <span style={{ background: s.status === "En cours" ? ORANGE_DIM : "rgba(100,200,100,.1)", color: s.status === "En cours" ? ORANGE : "#6dc86d", padding: "2px 7px", borderRadius: 20, fontSize: 10 }}>{s.status}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

        {/* Reviews Page */}
        {showReviewsPage && (
          <ReviewsPage extraReviews={extraReviews} library={library} openSeries={(s) => { setShowReviewsPage(false); openSeries(s); }} onDeleteReview={handleDeleteReview} onAskConfirm={askConfirm} />
        )}

        {/* Tags Page */}
        {showTagsPage && (
          <TagsPage library={library} tags={tags} onAddTag={handleAddTag} onRemoveTag={handleRemoveTag} onAskConfirm={askConfirm} openSeries={(s) => { setShowTagsPage(false); openSeries(s); }} />
        )}

        {/* Episode Popup */}
        {epPopup && (() => {
          const { ep, seasonN, tmdbId } = epPopup;
          const eps = watchedEpisodes[tmdbId] || {};
          const key = `S${seasonN}E${ep.ep}`;
          const isWatched = !!eps[key];
          const airDate = ep.air_date ? new Date(ep.air_date).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : null;
          const handleToggle = () => {
            const newEps = { ...eps, [key]: !isWatched };
            if (!newEps[key]) delete newEps[key];
            setWatchedEpisodes(prev => ({ ...prev, [tmdbId]: newEps }));
            setEpPopup(null);
          };
          return (
            <div onClick={() => setEpPopup(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", backdropFilter: "blur(8px)", zIndex: 9998, display: "flex", alignItems: "flex-end", justifyContent: "center", maxWidth: 440, margin: "0 auto" }}>
              <div onClick={e => e.stopPropagation()} style={{ background: "#0f0f0f", borderRadius: "20px 20px 0 0", width: "100%", border: "1px solid #1e1e1e", borderBottom: "none", maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
                {ep.still && <img src={ep.still} style={{ width: "100%", aspectRatio: "16/9", objectFit: "cover", borderRadius: "20px 20px 0 0", flexShrink: 0 }} />}
                <div style={{ overflowY: "auto", flex: 1, padding: "20px 20px 0" }}>
                  <div style={{ width: 36, height: 3, background: "#2a2a2a", borderRadius: 2, margin: "0 auto 20px" }} />
                  <div style={{ fontSize: 17, fontWeight: 700, color: "#fff", fontFamily: "'Playfair Display',Georgia,serif", lineHeight: 1.3, marginBottom: 4 }}>{ep.title}</div>
                  <div style={{ fontSize: 12, color: "#555", marginBottom: airDate ? 8 : 12 }}>S{seasonN}E{ep.ep}{ep.duration ? ` · ${ep.duration}` : ""}</div>
                  {airDate && <div style={{ fontSize: 12, color: "#555", marginBottom: 12 }}>📅 {airDate}</div>}
                  {ep.overview && <div style={{ fontSize: 13, color: "#999", lineHeight: 1.7, marginBottom: 16 }}>{ep.overview}</div>}
                  {ep.guest_stars?.length > 0 && (
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>Guest stars</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {ep.guest_stars.slice(0, 8).map((g, i) => (
                          <span key={i} style={{ background: "#141414", border: "1px solid #222", color: "#777", fontSize: 11, padding: "4px 10px", borderRadius: 20 }}>{g.name}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div style={{ padding: "12px 20px 44px", flexShrink: 0 }}>
                  <button onClick={handleToggle} style={{ display: "block", margin: "0 auto", padding: "9px 24px", borderRadius: 20, background: "none", border: `1px solid ${isWatched ? "#2a2a2a" : ORANGE_BORDER}`, color: isWatched ? "#444" : ORANGE, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                    {isWatched ? "✓ Vu" : "Marquer comme vu"}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Confirm Dialog */}
        {confirm && (
          <ConfirmDialog
            title={confirm.title}
            message={confirm.message}
            confirmLabel={confirm.confirmLabel}
            danger={confirm.danger !== false}
            onConfirm={confirm.onConfirm}
            onCancel={() => setConfirm(null)}
          />
        )}

        {/* Public Profile */}
        {viewingProfile && (
          <PublicProfilePage userId={viewingProfile.userId} currentUserId={authUser?.id} onOpen={openSeries} onClose={() => setViewingProfile(null)} myLibrary={library} myWatchedEpisodes={watchedEpisodes} listLikeCounts={listLikeCounts} likedListKeys={likedListKeys} onToggleListLike={toggleListLikeRemote} onRefreshListLikes={refreshListLikes} />
        )}
        {/* Followers Page */}
        {showFollowersPage && (
          <FollowListPage title="Abonnés" userId={authUser?.id} type="followers" currentUserId={authUser?.id} onViewProfile={uid => { setShowFollowersPage(false); setViewingProfile({ userId: uid }); }} />
        )}
        {/* Following Page */}
        {showFollowingPage && (
          <FollowListPage title="Abonnements" userId={authUser?.id} type="following" currentUserId={authUser?.id} onViewProfile={uid => { setShowFollowingPage(false); setViewingProfile({ userId: uid }); }} />
        )}

        {/* Badges Page */}
        {showBadgesPage && (
          <BadgesPage
            unlockedBadgeIds={unlockedBadgeIds}
            pinnedBadgeIds={pinnedBadgeIds}
            onPin={id => setPinnedBadgeIds(p => [...p, id])}
            onUnpin={id => setPinnedBadgeIds(p => p.filter(x => x !== id))}
          />
        )}

        {/* Bottom Nav */}
        <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 440, background: "rgba(8,8,8,.96)", backdropFilter: "blur(20px)", borderTop: "1px solid #1a1a1a", display: "flex", padding: "8px 0 24px", zIndex: 1000 }}>
          {tabs.map(t => { const active = tab===t.id; return (
            <button key={t.id} onClick={() => { setTab(t.id); setShowWatchlistPage(false); setShowTVShowsPage(false); setShowUpcomingPage(false); setShowListsPage(false); setShowBadgesPage(false); setShowReviewsPage(false); setShowTagsPage(false); setShowCreateList(false); setViewingList(null); setDetailSeries(null); setSeeAllPage(null); setShowSettingsPage(false); setViewingProfile(null); setShowFollowersPage(false); setShowFollowingPage(false); }} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, background: "none", border: "none", cursor: "pointer", padding: "6px 0" }}>
              {NAV_ICONS[t.id]?.(active)}
              <span style={{ fontSize: 9, color: active?ORANGE:"#444", fontWeight: active?600:400, letterSpacing: ".04em", textTransform: "uppercase" }}>{t.label}</span>
            </button>
          );})}
        </div>
      </div>
    </div>
  );
}
