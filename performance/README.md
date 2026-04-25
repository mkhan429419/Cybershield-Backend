# Performance (Locust) and security notes

## Locust web UI — quick start

```bash
cd Cybershield-Backend
npm run dev   # backend on 5001 (or match your PORT)

cd performance
python3 -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt

export LOCUST_BEARER_TOKEN="..."             # learner / affiliated JWT
export LOCUST_CLIENT_ADMIN_TOKEN="..."     # client admin JWT (templates, campaigns, orgs, reports)
export LOCUST_SYSTEM_ADMIN_TOKEN="..."     # optional; /api/admins/* + cert count non-affiliated

locust -f locustfile.py --host=http://127.0.0.1:5001
```

Open **http://localhost:8089** → set users & spawn rate → **Start swarming**.  
Do **not** use `--headless` if you want the UI.

---

## Endpoint coverage (honest scope)

Locust is **not** a substitute for a formal API inventory test: it samples traffic by **weight**. This project’s `locustfile.py` aims for **full read-path coverage** of the Express app’s **safe** HTTP surface (GET + a few no-op POSTs that return validation errors), plus **optional** heavy/write paths behind env flags.

### Always exercised (no JWT)

| Method | Path |
|--------|------|
| GET | `/` |
| GET | `/health` |
| GET | `/track/open/:id` (dummy id; still returns pixel) |
| GET | `/track/click/:id` |
| OPTIONS | `/track/credentials` |
| POST | `/track/credentials` (empty body → **400**, validates handler) |
| GET | `/api/whatsapp-campaigns/click` |

### With `LOCUST_BEARER_TOKEN` (authenticated “user” reads)

| Method | Path |
|--------|------|
| GET | `/api/users/me`, `/learning-progress`, `/courses-progress`, `/activity`, `/remedial-assignments` |
| GET | `/api/courses`, `/api/courses/:id`, `/api/courses/:id/progress`, `.../activity-email-status`, `.../activity-whatsapp-status` |
| GET | `/api/leaderboard/global`, `/api/leaderboard/organization` |
| GET | `/api/certificates`, `/api/certificates/course/:courseId`, `/api/certificates/:certificateId` (when IDs exist) |
| GET | `/api/incidents`, `/api/incidents/:id` (when ID exists) |
| GET | `/api/voice-phishing`, `/api/voice-phishing/:conversationId`, `/analytics/overview` |
| GET | `/api/email-campaigns`, `/api/whatsapp-campaigns` |

IDs for `:id` routes are resolved once per user in **`on_start`** from list endpoints (courses, incidents, conversations, certificates).

### With `LOCUST_CLIENT_ADMIN_TOKEN` (client admin reads)

| Method | Path |
|--------|------|
| GET | `/api/users/me` (warmup, for `orgId` if `LOCUST_ORG_ID` unset) |
| GET | `/api/email-templates`, `/api/email-templates/:templateId` |
| GET | `/api/whatsapp-templates`, `/api/whatsapp-templates/:templateId` |
| GET | `/api/campaigns`, `/api/campaigns/:campaignId`, `/api/campaigns/:campaignId/analytics` |
| GET | `/api/whatsapp-campaigns/:campaignId`, `.../analytics` |
| GET | `/api/voice-phishing-templates`, `/defaults`, `/:templateId` |
| GET | `/api/reports`, `/api/reports/:reportId/download` |
| GET | `/api/users/all` |
| GET | `/api/orgs/:orgId/users`, `/invites`, `/certificates/count` |

### With `LOCUST_SYSTEM_ADMIN_TOKEN` (system admin reads)

| Method | Path |
|--------|------|
| GET | `/api/admins/orgs`, `/api/admins/pending-invitations` |
| GET | `/api/certificates/count/non-affiliated` |

**Deliberately excluded** from default load (would skew results, hit third parties, or mutate data):

