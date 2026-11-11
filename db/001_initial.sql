begin;
create table public.products(id uuid primary key default gen_random_uuid(),slug text unique not null,name text not null,category text not null,description text not null,image integer not null check(image between 0 and 7),tag text not null,model_url text,active boolean not null default false);
create table public.variants(id uuid primary key default gen_random_uuid(),product_id uuid not null references public.products(id),sku text unique not null,size text not null,color text not null,price integer not null check(price>0),stock integer not null default 0 check(stock>=0),tax_code text not null default 'txcd_99999999',unique(product_id,size,color));
create index variants_product_idx on public.variants(product_id);
create table public.price_history(id uuid primary key default gen_random_uuid(),variant_id uuid not null references public.variants(id),price integer not null check(price>0),recorded_at timestamptz not null default now());
create index price_history_variant_time_idx on public.price_history(variant_id,recorded_at desc);
create table public.promotions(id uuid primary key default gen_random_uuid(),variant_id uuid not null references public.variants(id),starts_at timestamptz not null,ends_at timestamptz not null,prior_price integer not null,sale_price integer not null check(sale_price>0),check(ends_at>starts_at));
create table public.orders(id uuid primary key,idempotency_key uuid unique not null,status text not null default 'pending' check(status in('pending','processing','paid','shipped','cancelled','refunded','review')),payment_intent text unique,amount integer not null check(amount>0),tax integer not null check(tax>=0),shipping integer not null check(shipping>=0),currency text not null default 'eur' check(currency='eur'),country text not null,customer_encrypted jsonb not null,items jsonb not null,tax_calculation text,tracking text,created_at timestamptz not null default now(),expires_at timestamptz not null);
create index orders_status_expiry_idx on public.orders(status,expires_at);
alter table public.orders add column terms_version text,add column terms_accepted_at timestamptz;
alter table public.products add column image_url text;
create table public.admin_roles(user_id uuid primary key references auth.users(id) on delete cascade,role text not null check(role in('owner','manager','support')));
create table public.audit_log(id uuid primary key default gen_random_uuid(),actor uuid,action text not null,entity_id uuid,details jsonb,created_at timestamptz not null default now());
create table public.webhook_events(id text primary key,created_at timestamptz not null default now());
create table public.email_outbox(id uuid primary key default gen_random_uuid(),order_id uuid references public.orders(id),kind text not null,payload_encrypted jsonb,sent_at timestamptz,created_at timestamptz not null default now(),unique(order_id,kind));
create table public.withdrawals(id uuid primary key default gen_random_uuid(),order_reference text not null,payload_encrypted jsonb not null,created_at timestamptz not null default now());
create table public.newsletter(id uuid primary key default gen_random_uuid(),email_hash text unique not null,email_encrypted jsonb not null,confirmed_at timestamptz,created_at timestamptz not null default now());
alter table public.products enable row level security;alter table public.variants enable row level security;alter table public.price_history enable row level security;alter table public.promotions enable row level security;alter table public.orders enable row level security;alter table public.admin_roles enable row level security;alter table public.audit_log enable row level security;alter table public.webhook_events enable row level security;alter table public.email_outbox enable row level security;alter table public.withdrawals enable row level security;alter table public.newsletter enable row level security;
revoke all on public.products,public.variants,public.price_history,public.promotions,public.orders,public.admin_roles,public.audit_log,public.webhook_events,public.email_outbox,public.withdrawals,public.newsletter from anon,authenticated;
grant select on public.products,public.variants to anon,authenticated;
create policy active_products on public.products for select to anon,authenticated using(active);
create policy active_variants on public.variants for select to anon,authenticated using(exists(select 1 from public.products p where p.id=product_id and p.active));
grant all on public.products,public.variants,public.price_history,public.promotions,public.orders,public.admin_roles,public.audit_log,public.webhook_events,public.email_outbox,public.withdrawals,public.newsletter to service_role;
create function public.log_price() returns trigger language plpgsql security invoker set search_path='' as $$ begin if TG_OP='INSERT' or NEW.price<>OLD.price then insert into public.price_history(variant_id,price) values(NEW.id,NEW.price); end if; return NEW;end;$$;
create trigger variant_price_history after insert or update of price on public.variants for each row execute function public.log_price();
create function public.deny_mutation() returns trigger language plpgsql security invoker set search_path='' as $$ begin raise exception 'Append-only record';end;$$;
create trigger immutable_audit before update or delete on public.audit_log for each row execute function public.deny_mutation();
create trigger immutable_prices before update or delete on public.price_history for each row execute function public.deny_mutation();
-- The price effective at the beginning of the window must be included.
create function public.prior_30_day_price(p_variant uuid,p_start timestamptz) returns integer language sql stable security invoker set search_path='' as $$select min(price) from (select price from public.price_history where variant_id=p_variant and recorded_at>=p_start-interval '30 days' and recorded_at<p_start union all (select price from public.price_history where variant_id=p_variant and recorded_at<p_start-interval '30 days' order by recorded_at desc limit 1)) p;$$;
create function public.freeze_promotion() returns trigger language plpgsql security invoker set search_path='' as $$begin NEW.prior_price:=public.prior_30_day_price(NEW.variant_id,NEW.starts_at);if NEW.prior_price is null then raise exception 'Missing genuine price history';end if;return NEW;end;$$;
create trigger promotion_reference before insert on public.promotions for each row execute function public.freeze_promotion();
create trigger immutable_promotions before update or delete on public.promotions for each row execute function public.deny_mutation();
-- Called only by the trusted Worker. Serializable stock locks and idempotency in one transaction.
create function public.reserve_order(p_order jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$declare line jsonb;v public.variants;existing public.orders;begin
 perform pg_advisory_xact_lock(hashtextextended(p_order->>'idempotency_key',0));
 select * into existing from public.orders where idempotency_key=(p_order->>'idempotency_key')::uuid;if found then return to_jsonb(existing);end if;
 for line in select value from jsonb_array_elements(p_order->'items') order by value->>'variant_id' loop
  select * into strict v from public.variants where id=(line->>'variant_id')::uuid for update;
  if (line->>'quantity')::integer not between 1 and 10 or v.price<>(line->>'unit_price')::integer or v.stock<(line->>'quantity')::integer or not exists(select 1 from public.products where id=v.product_id and active) then raise exception 'Stock or price changed';end if;
  update public.variants set stock=stock-(line->>'quantity')::integer where id=v.id;
 end loop;
 insert into public.orders(id,idempotency_key,amount,tax,shipping,country,customer_encrypted,items,tax_calculation,expires_at) values((p_order->>'id')::uuid,(p_order->>'idempotency_key')::uuid,(p_order->>'amount')::int,(p_order->>'tax')::int,(p_order->>'shipping')::int,p_order->>'country',p_order->'customer_encrypted',p_order->'items',p_order->>'tax_calculation',now()+interval '2 hours') returning * into existing;
 update public.orders set terms_version=p_order->>'terms_version',terms_accepted_at=now() where id=existing.id;
 insert into public.audit_log(action,entity_id) values('order.reserved',existing.id);return to_jsonb(existing);end;$$;
create function public.apply_payment_event(p_event text,p_order uuid,p_intent text,p_status text,p_amount integer,p_currency text) returns void language plpgsql security invoker set search_path='' as $$declare o public.orders;line jsonb;begin
 insert into public.webhook_events(id) values(p_event) on conflict do nothing;if not found then return;end if;
 select * into strict o from public.orders where id=p_order for update;
 if o.payment_intent is not null and o.payment_intent<>p_intent then raise exception 'Intent mismatch';end if;
 if o.amount<>p_amount or o.currency<>p_currency then raise exception 'Amount mismatch';end if;
 if p_status='paid' and o.status in('pending','processing') then
 update public.orders set status='paid',payment_intent=p_intent where id=o.id;insert into public.email_outbox(order_id,kind) values(o.id,'receipt') on conflict do nothing;
 elsif p_status='paid' and o.status='cancelled' then update public.orders set status='review' where id=o.id;
 elsif p_status='processing' and o.status='pending' then update public.orders set status='processing',payment_intent=p_intent where id=o.id;
 elsif p_status='cancelled' and o.status in('pending','processing') then
  for line in select value from jsonb_array_elements(o.items) loop update public.variants set stock=stock+(line->>'quantity')::int where id=(line->>'variant_id')::uuid;end loop;
  update public.orders set status='cancelled' where id=o.id;
 end if;
 insert into public.audit_log(action,entity_id,details) values('payment.'||p_status,o.id,jsonb_build_object('event',p_event));end;$$;
create function public.admin_variant_update(p_actor uuid,p_id uuid,p_price integer,p_stock integer) returns void language plpgsql security invoker set search_path='' as $$ begin if not exists(select 1 from public.admin_roles where user_id=p_actor and role in('owner','manager')) then raise exception 'Unauthorized';end if;update public.variants set price=p_price,stock=p_stock where id=p_id;insert into public.audit_log(actor,action,entity_id,details) values(p_actor,'variant.updated',p_id,jsonb_build_object('price',p_price,'stock',p_stock));end;$$;
create function public.ship_order(p_actor uuid,p_id uuid,p_tracking text) returns void language plpgsql security invoker set search_path='' as $$begin if not exists(select 1 from public.admin_roles where user_id=p_actor and role in('owner','manager','support')) then raise exception 'Unauthorized';end if;update public.orders set status='shipped',tracking=p_tracking where id=p_id and status='paid';if not found then raise exception 'Order must be paid';end if;insert into public.audit_log(actor,action,entity_id) values(p_actor,'order.shipped',p_id);insert into public.email_outbox(order_id,kind) values(p_id,'shipping') on conflict do nothing;end;$$;
revoke execute on function public.log_price(),public.deny_mutation(),public.prior_30_day_price(uuid,timestamptz),public.freeze_promotion(),public.reserve_order(jsonb),public.apply_payment_event(text,uuid,text,text,integer,text),public.admin_variant_update(uuid,uuid,integer,integer),public.ship_order(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.log_price(),public.deny_mutation(),public.prior_30_day_price(uuid,timestamptz),public.freeze_promotion(),public.reserve_order(jsonb),public.apply_payment_event(text,uuid,text,text,integer,text),public.admin_variant_update(uuid,uuid,integer,integer),public.ship_order(uuid,uuid,text) to service_role;
create function public.submit_withdrawal(p_id uuid,p_reference text,p_payload jsonb,p_outbox jsonb) returns void language plpgsql security invoker set search_path='' as $$begin insert into public.withdrawals(id,order_reference,payload_encrypted) values(p_id,p_reference,p_payload);insert into public.email_outbox(kind,payload_encrypted) values('withdrawal',p_outbox);end;$$;
create function public.create_product(p_actor uuid,p_product jsonb,p_variants jsonb) returns uuid language plpgsql security invoker set search_path='' as $$declare id uuid:=gen_random_uuid();v jsonb;begin if not exists(select 1 from public.admin_roles where user_id=p_actor and role in('owner','manager')) then raise exception 'Unauthorized';end if;insert into public.products(id,slug,name,category,description,image,tag,active) values(id,p_product->>'slug',p_product->>'name',p_product->>'category',p_product->>'description',(p_product->>'image')::int,p_product->>'tag',false);for v in select value from jsonb_array_elements(p_variants) loop insert into public.variants(product_id,sku,size,color,price,stock) values(id,v->>'sku',v->>'size',v->>'color',(v->>'price')::int,(v->>'stock')::int);end loop;insert into public.audit_log(actor,action,entity_id) values(p_actor,'product.created',id);return id;end;$$;
revoke execute on function public.submit_withdrawal(uuid,text,jsonb,jsonb),public.create_product(uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.submit_withdrawal(uuid,text,jsonb,jsonb),public.create_product(uuid,jsonb,jsonb) to service_role;
commit;
