-- ════════════════════════════════════════════════════════════════════════════
-- Suppression de compte (RGPD)
-- Fonction appelée par l'app (supabase.rpc("delete_my_account")).
-- Elle ne peut supprimer QUE le compte de la personne connectée (auth.uid()).
-- Relançable sans risque.
-- ════════════════════════════════════════════════════════════════════════════

-- Les likes donnés sur les listes des autres bloquaient la suppression du compte
-- (clé étrangère sans « on delete cascade ») : on corrige la contrainte.
do $$
declare c text;
begin
  select conname into c from pg_constraint
  where conrelid = 'public.list_likes'::regclass and contype = 'f'
    and conkey = array[(select attnum from pg_attribute where attrelid = 'public.list_likes'::regclass and attname = 'user_id')];
  if c is not null then
    execute format('alter table public.list_likes drop constraint %I', c);
  end if;
  alter table public.list_likes
    add constraint list_likes_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
end $$;

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Non connecté';
  end if;

  -- Données sans lien automatique avec le compte
  delete from public.list_likes where user_id = uid or owner_id = uid;   -- likes donnés et reçus sur les listes
  delete from public.user_data where user_id = uid::text;                -- ancienne table (ancien proxy)

  -- Le compte lui-même : supprime en cascade profil public, coffre privé, abonnements,
  -- critiques, likes et commentaires de critiques
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
