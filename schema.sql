-- 1. Ejecutar este archivo en Supabase > SQL Editor.
-- 2. Crear un usuario en Authentication > Users > Add user (email + contraseña).
-- 3. Ejecutar por separado: INSERT INTO public.app_members(user_id)
--    SELECT id FROM auth.users WHERE email = 'CORREO_COMPARTIDO@EJEMPLO.COM';
-- Solo usuarios incluidos en app_members pueden leer o modificar registros.

create extension if not exists pgcrypto;
create table if not exists public.app_members (
 user_id uuid primary key references auth.users(id) on delete cascade,
 created_at timestamptz not null default now()
);
create table if not exists public.accounts (
 id uuid primary key default gen_random_uuid(),
 name text not null check (char_length(name) between 1 and 80),
 owner_note text not null default '' check (char_length(owner_note)<=100),
 created_at timestamptz not null default now()
);
create table if not exists public.purchases (
 id uuid primary key default gen_random_uuid(),
 name text not null check (char_length(name) between 1 and 120),
 category text not null default 'Otros',
 total_amount numeric(12,2) not null check (total_amount>0),
 split_a numeric(5,2) not null default 50 check (split_a between 0 and 100),
 notes text not null default '' check (char_length(notes)<=500),
 created_at timestamptz not null default now()
);
create table if not exists public.installments (
 id uuid primary key default gen_random_uuid(),
 purchase_id uuid not null references public.purchases(id) on delete cascade,
 number integer not null check (number between 1 and 120),
 amount numeric(12,2) not null check (amount>0),
 due_date date not null,
 account_id uuid references public.accounts(id) on delete set null,
 status text not null default 'pending' check (status in ('pending','paid')),
 paid_at date,
 paid_by text not null default 'a' check (paid_by in ('a','b')),
 created_at timestamptz not null default now(),
 unique(purchase_id,number),
 constraint payment_date_consistency check ((status='pending' and paid_at is null) or (status='paid' and paid_at is not null))
);
create index if not exists installments_due_idx on public.installments(due_date);
create index if not exists installments_purchase_idx on public.installments(purchase_id);
-- No acceso anónimo, ni siquiera a la tabla de autorización.
revoke all on public.app_members,public.accounts,public.purchases,public.installments from anon,public;
revoke all on public.app_members,public.accounts,public.purchases,public.installments from authenticated;
grant usage on schema public to authenticated;
grant select on public.app_members to authenticated;
grant select,insert,update,delete on public.accounts,public.purchases,public.installments to authenticated;
alter table public.app_members enable row level security;
alter table public.accounts enable row level security;
alter table public.purchases enable row level security;
alter table public.installments enable row level security;
-- Cada usuario autenticado solo puede ver su propia fila de pertenencia.
create policy "membership_self_read" on public.app_members for select to authenticated using (user_id=(select auth.uid()));
create policy "accounts_shared_access" on public.accounts for all to authenticated using (exists(select 1 from public.app_members where user_id=(select auth.uid()))) with check (exists(select 1 from public.app_members where user_id=(select auth.uid())));
create policy "purchases_shared_access" on public.purchases for all to authenticated using (exists(select 1 from public.app_members where user_id=(select auth.uid()))) with check (exists(select 1 from public.app_members where user_id=(select auth.uid())));
create policy "installments_shared_access" on public.installments for all to authenticated using (exists(select 1 from public.app_members where user_id=(select auth.uid()))) with check (exists(select 1 from public.app_members where user_id=(select auth.uid())));
-- app_members NO tiene políticas de insert/update/delete para usuarios autenticados.
-- El administrador controla la lista de usuarios desde el SQL Editor.
