const { clerkClient } = require('@clerk/clerk-sdk-node');
const User = require('../models/User');
const { transformBadgesFromLabels } = require('../utils/badgeMapping');
const { isEligibleForEmailRiskScoring, computeEmailRiskScore } = require('../services/emailRiskScoreService');
const { isEligibleForWhatsAppRiskScoring, computeWhatsAppRiskScore } = require('../services/whatsappRiskScoreService');
const { isEligibleForLmsRiskScoring, computeLmsRiskScore } = require('../services/lmsRiskScoreService');
const { getRemedialAssignmentsForUser, ensureRemedialAssignments } = require('../services/remedialAssignmentService');
const { updateUserCombinedLearningScore, computeCombinedLearningScore } = require('../services/combinedLearningScoreService');

// GET /api/users/me/learning-progress
// Get course completion progress over time (weekly data for last 8 weeks)
const getLearningProgress = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const Certificate = require('../models/Certificate');
    
    // Get all certificates for the user, sorted by completion date
    const certificates = await Certificate.find({ user: userId })
      .select('completionDate')
      .sort({ completionDate: 1 })
      .lean();

    // Calculate last 8 weeks from today (including current week)
    const now = new Date();
    const weeks = [];
    
    // Get the start of the current week (Sunday)
    const currentWeekStart = new Date(now);
    const dayOfWeek = currentWeekStart.getDay(); // 0 = Sunday, 6 = Saturday
    currentWeekStart.setDate(currentWeekStart.getDate() - dayOfWeek);
    currentWeekStart.setHours(0, 0, 0, 0);
    
    // Generate 8 weeks going back from current week
    for (let i = 7; i >= 0; i--) {
      const weekStart = new Date(currentWeekStart);
      weekStart.setDate(weekStart.getDate() - (i * 7));
      
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);
      
      weeks.push({
        weekNumber: 8 - i,
        start: weekStart,
        end: weekEnd,
      });
    }

    // Count completions per week
    const weeklyData = weeks.map((week, index) => {
      const completionsInWeek = certificates.filter(cert => {
        const completionDate = new Date(cert.completionDate);
        return completionDate >= week.start && completionDate <= week.end;
      }).length;
      
      // Cumulative count up to this week
      const cumulativeCount = certificates.filter(cert => {
        const completionDate = new Date(cert.completionDate);
        return completionDate <= week.end;
      }).length;
      
      return {
        week: `Week ${week.weekNumber}`,
        weekNumber: week.weekNumber,
        completions: completionsInWeek,
        cumulative: cumulativeCount,
      };
    });

    res.json({
      success: true,
      data: weeklyData,
      totalCompletions: certificates.length,
    });
  } catch (error) {
    console.error('Error fetching learning progress:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch learning progress' });
  }
};

