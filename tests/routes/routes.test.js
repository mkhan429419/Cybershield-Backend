const path = require("path");
const express = require("express");
const request = require("supertest");

const backendPath = (...parts) => path.join(process.cwd(), ...parts);

const passthrough = (req, res, next) => next();

function buildAuthMock() {
  return {
    requireAuth: (req, res, next) => {
      req.auth = { userId: "test-clerk-user" };
      next();
    },
    getUserData: (req, res, next) => {
      req.user = {
        _id: "507f1f77bcf86cd799439011",
        role: "system_admin",
        orgId: "507f1f77bcf86cd799439012",
      };
      next();
    },
    requireRole: () => passthrough,
    requireOrgAccess: passthrough,
  };
}

function buildControllerMock(handlerNames, middlewareNames = []) {
  const mock = {};

  for (const name of handlerNames) {
    mock[name] = (req, res) => {
      res.status(200).json({
        handler: name,
        method: req.method,
        path: req.path,
        params: req.params,
      });
    };
  }

  for (const name of middlewareNames) {
    mock[name] = passthrough;
  }

  return mock;
}

function buildMulterMock() {
  const multer = jest.fn(() => ({
    single: () => passthrough,
  }));

  multer.memoryStorage = jest.fn(() => ({}));
  return multer;
}

function createAppWithRouter(routeModuleRelPath, controllerModuleRelPath, handlerNames, options = {}) {
  jest.resetModules();
  jest.doMock(backendPath("src", "middleware", "auth.js"), () => buildAuthMock());

  if (controllerModuleRelPath) {
    jest.doMock(
      backendPath(...controllerModuleRelPath.split("/")),
      () => buildControllerMock(handlerNames, options.controllerMiddlewareNames || [])
    );
  }

  if (options.mockMulter) {
    jest.doMock("multer", () => buildMulterMock());
  }

  if (options.extraMocks) {
    for (const [moduleName, factory] of Object.entries(options.extraMocks)) {
      jest.doMock(moduleName, factory);
    }
  }

  let router;
  jest.isolateModules(() => {
    router = require(backendPath(...routeModuleRelPath.split("/")));
  });

  const app = express();
  app.use(express.json());
  app.use("/", router);
  return app;
}

