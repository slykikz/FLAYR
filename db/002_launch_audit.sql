begin;
alter table public.products add column translations jsonb not null default '{}'::jsonb;
alter table public.email_outbox add column attempts integer not null default 0;
alter table public.email_outbox add column next_attempt_at timestamptz not null default now();
alter table public.email_outbox add column first_attempt_at timestamptz;
alter table public.email_outbox add column lease_until timestamptz;
create index email_outbox_pending on public.email_outbox(next_attempt_at) where sent_at is null;
create function public.claim_emails() returns setof public.email_outbox
language sql security invoker set search_path='' as $$
  update public.email_outbox set lease_until=now()+interval '10 minutes',attempts=attempts+1,
    first_attempt_at=coalesce(first_attempt_at,now()),next_attempt_at=now()+interval '5 minutes' * power(2,least(attempts,6))
  where id in (select id from public.email_outbox where sent_at is null and attempts<8
    and next_attempt_at<=now() and (lease_until is null or lease_until<now())
    and (first_attempt_at is null or first_attempt_at>now()-interval '23 hours')
    order by created_at limit 20 for update skip locked)
  returning *;
$$;
revoke all on function public.claim_emails() from public,anon,authenticated;
grant execute on function public.claim_emails() to service_role;
create function public.update_product_content(p_actor uuid,p_id uuid,p_patch jsonb) returns void
language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.admin_roles where user_id=p_actor and role in('owner','manager')) then raise exception 'Unauthorized';end if;
 update public.products set active=coalesce((p_patch->>'active')::boolean,active),
  translations=coalesce(p_patch->'translations',translations) where id=p_id;
 if not found then raise exception 'Product not found';end if;
 insert into public.audit_log(actor,action,entity_id) values(p_actor,'product.updated',p_id);
end;$$;
revoke all on function public.update_product_content(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.update_product_content(uuid,uuid,jsonb) to service_role;
create or replace function public.apply_payment_event(p_event text,p_order uuid,p_intent text,p_status text,p_amount integer,p_currency text) returns void language plpgsql security invoker set search_path='' as $$declare o public.orders;line jsonb;begin
 insert into public.webhook_events(id) values(p_event) on conflict do nothing;if not found then return;end if;
 select * into strict o from public.orders where id=p_order for update;
 if o.payment_intent is not null and o.payment_intent<>p_intent then raise exception 'Intent mismatch';end if;
 if o.amount<>p_amount or o.currency<>p_currency then raise exception 'Amount mismatch';end if;
 if p_status='paid' and o.status in('pending','processing') then
 update public.orders set status='paid',payment_intent=p_intent where id=o.id;insert into public.email_outbox(order_id,kind) values(o.id,'receipt') on conflict do nothing;
 elsif p_status='paid' and o.status='cancelled' then update public.orders set status='review' where id=o.id;
 elsif p_status='processing' and o.status='pending' then update public.orders set status='processing',payment_intent=p_intent where id=o.id;
 elsif p_status='failed' and o.status in('pending','processing') then update public.orders set status='pending',expires_at=now()+interval '2 hours' where id=o.id;
 elsif p_status='cancelled' and o.status in('pending','processing') then
  for line in select value from jsonb_array_elements(o.items) loop update public.variants set stock=stock+(line->>'quantity')::int where id=(line->>'variant_id')::uuid;end loop;
  update public.orders set status='cancelled' where id=o.id;
 end if;
 insert into public.audit_log(action,entity_id,details) values('payment.'||p_status,o.id,jsonb_build_object('event',p_event));end;$$;

commit;