// GET /api/users/me/courses-progress
// Get course progress data for all user's courses
const getCoursesProgress = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const user = req.user;
    const Course = require('../models/Course');
    const CourseProgress = require('../models/CourseProgress');
    const { getCourseFilterForUser, getTotalSubmodulesForCourse } = require('../services/lmsRiskScoreService');

    // Get course filter based on user role
    const filter = getCourseFilterForUser(user);
    if (!filter) {
      return res.json({
        success: true,
        courses: [],
        totalCompleted: 0,
      });
    }

    // Get all courses the user has access to
    const courses = await Course.find(filter)
      .select('_id courseTitle description modules')
      .lean();

    // Get all progress records for this user
    const progressRecords = await CourseProgress.find({ user: userId })
      .select('course completed')
      .lean();

    // Create a map of courseId -> progress
    const progressMap = new Map();
    progressRecords.forEach(progress => {
      const courseId = progress.course?.toString() || progress.course;
      if (courseId) {
        progressMap.set(courseId, progress.completed || []);
      }
    });

    // Calculate progress for each course
    const coursesWithProgress = courses.map(course => {
      const courseId = course._id.toString();
      const completed = progressMap.get(courseId) || [];
      const completedSet = new Set(completed);

      // Calculate total submodules
      const totalSubmodules = getTotalSubmodulesForCourse(course);
      const completedCount = completed.length;
      const progressPercent = totalSubmodules > 0 
        ? Math.round((completedCount / totalSubmodules) * 100)
        : 0;

      // Count modules completed (a module is complete if all its sections, quiz, and activity are done)
      const modules = course.modules || [];
      let modulesCompleted = 0;
      
      modules.forEach((module, modIdx) => {
        const sections = module.sections || [];
        const hasQuiz = (module.quiz || []).length > 0;
        const hasActivity = !!module.activityType;
        
        // Check if all sections are completed
        const allSectionsCompleted = sections.every((_, secIdx) => 
          completedSet.has(`${modIdx}-${secIdx}`)
        );
        
        // Check if quiz is completed (if exists)
        const quizCompleted = !hasQuiz || completedSet.has(`${modIdx}-quiz`);
        
        // Check if activity is completed (if exists)
        const activityCompleted = !hasActivity || completedSet.has(`${modIdx}-activity`);
        
        // Module is complete if all parts are done
        if (allSectionsCompleted && quizCompleted && activityCompleted) {
          modulesCompleted++;
        }
      });

      return {
        _id: course._id,
        courseTitle: course.courseTitle,
        description: course.description,
        totalModules: modules.length,
        modulesCompleted,
        completedSubmodules: completedCount,
        totalSubmodules,
        progressPercent,
        isCompleted: progressPercent === 100,
      };
    });

    // Sort by progress (completed first, then by progress percentage)
    coursesWithProgress.sort((a, b) => {
      if (a.isCompleted && !b.isCompleted) return -1;
      if (!a.isCompleted && b.isCompleted) return 1;
      return b.progressPercent - a.progressPercent;
    });

    const totalCompleted = coursesWithProgress.filter(c => c.isCompleted).length;

    res.json({
      success: true,
      courses: coursesWithProgress,
      totalCompleted,
      totalCourses: coursesWithProgress.length,
    });
  } catch (error) {
    console.error('Error fetching courses progress:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch courses progress' });
  }
};