const routeSuites = [
  {
    name: "admin routes",
    route: "src/routes/admin.js",
    controller: "src/controllers/adminController.js",
    handlers: [
      "inviteClientAdmin",
      "getOrganizations",
      "syncUsersFromClerk",
      "activateUser",
      "createOrganization",
      "updateOrganization",
      "getPendingInvitations",
      "revokeInvitation",
    ],
    cases: [
      ["post", "/invite-client", "inviteClientAdmin"],
      ["get", "/orgs", "getOrganizations"],
      ["get", "/sync-users", "syncUsersFromClerk"],
      ["post", "/activate-user", "activateUser"],
      ["post", "/create-org", "createOrganization"],
      ["put", "/orgs/org-1", "updateOrganization"],
      ["get", "/pending-invitations", "getPendingInvitations"],
      ["delete", "/revoke-invitation/inv-1", "revokeInvitation"],
    ],
  },
  {
    name: "campaign routes",
    route: "src/routes/campaigns.js",
    controller: "src/controllers/campaignController.js",
    handlers: [
      "createCampaign",
      "getCampaigns",
      "getCampaign",
      "updateCampaign",
      "deleteCampaign",
      "startCampaign",
      "pauseCampaign",
      "resumeCampaign",
      "cancelCampaign",
      "getCampaignAnalytics",
    ],
    cases: [
      ["post", "/", "createCampaign"],
      ["get", "/", "getCampaigns"],
      ["get", "/cmp-1", "getCampaign"],
      ["put", "/cmp-1", "updateCampaign"],
      ["delete", "/cmp-1", "deleteCampaign"],
      ["post", "/cmp-1/start", "startCampaign"],
      ["post", "/cmp-1/pause", "pauseCampaign"],
      ["post", "/cmp-1/resume", "resumeCampaign"],
      ["post", "/cmp-1/cancel", "cancelCampaign"],
      ["get", "/cmp-1/analytics", "getCampaignAnalytics"],
    ],
  },
  {
    name: "certificate routes",
    route: "src/routes/certificates.js",
    controller: "src/controllers/certificateController.js",
    handlers: [
      "generateCertificate",
      "getUserCertificates",
      "getCertificateById",
      "getCertificateByCourse",
      "getNonAffiliatedCertificateCount",
    ],
    cases: [
      ["get", "/", "getUserCertificates"],
      ["get", "/course/course-1", "getCertificateByCourse"],
      ["get", "/count/non-affiliated", "getNonAffiliatedCertificateCount"],
      ["get", "/cert-1", "getCertificateById"],
      ["post", "/generate/course-1", "generateCertificate"],
    ],
  },
  {
    name: "chat routes",
    route: "src/routes/chat.js",
    controller: "src/controllers/chatController.js",
    handlers: ["sendMessage"],
    cases: [["post", "/message", "sendMessage"]],
  },
  {
    name: "course routes",
    route: "src/routes/courses.js",
    controller: "src/controllers/courseController.js",
    handlers: [
      "getCourses",
      "getCourseById",
      "createCourse",
      "updateCourse",
      "deleteCourse",
      "getProgress",
      "getActivityEmailStatus",
      "getActivityWhatsAppStatus",
      "recordActivityResult",
      "activityRetry",
      "markComplete",
      "unmarkComplete",
      "sendActivityEmail",
      "sendActivityWhatsApp",
    ],
    cases: [
      ["get", "/", "getCourses"],
      ["get", "/course-1/progress/activity-email-status", "getActivityEmailStatus"],
      ["get", "/course-1/progress/activity-whatsapp-status", "getActivityWhatsAppStatus"],
      ["post", "/course-1/progress/activity-result", "recordActivityResult"],
      ["post", "/course-1/progress/activity-retry", "activityRetry"],
      ["get", "/course-1/progress", "getProgress"],
      ["post", "/course-1/progress", "markComplete"],
      ["delete", "/course-1/progress", "unmarkComplete"],
      ["post", "/course-1/activity/send-email", "sendActivityEmail"],
      ["post", "/course-1/activity/send-whatsapp", "sendActivityWhatsApp"],
      ["get", "/course-1", "getCourseById"],
      ["put", "/course-1", "updateCourse"],
      ["delete", "/course-1", "deleteCourse"],
      ["post", "/", "createCourse"],
    ],
  },
  {
    name: "email routes",
    route: "src/routes/email.js",
    controller: "src/controllers/emailController.js",
    handlers: ["sendEmail", "getEmails"],
    cases: [
      ["get", "/", "getEmails"],
      ["post", "/send", "sendEmail"],
    ],
  },
  {
    name: "email template routes",
    route: "src/routes/emailTemplates.js",
    controller: "src/controllers/emailTemplateController.js",
    handlers: [
      "getEmailTemplates",
      "createCustomEmailTemplate",
      "getEmailTemplate",
      "createEmailTemplate",
    ],
    cases: [
      ["get", "/", "getEmailTemplates"],
      ["post", "/custom", "createCustomEmailTemplate"],
      ["get", "/template-1", "getEmailTemplate"],
      ["post", "/", "createEmailTemplate"],
    ],
  },
  {
    name: "incident routes",
    route: "src/routes/incidents.js",
    controller: "src/controllers/incidentController.js",
    handlers: ["analyzeIncident", "getIncidents", "getIncidentById"],
    cases: [
      ["post", "/analyze", "analyzeIncident"],
      ["get", "/", "getIncidents"],
      ["get", "/incident-1", "getIncidentById"],
    ],
  },
  {
    name: "leaderboard routes",
    route: "src/routes/leaderboard.js",
    controller: "src/controllers/leaderboardController.js",
    handlers: ["getGlobalLeaderboard", "getOrganizationLeaderboard"],
    cases: [
      ["get", "/global", "getGlobalLeaderboard"],
      ["get", "/organization", "getOrganizationLeaderboard"],
    ],
  },
  {
    name: "organization routes",
    route: "src/routes/orgs.js",
    controller: "src/controllers/orgController.js",
    handlers: [
      "bulkInviteUsers",
      "inviteSingleUser",
      "getInviteStatus",
      "getOrgUsers",
      "getOrgCertificateCount",
    ],
    cases: [
      ["post", "/org-1/bulk-invite", "bulkInviteUsers"],
      ["post", "/org-1/invite", "inviteSingleUser"],
      ["get", "/org-1/invites", "getInviteStatus"],
      ["get", "/org-1/users", "getOrgUsers"],
      ["get", "/org-1/certificates/count", "getOrgCertificateCount"],
    ],
    options: { mockMulter: true },
  },
  {
    name: "report routes",
    route: "src/routes/reports.js",
    controller: "src/controllers/reportController.js",
    handlers: ["createReport", "getUserReports", "downloadReport"],
    cases: [
      ["post", "/", "createReport"],
      ["get", "/", "getUserReports"],
      ["get", "/report-1/download", "downloadReport"],
    ],
    options: { controllerMiddlewareNames: ["uploadMiddleware"] },
  },
  {
    name: "user routes",
    route: "src/routes/users.js",
    controller: "src/controllers/userController.js",
    handlers: [
      "getUserProfile",
      "getLearningProgress",
      "getCoursesProgress",
      "getUserActivity",
      "getAllUsers",
      "updateProfile",
      "getMyRemedialAssignments",
    ],
    cases: [
      ["get", "/me", "getUserProfile"],
      ["get", "/me/learning-progress", "getLearningProgress"],
      ["get", "/me/courses-progress", "getCoursesProgress"],
      ["get", "/me/activity", "getUserActivity"],
      ["get", "/me/remedial-assignments", "getMyRemedialAssignments"],
      ["patch", "/me", "updateProfile"],
      ["get", "/all", "getAllUsers"],
    ],
  },
  {
    name: "voice phishing routes",
    route: "src/routes/voicePhishing.js",
    controller: "src/controllers/voicePhishingController.js",
    handlers: [
      "initiateConversation",
      "updateTranscript",
      "endConversation",
      "getConversations",
      "getConversationAnalytics",
      "getConversation",
    ],
    cases: [
      ["post", "/initiate", "initiateConversation"],
      ["post", "/conversation-1/transcript", "updateTranscript"],
      ["post", "/conversation-1/end", "endConversation"],
      ["get", "/", "getConversations"],
      ["get", "/analytics/overview", "getConversationAnalytics"],
      ["get", "/conversation-1", "getConversation"],
    ],
  },
  {
    name: "voice phishing template routes",
    route: "src/routes/voicePhishingTemplates.js",
    controller: "src/controllers/voicePhishingTemplateController.js",
    handlers: [
      "getDefaultScenarios",
      "getTemplates",
      "getTemplate",
      "createTemplate",
      "updateTemplate",
      "deleteTemplate",
    ],
    cases: [
      ["get", "/defaults", "getDefaultScenarios"],
      ["get", "/", "getTemplates"],
      ["get", "/template-1", "getTemplate"],
      ["post", "/", "createTemplate"],
      ["put", "/template-1", "updateTemplate"],
      ["delete", "/template-1", "deleteTemplate"],
    ],
  },
  {
    name: "whatsapp campaign routes",
    route: "src/routes/whatsappCampaigns.js",
    controller: "src/controllers/whatsappCampaignController.js",
    handlers: [
      "createCampaign",
      "getCampaigns",
      "getCampaign",
      "startCampaign",
      "updateCampaign",
      "deleteCampaign",
      "getCampaignAnalytics",
      "handleTwilioWebhook",
      "recordClick",
    ],
    cases: [
      ["post", "/", "createCampaign"],
      ["get", "/", "getCampaigns"],
      ["get", "/click", "recordClick"],
      ["post", "/webhook", "handleTwilioWebhook"],
      ["get", "/campaign-1", "getCampaign"],
      ["put", "/campaign-1", "updateCampaign"],
      ["delete", "/campaign-1", "deleteCampaign"],
      ["post", "/campaign-1/start", "startCampaign"],
      ["get", "/campaign-1/analytics", "getCampaignAnalytics"],
    ],
  },
  {
    name: "whatsapp template routes",
    route: "src/routes/whatsAppTemplates.js",
    controller: "src/controllers/whatsAppTemplateController.js",
    handlers: [
      "getWhatsAppTemplates",
      "createCustomWhatsAppTemplate",
      "getWhatsAppTemplate",
      "createWhatsAppTemplate",
    ],
    cases: [
      ["get", "/", "getWhatsAppTemplates"],
      ["post", "/custom", "createCustomWhatsAppTemplate"],
      ["get", "/template-1", "getWhatsAppTemplate"],
      ["post", "/", "createWhatsAppTemplate"],
    ],
  },
];

