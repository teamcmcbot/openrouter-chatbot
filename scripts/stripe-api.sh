#!/usr/bin/env bash
# Simple Stripe API test harness for local environment
# Requirements:
# - NEXT app running locally (BASE_URL)
# - Auth: EITHER a Supabase JWT (TOKEN) OR the full Cookie header string (COOKIE)
# - Stripe CLI listening and STRIPE_WEBHOOK_SECRET configured in app env
#
# Usage (zsh/bash):
#   BASE_URL="http://localhost:3000" \
#   TOKEN="eyJhbGciOi..." \
#   PLAN="pro" \
#   ./scripts/stripe-api.sh checkout
#
#   # or using cookies copied from browser DevTools (include sb-*-auth-token.*)
#   BASE_URL="http://localhost:3000" \
#   COOKIE="sb-127-auth-token.0=base64-...; sb-127-auth-token.1=..." \
#   PLAN="pro" \
#   ./scripts/stripe-api.sh checkout
#
# Commands:
#   checkout           -> Calls POST /api/stripe/checkout-session
#   get-sub            -> Calls GET  /api/stripe/subscription
#   cancel             -> Calls POST /api/stripe/cancel-subscription
#   portal             -> Calls POST /api/stripe/customer-portal
#
# Notes:
# - To verify DB state, run queries in Supabase SQL editor:
#   select id, stripe_customer_id, subscription_tier, subscription_status from profiles where id='<USER_ID>';
#   select * from subscriptions where user_id='<USER_ID>' order by updated_at desc limit 1;
#   select * from payment_history where user_id='<USER_ID>' order by created_at desc limit 5;

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
TOKEN="${TOKEN:-}"
COOKIE="${COOKIE:-}"
PLAN="${PLAN:-pro}"

if [[ -z "$TOKEN" && -z "$COOKIE" ]]; then
  echo "ERROR: Provide auth via TOKEN (JWT) or COOKIE (full Cookie header string)." >&2
  exit 1
fi

hdr=(-H "Content-Type: application/json")
if [[ -n "$TOKEN" ]]; then
  hdr+=( -H "Authorization: Bearer ${TOKEN}" )
fi
if [[ -n "$COOKIE" ]]; then
  hdr+=( -H "Cookie: ${COOKIE}" )
fi

cmd="${1:-}"
case "$cmd" in
  checkout)
    echo "POST ${BASE_URL}/api/stripe/checkout-session (plan=${PLAN})"
    curl -sS -X POST "${BASE_URL}/api/stripe/checkout-session" \
      "${hdr[@]}" \
      --data "$(jq -nc --arg plan "$PLAN" '{plan: $plan, trialDays: 0}')" | jq .
    ;;
  get-sub)
    echo "GET  ${BASE_URL}/api/stripe/subscription"
    curl -sS -X GET "${BASE_URL}/api/stripe/subscription" \
      "${hdr[@]}" | jq .
    ;;
  cancel)
    echo "POST ${BASE_URL}/api/stripe/cancel-subscription"
    curl -sS -X POST "${BASE_URL}/api/stripe/cancel-subscription" \
      "${hdr[@]}" | jq .
    ;;
  portal)
    echo "POST ${BASE_URL}/api/stripe/customer-portal"
    curl -sS -X POST "${BASE_URL}/api/stripe/customer-portal" \
      "${hdr[@]}" \
      --data '{}'
    echo "\n(NOTE) Open the returned url in your browser to view the Billing Portal."
    ;;
  *)
    echo "Usage: BASE_URL=... TOKEN=... PLAN=pro ./scripts/stripe-api.sh <checkout|get-sub|cancel|portal>" >&2
    exit 2
    ;;
 esac
