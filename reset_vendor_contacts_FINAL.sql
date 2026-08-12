-- PharmFlow v1.5.3: vendor_contacts final reset
-- 기존 거래처 데이터가 없을 때 1회 실행합니다.

begin;

drop table if exists public.vendor_contacts cascade;

create table public.vendor_contacts (
  vendor text primary key,
  contact_name text not null default '',
  phone text not null default '',
  order_deadline text not null default '',
  note text not null default ''
);

alter table public.vendor_contacts enable row level security;

create policy "vendor_contacts_read"
on public.vendor_contacts for select to authenticated
using (true);

create policy "vendor_contacts_insert"
on public.vendor_contacts for insert to authenticated
with check (true);

create policy "vendor_contacts_update"
on public.vendor_contacts for update to authenticated
using (true) with check (true);

create policy "vendor_contacts_delete"
on public.vendor_contacts for delete to authenticated
using (true);

grant select, insert, update, delete on public.vendor_contacts to authenticated;

notify pgrst, 'reload schema';
commit;