// GET /api/users/me/activity
// Get user activity feed (course completions, quiz passes, badge earnings, etc.)
const getUserActivity = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const Certificate = require('../models/Certificate');
    const CourseProgress = require('../models/CourseProgress');
    const Course = require('../models/Course');
    const { getTotalSubmodulesForCourse } = require('../services/lmsRiskScoreService');
    const { getBadgeLabel } = require('../utils/badgeMapping');

    const activities = [];

    // 1. Get course completions (from certificates)
    const certificates = await Certificate.find({ user: userId })
      .populate('course', 'courseTitle modules')
      .sort({ completionDate: -1 })
      .limit(20)
      .lean();

    // Process certificates with progress data
    for (const cert of certificates) {
      if (!cert.completionDate || !cert.course) continue;

      try {
        const progress = await CourseProgress.findOne({ 
          user: userId, 
          course: cert.course._id || cert.course 
        }).lean();

        let score = 100;
        if (progress && cert.course.modules) {
          const totalSubmodules = getTotalSubmodulesForCourse(cert.course);
          const completedCount = (progress.completed || []).length;
          score = totalSubmodules > 0 
            ? Math.round((completedCount / totalSubmodules) * 100)
            : 100;
        }

        const courseTitle = cert.courseTitle || (cert.course.courseTitle) || 'Course';
        activities.push({
          type: 'course_completed',
          title: `${courseTitle} course completed - ${score}% score`,
          date: cert.completionDate,
          icon: 'Award',
          iconColor: 'text-[var(--success-green)]',
        });
      } catch (err) {
        // Fallback if progress not found
        const courseTitle = cert.courseTitle || (cert.course?.courseTitle) || 'Course';
        activities.push({
          type: 'course_completed',
          title: `${courseTitle} course completed - 100% score`,
          date: cert.completionDate,
          icon: 'Award',
          iconColor: 'text-[var(--success-green)]',
        });
      }
    }

    // 2. Get quiz completions and course starts (from course progress)
    const progressRecords = await CourseProgress.find({ user: userId })
      .populate('course', 'courseTitle modules')
      .sort({ updatedAt: -1 })
      .lean();

    const processedQuizzes = new Set(); // Track processed quizzes to avoid duplicates
    const processedStarts = new Set(); // Track processed course starts

    for (const progress of progressRecords) {
      if (!progress.course) continue;

      const completed = new Set(progress.completed || []);
      const modules = progress.course.modules || [];
      const courseTitle = progress.course.courseTitle || 'Course';
      const courseId = progress.course._id?.toString() || progress.course.toString();

      // Check for quiz completions
      modules.forEach((module, modIdx) => {
        const hasQuiz = (module.quiz || []).length > 0;
        const quizId = `${courseId}-${modIdx}-quiz`;
        
        if (hasQuiz && completed.has(`${modIdx}-quiz`) && !processedQuizzes.has(quizId)) {
          processedQuizzes.add(quizId);
          activities.push({
            type: 'quiz_passed',
            title: `Passed ${courseTitle} quiz`,
            date: progress.updatedAt || progress.createdAt,
            icon: 'Shield',
            iconColor: 'text-[var(--success-green)]',
          });
        }
      });

      // Check for course starts (first submodule completed)
      if (progress.completed && progress.completed.length > 0 && !processedStarts.has(courseId)) {
        // Check if this is among the first few completions (within first week of starting)
        const firstCompletionDate = progress.createdAt;
        const daysSinceStart = (Date.now() - new Date(firstCompletionDate).getTime()) / (1000 * 60 * 60 * 24);
        
        if (daysSinceStart <= 7 && progress.completed.length <= 3) {
          processedStarts.add(courseId);
          // Only add if course is not already completed (to avoid duplicate with certificate)
          const isCompleted = certificates.some(c => 
            (c.course?._id?.toString() || c.course?.toString()) === courseId
          );
          if (!isCompleted) {
            activities.push({
              type: 'course_started',
              title: `Started ${courseTitle} course`,
              date: firstCompletionDate,
              icon: 'BookOpen',
              iconColor: 'text-[var(--neon-blue)]',
            });
          }
        }
      }
    }

    // 3. Get badge earnings (inferred from course completions with badges)
    const user = await User.findById(userId).select('badges').lean();
    if (user && user.badges && Array.isArray(user.badges)) {
      for (const cert of certificates) {
        if (!cert.course || !cert.completionDate) continue;
        
        try {
          const courseId = cert.course._id || cert.course;
          const course = await Course.findById(courseId).select('badges').lean();
          
          if (course && course.badges && Array.isArray(course.badges)) {
            for (const badgeId of course.badges) {
              const badgeLabel = getBadgeLabel(badgeId);
              if (badgeLabel && user.badges.includes(badgeLabel)) {
                activities.push({
                  type: 'badge_earned',
                  title: `Earned '${badgeLabel}' badge`,
                  date: cert.completionDate,
                  icon: 'Award',
                  iconColor: 'text-[var(--neon-blue)]',
                });
              }
            }
          }
        } catch (err) {
          // Skip if course not found
          continue;
        }
      }
    }

    // Sort all activities by date (most recent first)
    activities.sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      return dateB - dateA;
    });

    // Remove duplicates (same type, title, and date within 1 hour)
    const uniqueActivities = [];
    const seen = new Set();
    for (const activity of activities) {
      const key = `${activity.type}-${activity.title}-${new Date(activity.date).toISOString().split('T')[0]}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueActivities.push(activity);
      }
    }

    // Limit to most recent 20 activities
    const recentActivities = uniqueActivities.slice(0, 20);

    // Calculate activity growth (compare this month vs last month)
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

    const thisMonthCount = recentActivities.filter(a => new Date(a.date) >= thisMonthStart).length;
    const lastMonthCount = recentActivities.filter(a => {
      const date = new Date(a.date);
      return date >= lastMonthStart && date <= lastMonthEnd;
    }).length;

    const growthPercent = lastMonthCount > 0 
      ? Math.round(((thisMonthCount - lastMonthCount) / lastMonthCount) * 100)
      : thisMonthCount > 0 ? 100 : 0;

    res.json({
      success: true,
      activities: recentActivities,
      growthPercent,
      thisMonthCount,
      lastMonthCount,
    });
  } catch (error) {
    console.error('Error fetching user activity:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch user activity' });
  }
};

// GET /api/users/me
const getUserProfile = async (req, res) => {
  try {
    const user = req.user; // Set by getUserData middleware

    // Get additional Clerk data
    let clerkUser = null;
    try {
      clerkUser = await clerkClient.users.getUser(user.clerkId);
    } catch (error) {
      console.error('Error fetching Clerk user data:', error);
    }

    // Ensure user.badges is properly loaded (in case it's not populated)
    const userBadges = Array.isArray(user.badges) ? user.badges : [];
    
    // Transform badges from labels (or IDs) to objects with labels
    // Handles both cases: badges stored as labels or as IDs
    let transformedBadges = [];
    try {
      transformedBadges = transformBadgesFromLabels(userBadges);
    } catch (badgeError) {
      console.error('Error transforming badges:', badgeError);
      // Fallback to empty array if transformation fails
      transformedBadges = [];
    }
    
    // Learning scores (0–1, higher = better). Email/WhatsApp: no events = 1; with events = 1 - risk (decreases on open/click/credentials).
    let emailScore = 0;
    if (isEligibleForEmailRiskScoring(user.role)) {
      const rawRisk = await computeEmailRiskScore(user._id);
      emailScore = rawRisk === 0 ? 1 : Math.max(0, Math.min(1, 1 - rawRisk));
    } else {
      emailScore = user.learningScoreEmail != null ? user.learningScoreEmail : 0;
    }

    let whatsappScore = 0;
    if (isEligibleForWhatsAppRiskScoring(user.role)) {
      const rawRisk = await computeWhatsAppRiskScore(user._id);
      whatsappScore = rawRisk === 0 ? 1 : Math.max(0, Math.min(1, 1 - rawRisk));
    } else {
      whatsappScore = user.learningScoreWhatsapp != null ? user.learningScoreWhatsapp : 0;
    }

    let lmsScore = 0;
    if (isEligibleForLmsRiskScoring(user.role)) {
      lmsScore = await computeLmsRiskScore(user._id);
    } else {
      lmsScore = user.learningScoreLms != null ? user.learningScoreLms : 0;
    }

    const voiceScore = user.learningScoreVoice != null ? user.learningScoreVoice : 0;
    const learningScores = {
      email: Math.round(emailScore * 100) / 100,
      whatsapp: Math.round(whatsappScore * 100) / 100,
      lms: Math.round(lmsScore * 100) / 100,
      voice: Math.round((voiceScore ?? 0) * 100) / 100
    };

    // Merge local and Clerk data
    const profile = {
      _id: user._id,
      clerkId: user.clerkId,
      email: user.email,
      displayName: user.displayName,
      phoneNumber: user.phoneNumber != null ? user.phoneNumber : null,
      role: user.role,
      orgId: user.orgId?._id?.toString() || user.orgId?.toString() || null, // Ensure it's a string ID
      orgName: user.orgId?.name || null,
      groupIds: user.groupIds,
      status: user.status,
      learningScore: user.learningScore,
      learningScores,
      badges: transformedBadges,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      // Additional Clerk data if available
      profileImageUrl: clerkUser?.profileImageUrl || null,
      firstName: clerkUser?.firstName || null,
      lastName: clerkUser?.lastName || null,
      lastSignInAt: clerkUser?.lastSignInAt || null
    };

    // Include remedial assignments (courses assigned due to low/mid learning scores)
    try {
      if (user.role === 'affiliated' || user.role === 'non_affiliated') {
        // Persist current computed scores to User so remedial logic sees the same scores as profile
        await User.updateOne(
          { _id: user._id },
          {
            $set: {
              learningScoreEmail: emailScore,
              learningScoreWhatsapp: whatsappScore,
              learningScoreLms: lmsScore,
              learningScoreVoice: voiceScore,
            },
          }
        );
        await updateUserCombinedLearningScore(user._id, {
          email: emailScore,
          whatsapp: whatsappScore,
          lms: lmsScore,
          voice: voiceScore,
        });
        await ensureRemedialAssignments(user._id);
        profile.learningScore = computeCombinedLearningScore({
          email: emailScore,
          whatsapp: whatsappScore,
          lms: lmsScore,
          voice: voiceScore,
        });
      }
      const remedialAssignments = await getRemedialAssignmentsForUser(user._id);
      profile.remedialAssignments = remedialAssignments;
    } catch (remedialErr) {
      console.error('Error fetching remedial assignments:', remedialErr);
      profile.remedialAssignments = [];
    }

    res.json(profile);
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({ error: 'Failed to fetch user profile' });
  }
};

// GET /api/users/all - Get all users (for email campaigns, etc.)
const getAllUsers = async (req, res) => {
  try {
    const { page = 1, limit = 1000, status } = req.query;

    const query = {};
    if (status) {
      query.status = status;
    }

    const users = await User.find(query)
      .select('_id email displayName role status learningScore learningScoreEmail learningScoreWhatsapp learningScoreLms learningScoreVoice badges')
      .sort({ email: 1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await User.countDocuments(query);

    // For system admin dashboard, we need to compute learningScores similar to getOrgUsers
    const { isEligibleForEmailRiskScoring, computeEmailRiskScore } = require('../services/emailRiskScoreService');
    const { isEligibleForWhatsAppRiskScoring, computeWhatsAppRiskScore } = require('../services/whatsappRiskScoreService');

    const usersWithScores = await Promise.all(users.map(async (user) => {
      let emailScore = user.learningScoreEmail != null ? user.learningScoreEmail : 0;
      let whatsappScore = user.learningScoreWhatsapp != null ? user.learningScoreWhatsapp : 0;
      if (isEligibleForEmailRiskScoring(user.role)) {
        const rawRisk = await computeEmailRiskScore(user._id);
        emailScore = rawRisk === 0 ? 1 : Math.max(0, Math.min(1, 1 - rawRisk));
      }
      if (isEligibleForWhatsAppRiskScoring(user.role)) {
        const rawRisk = await computeWhatsAppRiskScore(user._id);
        whatsappScore = rawRisk === 0 ? 1 : Math.max(0, Math.min(1, 1 - rawRisk));
      }
      return {
        _id: user._id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        status: user.status,
        learningScore: user.learningScore || 0,
        learningScores: {
          email: Math.round(emailScore * 100) / 100,
          whatsapp: Math.round(whatsappScore * 100) / 100,
          lms: user.learningScoreLms != null ? user.learningScoreLms : 0,
          voice: user.learningScoreVoice != null ? user.learningScoreVoice : 0
        },
        badges: Array.isArray(user.badges) ? user.badges : []
      };
    }));

    res.json({
      users: usersWithScores,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total
      }
    });
  } catch (error) {
    console.error('Error fetching all users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
};

// PATCH /api/users/me - update current user profile (e.g. phone number for WhatsApp campaigns)
const updateProfile = async (req, res) => {
  try {
    const userId = req.user._id;
    const { phoneNumber } = req.body || {};
    const updates = {};
    if (typeof phoneNumber === "string") {
      updates.phoneNumber = phoneNumber.trim() || null;
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No valid fields to update (e.g. phoneNumber)." });
    }
    const user = await User.findByIdAndUpdate(userId, { $set: updates }, { new: true })
      .select("_id email displayName phoneNumber role")
      .lean();
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }
    res.json({ success: true, user });
  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({ error: "Failed to update profile." });
  }
};

// GET /api/users/me/remedial-assignments - get current user's remedial course assignments
const getMyRemedialAssignments = async (req, res) => {
  try {
    const userId = req.user._id;
    const assignments = await getRemedialAssignmentsForUser(userId);
    res.json({ success: true, remedialAssignments: assignments });
  } catch (error) {
    console.error('Error fetching remedial assignments:', error);
    res.status(500).json({ error: 'Failed to fetch remedial assignments' });
  }
};

module.exports = {
  getUserProfile,
  getLearningProgress,
  getCoursesProgress,
  getUserActivity,
  getAllUsers,
  updateProfile,
  getMyRemedialAssignments
};