describe("Controller-backed route modules", () => {
  for (const suite of routeSuites) {
    describe(suite.name, () => {
      let app;

      beforeAll(() => {
        app = createAppWithRouter(
          suite.route,
          suite.controller,
          suite.handlers,
          suite.options || {}
        );
      });

      it.each(suite.cases)("%s %s -> %s", async (method, url, handler) => {
        const response = await request(app)[method](url);

        expect(response.status).toBe(200);
        expect(response.body.handler).toBe(handler);
      });
    });
  }
});

describe("Upload route module", () => {
  const transcriptResource = jest.fn();
  const transcriptUrl = jest.fn(() => "https://cloudinary.example/transcript.txt");
  const axiosGet = jest.fn();
  const youtubeService = {
    isReady: jest.fn(() => false),
    uploadVideo: jest.fn(),
  };

  let app;

  beforeAll(() => {
    app = createAppWithRouter("src/routes/upload.js", null, [], {
      mockMulter: true,
      extraMocks: {
        cloudinary: () => ({
          v2: {
            config: jest.fn(),
            uploader: {
              upload_stream: jest.fn((options, callback) => ({
                end: () => callback(null, { secure_url: "https://image.example", public_id: "public-id" }),
              })),
            },
            api: { resource: transcriptResource },
            url: transcriptUrl,
          },
        }),
        axios: () => ({ get: axiosGet }),
        [backendPath("src", "services", "youtubeService.js")]: () => youtubeService,
      },
    });
  });

  beforeEach(() => {
    transcriptResource.mockReset();
    transcriptUrl.mockClear();
    axiosGet.mockReset();
    youtubeService.isReady.mockClear();
    youtubeService.uploadVideo.mockClear();
  });

  it("POST / returns 400 when no file is uploaded", async () => {
    const response = await request(app).post("/");

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("No file uploaded");
  });

  it("GET /subtitles/status/:publicId returns 404 when transcript is not ready", async () => {
    transcriptResource
      .mockRejectedValueOnce({ http_code: 404, message: "not found" })
      .mockRejectedValueOnce({ http_code: 404, message: "video not found" });

    const response = await request(app).get("/subtitles/status/video-123");

    expect(response.status).toBe(404);
    expect(response.body.ready).toBe(false);
  });

  it("GET /subtitles/:publicId returns WebVTT content when transcript is available", async () => {
    transcriptResource.mockResolvedValueOnce({
      bytes: 128,
      format: "txt",
      created_at: new Date().toISOString(),
    });
    axiosGet.mockResolvedValueOnce({
      data: JSON.stringify([{ start: 0, end: 2.5, text: "Hello world" }]),
    });

    const response = await request(app).get("/subtitles/video-123");

    expect(response.status).toBe(200);
    expect(response.text).toContain("WEBVTT");
    expect(response.text).toContain("Hello world");
    expect(transcriptUrl).toHaveBeenCalled();
  });
});
