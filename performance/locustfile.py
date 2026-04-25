"""
CyberShield backend — broad **read-only** performance coverage.

Run (web UI):  locust -f locustfile.py --host=http://127.0.0.1:5001
Open: http://localhost:8089

Tokens (JWT Bearer):
  LOCUST_BEARER_TOKEN          — learner/affiliated (or any user for “me” + courses + …)
  LOCUST_CLIENT_ADMIN_TOKEN    — client admin (templates, campaigns, org routes, reports)
  LOCUST_SYSTEM_ADMIN_TOKEN    — system admin (/api/admins/*, cert count non-affiliated)

Optional:
  LOCUST_ORG_ID                — override org id for /api/orgs/:orgId/* (else taken from /api/users/me)
  LOCUST_ENABLE_HEAVY=1       — also POST /api/chat/message and POST /api/incidents/analyze (slow; external APIs)
  LOCUST_HIT_UPLOAD_SUBTITLES=1 — GET /api/upload/subtitles/* (calls Cloudinary — use sparingly)

Intentionally **not** load-tested here: file POST upload, campaign start/pause/delete, Twilio webhooks,
PATCH/PUT/DELETE mutations, GET /api/admins/sync-users (Clerk hammer), admin invite/create-org POSTs.
See README.md “Coverage matrix”.
"""

from __future__ import annotations

import json
import os
from typing import Any

from locust import HttpUser, between, task


def _headers(token: str) -> dict[str, str]:
    token = (token or "").strip()
    if not token:
        return {}
    return {"Authorization": f"Bearer {token}"}


def _json_first_id(data: Any, *paths: tuple[str, ...]) -> str:
    """Pull first _id from nested list structures returned by this API."""
    if not isinstance(data, dict):
        return ""
    for path in paths:
        cur: Any = data
        ok = True
        for key in path:
            if not isinstance(cur, dict):
                ok = False
                break
            cur = cur.get(key)
        if not ok:
            continue
        if isinstance(cur, list) and cur:
            item = cur[0]
            if isinstance(item, dict):
                sid = item.get("_id") or item.get("id")
                if sid:
                    return str(sid)
    return ""


def _parse_json(resp) -> dict[str, Any]:
    try:
        j = resp.json()
        return j if isinstance(j, dict) else {}
    except Exception:
        return {}