| Reason | Examples |
|--------|----------|
| **External APIs** | `GET /api/upload/subtitles/*` (Cloudinary) — enable only with `LOCUST_HIT_UPLOAD_SUBTITLES=1` and a real `LOCUST_SUBTITLE_PUBLIC_ID` if you accept Cloudinary load |
| **Clerk / dangerous** | `GET /api/admins/sync-users` (would hammer Clerk) |
| **Mutations** | `POST/PUT/DELETE` on campaigns, org invites, templates, courses, voice `POST /initiate`, `POST /api/email-campaigns/send`, file `POST /api/upload`, admin `POST invite-client` / `create-org`, etc. |
| **Heavy ML / LLM** | `POST /api/incidents/analyze`, `POST /api/chat/message` — enable only with `LOCUST_ENABLE_HEAVY=1` and **very few** Locust users |

Optional env flags:

```bash
export LOCUST_ENABLE_HEAVY=1              # adds POST chat + POST incidents/analyze (use 1–5 users)
export LOCUST_HIT_UPLOAD_SUBTITLES=1      # adds GET upload subtitle status (Cloudinary)
export LOCUST_SUBTITLE_PUBLIC_ID=...      # real Cloudinary public id when hitting upload
export LOCUST_ORG_ID=...                  # override org for /api/orgs/:orgId/*
```

---

## All performance “tests” to run **through the Locust UI**

Treat each row as a **separate run**: configure fields in the UI, start, observe **Charts**, **Statistics**, **Failures**, then **Stop** and (optionally) **Download report**.

| # | Scenario | Typical users | Spawn rate | Duration / stop rule | What to validate |
|---|-----------|---------------|------------|------------------------|------------------|
| 1 | **Smoke** | 1–2 | 1/s | 1–2 min | No failures; median `/health` stable; app stays up |
| 2 | **Baseline / average load** | Match expected concurrent users (e.g. 20–50) | 2–5/s | 5–10 min | p95 latency vs SLA; error rate ~0%; DB/CPU steady |
| 3 | **Peak / expected max** | ~1.5× normal peak (e.g. 75 if normal is 50) | 5/s | 5–15 min | No sustained 5xx; p95 acceptable; no memory climb |
| 4 | **Spike** | Low → high fast (e.g. 10 → 200) | 20–50/s | 2–3 min then stop | Recovery after spike; timeouts not permanent |
| 5 | **Stress / find ceiling** | Increase each run (100 → 200 → 400) | 10/s | Until errors/timeouts rise | Breaking point for capacity planning (non-prod) |
| 6 | **Soak / endurance** | Moderate (e.g. 30) | 2/s | **30–120 min** | Memory leaks, connection pool exhaustion, slow log growth |
| 7 | **Auth-only mix** | Same as #2 but **with** `LOCUST_BEARER_TOKEN` | same | same | Compare p95 of `/api/courses` vs `/health`; DB query load |
| 8 | **Admin mix** | Same as #2 with **both** tokens set | same | same | Admin list endpoints under load; watch Mongo/CPU |
| 9 | **Public-only** | Unset tokens; health-heavy | high users OK | short | CDN / edge / ALB in front of API; baseline without JWT |

**Within each run**, in the UI:

1. **Statistics** — sort by **95%** and **99%**; watch **RPS** vs failures.  
2. **Charts** — response times and users should stabilize during steady phase.  
3. **Failures** — investigate any non-5xx logic failures (4xx on wrong role = fix token or move task to admin class).  
4. **Download Data** — keep CSV for regression (compare p95 after deploy).

---

## Security testing (not Locust)

| Area | Suggestion |
|------|------------|
| Dependencies | `npm audit` in backend + frontend |
| API abuse | Rate limits, auth bypass, IDOR (separate tools / manual) |
| Dynamic scan | OWASP ZAP against **staging** only |
| Transport | TLS, HSTS, secure cookies in production |

---

## npm script (from `Cybershield-Backend`)

```bash
npm run perf:locust
```

Override host in the Locust UI **Host** field if needed, or run `locust` manually with `--host=...`.
