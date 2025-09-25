-- Stripe testing reset
select * from profiles;
update profiles set stripe_customer_id=null, subscription_updated_at=null, is_banned=false, banned_at=null, ban_reason=null;
delete from subscriptions;
delete from stripe_events;
delete from payment_history;