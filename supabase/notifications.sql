-- ════════════════════════════════════════════════════════════════════════════
-- Notifications dans l'app
-- Les notifications sont créées par la BASE (déclencheurs), jamais par l'app :
-- personne ne peut fabriquer une notification pour quelqu'un d'autre.
-- Chacun ne peut lire / marquer comme lues / supprimer que les siennes.
-- Relançable sans risque.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,   -- destinataire
  actor_id    uuid not null references auth.users(id) on delete cascade,   -- auteur de l'action
  type        text not null check (type in ('follow', 'review_like', 'review_comment', 'list_like')),
  review_id   uuid references public.reviews(id) on delete cascade,
  comment_id  uuid references public.review_comments(id) on delete cascade,
  list_id     text,
  tmdb_id     integer,
  created_at  timestamptz not null default now(),
  read_at     timestamptz
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists "notifications_select_own" on public.notifications;
drop policy if exists "notifications_update_own" on public.notifications;
drop policy if exists "notifications_delete_own" on public.notifications;
create policy "notifications_select_own" on public.notifications
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "notifications_update_own" on public.notifications
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "notifications_delete_own" on public.notifications
  for delete to authenticated using ((select auth.uid()) = user_id);
-- Pas de règle INSERT : seuls les déclencheurs ci-dessous créent des notifications.

-- L'app ne peut modifier QUE la date de lecture
revoke insert, update on public.notifications from anon, authenticated;
grant update (read_at) on public.notifications to authenticated;


-- ── Déclencheurs ─────────────────────────────────────────────────────────────

-- Abonnement
create or replace function public.notify_follow() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.follower_id <> new.following_id then
      insert into public.notifications (user_id, actor_id, type)
      values (new.following_id, new.follower_id, 'follow');
    end if;
    return new;
  else
    delete from public.notifications
    where type = 'follow' and user_id = old.following_id and actor_id = old.follower_id;
    return old;
  end if;
end $$;

drop trigger if exists notify_follow_trg on public.follows;
create trigger notify_follow_trg after insert or delete on public.follows
  for each row execute function public.notify_follow();

-- « J'aime » sur une critique
create or replace function public.notify_review_like() returns trigger
language plpgsql security definer set search_path = '' as $$
declare owner uuid; tmdb integer;
begin
  if tg_op = 'INSERT' then
    select user_id, tmdb_id into owner, tmdb from public.reviews where id = new.review_id;
    if owner is not null and owner <> new.user_id then
      insert into public.notifications (user_id, actor_id, type, review_id, tmdb_id)
      values (owner, new.user_id, 'review_like', new.review_id, tmdb);
    end if;
    return new;
  else
    delete from public.notifications
    where type = 'review_like' and review_id = old.review_id and actor_id = old.user_id;
    return old;
  end if;
end $$;

drop trigger if exists notify_review_like_trg on public.review_likes;
create trigger notify_review_like_trg after insert or delete on public.review_likes
  for each row execute function public.notify_review_like();

-- Commentaire sur une critique (supprimé automatiquement avec le commentaire : clé étrangère)
create or replace function public.notify_review_comment() returns trigger
language plpgsql security definer set search_path = '' as $$
declare owner uuid; tmdb integer;
begin
  select user_id, tmdb_id into owner, tmdb from public.reviews where id = new.review_id;
  if owner is not null and owner <> new.user_id then
    insert into public.notifications (user_id, actor_id, type, review_id, comment_id, tmdb_id)
    values (owner, new.user_id, 'review_comment', new.review_id, new.id, tmdb);
  end if;
  return new;
end $$;

drop trigger if exists notify_review_comment_trg on public.review_comments;
create trigger notify_review_comment_trg after insert on public.review_comments
  for each row execute function public.notify_review_comment();

-- « J'aime » sur une liste
create or replace function public.notify_list_like() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.owner_id <> new.user_id then
      insert into public.notifications (user_id, actor_id, type, list_id)
      values (new.owner_id, new.user_id, 'list_like', new.list_id);
    end if;
    return new;
  else
    delete from public.notifications
    where type = 'list_like' and user_id = old.owner_id and actor_id = old.user_id and list_id = old.list_id;
    return old;
  end if;
end $$;

drop trigger if exists notify_list_like_trg on public.list_likes;
create trigger notify_list_like_trg after insert or delete on public.list_likes
  for each row execute function public.notify_list_like();

-- Ces fonctions ne sont appelées que par les déclencheurs
revoke all on function public.notify_follow(), public.notify_review_like(),
  public.notify_review_comment(), public.notify_list_like() from public, anon, authenticated;

select 'notifications installées' as resultat;
