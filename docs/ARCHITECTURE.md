# Connectify Backend — Architecture

> Living document. Update it whenever the system's shape changes.

## 1. Repositories

| Path | Stack | Role |
|---|---|---|
| `backendconnectify/` | Node 18+, Express 4, CommonJS | API + realtime + background jobs |
| `connectifyfrontend/` | Vite + React 18 + TypeScript + shadcn/ui | Web client (Vercel) |
| `moblie-frontend/` | Expo / React Native | Mobile client |

Each directory is its own git repository.

## 2. Runtime stack

| Concern | Technology | Notes |
|---|---|---|
| HTTP server | Express 4 | plus Socket.IO (attached to the same `http.Server`) |
| Database | Supabase (Postgres) | postgREST via `@supabase/supabase-js` |
| Data access | Repository pattern | camelCase mappers, column allow-lists |
| Atomicity | PL/pgSQL RPCs | booking/wallet/messaging mutate via `rpc()` |
| Cache | Redis (`redis` v4 client) | graceful degradation on failure |
| Job queue | Bull (v4, Redis-backed) | in-process workers |
| Email | Resend | HTML templates inline in `emailService` |
| SMS | MailerSend | `smsService` (E.164 normalization) |
| Push | Firebase Cloud Messaging (Firebase Admin) | optional, degrades |
| Payments | Paystack | init/verify/transfers/recipients |
| WhatsApp AI | Meta Cloud API + Gemini (`gemini-3.6-flash`) | optional channel |
| Logs | Winston (files) + Morgan (requests) | |

## 3. Layer rules

```
routes/      -> declare HTTP routes + express-validator chains only
middleware/  -> auth, adminAuth, security, rate limits
controllers/ -> orchestrate request/response, call repositories & services
repositories/-> the ONLY layer that talks to Postgres (Supabase client)
services/    -> external integrations, Redis, queues, scheduling
supabase/migrations/ -> SQL schema + RPC definitions
```

Enforced conventions:

- **Controllers never import the Supabase client** (verified; grep for `.from(`/`.rpc(` in `controllers/` returns nothing).
- **Repositories return mapped camelCase objects** via `mappers.js`; the raw rows are never exposed.
- **`select('*')` is forbidden on sensitive tables.** Password/token columns are only ever selected by dedicated "private" reads (`PRIVATE_USER_SELECT`).
- Multi-statement flows that must stay consistent (booking + slot, wallet credit + transaction) go through a stored function; never through two separate REST calls.

## 4. Data model & atomicity

5 versioned migrations in `supabase/migrations/`:

| Migration | Purpose |
|---|---|
| `202605200001_supabase_only_foundation.sql` | All core tables, indexes, base RPCs, RLS **enabled** |
| `202605210002_booking_atomicity_rpcs.sql` | `create_booking_atomic`, `update_booking_status_atomic` |
| `202605290001_fix_booking_atomic_column_order.sql` | normalize numeric cols |
| `202605290002_b2b_company_provider.sql` | provider companies, team, service requests, quotes |
| `202606080001_messaging_atomic_updates.sql` | conversation last-message updates |
| `202608090003_security_hardening.sql` | revoke anon/authenticated RPC grants |

### RPC catalog (business-critical guarantees)

| RPC | Guarantee |
|---|---|
| `create_booking_atomic` | locks availability row (`FOR UPDATE`), rejects double-book time slot, inserts booking atomically |
| `update_booking_status_atomic` | row-level authz (customer limited to cancel/reschedule), releases/books slots with deadlock-avoidant lock ordering |
| `credit_wallet_from_pending_transaction`, `create_manual_wallet_credit`, `create_wallet_withdrawal_debit`, `refund_wallet_withdrawal`, `process_booking_wallet_payment` | wallet balance + ledger updated in one transaction; amount/reference invariants checked in SQL |
| `update_conversation_last_message_atomic` | message + conversation last-message update |

### RLS model

RLS is **enabled** on every table but **no policies are defined**. Access is 100% mediated by the backend using the `service_role` key (classic *backend-for-frontend*). Consequence: all authorization lives in application code and in the `*_atomic` stored functions. Do not add client-side (anon/authenticated) access without adding matching RLS policies.