class CybershieldUser(HttpUser):
    wait_time = between(0.35, 1.8)

    def on_start(self):
        self.hu = _headers(os.environ.get("LOCUST_BEARER_TOKEN", ""))
        self.ha = _headers(os.environ.get("LOCUST_CLIENT_ADMIN_TOKEN", ""))
        self.hs = _headers(os.environ.get("LOCUST_SYSTEM_ADMIN_TOKEN", ""))
        self.has_u = bool(self.hu)
        self.has_a = bool(self.ha)
        self.has_s = bool(self.hs)

        self.org_id = (os.environ.get("LOCUST_ORG_ID") or "").strip()
        self.course_id = ""
        self.email_campaign_id = ""
        self.wa_campaign_id = ""
        self.incident_id = ""
        self.conversation_id = ""
        self.certificate_id = ""
        self.report_id = ""
        self.email_template_id = ""
        self.wa_template_id = ""
        self.voice_template_id = ""

        if self.has_u:
            r = self.client.get("/api/users/me", headers=self.hu, name="[warmup] GET /api/users/me")
            if r.status_code == 200:
                p = _parse_json(r)
                self.org_id = self.org_id or (p.get("orgId") or "")

            r = self.client.get("/api/courses", headers=self.hu, name="[warmup] GET /api/courses")
            if r.status_code == 200:
                self.course_id = _json_first_id(_parse_json(r), ("courses",))

            r = self.client.get(
                "/api/incidents", headers=self.hu, name="[warmup] GET /api/incidents"
            )
            if r.status_code == 200:
                self.incident_id = _json_first_id(_parse_json(r), ("incidents",))

            r = self.client.get(
                "/api/voice-phishing", headers=self.hu, name="[warmup] GET /api/voice-phishing"
            )
            if r.status_code == 200:
                d = _parse_json(r)
                conv = (d.get("data") or {}).get("conversations") or d.get("conversations")
                if isinstance(conv, list) and conv and isinstance(conv[0], dict):
                    cid = conv[0].get("_id")
                    if cid:
                        self.conversation_id = str(cid)

            r = self.client.get(
                "/api/certificates", headers=self.hu, name="[warmup] GET /api/certificates"
            )
            if r.status_code == 200:
                self.certificate_id = _json_first_id(
                    _parse_json(r), ("certificates",), ("data", "certificates")
                )

        if self.has_a and not self.org_id:
            r = self.client.get(
                "/api/users/me", headers=self.ha, name="[warmup] GET /api/users/me (admin)"
            )
            if r.status_code == 200:
                p = _parse_json(r)
                self.org_id = self.org_id or (p.get("orgId") or "")

        if self.has_a:
            r = self.client.get(
                "/api/campaigns", headers=self.ha, name="[warmup] GET /api/campaigns"
            )
            if r.status_code == 200:
                d = _parse_json(r)
                camps = (d.get("data") or {}).get("campaigns") or []
                if camps and isinstance(camps[0], dict) and camps[0].get("_id"):
                    self.email_campaign_id = str(camps[0]["_id"])

            r = self.client.get(
                "/api/whatsapp-campaigns",
                headers=self.ha,
                name="[warmup] GET /api/whatsapp-campaigns",
            )
            if r.status_code == 200:
                d = _parse_json(r)
                camps = (d.get("data") or {}).get("campaigns") or []
                if camps and isinstance(camps[0], dict) and camps[0].get("_id"):
                    self.wa_campaign_id = str(camps[0]["_id"])

            r = self.client.get(
                "/api/reports", headers=self.ha, name="[warmup] GET /api/reports"
            )
            if r.status_code == 200:
                self.report_id = _json_first_id(_parse_json(r), ("reports",))

            r = self.client.get(
                "/api/email-templates", headers=self.ha, name="[warmup] GET /api/email-templates"
            )
            if r.status_code == 200:
                d = _parse_json(r)
                arr = (d.get("data") or {}).get("templates") or d.get("templates") or []
                if arr and isinstance(arr[0], dict) and arr[0].get("_id"):
                    self.email_template_id = str(arr[0]["_id"])

            r = self.client.get(
                "/api/whatsapp-templates",
                headers=self.ha,
                name="[warmup] GET /api/whatsapp-templates",
            )
            if r.status_code == 200:
                d = _parse_json(r)
                arr = (d.get("data") or {}).get("templates") or d.get("templates") or []
                if arr and isinstance(arr[0], dict) and arr[0].get("_id"):
                    self.wa_template_id = str(arr[0]["_id"])

            r = self.client.get(
                "/api/voice-phishing-templates",
                headers=self.ha,
                name="[warmup] GET /api/voice-phishing-templates",
            )
            if r.status_code == 200:
                d = _parse_json(r)
                arr = (d.get("data") or {}).get("templates") or d.get("templates") or []
                if arr and isinstance(arr[0], dict) and arr[0].get("_id"):
                    self.voice_template_id = str(arr[0]["_id"])

    def _ok(self, r, allowed: tuple[int, ...] = (200,)) -> None:
        if r.status_code not in allowed:
            r.failure(f"HTTP {r.status_code}")

    # --- Public / root ------------------------------------------------------

    @task(12)
    def root(self):
        with self.client.get("/", catch_response=True, name="GET /") as r:
            self._ok(r, (200,))

    @task(22)
    def health(self):
        with self.client.get("/health", catch_response=True, name="GET /health") as r:
            self._ok(r, (200,))

    @task(3)
    def track_open_pixel(self):
        with self.client.get(
            "/track/open/locust-nonexistent-id",
            catch_response=True,
            name="GET /track/open/:id",
        ) as r:
            self._ok(r, (200,))

    @task(2)
    def track_click_redirect(self):
        with self.client.get(
            "/track/click/locust-nonexistent-id?url=https%3A%2F%2Fexample.com%2F",
            catch_response=True,
            name="GET /track/click/:id",
        ) as r:
            if r.status_code not in (200, 302, 404):
                r.failure(f"HTTP {r.status_code}")

    @task(1)
    def track_credentials_options(self):
        self.client.options(
            "/track/credentials",
            name="OPTIONS /track/credentials",
        )

    @task(1)
    def track_credentials_post_empty(self):
        with self.client.post(
            "/track/credentials",
            json={},
            catch_response=True,
            name="POST /track/credentials (validation)",
        ) as r:
            self._ok(r, (400,))

    @task(2)
    def whatsapp_public_click(self):
        with self.client.get(
            "/api/whatsapp-campaigns/click",
            catch_response=True,
            name="GET /api/whatsapp-campaigns/click",
        ) as r:
            if r.status_code >= 500:
                r.failure(f"HTTP {r.status_code}")

    # --- Authenticated user (LOCUST_BEARER_TOKEN) ---------------------------

    @task(5)
    def users_me(self):
        if not self.has_u:
            return
        with self.client.get("/api/users/me", headers=self.hu, catch_response=True, name="GET /api/users/me") as r:
            self._ok(r, (200,))

    @task(2)
    def users_me_learning(self):
        if not self.has_u:
            return
        with self.client.get(
            "/api/users/me/learning-progress",
            headers=self.hu,
            catch_response=True,
            name="GET /api/users/me/learning-progress",
        ) as r:
            self._ok(r, (200,))

    @task(2)
    def users_me_courses_progress(self):
        if not self.has_u:
            return
        with self.client.get(
            "/api/users/me/courses-progress",
            headers=self.hu,
            catch_response=True,
            name="GET /api/users/me/courses-progress",
        ) as r:
            self._ok(r, (200,))

    @task(2)
    def users_me_activity(self):
        if not self.has_u:
            return
        with self.client.get(
            "/api/users/me/activity",
            headers=self.hu,
            catch_response=True,
            name="GET /api/users/me/activity",
        ) as r:
            self._ok(r, (200,))

    @task(2)
    def users_me_remedial(self):
        if not self.has_u:
            return
        with self.client.get(
            "/api/users/me/remedial-assignments",
            headers=self.hu,
            catch_response=True,
            name="GET /api/users/me/remedial-assignments",
        ) as r:
            self._ok(r, (200,))

    @task(4)
    def courses_list(self):
        if not self.has_u:
            return
        with self.client.get("/api/courses", headers=self.hu, catch_response=True, name="GET /api/courses") as r:
            self._ok(r, (200,))

    @task(2)
    def course_by_id(self):
        if not self.has_u or not self.course_id:
            return
        with self.client.get(
            f"/api/courses/{self.course_id}",
            headers=self.hu,
            catch_response=True,
            name="GET /api/courses/:id",
        ) as r:
            self._ok(r, (200,))

    @task(2)
    def course_progress(self):
        if not self.has_u or not self.course_id:
            return
        with self.client.get(
            f"/api/courses/{self.course_id}/progress",
            headers=self.hu,
            catch_response=True,
            name="GET /api/courses/:id/progress",
        ) as r:
            self._ok(r, (200, 404))

    @task(1)
    def course_activity_email_status(self):
        if not self.has_u or not self.course_id:
            return
        with self.client.get(
            f"/api/courses/{self.course_id}/progress/activity-email-status",
            headers=self.hu,
            catch_response=True,
            name="GET /api/courses/:id/progress/activity-email-status",
        ) as r:
            self._ok(r, (200, 404))

    @task(1)
    def course_activity_wa_status(self):
        if not self.has_u or not self.course_id:
            return
        with self.client.get(
            f"/api/courses/{self.course_id}/progress/activity-whatsapp-status",
            headers=self.hu,
            catch_response=True,
            name="GET /api/courses/:id/progress/activity-whatsapp-status",
        ) as r:
            self._ok(r, (200, 404))

    @task(3)
    def leaderboard_global(self):
        if not self.has_u:
            return
        with self.client.get(
            "/api/leaderboard/global",
            headers=self.hu,
            catch_response=True,
            name="GET /api/leaderboard/global",
        ) as r:
            self._ok(r, (200,))

    @task(3)
    def leaderboard_org(self):
        if not self.has_u:
            return
        with self.client.get(
            "/api/leaderboard/organization",
            headers=self.hu,
            catch_response=True,
            name="GET /api/leaderboard/organization",
        ) as r:
            self._ok(r, (200, 400))

    @task(3)
    def certificates_list(self):
        if not self.has_u:
            return
        with self.client.get(
            "/api/certificates", headers=self.hu, catch_response=True, name="GET /api/certificates"
        ) as r:
            self._ok(r, (200,))

    @task(1)
    def certificate_by_course(self):
        if not self.has_u or not self.course_id:
            return
        with self.client.get(
            f"/api/certificates/course/{self.course_id}",
            headers=self.hu,
            catch_response=True,
            name="GET /api/certificates/course/:courseId",
        ) as r:
            if r.status_code not in (200, 404):
                r.failure(f"HTTP {r.status_code}")

    @task(1)
    def certificate_by_id(self):
        if not self.has_u or not self.certificate_id:
            return
        with self.client.get(
            f"/api/certificates/{self.certificate_id}",
            headers=self.hu,
            catch_response=True,
            name="GET /api/certificates/:certificateId",
        ) as r:
            if r.status_code not in (200, 404):
                r.failure(f"HTTP {r.status_code}")

    @task(3)
    def incidents_list(self):
        if not self.has_u:
            return
        with self.client.get(
            "/api/incidents", headers=self.hu, catch_response=True, name="GET /api/incidents"
        ) as r:
            self._ok(r, (200,))

    @task(1)
    def incident_by_id(self):
        if not self.has_u or not self.incident_id:
            return
        with self.client.get(
            f"/api/incidents/{self.incident_id}",
            headers=self.hu,
            catch_response=True,
            name="GET /api/incidents/:id",
        ) as r:
            if r.status_code not in (200, 404):
                r.failure(f"HTTP {r.status_code}")

    @task(3)
    def voice_phishing_list(self):
        if not self.has_u:
            return
        with self.client.get(
            "/api/voice-phishing",
            headers=self.hu,
            catch_response=True,
            name="GET /api/voice-phishing",
        ) as r:
            self._ok(r, (200,))

    @task(1)
    def voice_phishing_conversation(self):
        if not self.has_u or not self.conversation_id:
            return
        with self.client.get(
            f"/api/voice-phishing/{self.conversation_id}",
            headers=self.hu,
            catch_response=True,
            name="GET /api/voice-phishing/:conversationId",
        ) as r:
            if r.status_code not in (200, 404):
                r.failure(f"HTTP {r.status_code}")

    @task(2)
    def voice_phishing_analytics(self):
        if not self.has_u:
            return
        with self.client.get(
            "/api/voice-phishing/analytics/overview",
            headers=self.hu,
            catch_response=True,
            name="GET /api/voice-phishing/analytics/overview",
        ) as r:
            self._ok(r, (200,))

    @task(2)
    def email_campaigns_list(self):
        if not self.has_u:
            return
        with self.client.get(
            "/api/email-campaigns",
            headers=self.hu,
            catch_response=True,
            name="GET /api/email-campaigns",
        ) as r:
            self._ok(r, (200,))

    @task(2)
    def whatsapp_campaigns_list_user(self):
        if not self.has_u:
            return
        with self.client.get(
            "/api/whatsapp-campaigns",
            headers=self.hu,
            catch_response=True,
            name="GET /api/whatsapp-campaigns (user token)",
        ) as r:
            self._ok(r, (200,))

    # --- Client admin (LOCUST_CLIENT_ADMIN_TOKEN) ---------------------------

    @task(2)
    def admin_email_templates(self):
        if not self.has_a:
            return
        with self.client.get(
            "/api/email-templates",
            headers=self.ha,
            catch_response=True,
            name="GET /api/email-templates",
        ) as r:
            self._ok(r, (200,))

    @task(1)
    def admin_email_template_by_id(self):
        if not self.has_a or not self.email_template_id:
            return
        with self.client.get(
            f"/api/email-templates/{self.email_template_id}",
            headers=self.ha,
            catch_response=True,
            name="GET /api/email-templates/:templateId",
        ) as r:
            if r.status_code not in (200, 404):
                r.failure(f"HTTP {r.status_code}")

    @task(2)
    def admin_whatsapp_templates(self):
        if not self.has_a:
            return
        with self.client.get(
            "/api/whatsapp-templates",
            headers=self.ha,
            catch_response=True,
            name="GET /api/whatsapp-templates",
        ) as r:
            self._ok(r, (200,))

    @task(1)
    def admin_whatsapp_template_by_id(self):
        if not self.has_a or not self.wa_template_id:
            return
        with self.client.get(
            f"/api/whatsapp-templates/{self.wa_template_id}",
            headers=self.ha,
            catch_response=True,
            name="GET /api/whatsapp-templates/:templateId",
        ) as r:
            if r.status_code not in (200, 404):
                r.failure(f"HTTP {r.status_code}")

    @task(2)
    def admin_campaigns_list(self):
        if not self.has_a:
            return
        with self.client.get(
            "/api/campaigns", headers=self.ha, catch_response=True, name="GET /api/campaigns"
        ) as r:
            self._ok(r, (200,))

    @task(1)
    def admin_campaign_by_id(self):
        if not self.has_a or not self.email_campaign_id:
            return
        with self.client.get(
            f"/api/campaigns/{self.email_campaign_id}",
            headers=self.ha,
            catch_response=True,
            name="GET /api/campaigns/:campaignId",
        ) as r:
            if r.status_code not in (200, 404):
                r.failure(f"HTTP {r.status_code}")

    @task(1)
    def admin_campaign_analytics(self):
        if not self.has_a or not self.email_campaign_id:
            return
        with self.client.get(
            f"/api/campaigns/{self.email_campaign_id}/analytics",
            headers=self.ha,
            catch_response=True,
            name="GET /api/campaigns/:campaignId/analytics",
        ) as r:
            if r.status_code not in (200, 404):
                r.failure(f"HTTP {r.status_code}")

    @task(1)
    def admin_whatsapp_campaign_by_id(self):
        if not self.has_a or not self.wa_campaign_id:
            return
        with self.client.get(
            f"/api/whatsapp-campaigns/{self.wa_campaign_id}",
            headers=self.ha,
            catch_response=True,
            name="GET /api/whatsapp-campaigns/:campaignId",
        ) as r:
            if r.status_code not in (200, 404):
                r.failure(f"HTTP {r.status_code}")

    @task(1)
    def admin_whatsapp_campaign_analytics(self):
        if not self.has_a or not self.wa_campaign_id:
            return
        with self.client.get(
            f"/api/whatsapp-campaigns/{self.wa_campaign_id}/analytics",
            headers=self.ha,
            catch_response=True,
            name="GET /api/whatsapp-campaigns/:campaignId/analytics",
        ) as r:
            if r.status_code not in (200, 404):
                r.failure(f"HTTP {r.status_code}")

    @task(2)
    def admin_voice_template_defaults(self):
        if not self.has_a:
            return
        with self.client.get(
            "/api/voice-phishing-templates/defaults",
            headers=self.ha,
            catch_response=True,
            name="GET /api/voice-phishing-templates/defaults",
        ) as r:
            self._ok(r, (200,))

    @task(1)
    def admin_voice_templates_list(self):
        if not self.has_a:
            return
        with self.client.get(
            "/api/voice-phishing-templates",
            headers=self.ha,
            catch_response=True,
            name="GET /api/voice-phishing-templates",
        ) as r:
            self._ok(r, (200,))

    @task(1)
    def admin_voice_template_by_id(self):
        if not self.has_a or not self.voice_template_id:
            return
        with self.client.get(
            f"/api/voice-phishing-templates/{self.voice_template_id}",
            headers=self.ha,
            catch_response=True,
            name="GET /api/voice-phishing-templates/:templateId",
        ) as r:
            if r.status_code not in (200, 404):
                r.failure(f"HTTP {r.status_code}")

    @task(2)
    def admin_reports_list(self):
        if not self.has_a:
            return
        with self.client.get(
            "/api/reports", headers=self.ha, catch_response=True, name="GET /api/reports"
        ) as r:
            self._ok(r, (200,))

    @task(1)
    def admin_report_download(self):
        if not self.has_a or not self.report_id:
            return
        with self.client.get(
            f"/api/reports/{self.report_id}/download",
            headers=self.ha,
            catch_response=True,
            name="GET /api/reports/:reportId/download",
        ) as r:
            if r.status_code not in (200, 403, 404):
                r.failure(f"HTTP {r.status_code}")

    @task(1)
    def admin_users_all(self):
        """Heavy list — low frequency; any authenticated user per route definition."""
        if not self.has_a:
            return
        with self.client.get(
            "/api/users/all",
            headers=self.ha,
            catch_response=True,
            name="GET /api/users/all",
        ) as r:
            self._ok(r, (200,))

    @task(2)
    def org_users(self):
        if not self.has_a or not self.org_id:
            return
        with self.client.get(
            f"/api/orgs/{self.org_id}/users",
            headers=self.ha,
            catch_response=True,
            name="GET /api/orgs/:orgId/users",
        ) as r:
            if r.status_code not in (200, 403):
                r.failure(f"HTTP {r.status_code}")

    @task(1)
    def org_invites(self):
        if not self.has_a or not self.org_id:
            return
        with self.client.get(
            f"/api/orgs/{self.org_id}/invites",
            headers=self.ha,
            catch_response=True,
            name="GET /api/orgs/:orgId/invites",
        ) as r:
            if r.status_code not in (200, 403):
                r.failure(f"HTTP {r.status_code}")

    @task(1)
    def org_certificates_count(self):
        if not self.has_a or not self.org_id:
            return
        with self.client.get(
            f"/api/orgs/{self.org_id}/certificates/count",
            headers=self.ha,
            catch_response=True,
            name="GET /api/orgs/:orgId/certificates/count",
        ) as r:
            if r.status_code not in (200, 403):
                r.failure(f"HTTP {r.status_code}")

    # --- System admin (LOCUST_SYSTEM_ADMIN_TOKEN) -----------------------------

    @task(1)
    def sys_admin_orgs(self):
        if not self.has_s:
            return
        with self.client.get(
            "/api/admins/orgs", headers=self.hs, catch_response=True, name="GET /api/admins/orgs"
        ) as r:
            self._ok(r, (200,))

    @task(1)
    def sys_admin_pending_invitations(self):
        if not self.has_s:
            return
        with self.client.get(
            "/api/admins/pending-invitations",
            headers=self.hs,
            catch_response=True,
            name="GET /api/admins/pending-invitations",
        ) as r:
            self._ok(r, (200,))

    @task(1)
    def sys_certificates_non_affiliated_count(self):
        if not self.has_s:
            return
        with self.client.get(
            "/api/certificates/count/non-affiliated",
            headers=self.hs,
            catch_response=True,
            name="GET /api/certificates/count/non-affiliated",
        ) as r:
            self._ok(r, (200,))

    # --- Optional: Cloudinary-backed (off by default; use low UI user count) -

    @task(1)
    def upload_subtitles_status_placeholder(self):
        if os.environ.get("LOCUST_HIT_UPLOAD_SUBTITLES") != "1" or not self.has_u:
            return
        pid = (os.environ.get("LOCUST_SUBTITLE_PUBLIC_ID") or "locust-no-such-video").strip()
        with self.client.get(
            f"/api/upload/subtitles/status/{pid}",
            headers=self.hu,
            catch_response=True,
            name="GET /api/upload/subtitles/status/:publicId",
            timeout=45,
        ) as r:
            if r.status_code >= 500:
                r.failure(f"HTTP {r.status_code}")

    # --- Optional: heavy ML / LLM (off by default; use very few users if on) --

    @task(1)
    def heavy_chat_message(self):
        if os.environ.get("LOCUST_ENABLE_HEAVY") != "1" or not self.has_u:
            return
        with self.client.post(
            "/api/chat/message",
            headers={**self.hu, "Content-Type": "application/json"},
            json={"message": "What is phishing? (Locust load test one line.)"},
            catch_response=True,
            name="POST /api/chat/message [HEAVY]",
            timeout=120,
        ) as r:
            if r.status_code not in (200, 429, 500, 502, 503):
                r.failure(f"HTTP {r.status_code}")

    @task(1)
    def heavy_incidents_analyze(self):
        if os.environ.get("LOCUST_ENABLE_HEAVY") != "1" or not self.has_u:
            return
        with self.client.post(
            "/api/incidents/analyze",
            headers={**self.hu, "Content-Type": "application/json"},
            json={
                "messageType": "email",
                "message": "Verify your account at http://example.com",
                "subject": "Locust",
                "from": "a@b.com",
                "urls": ["http://example.com"],
                "date": "2026-01-01T00:00:00.000Z",
            },
            catch_response=True,
            name="POST /api/incidents/analyze [HEAVY]",
            timeout=120,
        ) as r:
            if r.status_code not in (200, 400, 429, 500, 502, 503):
                r.failure(f"HTTP {r.status_code}")
