/* ============================================
   ORION — HOME PAGE (v5)
   Dynamic Timetable Overlay + Smart Recommendations
   ============================================ */

import { 
  createPlannerItem, 
  deletePlannerItem, 
  fetchPlanner, 
  fetchTopics,
  fetchResources,
  getActiveRecoveryPlan,
  fetchQuizResults,
  fetchSessions
} from '../firebase.js';
import { doc, updateDoc, Timestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

(function() {
  let dataCheckInterval = null;
  let dismissedRecommendations = new Set();
  let currentPlannerItems = [];
  let currentEditItemId = null;

  const COURSE_COLORS = [
    '#3b82f6', '#10b981', '#f59e0b', '#ef4444', 
    '#8b5cf6', '#ec4899', '#06b6d4', '#f97316',
    '#84cc16', '#6366f1'
  ];

  function init() {
    console.log('home.js init() called');
    setupPlanner();
    setupProfilePopup();
    setupRecommendationsOverlay();
    startDataPolling();

    window.addEventListener('userdata:loaded', () => {
      console.log('userdata:loaded event received');
      stopDataPolling();
      renderHome();
    });

    window.addEventListener('pagechange', (e) => {
      if (e.detail && e.detail.page === 'home') {
        console.log('pagechange to home');
        renderHome();
      }
    });
  }

  function startDataPolling() {
    dataCheckInterval = setInterval(() => {
      const profile = window.Store.get('profile');
      const courses = window.Store.get('courses');
      const sessions = window.Store.get('sessions');

      if (profile && profile.id && courses && sessions) {
        console.log('Data polling found data, rendering...');
        stopDataPolling();
        renderHome();
      }
    }, 100);

    setTimeout(() => {
      stopDataPolling();
    }, 10000);
  }

  function stopDataPolling() {
    if (dataCheckInterval) {
      clearInterval(dataCheckInterval);
      dataCheckInterval = null;
    }
  }

  function updatePageSubtitle() {
    const subtitle = document.getElementById('homeSubtitle');
    if (subtitle) {
      window.OrionInjector.updateGreeting(subtitle);
    }
    if (window.OrionInjector) {
      window.OrionInjector.inject('page-home', 'homeSubtitle');
    }
  }

  async function renderHome() {
    console.log('>>> renderHome called');
    const profile = window.Store.get('profile') || {};
    const sessions = window.Store.get('sessions') || [];
    const courses = window.Store.get('courses') || [];

    console.log('>>> renderHome data:', { 
      profileId: profile.id, 
      profileTotalTime: profile.total_study_time,
      profileXP: profile.xp,
      sessionsCount: sessions.length, 
      coursesCount: courses.length 
    });

    updatePageSubtitle();
    updateIQBadge(profile);
    renderStats(sessions, profile, courses);
    renderProgressRing(sessions, profile);
    await refreshPlannerData();
    populatePlannerCourses();
    await renderSmartRecommendations();
  }

  function updateIQBadge(profile) {
    const badgeName = document.getElementById('badgeName');
    const badgeLevel = document.getElementById('badgeLevel');
    const badgeXP = document.getElementById('badgeXP');
    const badgeAvatar = document.getElementById('badgeAvatar');

    if (badgeName) badgeName.textContent = profile.display_name || 'Student';
    if (badgeLevel) badgeLevel.textContent = `Lv. ${profile.level || 1}`;
    if (badgeXP) badgeXP.textContent = `${profile.xp || 0} XP`;
    if (badgeAvatar) {
      if (profile.avatar) {
        badgeAvatar.innerHTML = `<img src="${profile.avatar}" alt="Avatar">`;
      } else {
        badgeAvatar.textContent = (profile.display_name || 'S').charAt(0).toUpperCase();
      }
    }
  }

  function setupProfilePopup() {
    setTimeout(() => {
      const iqBadge = document.getElementById('iqBadge');
      if (!iqBadge) return;
      iqBadge.addEventListener('click', (e) => {
        e.stopPropagation();
        const profile = window.Store.get('profile') || {};
        toggleProfilePopup(profile);
      });
    }, 0);
  }

  function toggleProfilePopup(profile) {
    const popup = document.getElementById('profilePopup');
    if (!popup) return;
    const isVisible = popup.classList.contains('visible');
    if (isVisible) {
      popup.classList.remove('visible');
      return;
    }

    const popupAvatar = document.getElementById('popupAvatar');
    const popupName = document.getElementById('popupName');
    const popupLevel = document.getElementById('popupLevel');
    const popupCourses = document.getElementById('popupCourses');
    const popupSessions = document.getElementById('popupSessions');
    const editBtn = document.getElementById('popupEditProfile');

    if (popupAvatar) {
      popupAvatar.innerHTML = profile.avatar 
        ? `<img src="${profile.avatar}" alt="Avatar">` 
        : (profile.display_name || 'S').charAt(0).toUpperCase();
    }
    if (popupName) popupName.textContent = profile.display_name || 'Student';
    if (popupLevel) popupLevel.textContent = `Level ${profile.level || 1}`;
    const courses = window.Store.get('courses') || [];
    const sessions = window.Store.get('sessions') || [];
    if (popupCourses) popupCourses.textContent = courses.length;
    if (popupSessions) popupSessions.textContent = sessions.length;
    if (editBtn) {
      editBtn.onclick = () => {
        popup.classList.remove('visible');
        window.Router.navigate('settings');
      };
    }

    popup.classList.add('visible');
    const closePopup = (e) => {
      if (!popup.contains(e.target) && !iqBadge.contains(e.target)) {
        popup.classList.remove('visible');
        document.removeEventListener('click', closePopup);
      }
    };
    setTimeout(() => document.addEventListener('click', closePopup), 0);
  }

  function renderStats(sessions, profile, courses) {
    console.log('>>> renderStats called with:', { 
      totalStudyTime: profile.total_study_time, 
      coursesLength: courses.length, 
      xp: profile.xp,
      sessionsCount: sessions.length
    });

    const totalStudyTimeEl = document.getElementById('totalStudyTime');
    const activeCoursesEl = document.getElementById('activeCoursesCount');
    const dayStreakEl = document.getElementById('dayStreak');
    const totalXPEl = document.getElementById('totalXP');

    console.log('>>> DOM elements found:', {
      totalStudyTimeEl: !!totalStudyTimeEl,
      activeCoursesEl: !!activeCoursesEl,
      dayStreakEl: !!dayStreakEl,
      totalXPEl: !!totalXPEl
    });

    const totalMinutes = profile.total_study_time || 0;
    const totalHours = Math.floor(totalMinutes / 60);
    const remainingMinutes = totalMinutes % 60;
    if (totalStudyTimeEl) {
      const timeText = remainingMinutes > 0 ? `${totalHours}h ${remainingMinutes}m` : `${totalHours}h`;
      totalStudyTimeEl.textContent = timeText;
      console.log('>>> Set totalStudyTime to:', timeText);
    }

    if (activeCoursesEl) {
      activeCoursesEl.textContent = courses.length;
      console.log('>>> Set activeCoursesCount to:', courses.length);
    }

    if (dayStreakEl) {
      const streak = calculateDayStreak(sessions);
      dayStreakEl.textContent = streak;
      console.log('>>> Set dayStreak to:', streak);
    }

    if (totalXPEl) {
      totalXPEl.textContent = profile.xp || 0;
      console.log('>>> Set totalXP to:', profile.xp || 0);
    }
  }

  function calculateDayStreak(sessions) {
    if (!sessions || sessions.length === 0) return 0;
    const sessionDates = sessions
      .filter(s => s.ended_at)
      .map(s => {
        const d = s.ended_at.toDate ? s.ended_at.toDate() : new Date(s.ended_at);
        return d.toDateString();
      });
    const uniqueDates = [...new Set(sessionDates)].sort((a, b) => new Date(b) - new Date(a));
    if (uniqueDates.length === 0) return 0;
    const today = new Date().toDateString();
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    const mostRecent = uniqueDates[0];
    if (mostRecent !== today && mostRecent !== yesterday.toDateString()) return 0;
    let streak = 1;
    for (let i = 1; i < uniqueDates.length; i++) {
      const prevDate = new Date(uniqueDates[i - 1]);
      const currDate = new Date(uniqueDates[i]);
      const diffDays = (prevDate - currDate) / (1000 * 60 * 60 * 24);
      if (diffDays === 1) streak++; else break;
    }
    return streak;
  }

  function renderProgressRing(sessions, profile) {
    const ringContainer = document.getElementById('weeklyProgressRing');
    const trendContainer = document.getElementById('weeklyTrend');
    if (!ringContainer) return;

    const weeklyGoal = (profile.weekly_goal || 15) * 60;
    const thisWeekMinutes = getThisWeekStudyTime(sessions);
    const lastWeekMinutes = getLastWeekStudyTime(sessions);
    const percentage = weeklyGoal > 0 ? Math.min(100, Math.round((thisWeekMinutes / weeklyGoal) * 100)) : 0;
    const circumference = 2 * Math.PI * 45;
    const offset = circumference - (percentage / 100) * circumference;

    ringContainer.innerHTML = `
      <svg width="120" height="120" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r="45" fill="none" stroke="var(--surface-light)" stroke-width="8"/>
        <circle cx="60" cy="60" r="45" fill="none" stroke="var(--accent)" stroke-width="8"
          stroke-dasharray="${circumference}" stroke-dashoffset="${offset}" stroke-linecap="round"
          transform="rotate(-90 60 60)" style="transition: stroke-dashoffset 0.5s ease;"/>
        <text x="60" y="55" text-anchor="middle" fill="var(--text-primary)" font-size="18" font-weight="bold">${percentage}%</text>
        <text x="60" y="75" text-anchor="middle" fill="var(--text-secondary)" font-size="10">of goal</text>
      </svg>
    `;

    if (trendContainer) {
      if (lastWeekMinutes === 0) {
        trendContainer.innerHTML = '<span class="trend-neutral">No previous data</span>';
      } else {
        const trend = ((thisWeekMinutes - lastWeekMinutes) / lastWeekMinutes) * 100;
        const isUp = trend >= 0;
        trendContainer.innerHTML = `<span class="${isUp ? 'trend-up' : 'trend-down'}">${isUp ? '▲' : '▼'} ${Math.abs(Math.round(trend))}%</span>`;
      }
    }
  }

  function getThisWeekStudyTime(sessions) {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    return sessions
      .filter(s => {
        if (!s.ended_at) return false;
        const d = s.ended_at.toDate ? s.ended_at.toDate() : new Date(s.ended_at);
        return d >= startOfWeek;
      })
      .reduce((sum, s) => sum + (s.duration_minutes || 0), 0);
  }

  function getLastWeekStudyTime(sessions) {
    const now = new Date();
    const startOfThisWeek = new Date(now);
    startOfThisWeek.setDate(now.getDate() - now.getDay());
    startOfThisWeek.setHours(0, 0, 0, 0);
    const startOfLastWeek = new Date(startOfThisWeek);
    startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);
    return sessions
      .filter(s => {
        if (!s.ended_at) return false;
        const d = s.ended_at.toDate ? s.ended_at.toDate() : new Date(s.ended_at);
        return d >= startOfLastWeek && d < startOfThisWeek;
      })
      .reduce((sum, s) => sum + (s.duration_minutes || 0), 0);
  }

  /* ============================================================
     SMART RECOMMENDATIONS OVERLAY
     ============================================================ */

  function setupRecommendationsOverlay() {
    const closeBtn = document.getElementById('recommendationsClose');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        dismissRecommendations();
      });
    }
  }

  function dismissRecommendations() {
    const section = document.getElementById('smartRecommendations');
    if (section) {
      section.classList.add('hidden');
      localStorage.setItem('recommendationsDismissedAt', Date.now().toString());
    }
  }

  function shouldShowRecommendations() {
    const dismissedAt = localStorage.getItem('recommendationsDismissedAt');
    if (!dismissedAt) return true;
    const elapsed = Date.now() - parseInt(dismissedAt);
    return elapsed > 3600000;
  }

  async function renderSmartRecommendations() {
    const container = document.getElementById('recommendationsContainer');
    const section = document.getElementById('smartRecommendations');
    if (!container || !section) return;

    const user = window.Store.get('user');
    if (!user) {
      section.classList.add('hidden');
      return;
    }

    if (!shouldShowRecommendations()) {
      section.classList.add('hidden');
      return;
    }

    const recommendations = await generateRecommendations(user.uid);

    if (recommendations.length === 0) {
      section.classList.add('hidden');
      return;
    }

    section.classList.remove('hidden');
    container.innerHTML = recommendations.map(rec => `
      <div class="recommendation-card ${rec.priority}">
        <div class="recommendation-icon">${rec.icon}</div>
        <div class="recommendation-content">
          <h4>${rec.title}</h4>
          <p>${rec.description}</p>
          ${rec.action ? `<button class="btn btn-sm btn-primary recommendation-action" data-action="${rec.actionType}" data-params='${JSON.stringify(rec.actionParams || {})}'>${rec.action}</button>` : ''}
        </div>
      </div>
    `).join('');

    container.querySelectorAll('.recommendation-action').forEach(btn => {
      btn.addEventListener('click', () => {
        const actionType = btn.dataset.action;
        const params = JSON.parse(btn.dataset.params || '{}');
        handleRecommendationAction(actionType, params);
      });
    });
  }

  async function generateRecommendations(userId) {
    const recommendations = [];
    const sessions = window.Store.get('sessions') || [];
    const courses = window.Store.get('courses') || [];
    const allTopics = window.Store.get('topics') || {};
    const planner = window.Store.get('planner') || [];
    const profile = window.Store.get('profile') || {};

    try {
      const activeRecovery = await getActiveRecoveryPlan(userId);
      if (activeRecovery && activeRecovery.status === 'pending') {
        recommendations.push({
          priority: 'urgent',
          icon: '🔥',
          title: 'Recovery Plan Ready',
          description: activeRecovery.description || 'You have a recovery plan waiting. Get back on track gently.',
          action: 'View Plan',
          actionType: 'navigate',
          actionParams: { page: 'activity', section: 'recovery' }
        });
      }
    } catch (err) {
      console.error('Failed to check recovery plan:', err);
    }

    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentDay = now.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();

    const upcomingSessions = planner.filter(p => {
      if (p.day !== currentDay) return false;
      const [planHour, planMinute] = p.start_time.split(':').map(Number);
      const planMinutes = planHour * 60 + planMinute;
      const currentMinutes = currentHour * 60 + currentMinute;
      const diff = planMinutes - currentMinutes;
      return diff > 0 && diff <= 120;
    });

    if (upcomingSessions.length > 0) {
      const nextSession = upcomingSessions.sort((a, b) => a.start_time.localeCompare(b.start_time))[0];
      const course = courses.find(c => c.id === nextSession.course_id);
      const topics = allTopics[nextSession.course_id] || [];
      const topic = topics.find(t => t.id === nextSession.topic_id);

      recommendations.push({
        priority: 'high',
        icon: '⏰',
        title: `Up Next: ${course?.name || 'Study Session'}`,
        description: `${topic?.name || 'Study'} starts at ${formatTime12(nextSession.start_time)}. Ready?`,
        action: 'Start Studying',
        actionType: 'startSession',
        actionParams: { courseId: nextSession.course_id, topicId: nextSession.topic_id }
      });
    }

    const subjectLastStudy = {};
    sessions.forEach(s => {
      const topic = Object.values(allTopics).flat().find(t => t.id === s.topic_id);
      if (!topic) return;
      const course = courses.find(c => c.id === topic.course_id);
      if (!course) return;

      const sessionDate = s.ended_at?.toDate?.() || new Date(s.ended_at);
      if (!subjectLastStudy[course.id] || sessionDate > subjectLastStudy[course.id].date) {
        subjectLastStudy[course.id] = { date: sessionDate, name: course.name, topic: topic.name, topicId: topic.id, courseId: course.id };
      }
    });

    Object.entries(subjectLastStudy).forEach(([courseId, data]) => {
      const daysSince = (now - data.date) / (1000 * 60 * 60 * 24);
      if (daysSince >= 5) {
        recommendations.push({
          priority: 'medium',
          icon: '🔗',
          title: `Reconnect with ${data.name}`,
          description: `You haven't studied ${data.name} in ${Math.floor(daysSince)} days. ${data.topic} needs attention.`,
          action: 'Study Now',
          actionType: 'startSession',
          actionParams: { courseId: data.courseId, topicId: data.topicId }
        });
      }
    });

    try {
      const quizResults = await fetchQuizResults(userId);
      const weakTopics = quizResults
        .filter(r => (r.score || 0) < 60)
        .sort((a, b) => (a.score || 0) - (b.score || 0))
        .slice(0, 2);

      weakTopics.forEach(q => {
        recommendations.push({
          priority: 'medium',
          icon: '📝',
          title: `Review: ${q.topic_name || 'Weak Topic'}`,
          description: `Your last quiz score was ${q.score}%. Some concepts need reinforcement.`,
          action: 'Review Topic',
          actionType: 'startSession',
          actionParams: { courseId: q.course_id, topicId: q.topic_id }
        });
      });
    } catch (err) {
      console.error('Failed to fetch quiz results:', err);
    }

    const streak = calculateDayStreak(sessions);
    const uniqueDates = [...new Set(sessions
      .filter(s => s.ended_at)
      .map(s => {
        const d = s.ended_at.toDate ? s.ended_at.toDate() : new Date(s.ended_at);
        return d.toDateString();
      }))].sort((a, b) => new Date(b) - new Date(a));

    if (streak > 0 && uniqueDates.length > 0) {
      const lastDate = new Date(uniqueDates[0]);
      const daysSince = Math.floor((now - lastDate) / (1000 * 60 * 60 * 24));
      if (daysSince === 1) {
        recommendations.push({
          priority: 'high',
          icon: '🔥',
          title: `Streak at Risk! ${streak} Day${streak > 1 ? 's' : ''}`,
          description: 'Study today to keep your streak alive. Even 15 minutes counts.',
          action: 'Quick Session',
          actionType: 'navigate',
          actionParams: { page: 'library' }
        });
      }
    }

    if (recommendations.length < 2) {
      const unstartedCourses = courses.filter(c => {
        const topics = allTopics[c.id] || [];
        return topics.length > 0 && !sessions.some(s => {
          const topic = topics.find(t => t.id === s.topic_id);
          return topic && s.duration_minutes > 0;
        });
      });

      if (unstartedCourses.length > 0) {
        const course = unstartedCourses[0];
        const topics = allTopics[course.id] || [];
        if (topics.length > 0) {
          recommendations.push({
            priority: 'low',
            icon: '🚀',
            title: `Start ${course.name}`,
            description: `You have ${topics.length} topic${topics.length > 1 ? 's' : ''} ready. Pick one and begin!`,
            action: 'Browse Topics',
            actionType: 'navigate',
            actionParams: { page: 'library' }
          });
        }
      }
    }

    const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
    return recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]).slice(0, 4);
  }

  function handleRecommendationAction(actionType, params) {
    if (actionType === 'navigate') {
      if (params.page === 'activity' && params.section === 'recovery') {
        window.Router.navigate('activity');
        setTimeout(() => {
          const btn = document.getElementById('openRecoveryOverlayBtn');
          if (btn) btn.click();
        }, 300);
      } else if (params.page) {
        window.Router.navigate(params.page);
      }
    } else if (actionType === 'startSession') {
      window.Store.set('recommendedSession', params);
      window.Router.navigate('library');
    }
  }

  /* ============================================================
     PLANNER — TIMETABLE OVERLAY
     ============================================================ */

  function setupPlanner() {
    const openBtn = document.getElementById('plannerOpenBtn');
    if (openBtn) openBtn.addEventListener('click', openPlannerTimetable);

    const timetableClose = document.getElementById('plannerTimetableClose');
    const timetableBackdrop = document.getElementById('plannerTimetableBackdrop');
    const addBlockBtn = document.getElementById('plannerAddBlockBtn');
    const todayBtn = document.getElementById('plannerTodayBtn');

    if (timetableClose) timetableClose.addEventListener('click', closePlannerTimetable);
    if (timetableBackdrop) timetableBackdrop.addEventListener('click', closePlannerTimetable);
    if (addBlockBtn) addBlockBtn.addEventListener('click', () => openPlannerForm('add'));
    if (todayBtn) todayBtn.addEventListener('click', scrollToToday);

    const formClose = document.getElementById('plannerFormClose');
    const formBackdrop = document.getElementById('plannerFormBackdrop');
    const formCancel = document.getElementById('plannerFormCancel');
    const form = document.getElementById('plannerForm');

    if (formClose) formClose.addEventListener('click', closePlannerForm);
    if (formBackdrop) formBackdrop.addEventListener('click', closePlannerForm);
    if (formCancel) formCancel.addEventListener('click', closePlannerForm);

    const courseSelect = document.getElementById('plannerCourse');
    if (courseSelect) {
      courseSelect.addEventListener('change', () => {
        loadTopicsForCourse(courseSelect.value);
      });
    }

    setupDaySelector();

    if (form) {
      form.addEventListener('submit', handlePlannerFormSubmit);
    }

    const deleteCancel = document.getElementById('plannerDeleteCancel');
    const deleteBackdrop = document.getElementById('plannerDeleteBackdrop');
    if (deleteCancel) deleteCancel.addEventListener('click', closeDeleteOverlay);
    if (deleteBackdrop) deleteBackdrop.addEventListener('click', closeDeleteOverlay);

    const overlapCancel = document.getElementById('plannerOverlapCancel');
    const overlapBackdrop = document.getElementById('plannerOverlapBackdrop');
    if (overlapCancel) overlapCancel.addEventListener('click', closeOverlapOverlay);
    if (overlapBackdrop) overlapBackdrop.addEventListener('click', closeOverlapOverlay);
  }

  async function refreshPlannerData() {
    const user = window.Store.get('user');
    if (!user) return;
    try {
      const plannerItems = await fetchPlanner(user.uid);
      window.Store.set('planner', plannerItems);
      currentPlannerItems = plannerItems;
    } catch (err) {
      console.error('Failed to refresh planner:', err);
    }
  }

  async function openPlannerTimetable() {
    const overlay = document.getElementById('plannerTimetableOverlay');
    if (!overlay) return;
    await refreshPlannerData();
    overlay.classList.remove('hidden');
    renderTimetableGrid();
    setTimeout(scrollToToday, 150);
  }

  function closePlannerTimetable() {
    const overlay = document.getElementById('plannerTimetableOverlay');
    if (overlay) overlay.classList.add('hidden');
  }

  function scrollToToday() {
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    const dayHeader = document.querySelector(`.planner-day-header[data-day="${today}"]`);
    if (dayHeader) {
      dayHeader.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }

  /* ============================================================
     FIXED RENDER TIMETABLE GRID — EXPLICIT PLACEMENT FOR ALL
     ============================================================ */

  function renderTimetableGrid() {
    const container = document.getElementById('plannerTimetableBody');
    if (!container) return;

    const plannerItems = window.Store.get('planner') || [];
    currentPlannerItems = plannerItems;

    const courses = window.Store.get('courses') || [];
    const allTopics = window.Store.get('topics') || {};
    const dayOrder = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();

    let minHour = 8, maxHour = 18;
    if (plannerItems.length > 0) {
      let minStart = Infinity, maxEnd = -Infinity;
      plannerItems.forEach(item => {
        const [h, m] = item.start_time.split(':').map(Number);
        const startMinutes = h * 60 + m;
        const endMinutes = startMinutes + (item.duration_minutes || 60);
        if (startMinutes < minStart) minStart = startMinutes;
        if (endMinutes > maxEnd) maxEnd = endMinutes;
      });
      minHour = Math.floor(minStart / 60) - 1;
      maxHour = Math.ceil(maxEnd / 60) + 1;
      if (minHour < 0) minHour = 0;
      if (maxHour > 23) maxHour = 23;
    }

    const totalHours = maxHour - minHour + 1;

    const grid = document.createElement('div');
    grid.className = 'planner-timetable-grid';
    // Set explicit grid template
    grid.style.gridTemplateRows = `repeat(${totalHours + 1}, 60px)`;

    // Row 1: Headers
    const timeHeader = document.createElement('div');
    timeHeader.className = 'planner-grid-header planner-time-header';
    timeHeader.textContent = 'Time';
    timeHeader.style.gridRow = '1';
    timeHeader.style.gridColumn = '1';
    grid.appendChild(timeHeader);

    dayOrder.forEach((day, i) => {
      const dayHeader = document.createElement('div');
      dayHeader.className = `planner-grid-header planner-day-header ${day === today ? 'planner-today-col' : ''}`;
      dayHeader.dataset.day = day;
      dayHeader.textContent = day.charAt(0).toUpperCase() + day.slice(1, 3);
      dayHeader.style.gridRow = '1';
      dayHeader.style.gridColumn = `${i + 2}`;
      grid.appendChild(dayHeader);
    });

    // Rows 2+: Time labels and cells with EXPLICIT placement
    for (let hour = minHour; hour <= maxHour; hour++) {
      const rowIndex = 2 + (hour - minHour);

      const timeLabel = document.createElement('div');
      timeLabel.className = 'planner-time-label';
      timeLabel.textContent = formatTime12(`${hour.toString().padStart(2, '0')}:00`);
      timeLabel.style.gridRow = `${rowIndex}`;
      timeLabel.style.gridColumn = '1';
      grid.appendChild(timeLabel);

      dayOrder.forEach((day, dayIndex) => {
        const cell = document.createElement('div');
        cell.className = `planner-time-slot ${day === today ? 'planner-today-col' : ''}`;
        cell.dataset.day = day;
        cell.dataset.hour = hour;
        cell.style.gridRow = `${rowIndex}`;
        cell.style.gridColumn = `${dayIndex + 2}`;
        cell.addEventListener('click', () => {
          openPlannerForm('add', { day, startTime: `${hour.toString().padStart(2, '0')}:00` });
        });
        grid.appendChild(cell);
      });
    }

    // Place study blocks with EXPLICIT row/column (no auto-placement interference)
    plannerItems.forEach(item => {
      const course = courses.find(c => c.id === item.course_id);
      const topics = allTopics[item.course_id] || [];
      const topic = topics.find(t => t.id === item.topic_id);
      const [startH, startM] = item.start_time.split(':').map(Number);

      if (startH < minHour || startH > maxHour) return;

      const startRow = 2 + (startH - minHour);
      const spanRows = Math.max(1, Math.ceil((item.duration_minutes || 60) / 60));
      const dayIndex = dayOrder.indexOf(item.day);
      if (dayIndex === -1) return;

      const block = document.createElement('div');
      block.className = 'planner-study-block';
      block.style.gridColumn = `${dayIndex + 2}`;
      block.style.gridRow = `${startRow} / span ${spanRows}`;
      block.style.backgroundColor = getCourseColor(item.course_id);
      block.dataset.id = item.id;

      const endTime = calculateEndTime(item.start_time, item.duration_minutes);
      block.innerHTML = `
        <div class="planner-block-time">${formatTime12(item.start_time)} – ${formatTime12(endTime)}</div>
        <div class="planner-block-course">${course?.name || 'Course'}</div>
        <div class="planner-block-topic">${topic?.name || 'Topic'}</div>
        ${item.status === 'completed' ? '<span class="planner-block-status">✓</span>' : ''}
      `;

      block.addEventListener('click', (e) => {
        e.stopPropagation();
        openPlannerForm('edit', { item });
      });

      grid.appendChild(block);
    });

    container.innerHTML = '';
    container.appendChild(grid);

    if (plannerItems.length === 0) {
      const emptyState = document.createElement('div');
      emptyState.className = 'planner-empty-state';
      emptyState.innerHTML = '<p>No study blocks planned yet. Click any time slot to add one, or use the + Add Study Block button!</p>';
      container.appendChild(emptyState);
    }
  }

  /* ============================================================
     PLANNER — ADD/EDIT FORM OVERLAY
     ============================================================ */

  function openPlannerForm(mode, data = {}) {
    const overlay = document.getElementById('plannerFormOverlay');
    const form = document.getElementById('plannerForm');
    const title = document.getElementById('plannerFormTitle');
    const submitBtn = document.getElementById('plannerFormSubmit');
    const editActions = document.getElementById('plannerEditActions');
    const deleteBtn = document.getElementById('plannerDeleteBtn');
    const startStudyBtn = document.getElementById('plannerStartStudyBtn');

    if (!overlay || !form) return;

    form.reset();
    currentEditItemId = null;
    window.__plannerForceSave = false;

    document.querySelectorAll('.day-btn').forEach(btn => btn.classList.remove('selected'));

    if (mode === 'edit' && data.item) {
      const item = data.item;
      currentEditItemId = item.id;
      title.textContent = 'Edit Study Block';
      submitBtn.textContent = 'Save Changes';
      editActions.classList.remove('hidden');

      document.getElementById('plannerCourse').value = item.course_id;
      loadTopicsForCourse(item.course_id, item.topic_id);
      document.getElementById('plannerStartTime').value = item.start_time;
      const hours = Math.floor((item.duration_minutes || 60) / 60);
      const mins = (item.duration_minutes || 60) % 60;
      document.getElementById('plannerDurationHours').value = hours;
      document.getElementById('plannerDurationMinutes').value = mins;

      const dayBtn = document.querySelector(`.day-btn[data-day="${item.day}"]`);
      if (dayBtn) dayBtn.classList.add('selected');

      const recurringCheckbox = document.getElementById('plannerRecurring');
      if (recurringCheckbox) recurringCheckbox.checked = item.is_recurring !== false;

      // Remove old listener to prevent duplicates
      deleteBtn.replaceWith(deleteBtn.cloneNode(true));
      const freshDeleteBtn = document.getElementById('plannerDeleteBtn');
      freshDeleteBtn.addEventListener('click', () => openDeleteConfirm(item.id));
      // Remove old listener to prevent duplicates
      startStudyBtn.replaceWith(startStudyBtn.cloneNode(true));
      const freshStartBtn = document.getElementById('plannerStartStudyBtn');
      freshStartBtn.addEventListener('click', () => {
        startStudySession(item.course_id, item.topic_id, item.duration_minutes, item.id);
        closePlannerForm();
        closePlannerTimetable();
      });
    } else {
      title.textContent = 'Add Study Block';
      submitBtn.textContent = 'Add Study Block';
      editActions.classList.add('hidden');

      if (data.day) {
        const dayBtn = document.querySelector(`.day-btn[data-day="${data.day}"]`);
        if (dayBtn) dayBtn.classList.add('selected');
      }
      if (data.startTime) {
        document.getElementById('plannerStartTime').value = data.startTime;
      }

      populatePlannerCourses();
      const topicSelect = document.getElementById('plannerTopic');
      if (topicSelect) {
        topicSelect.innerHTML = '<option value="">Select Topic</option>';
        topicSelect.disabled = true;
      }
    }

    overlay.classList.remove('hidden');
  }

  function closePlannerForm() {
    const overlay = document.getElementById('plannerFormOverlay');
    if (overlay) overlay.classList.add('hidden');
    currentEditItemId = null;
    window.__plannerForceSave = false;
  }

  async function handlePlannerFormSubmit(e) {
    e.preventDefault();
    const user = window.Store.get('user');
    if (!user) return;

    const courseId = document.getElementById('plannerCourse').value;
    const topicId = document.getElementById('plannerTopic').value;
    const startTime = document.getElementById('plannerStartTime').value;
    const durationHours = parseInt(document.getElementById('plannerDurationHours').value) || 0;
    const durationMinutes = parseInt(document.getElementById('plannerDurationMinutes').value) || 0;
    const totalDurationMinutes = (durationHours * 60) + durationMinutes;
    const isRecurring = document.getElementById('plannerRecurring')?.checked ?? true;

    const selectedDays = [];
    document.querySelectorAll('.day-btn.selected').forEach(btn => {
      selectedDays.push(btn.dataset.day);
    });

    if (!courseId || !topicId || selectedDays.length === 0 || !startTime || totalDurationMinutes <= 0) {
      window.showToast('Please fill in all fields and select at least one day', 'error');
      return;
    }

    const forceSave = window.__plannerForceSave;
    window.__plannerForceSave = false;

    if (!forceSave) {
      const overlaps = checkOverlap(selectedDays, startTime, totalDurationMinutes, currentEditItemId);
      if (overlaps.length > 0) {
        openOverlapWarning(overlaps);
        return;
      }
    }

    try {
      if (currentEditItemId) {
        const existing = currentPlannerItems.find(i => i.id === currentEditItemId);
        await updateDoc(doc(db, 'planner', currentEditItemId), {
          course_id: courseId,
          topic_id: topicId,
          day: selectedDays[0],
          start_time: startTime,
          duration_minutes: totalDurationMinutes,
          is_recurring: isRecurring,
          updated_at: Timestamp.now()
        });
        window.showToast('Study block updated!', 'success');
      } else {
        const recurringGroupId = isRecurring ? `rec_${Date.now()}` : null;
        for (const day of selectedDays) {
          await createPlannerItem(user.uid, {
            course_id: courseId,
            topic_id: topicId,
            day: day,
            start_time: startTime,
            duration_minutes: totalDurationMinutes,
            is_recurring: isRecurring,
            recurring_group_id: recurringGroupId,
            status: 'planned',
            completed_at: null
          });
        }
        const dayLabel = selectedDays.length === 1 
          ? selectedDays[0].charAt(0).toUpperCase() + selectedDays[0].slice(1)
          : `${selectedDays.length} days`;
        window.showToast(`${isRecurring ? 'Recurring' : 'One-time'} study block added for ${dayLabel}!`, 'success');
      }

      closePlannerForm();
      await refreshPlannerData();
      renderTimetableGrid();
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  }

  function checkOverlap(days, startTime, durationMinutes, excludeId = null) {
    const [h, m] = startTime.split(':').map(Number);
    const newStart = h * 60 + m;
    const newEnd = newStart + durationMinutes;
    const overlaps = [];

    currentPlannerItems.forEach(item => {
      if (excludeId && item.id === excludeId) return;
      if (!days.includes(item.day)) return;

      const [ih, im] = item.start_time.split(':').map(Number);
      const itemStart = ih * 60 + im;
      const itemEnd = itemStart + (item.duration_minutes || 60);

      if (newStart < itemEnd && itemStart < newEnd) {
        overlaps.push(item);
      }
    });

    return overlaps;
  }

  function openOverlapWarning(overlaps) {
    const overlay = document.getElementById('plannerOverlapOverlay');
    const message = document.getElementById('plannerOverlapMessage');
    const confirmBtn = document.getElementById('plannerOverlapConfirm');
    const cancelBtn = document.getElementById('plannerOverlapCancel');

    if (!overlay) return;

    const items = overlaps.map(o => {
      const courses = window.Store.get('courses') || [];
      const course = courses.find(c => c.id === o.course_id);
      return `${course?.name || 'Study'} at ${formatTime12(o.start_time)}`;
    }).join(', ');

    message.textContent = `This overlaps with: ${items}. Save anyway?`;
    overlay.classList.remove('hidden');

    confirmBtn.onclick = () => {
      overlay.classList.add('hidden');
      window.__plannerForceSave = true;
      document.getElementById('plannerForm').requestSubmit();
    };

    cancelBtn.onclick = () => {
      overlay.classList.add('hidden');
      window.__plannerForceSave = false;
    };
  }

  function closeOverlapOverlay() {
    const overlay = document.getElementById('plannerOverlapOverlay');
    if (overlay) overlay.classList.add('hidden');
    window.__plannerForceSave = false;
  }

  function openDeleteConfirm(itemId) {
    const overlay = document.getElementById('plannerDeleteOverlay');
    const confirmBtn = document.getElementById('plannerDeleteConfirm');
    const cancelBtn = document.getElementById('plannerDeleteCancel');

    if (!overlay) return;

    overlay.classList.remove('hidden');

    confirmBtn.onclick = async () => {
      try {
        await deletePlannerItem(itemId);
        closePlannerForm();
        await refreshPlannerData();
        renderTimetableGrid();
        window.showToast('Study block deleted', 'success');
      } catch (err) {
        window.showToast(err.message, 'error');
      }
      overlay.classList.add('hidden');
    };

    cancelBtn.onclick = () => {
      overlay.classList.add('hidden');
    };
  }

  function closeDeleteOverlay() {
    const overlay = document.getElementById('plannerDeleteOverlay');
    if (overlay) overlay.classList.add('hidden');
  }

  /* ============================================================
     START STUDY SESSION — WITH DOCUMENT LOADING (same as library.js)
     ============================================================ */

  async function startStudySession(courseId, topicId, plannedDurationMinutes, plannerItemId) {
    const courses = window.Store.get('courses') || [];
    const allTopics = window.Store.get('topics') || {};
    const course = courses.find(c => c.id === courseId);
    const topics = allTopics[courseId] || [];
    const topic = topics.find(t => t.id === topicId);

    if (!course || !topic) {
      window.showToast('Course or topic not found', 'error');
      return;
    }

    // Fetch resources for this topic (same as library.js)
    let resources = [];
    try {
      const allResources = window.Store.get('resources') || {};
      resources = allResources[topicId];
      if (!resources) {
        resources = await fetchResources(topicId);
        allResources[topicId] = resources;
        window.Store.set('resources', allResources);
      }
    } catch (err) {
      console.error('Failed to fetch resources:', err);
    }

    // Store session data
    window.Store.set('currentStudySession', {
      courseId,
      topicId,
      courseName: course.name,
      topicName: topic.name,
      plannedDurationMinutes: plannedDurationMinutes || 60,
      plannerItemId: plannerItemId || null,
      startedAt: new Date().toISOString()
    });

    window.Store.set('activeCourse', course);
    window.Store.set('activeTopic', topic);
    window.Store.set('activeResources', resources);
    window.Store.set('documentText', '');

    // Update study space title
    const studyTitle = document.getElementById('studyTitle');
    if (studyTitle) {
      studyTitle.textContent = `${course.name} — ${topic.name}`;
    }

    // Load document into viewer
    const docViewer = document.getElementById('studyDocViewer');
    if (docViewer) {
      if (resources.length === 0) {
        docViewer.innerHTML = `
          <div class="study-welcome">
            <div class="study-welcome-icon">📂</div>
            <h3>No resources for ${topic.name}</h3>
            <p>Upload files in the Courses page to study here.</p>
          </div>
        `;
      } else {
        // Auto-load the first resource (same logic as library.js)
        const firstResource = resources[0];
        window.Store.set('activeResource', firstResource);
        await loadDocumentIntoViewer(firstResource, docViewer);
      }
    }

    // Show study space, hide app shell
    const appShell = document.getElementById('appShell');
    const studySpace = document.getElementById('studySpace');
    const mobileNav = document.getElementById('mobileNav');

    if (appShell) appShell.classList.add('hidden');
    if (mobileNav) mobileNav.classList.add('hidden');
    if (studySpace) {
      studySpace.classList.remove('hidden');
      studySpace.style.display = 'flex';
    }

    // Dispatch the correct event that study.js listens for
    const resourceId = resources.length > 0 ? resources[0].id : null;
    window.dispatchEvent(new CustomEvent('studysession:start', {
      detail: { courseId, topicId, resourceId }
    }));
  }

  // Copy of loadDocumentIntoViewer from library.js
  async function loadDocumentIntoViewer(resource, docViewer) {
    if (!resource || !docViewer) return;

    const fileUrl = resource.file_url || resource.file_data;

    if (!fileUrl) {
      docViewer.innerHTML = `
        <div class="study-welcome">
          <div class="study-welcome-icon">⚠️</div>
          <h3>Resource file not available</h3>
          <p>The file data is missing for ${resource.name}.</p>
        </div>
      `;
      return;
    }

    docViewer.innerHTML = `
      <div class="study-welcome">
        <div class="study-welcome-icon">⏳</div>
        <h3>Loading ${resource.name}...</h3>
      </div>
    `;

    try {
      if (resource.file_type && resource.file_type.startsWith('image/')) {
        docViewer.innerHTML = `<img src="${fileUrl}" style="max-width:100%; height:auto; display:block;" />`;
      } else if (resource.file_type === 'application/pdf') {
        docViewer.innerHTML = `<iframe src="${fileUrl}" style="width:100%; height:100%; border:none; min-height:500px;"></iframe>`;
      } else if (resource.file_type && (
        resource.file_type.includes('word') || 
        resource.file_type.includes('officedocument')
      )) {
        docViewer.innerHTML = `
          <div class="study-file-preview">
            <div class="file-preview-icon">📝</div>
            <h4>${resource.name}</h4>
            <a href="${fileUrl}" target="_blank" class="btn btn-primary">Download Document</a>
          </div>
        `;
      } else if (resource.file_type && resource.file_type.startsWith('text/')) {
        try {
          const response = await fetch(fileUrl);
          const text = await response.text();
          docViewer.innerHTML = `<pre style="white-space:pre-wrap; padding:1rem; color:var(--text-primary);">${escapeHtml(text)}</pre>`;
          window.Store.set('documentText', text);
        } catch (err) {
          docViewer.innerHTML = `
            <div class="study-welcome">
              <div class="study-welcome-icon">❌</div>
              <h3>Failed to load text file</h3>
            </div>
          `;
        }
      } else {
        docViewer.innerHTML = `
          <div class="study-file-preview">
            <div class="file-preview-icon">📄</div>
            <h4>${resource.name}</h4>
            <a href="${fileUrl}" target="_blank" class="btn btn-primary">Open File</a>
          </div>
        `;
      }
    } catch (err) {
      console.error('Document load error:', err);
      docViewer.innerHTML = `
        <div class="study-welcome">
          <div class="study-welcome-icon">❌</div>
          <h3>Failed to load document</h3>
          <p>${err.message || 'Unknown error'}</p>
        </div>
      `;
    }
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  async function loadTopicsForCourse(courseId, selectedTopicId = null) {
    const topicSelect = document.getElementById('plannerTopic');
    if (!topicSelect) return;

    if (!courseId) {
      topicSelect.innerHTML = '<option value="">Select Topic</option>';
      topicSelect.disabled = true;
      return;
    }

    try {
      const topics = await fetchTopics(courseId);
      const allTopics = window.Store.get('topics') || {};
      allTopics[courseId] = topics;
      window.Store.set('topics', allTopics);

      topicSelect.innerHTML = '<option value="">Select Topic</option>' + 
        topics.map(t => `<option value="${t.id}" ${t.id === selectedTopicId ? 'selected' : ''}>${t.name}</option>`).join('');
      topicSelect.disabled = false;
    } catch (err) {
      console.error('Failed to fetch topics:', err);
    }
  }

  function populatePlannerCourses() {
    const courseSelect = document.getElementById('plannerCourse');
    if (!courseSelect) return;
    const courses = window.Store.get('courses') || [];
    courseSelect.innerHTML = '<option value="">Select Course</option>' +
      courses.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  }

  function setupDaySelector() {
    const daySelector = document.getElementById('daySelector');
    if (!daySelector) return;

    daySelector.querySelectorAll('.day-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        btn.classList.toggle('selected');
      });
    });
  }

  function resetDaySelector() {
    document.querySelectorAll('.day-btn').forEach(btn => {
      btn.classList.remove('selected');
    });
  }

  function getCourseColor(courseId) {
    if (!courseId) return '#3b82f6';
    let hash = 0;
    for (let i = 0; i < courseId.length; i++) {
      hash = courseId.charCodeAt(i) + ((hash << 5) - hash);
    }
    return COURSE_COLORS[Math.abs(hash) % COURSE_COLORS.length];
  }

  function calculateEndTime(startTime, durationMinutes) {
    const [h, m] = startTime.split(':').map(Number);
    const totalMinutes = (h * 60) + m + durationMinutes;
    const endH = Math.floor(totalMinutes / 60) % 24;
    const endM = totalMinutes % 60;
    return `${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`;
  }

  function formatTime12(timeStr) {
    const [h, m] = timeStr.split(':');
    const hour = parseInt(h);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const h12 = hour % 12 || 12;
    return `${h12}:${m} ${ampm}`;
  }

  init();
})();