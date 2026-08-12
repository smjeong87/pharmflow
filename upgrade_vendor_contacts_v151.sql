-- PharmFlow v1.5.1 vendor_contacts schema repair
-- Run once in Supabase SQL Editor. Existing rows are preserved.

alter table public.vendor_contacts add column if not exists vendor text;
alter table public.vendor_contacts add column if not exists contact_name text not null default '';
alter table public.vendor_contacts add column if not exists phone text not null default '';
alter table public.vendor_contacts add column if not exists order_deadline text not null default '';
alter table public.vendor_contacts add column if not exists note text not null default '';
alter table public.vendor_contacts add column if not exists updated_by uuid references auth.users(id);
alter table public.vendor_contacts add column if not exists updated_at timestamptz not null default now();

-- Needed for upsert(..., { onConflict: 'vendor' })
create unique index if not exists vendor_contacts_vendor_uidx
  on public.vendor_contacts (vendor);

-- Reload PostgREST schema cache immediately.
notify pgrst, 'reload schema';