## 5. Auth & sessions

- **Access token**: JWT, 15 min, signed with `JWT_SECRET`, `{ userId }` only (no role — role is always re-fetched).
- **Refresh token**: JWT, 7 days, httpOnly + `Set-Cookie` (`SameSite` lax/none), stored hashed (SHA-256) in DB. Rotated on every refresh.
- Mobile clients receive the tokens in the body (`X-Client-Type: mobile`) and manage them in secure storage.
- **Session reuse protection**: refresh endpoint validates the DB refresh-token hash; a mismatch clears the hash (logs the user out everywhere).
- Socket.IO connections authenticate with the access token and fall back to a validated refresh token.
- Passwords hashed with bcrypt (`bcryptjs`, cost 12).

### WhatsApp ghost accounts

WhatsApp onboarding auto-creates `app_users` rows with a synthetic `whatsapp_<phone>@connectify.com` email and **no password**. When that person later registers on web/mobile, the register flow **claims** the ghost row (attaches the real email/password) instead of rejecting, so they are never locked out.

## 6. Realtime (Socket.IO)

- Connection auth → joins `user_<id>` and `notifications_<id>` rooms.
- Conversation rooms `conversation_<id>` are per-conversation and joined only after a participant check.
- Typing indicators, booking events, and notifications are emitted to user rooms; target scoping happens server-side.
- `socketHandlers.js` is thin: permission checks first, then `io.to(room).emit`.

## 7. Background jobs (Bull)

Queues: `Email Processing`, `Notification Processing`, `Image Processing`, `Booking Reminders` (cron hourly).

- Workers run **in the API process** (`queueService.js`) — acceptable for single-instance deploy; for horizontal scale, extract a worker process.
- **Booking reminders are idempotent**: each booking is *claimed* (`reminder_sent` flips before any send). A crash mid-send cannot produce duplicates; a failed send unclaims for retry (`bookingReminderService.js`).

## 8. WhatsApp AI assistant

Flow: Meta webhook (`modules/whatsapp/routes/webhookRoutes.js`, HMAC-verifies `x-hub-signature-256`) → `conversationManager` state machine → Gemini intent/entity extraction (`aiService`) → provider matching (`matchingEngine`/`connectifyRepository`) → `create_booking_atomic` RPC.

Safety measures in place:

- Webhook signature **fail-closed in production** (no `WHATSAPP_APP_SECRET` ⇒ reject).
- **Prompt injection defense**: user message is fenced as *data only* in the prompt; replies are strictly validated and coerce everything to allow-listed session keys with length caps.
- **Cost guardrail**: max `MAX_SESSION_AI_CALLS` LLM calls per session; beyond that we fall back to template Q&A (no Gemini spend).
- Date/time are parsed by local helpers (`normalizeDate`/`normalizeTime`) before booking — never trusted to the model verbatim.
- All `app_users` access goes through column allow-lists (no `select('*')`).

## 9. Running & operating

- `npm run dev` — nodemon
- `npm test` — `node --test tests/` (unit tests with in-memory Supabase query mocks)
- `npm run migrate` — applies `supabase/migrations/*.sql` in order via `DATABASE_URL` (tracked in `_migrations` table)
- `npm run migrate:check` — drift report; `npm run migrate:mark` — record without running
- Health probe: `GET /api/health` (DB + Redis status)

## 10. Known gaps / roadmap

Work is additive but these remain (open to revisit):

1. Runners and tests cover unit paths only — no CI wiring or RPC integration tests against a real dev DB.
2. `emailService.js` is large (812 lines, inline HTML templates); consider extraction to `services/email/templates`.
3. OpenAPI contract (`docs/openapi.yaml`) is a baseline; not yet wired to request/response validation.
4. Rate limiting is in-memory (`express-rate-limit` MemoryStore) — fine for a single instance; use a shared store (Redis) if scaling horizontally.
5. `middleware/cache.js` (in-memory node-cache) and `middleware/redisCache.js` are present but not mounted on any route.