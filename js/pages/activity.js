/* ============================================
   ORION — ACTIVITY PAGE (v6)
   Recovery Plans Overlay + Progress Reports
   ============================================ */

import {
  fetchTopics, fetchSessions, fetchMonthlyReports, getMonthlyReport,
  saveMonthlyReport, fetchAllSessions, fetchAllTopics, fetchGoals,
  fetchRecoveryPlans, createRecoveryPlan, updateRecoveryPlan,
  acceptRecoveryPlan, dismissRecoveryPlan, getActiveRecoveryPlan,
  fetchPlanner, deletePlannerItem
} from '../firebase.js';

(function() {
  let currentView = 'weekly';
  let reportState = { selectedYear: null, selectedMonth: null, reports: [], liveReport: null };
  const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  function init() {
    renderActivity();
    setupToggles();
    setupProgressReports();
    setupRecoveryPlansOverlay();
    setupTopicProgressOverlay();
    window.addEventListener('pagechange', (e) => {
      if (e.detail.page === 'activity') {
        updatePageSubtitle();
        renderActivity();
        checkAndRenderRecoveryPlans();
      }
    });
    window.Store.subscribe('topics', () => {
      renderActivity();
      if (!document.getElementById('topicProgressOverlay')?.classList.contains('hidden')) {
        renderTopicProgressInOverlay();
      }
    });
    window.Store.subscribe('sessions', () => {
      renderActivity();
      if (!document.getElementById('topicProgressOverlay')?.classList.contains('hidden')) {
        renderTopicProgressInOverlay();
      }
    });
  }

  function updatePageSubtitle() {
    const subtitle = document.getElementById('activitySubtitle');
    if (subtitle) {
      window.OrionInjector.updateGreeting(subtitle);
    }
    if (window.OrionInjector) window.OrionInjector.inject('page-activity', 'activitySubtitle');
  }

  function setupToggles() {
    const weeklyBtn = document.getElementById('activityWeekly');
    const monthlyBtn = document.getElementById('activityMonthly');
    if (weeklyBtn) weeklyBtn.addEventListener('click', () => { currentView = 'weekly'; updateToggleState(weeklyBtn, monthlyBtn); renderActivity(); });
    if (monthlyBtn) monthlyBtn.addEventListener('click', () => { currentView = 'monthly'; updateToggleState(monthlyBtn, weeklyBtn); renderActivity(); });
  }

  function updateToggleState(active, inactive) {
    if (active) active.classList.add('active');
    if (inactive) inactive.classList.remove('active');
  }


  /* ============================================================
     TOPIC PROGRESS OVERLAY
     ============================================================ */

  function setupTopicProgressOverlay() {
    const overlay = document.getElementById('topicProgressOverlay');
    const closeBtn = document.getElementById('topicProgressOverlayClose');
    const backdrop = document.getElementById('topicProgressOverlayBackdrop');

    // Event delegation: listen on container for dynamically created button
    const container = document.getElementById('subjectProgressList');
    if (container) {
      container.addEventListener('click', (e) => {
        const btn = e.target.closest('#openTopicProgressBtn');
        if (btn) openTopicProgressOverlay();
      });
    }

    if (closeBtn) closeBtn.addEventListener('click', closeTopicProgressOverlay);
    if (backdrop) backdrop.addEventListener('click', closeTopicProgressOverlay);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && overlay && !overlay.classList.contains('hidden')) {
        closeTopicProgressOverlay();
      }
    });
  }

  function openTopicProgressOverlay() {
    const overlay = document.getElementById('topicProgressOverlay');
    if (overlay) {
      overlay.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
      renderTopicProgressInOverlay();
    }
  }

  function closeTopicProgressOverlay() {
    const overlay = document.getElementById('topicProgressOverlay');
    if (overlay) {
      overlay.classList.add('hidden');
      document.body.style.overflow = '';
    }
  }

  async function renderTopicProgressInOverlay() {
    const container = document.getElementById('topicProgressOverlayBody');
    if (!container) return;

    const user = window.Store.get('user');
    let courses = window.Store.get('courses') || [];
    let sessions = window.Store.get('sessions') || [];
    let allTopics = window.Store.get('topics') || {};

    const topicKeys = Object.keys(allTopics);
    if (topicKeys.length === 0 && courses.length > 0) {
      for (const course of courses) {
        try {
          const topics = await fetchTopics(course.id);
          allTopics[course.id] = topics;
        } catch (err) { console.error('Failed to fetch topics:', err); }
      }
      window.Store.set('topics', allTopics);
    }

    if (sessions.length === 0 && user) {
      try {
        sessions = await fetchSessions(user.uid);
        window.Store.set('sessions', sessions);
      } catch (err) { console.error('Failed to fetch sessions:', err); }
    }

    let allTopicsList = [];
    Object.values(allTopics).forEach(topics => allTopicsList = allTopicsList.concat(topics));

    if (allTopicsList.length === 0) {
      container.innerHTML = '<p class="empty-state">No topics yet. Create topics in the Courses page!</p>';
      return;
    }

    container.innerHTML = allTopicsList.map(t => {
      const course = courses.find(c => c.id === t.course_id);
      const topicSessions = sessions.filter(s => s.topic_id === t.id);
      const thisWeekMinutes = getThisWeekTime(topicSessions);
      const totalMinutes = topicSessions.reduce((sum, s) => sum + (s.duration_minutes || 0), 0);
      const percentage = t.target_hours > 0
        ? Math.min(100, Math.round((t.completed_hours || 0) / t.target_hours * 100))
        : 0;
      const circumference = 2 * Math.PI * 36;
      const offset = circumference - (percentage / 100) * circumference;
      const thisWeekH = Math.floor(thisWeekMinutes / 60);
      const thisWeekM = thisWeekMinutes % 60;
      const totalH = Math.floor(totalMinutes / 60);
      const totalM = totalMinutes % 60;
      const targetH = t.target_hours || 1.5;
      const thisWeekText = thisWeekH > 0 ? `${thisWeekH}h ${thisWeekM}m` : `${thisWeekM}m`;
      const totalText = totalH > 0 ? `${totalH}h ${totalM}m` : `${totalM}m`;

      return `
        <div class="topic-progress-item">
          <div class="topic-progress-ring">
            <svg width="84" height="84" viewBox="0 0 84 84">
              <circle cx="42" cy="42" r="36" fill="none" stroke="var(--surface-light)" stroke-width="6"/>
              <circle cx="42" cy="42" r="36" fill="none" stroke="var(--accent)" stroke-width="6"
                stroke-dasharray="${circumference}" stroke-dashoffset="${offset}" stroke-linecap="round"
                transform="rotate(-90 42 42)"/>
              <text x="42" y="46" text-anchor="middle" fill="var(--text-primary)" font-size="16" font-weight="bold">${percentage}%</text>
            </svg>
          </div>
          <div class="topic-progress-info">
            <span class="topic-progress-name">${t.name}</span>
            <span class="topic-progress-course">${course ? course.name : 'Unknown'}</span>
            <span class="topic-progress-meta">${thisWeekText} this week &middot; ${totalText} / ${targetH}h</span>
          </div>
        </div>
      `;
    }).join('');
  }

  /* ============================================================
     RECOVERY PLANS OVERLAY
     ============================================================ */

  function setupRecoveryPlansOverlay() {
    const openBtn = document.getElementById('openRecoveryOverlayBtn');
    const overlay = document.getElementById('recoveryOverlay');
    const closeBtn = document.getElementById('recoveryOverlayClose');
    const backdrop = document.getElementById('recoveryOverlayBackdrop');

    if (openBtn) openBtn.addEventListener('click', () => openRecoveryOverlay());
    if (closeBtn) closeBtn.addEventListener('click', closeRecoveryOverlay);
    if (backdrop) backdrop.addEventListener('click', closeRecoveryOverlay);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && overlay && !overlay.classList.contains('hidden')) {
        closeRecoveryOverlay();
      }
    });
  }

  function openRecoveryOverlay() {
    const overlay = document.getElementById('recoveryOverlay');
    if (overlay) {
      overlay.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
      renderRecoveryOverlayContent();
    }
  }

  function closeRecoveryOverlay() {
    const overlay = document.getElementById('recoveryOverlay');
    if (overlay) {
      overlay.classList.add('hidden');
      document.body.style.overflow = '';
    }
  }

  async function renderRecoveryOverlayContent() {
    const body = document.getElementById('recoveryOverlayBody');
    if (!body) return;

    const user = window.Store.get('user');
    if (!user) {
      body.innerHTML = '<p class="empty-state">Please log in to view recovery plans.</p>';
      return;
    }

    try {
      const activePlan = await getActiveRecoveryPlan(user.uid);
      if (activePlan) {
        renderRecoveryPlanInOverlay(activePlan, body);
        return;
      }

      const shouldGenerate = await shouldGenerateRecoveryPlan(user.uid);
      if (shouldGenerate.needsRecovery) {
        const newPlan = await generateRecoveryPlan(user.uid, shouldGenerate.reasons);
        renderRecoveryPlanInOverlay(newPlan, body);
      } else {
        const allPlans = await fetchRecoveryPlans(user.uid);
        const recentPlans = allPlans.filter(p => p.status !== 'pending').slice(0, 3);
        if (recentPlans.length > 0) {
          renderRecoveryHistoryInOverlay(recentPlans, body);
        } else {
          body.innerHTML = '<p class="empty-state">You\'re on track! No recovery plans needed.</p>';
        }
      }
    } catch (err) {
      console.error('Recovery plan check failed:', err);
      body.innerHTML = '<p class="empty-state">Failed to load recovery plans.</p>';
    }
  }

  async function checkAndRenderRecoveryPlans() {
    const user = window.Store.get('user');
    if (!user) return;
    const section = document.getElementById('recoverySection');
    if (!section) return;

    try {
      const activePlan = await getActiveRecoveryPlan(user.uid);
      const shouldGenerate = await shouldGenerateRecoveryPlan(user.uid);
      const allPlans = await fetchRecoveryPlans(user.uid);
      const hasHistory = allPlans.filter(p => p.status !== 'pending').length > 0;

      if (activePlan || shouldGenerate.needsRecovery || hasHistory) {
        section.classList.remove('hidden');
      } else {
        section.classList.add('hidden');
      }
    } catch (err) {
      section.classList.add('hidden');
    }
  }

  async function shouldGenerateRecoveryPlan(userId) {
    const sessions = window.Store.get('sessions') || [];
    const planner = window.Store.get('planner') || [];
    const courses = window.Store.get('courses') || [];
    const allTopics = window.Store.get('topics') || {};
    const reasons = [];
    let needsRecovery = false;
    const now = new Date();

    const last7Days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(now); d.setDate(d.getDate() - i);
      last7Days.push(d.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase());
    }

    const recentPlanner = planner.filter(p => {
      const planDay = p.day?.toLowerCase();
      return last7Days.includes(planDay);
    });

    const completedTopics = new Set(sessions
      .filter(s => {
        const sessionDate = s.ended_at?.toDate?.() || new Date(s.ended_at);
        const daysSince = (now - sessionDate) / (1000 * 60 * 60 * 24);
        return daysSince <= 7;
      })
      .map(s => s.topic_id));

    const missedPlanner = recentPlanner.filter(p => !completedTopics.has(p.topic_id));
    if (missedPlanner.length >= 2) {
      reasons.push({ type: 'missed_sessions', count: missedPlanner.length, items: missedPlanner.slice(0, 3) });
      needsRecovery = true;
    }

    const subjectLastStudy = {};
    sessions.forEach(s => {
      const topic = Object.values(allTopics).flat().find(t => t.id === s.topic_id);
      if (!topic) return;
      const course = courses.find(c => c.id === topic.course_id);
      if (!course) return;
      const sessionDate = s.ended_at?.toDate?.() || new Date(s.ended_at);
      if (!subjectLastStudy[course.id] || sessionDate > subjectLastStudy[course.id].date) {
        subjectLastStudy[course.id] = { date: sessionDate, name: course.name, topic: topic.name };
      }
    });

    const neglectedSubjects = [];
    Object.entries(subjectLastStudy).forEach(([courseId, data]) => {
      const daysSince = (now - data.date) / (1000 * 60 * 60 * 24);
      if (daysSince >= 5) {
        neglectedSubjects.push({ name: data.name, days: Math.floor(daysSince), topic: data.topic });
      }
    });

    if (neglectedSubjects.length > 0) {
      reasons.push({ type: 'subject_neglect', subjects: neglectedSubjects.slice(0, 3) });
      needsRecovery = true;
    }

    const streak = calculateDayStreak(sessions);
    const uniqueDates = [...new Set(sessions
      .filter(s => s.ended_at)
      .map(s => {
        const d = s.ended_at.toDate ? s.ended_at.toDate() : new Date(s.ended_at);
        return d.toDateString();
      }))].sort((a, b) => new Date(b) - new Date(a));

    if (streak === 0 && uniqueDates.length > 0) {
      const lastDate = new Date(uniqueDates[0]);
      const daysSince = Math.floor((now - lastDate) / (1000 * 60 * 60 * 24));
      if (daysSince >= 2) {
        reasons.push({ type: 'consistency_break', daysSince: daysSince });
        needsRecovery = true;
      }
    }

    return { needsRecovery, reasons };
  }

  async function generateRecoveryPlan(userId, reasons) {
    const sessions = window.Store.get('sessions') || [];
    const courses = window.Store.get('courses') || [];
    const allTopics = window.Store.get('topics') || {};

    const last7Days = sessions.filter(s => {
      const d = s.ended_at?.toDate?.() || new Date(s.ended_at);
      const daysSince = (new Date() - d) / (1000 * 60 * 60 * 24);
      return daysSince <= 7;
    });
    const avgDailyMinutes = last7Days.length > 0 
      ? last7Days.reduce((sum, s) => sum + (s.duration_minutes || 0), 0) / 7 
      : 30;

    const recoveryItems = [];
    let totalAddedMinutes = 0;

    const missedReason = reasons.find(r => r.type === 'missed_sessions');
    if (missedReason) {
      missedReason.items.forEach(item => {
        const course = courses.find(c => c.id === item.course_id);
        const topics = allTopics[item.course_id] || [];
        const topic = topics.find(t => t.id === item.topic_id);
        recoveryItems.push({
          day: 'tomorrow', course: course?.name || 'Unknown', topic: topic?.name || 'Unknown',
          duration: Math.min(45, Math.round(avgDailyMinutes * 0.6)), type: 'catch_up', original_plan: item
        });
        totalAddedMinutes += Math.min(45, Math.round(avgDailyMinutes * 0.6));
      });
    }

    const neglectReason = reasons.find(r => r.type === 'subject_neglect');
    if (neglectReason) {
      neglectReason.subjects.forEach((sub, idx) => {
        recoveryItems.push({
          day: idx === 0 ? 'today' : 'day_after', course: sub.name, topic: sub.topic,
          duration: Math.min(30, Math.round(avgDailyMinutes * 0.5)), type: 'reconnect', days_neglected: sub.days
        });
        totalAddedMinutes += Math.min(30, Math.round(avgDailyMinutes * 0.5));
      });
    }

    const consistencyReason = reasons.find(r => r.type === 'consistency_break');
    if (consistencyReason) {
      recoveryItems.push({
        day: 'today', course: 'General', topic: 'Light Review', duration: 15, type: 'momentum',
        message: 'Start small. 15 minutes today rebuilds the habit.'
      });
      totalAddedMinutes += 15;
    }

    const distributedItems = distributeRecoveryItems(recoveryItems, avgDailyMinutes);

    const planData = {
      user_id: userId, title: generateRecoveryTitle(reasons), description: generateRecoveryDescription(reasons),
      reasons: reasons, items: distributedItems, total_minutes: totalAddedMinutes,
      status: 'pending', created_at: new Date(), distributed_over_days: 3
    };

    return await createRecoveryPlan(userId, planData);
  }

  function distributeRecoveryItems(items, avgCapacity) {
    const days = ['today', 'tomorrow', 'day_after'];
    const distributed = { today: [], tomorrow: [], day_after: [] };
    items.forEach(item => {
      const targetDay = item.day || 'tomorrow';
      const dayKey = days.includes(targetDay) ? targetDay : 'tomorrow';
      const dayTotal = distributed[dayKey].reduce((sum, i) => sum + i.duration, 0);
      if (dayTotal + item.duration > avgCapacity * 1.5) {
        const nextDay = dayKey === 'today' ? 'tomorrow' : 'day_after';
        distributed[nextDay].push({ ...item, day: nextDay });
      } else {
        distributed[dayKey].push(item);
      }
    });
    return distributed;
  }

  function generateRecoveryTitle(reasons) {
    if (reasons.some(r => r.type === 'missed_sessions')) return 'Catch Up on Missed Sessions';
    if (reasons.some(r => r.type === 'subject_neglect')) return 'Reconnect with Neglected Subjects';
    if (reasons.some(r => r.type === 'consistency_break')) return 'Rebuild Your Study Momentum';
    return 'Get Back on Track';
  }

  function generateRecoveryDescription(reasons) {
    const parts = [];
    if (reasons.some(r => r.type === 'missed_sessions')) parts.push('You missed some planned study sessions. Let\'s catch up gently.');
    if (reasons.some(r => r.type === 'subject_neglect')) parts.push('Some subjects haven\'t received attention recently.');
    if (reasons.some(r => r.type === 'consistency_break')) parts.push('Your study streak ended. That\'s okay — let\'s restart small.');
    return parts.join(' ') + ' This plan is designed to be realistic and guilt-free.';
  }

  function renderRecoveryPlanInOverlay(plan, container) {
    if (!container) return;
    const isPending = plan.status === 'pending';
    const isActive = plan.status === 'active';

    let itemsHtml = '';
    ['today', 'tomorrow', 'day_after'].forEach(day => {
      const dayItems = plan.items?.[day] || [];
      if (dayItems.length === 0) return;
      const dayLabel = day === 'today' ? 'Today' : day === 'tomorrow' ? 'Tomorrow' : 'Day After';
      itemsHtml += `<div class="recovery-day"><h5 class="recovery-day-title">${dayLabel}</h5>` +
        dayItems.map(item => `
          <div class="recovery-item">
            <div class="recovery-item-icon">${getRecoveryIcon(item.type)}</div>
            <div class="recovery-item-info">
              <div class="recovery-item-course">${item.course}</div>
              <div class="recovery-item-topic">${item.topic}</div>
              <div class="recovery-item-duration">${item.duration} min</div>
            </div>
          </div>
        `).join('') + '</div>';
    });

    container.innerHTML = `
      <div class="recovery-plan-card ${plan.status}">
        <div class="recovery-plan-header">
          <div class="recovery-plan-icon">🔥</div>
          <div class="recovery-plan-title-section">
            <h4>${plan.title}</h4>
            <p>${plan.description}</p>
          </div>
        </div>
        <div class="recovery-plan-body">${itemsHtml}</div>
        <div class="recovery-plan-actions">
          ${isPending ? `
            <button class="btn btn-primary recovery-accept" data-id="${plan.id}">Accept Plan</button>
            <button class="btn btn-secondary recovery-edit" data-id="${plan.id}">Edit Plan</button>
            <button class="btn btn-outline recovery-dismiss" data-id="${plan.id}">Not Now</button>
          ` : isActive ? `
            <div class="recovery-active-badge">✓ Active — added to your planner</div>
            <button class="btn btn-outline recovery-dismiss" data-id="${plan.id}">Dismiss</button>
          ` : `<div class="recovery-completed-badge">Completed</div>`}
        </div>
      </div>
    `;

    container.querySelector('.recovery-accept')?.addEventListener('click', async () => await handleAcceptPlan(plan));
    container.querySelector('.recovery-dismiss')?.addEventListener('click', async () => await handleDismissPlan(plan.id));
    container.querySelector('.recovery-edit')?.addEventListener('click', () => {
      window.showToast('Edit coming soon — for now, accept and adjust in planner', 'info');
    });
  }

  function renderRecoveryHistoryInOverlay(plans, container) {
    if (!container) return;
    container.innerHTML = `
      <div class="recovery-history">
        <h4>Recent Recovery Plans</h4>
        ${plans.map(plan => `
          <div class="recovery-history-item ${plan.status}">
            <span class="recovery-history-title">${plan.title}</span>
            <span class="recovery-history-status">${plan.status}</span>
            <span class="recovery-history-date">${new Date(plan.created_at?.toDate?.() || plan.created_at).toLocaleDateString()}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  function getRecoveryIcon(type) {
    const icons = { catch_up: '📚', reconnect: '🔗', momentum: '🚀', review: '📝' };
    return icons[type] || '📖';
  }

  async function handleAcceptPlan(plan) {
    const user = window.Store.get('user');
    if (!user) return;
    try {
      const { createPlannerItem } = await import('../firebase.js');
      const allItems = [
        ...(plan.items?.today || []), ...(plan.items?.tomorrow || []), ...(plan.items?.day_after || [])
      ];

      for (const item of allItems) {
        const dayMap = { today: 0, tomorrow: 1, day_after: 2 };
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + (dayMap[item.day] || 1));
        const dayName = targetDate.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
        const courses = window.Store.get('courses') || [];
        const allTopics = window.Store.get('topics') || {};
        const course = courses.find(c => c.name === item.course);
        const topics = course ? allTopics[course.id] || [] : [];
        const topic = topics.find(t => t.name === item.topic);

        if (course && topic) {
          await createPlannerItem(user.uid, {
            course_id: course.id, topic_id: topic.id, day: dayName, start_time: '09:00',
            duration_minutes: item.duration, is_recovery: true, recovery_plan_id: plan.id
          });
        }
      }

      await acceptRecoveryPlan(plan.id);
      window.showToast('Recovery plan accepted! Added to your planner.', 'success');

      const { fetchPlanner } = await import('../firebase.js');
      const plannerItems = await fetchPlanner(user.uid);
      window.Store.set('planner', plannerItems);
      renderRecoveryOverlayContent();
      checkAndRenderRecoveryPlans();
    } catch (err) {
      console.error('Failed to accept recovery plan:', err);
      window.showToast('Failed to accept plan', 'error');
    }
  }

  async function handleDismissPlan(planId) {
    try {
      const user = window.Store.get('user');
      if (!user) return;
      const planner = window.Store.get('planner') || [];
      const itemsToDelete = planner.filter(p => p.recovery_plan_id === planId);
      for (const item of itemsToDelete) {
        try { await deletePlannerItem(item.id); } catch (e) { console.error('Failed to delete planner item:', e); }
      }
      await dismissRecoveryPlan(planId);
      window.showToast('Recovery plan dismissed and removed from planner', 'info');
      const { fetchPlanner } = await import('../firebase.js');
      const plannerItems = await fetchPlanner(user.uid);
      window.Store.set('planner', plannerItems);
      renderRecoveryOverlayContent();
      checkAndRenderRecoveryPlans();
    } catch (err) {
      window.showToast('Failed to dismiss plan', 'error');
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

  /* ============================================================
     PROGRESS REPORTS SYSTEM
     ============================================================ */

  function setupProgressReports() {
    const insightsSection = document.getElementById('activityInsights');
    if (insightsSection) {
      insightsSection.innerHTML = `
        <div class="progress-reports-card" id="progressReportsCard">
          <div class="reports-card-icon">&#128202;</div>
          <div class="reports-card-content">
            <h4>Progress Reports</h4>
            <p>View your monthly academic summaries and track your growth over time.</p>
            <button class="btn btn-primary btn-sm" id="openProgressReports">View Reports</button>
          </div>
        </div>
      `;
      document.getElementById('openProgressReports')?.addEventListener('click', openProgressReports);
    }

    document.getElementById('progressReportsClose')?.addEventListener('click', closeProgressReports);
    document.getElementById('progressReportsBackdrop')?.addEventListener('click', closeProgressReports);
    document.getElementById('reportsBackToYears')?.addEventListener('click', showYearView);
    document.getElementById('reportModalClose')?.addEventListener('click', closeReportModal);
    document.getElementById('reportModalBackdrop')?.addEventListener('click', closeReportModal);
    document.getElementById('reportDownloadBtn')?.addEventListener('click', downloadReportPDF);
  }

  function openProgressReports() {
    document.getElementById('progressReportsOverlay')?.classList.remove('hidden');
    loadReportsData();
  }

  function closeProgressReports() {
    document.getElementById('progressReportsOverlay')?.classList.add('hidden');
    showYearView();
  }

  async function loadReportsData() {
    const user = window.Store.get('user');
    if (!user) return;
    try {
      reportState.reports = await fetchMonthlyReports(user.uid);
    } catch (e) {
      reportState.reports = [];
    }
    const now = new Date();
    reportState.liveReport = await generateLiveReport(user.uid, now.getFullYear(), now.getMonth());
    renderYearView();
  }

  function renderYearView() {
    const grid = document.getElementById('reportsYearGrid');
    if (!grid) return;
    const years = new Set(reportState.reports.map(r => r.year));
    years.add(new Date().getFullYear());
    const sortedYears = Array.from(years).sort((a, b) => b - a);

    grid.innerHTML = sortedYears.map(year => {
      const count = reportState.reports.filter(r => r.year === year).length;
      return `
        <div class="reports-year-card" data-year="${year}">
          <div class="reports-year-icon">&#128193;</div>
          <div class="reports-year-name">${year}</div>
          <div class="reports-year-count">${count} report${count !== 1 ? 's' : ''}</div>
        </div>
      `;
    }).join('');

    grid.querySelectorAll('.reports-year-card').forEach(card => {
      card.addEventListener('click', () => showMonthView(parseInt(card.dataset.year)));
    });

    document.getElementById('reportsYearView')?.classList.remove('hidden');
    document.getElementById('reportsMonthView')?.classList.add('hidden');
  }

  function showMonthView(year) {
    reportState.selectedYear = year;
    const title = document.getElementById('reportsMonthYearTitle');
    if (title) title.textContent = year;

    const grid = document.getElementById('reportsMonthGrid');
    if (!grid) return;

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    grid.innerHTML = MONTH_NAMES.map((name, idx) => {
      const report = reportState.reports.find(r => r.year === year && r.month === idx);
      const isCurrentMonth = year === currentYear && idx === currentMonth;
      const isFuture = year > currentYear || (year === currentYear && idx > currentMonth);

      let statusClass = '';
      let statusLabel = '';
      let badge = '';

      if (isFuture) { statusClass = 'future'; statusLabel = 'No data'; }
      else if (isCurrentMonth) { statusClass = 'live'; statusLabel = 'LIVE'; badge = '<span class="reports-live-badge">LIVE</span>'; }
      else if (report) { statusClass = 'completed'; statusLabel = 'Report Ready'; 
        const classification = report.overall_classification || 'stable_month';
        const emoji = { excellent_improvement: '&#128640;', good_improvement: '&#128200;', stable_month: '&#10145;', slight_decline: '&#128201;', major_decline: '&#9888;' }[classification] || '&#10145;';
        badge = `<span class="reports-status-badge ${classification}">${emoji}</span>`;
      } else { statusClass = 'empty'; statusLabel = 'No report'; }

      return `
        <div class="reports-month-card ${statusClass}" data-month="${idx}" data-year="${year}">
          <div class="reports-month-name">${name}</div>
          <div class="reports-month-status">${statusLabel}</div>
          ${badge}
        </div>
      `;
    }).join('');

    grid.querySelectorAll('.reports-month-card').forEach(card => {
      if (card.classList.contains('future')) return;
      card.addEventListener('click', () => openMonthReport(parseInt(card.dataset.year), parseInt(card.dataset.month)));
    });

    document.getElementById('reportsYearView')?.classList.add('hidden');
    document.getElementById('reportsMonthView')?.classList.remove('hidden');
  }

  function showYearView() {
    document.getElementById('reportsYearView')?.classList.remove('hidden');
    document.getElementById('reportsMonthView')?.classList.add('hidden');
    reportState.selectedYear = null;
  }

  async function openMonthReport(year, month) {
    const user = window.Store.get('user');
    if (!user) return;
    const now = new Date();
    const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();

    let report;
    if (isCurrentMonth) {
      report = reportState.liveReport;
    } else {
      report = await getMonthlyReport(user.uid, year, month);
      if (!report) report = await generateLiveReport(user.uid, year, month);
    }

    if (!report) { window.showToast?.('No data available for this month', 'info'); return; }

    reportState.selectedYear = year;
    reportState.selectedMonth = month;
    renderReportModal(report, isCurrentMonth);
    document.getElementById('reportModalOverlay')?.classList.remove('hidden');
  }

  function closeReportModal() {
    document.getElementById('reportModalOverlay')?.classList.add('hidden');
  }

  /* ============================================================
     REPORT GENERATION ENGINE
     ============================================================ */

  async function generateLiveReport(userId, year, month) {
    const courses = window.Store.get('courses') || [];
    let sessions = window.Store.get('sessions') || [];
    let allTopics = window.Store.get('topics') || {};

    if (sessions.length === 0) {
      try { sessions = await fetchAllSessions(userId); window.Store.set('sessions', sessions); }
      catch (e) { sessions = []; }
    }

    let topicsList = [];
    const topicKeys = Object.keys(allTopics);
    if (topicKeys.length === 0 && courses.length > 0) {
      topicsList = await fetchAllTopics(userId, courses);
      const grouped = {};
      topicsList.forEach(t => { if (!grouped[t.course_id]) grouped[t.course_id] = []; grouped[t.course_id].push(t); });
      window.Store.set('topics', grouped);
      allTopics = grouped;
    } else {
      Object.values(allTopics).forEach(t => topicsList = topicsList.concat(t));
    }

    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 0, 23, 59, 59);

    const monthSessions = sessions.filter(s => {
      const d = s.ended_at?.toDate?.() || s.ended_at;
      return d && d >= monthStart && d <= monthEnd;
    });

    if (monthSessions.length === 0 && !isCurrentMonth(year, month)) return null;

    const prevMonth = month === 0 ? 11 : month - 1;
    const prevYear = month === 0 ? year - 1 : year;
    const prevMonthStart = new Date(prevYear, prevMonth, 1);
    const prevMonthEnd = new Date(prevYear, prevMonth + 1, 0, 23, 59, 59);

    const prevSessions = sessions.filter(s => {
      const d = s.ended_at?.toDate?.() || s.ended_at;
      return d && d >= prevMonthStart && d <= prevMonthEnd;
    });

    const currentMetrics = calculateMonthMetrics(monthSessions, topicsList, courses, monthStart, monthEnd);
    const prevMetrics = calculateMonthMetrics(prevSessions, topicsList, courses, prevMonthStart, prevMonthEnd);

    const primary = {
      study_time: { hours: Math.round(currentMetrics.totalHours * 10) / 10, prev_hours: Math.round(prevMetrics.totalHours * 10) / 10,
        change_percent: prevMetrics.totalHours > 0 ? Math.round(((currentMetrics.totalHours - prevMetrics.totalHours) / prevMetrics.totalHours) * 100) : (currentMetrics.totalHours > 0 ? 100 : 0) },
      consistency: { score: currentMetrics.consistencyScore, prev_score: prevMetrics.consistencyScore,
        change_percent: prevMetrics.consistencyScore > 0 ? Math.round(((currentMetrics.consistencyScore - prevMetrics.consistencyScore) / prevMetrics.consistencyScore) * 100) : (currentMetrics.consistencyScore > 0 ? 100 : 0),
        study_days: currentMetrics.studyDays, missed_days: currentMetrics.missedDays,
        current_streak: currentMetrics.currentStreak, longest_streak: currentMetrics.longestStreak, avg_gap_days: currentMetrics.avgGapDays },
      topic_completion: { started: currentMetrics.topicsStarted, completed: currentMetrics.topicsCompleted, active: currentMetrics.topicsActive,
        prev_completed: prevMetrics.topicsCompleted, change_percent: prevMetrics.topicsCompleted > 0 ? Math.round(((currentMetrics.topicsCompleted - prevMetrics.topicsCompleted) / prevMetrics.topicsCompleted) * 100) : (currentMetrics.topicsCompleted > 0 ? 100 : 0) },
      goal_completion: { target_hours: currentMetrics.goalTarget, actual_hours: Math.round(currentMetrics.totalHours * 10) / 10, percent: currentMetrics.goalPercent,
        prev_percent: prevMetrics.goalPercent, change_percent: prevMetrics.goalPercent > 0 ? Math.round(((currentMetrics.goalPercent - prevMetrics.goalPercent) / prevMetrics.goalPercent) * 100) : (currentMetrics.goalPercent > 0 ? 100 : 0) }
    };

    const overallScore = Math.round(
      Math.min(primary.study_time.hours / 100 * 30, 30) +
      Math.min(primary.consistency.score, 30) +
      Math.min(primary.topic_completion.completed / 20 * 25, 25) +
      Math.min(primary.goal_completion.percent / 100 * 15, 15)
    );

    const prevOverallScore = Math.round(
      Math.min(primary.study_time.prev_hours / 100 * 30, 30) +
      Math.min(primary.consistency.prev_score, 30) +
      Math.min(primary.topic_completion.prev_completed / 20 * 25, 25) +
      Math.min(primary.goal_completion.prev_percent / 100 * 15, 15)
    );

    const overallChange = prevOverallScore > 0
      ? Math.round(((overallScore - prevOverallScore) / prevOverallScore) * 100)
      : (overallScore > 0 ? 100 : 0);

    const classification = classifyMonth(overallChange);

    const secondary = {
      total_sessions: currentMetrics.totalSessions, avg_session_minutes: currentMetrics.avgSessionMinutes,
      subjects: currentMetrics.subjectHours, most_studied_subject: currentMetrics.mostStudiedSubject,
      least_studied_subject: currentMetrics.leastStudiedSubject, weekly_trends: currentMetrics.weeklyTrends,
      achievements: currentMetrics.achievements, records: currentMetrics.records
    };

    const allReports = reportState.reports || [];
    const bestMonth = allReports.length > 0
      ? allReports.reduce((best, r) => { const score = r.overall_score || 0; return score > (best?.overall_score || 0) ? r : best; }, null)
      : null;

    const isNewRecord = !bestMonth || overallScore > (bestMonth.overall_score || 0);
    const profile = window.Store.get('profile') || {};

    return {
      user_id: userId, year, month, generated_at: new Date(),
      student_name: profile.display_name || 'Student', overall_score: overallScore,
      overall_change_percent: overallChange, overall_classification: classification,
      primary_metrics: primary, secondary_metrics: secondary,
      best_month_comparison: {
        best_month: bestMonth ? { year: bestMonth.year, month: bestMonth.month, score: bestMonth.overall_score || 0 } : null,
        current_score: overallScore, difference: bestMonth ? overallScore - (bestMonth.overall_score || 0) : 0, is_new_record: isNewRecord
      },
      ai_reflection: generateAIReflection(primary, secondary, overallChange, classification),
      is_live: isCurrentMonth(year, month)
    };
  }

  function calculateMonthMetrics(sessions, topics, courses, monthStart, monthEnd) {
    const totalMinutes = sessions.reduce((sum, s) => sum + (s.duration_minutes || 0), 0);
    const totalHours = totalMinutes / 60;
    const totalSessions = sessions.length;
    const avgSessionMinutes = totalSessions > 0 ? Math.round(totalMinutes / totalSessions) : 0;

    const studyDates = [...new Set(sessions
      .filter(s => s.ended_at)
      .map(s => {
        const d = s.ended_at.toDate ? s.ended_at.toDate() : new Date(s.ended_at);
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      }))].sort();

    const daysInMonth = monthEnd.getDate();
    const studyDays = studyDates.length;
    const missedDays = daysInMonth - studyDays;

    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 0;
    const today = new Date(); today.setHours(0,0,0,0);
    const lastStudyDate = studyDates.length > 0 ? new Date(studyDates[studyDates.length - 1]) : null;

    if (lastStudyDate) {
      const diff = Math.floor((today - lastStudyDate) / (1000 * 60 * 60 * 24));
      if (diff <= 1) {
        currentStreak = 1;
        for (let i = studyDates.length - 2; i >= 0; i--) {
          const curr = new Date(studyDates[i + 1]);
          const prev = new Date(studyDates[i]);
          const dayDiff = Math.floor((curr - prev) / (1000 * 60 * 60 * 24));
          if (dayDiff === 1) currentStreak++; else break;
        }
      }
    }

    for (let i = 0; i < studyDates.length; i++) {
      if (i === 0) { tempStreak = 1; }
      else {
        const curr = new Date(studyDates[i]);
        const prev = new Date(studyDates[i - 1]);
        const diff = Math.floor((curr - prev) / (1000 * 60 * 60 * 24));
        if (diff === 1) tempStreak++; else tempStreak = 1;
      }
      longestStreak = Math.max(longestStreak, tempStreak);
    }

    let totalGap = 0;
    let gapCount = 0;
    for (let i = 1; i < studyDates.length; i++) {
      const curr = new Date(studyDates[i]);
      const prev = new Date(studyDates[i - 1]);
      const gap = Math.floor((curr - prev) / (1000 * 60 * 60 * 24));
      if (gap > 1) { totalGap += gap - 1; gapCount++; }
    }
    const avgGapDays = gapCount > 0 ? Math.round((totalGap / gapCount) * 10) / 10 : 0;

    const consistencyScore = Math.min(100, Math.round(
      (studyDays / daysInMonth) * 40 +
      (longestStreak / daysInMonth) * 30 +
      (avgGapDays < 2 ? 30 : avgGapDays < 4 ? 20 : avgGapDays < 7 ? 10 : 0)
    ));

    const monthTopics = topics.filter(t => {
      const created = t.created_at?.toDate?.() || t.created_at;
      return created && created >= monthStart && created <= monthEnd;
    });
    const topicsStarted = monthTopics.length;
    const topicsCompleted = topics.filter(t => {
      const completed = t.completed_at?.toDate?.() || t.completed_at;
      return completed && completed >= monthStart && completed <= monthEnd;
    }).length;
    const topicsActive = topics.filter(t => t.status === 'active' || t.status === 'in_progress').length;

    const subjectHours = {};
    sessions.forEach(s => {
      const topic = topics.find(t => t.id === s.topic_id);
      const course = topic ? courses.find(c => c.id === topic.course_id) : null;
      const subject = course ? course.name : 'Unknown';
      subjectHours[subject] = (subjectHours[subject] || 0) + ((s.duration_minutes || 0) / 60);
    });
    const subjectHoursArray = Object.entries(subjectHours)
      .map(([name, hours]) => ({ name, hours: Math.round(hours * 10) / 10 }))
      .sort((a, b) => b.hours - a.hours);

    const mostStudiedSubject = subjectHoursArray.length > 0 ? subjectHoursArray[0].name : null;
    const leastStudiedSubject = subjectHoursArray.length > 0 ? subjectHoursArray[subjectHoursArray.length - 1].name : null;

    const weeklyTrends = [];
    for (let week = 1; week <= 4; week++) {
      const weekStart = new Date(monthStart);
      weekStart.setDate(weekStart.getDate() + (week - 1) * 7);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      weekEnd.setHours(23, 59, 59);

      const weekSessions = sessions.filter(s => {
        const d = s.ended_at?.toDate?.() || s.ended_at;
        return d && d >= weekStart && d <= weekEnd;
      });
      const weekMinutes = weekSessions.reduce((sum, s) => sum + (s.duration_minutes || 0), 0);
      const weekStudyDays = [...new Set(weekSessions.map(s => {
        const d = s.ended_at.toDate ? s.ended_at.toDate() : new Date(s.ended_at);
        return d.getDate();
      }))].length;

      weeklyTrends.push({
        week, hours: Math.round((weekMinutes / 60) * 10) / 10, sessions: weekSessions.length,
        avg_session: weekSessions.length > 0 ? Math.round(weekMinutes / weekSessions.length) : 0, study_days: weekStudyDays
      });
    }

    const goalTarget = 40;
    const goalPercent = goalTarget > 0 ? Math.min(100, Math.round((totalHours / goalTarget) * 100)) : 0;

    return { totalHours, totalSessions, avgSessionMinutes, studyDays, missedDays, currentStreak, longestStreak, avgGapDays,
      consistencyScore, topicsStarted, topicsCompleted, topicsActive, subjectHours: subjectHoursArray, mostStudiedSubject,
      leastStudiedSubject, weeklyTrends, goalTarget, goalPercent, achievements: [], records: [] };
  }

  function classifyMonth(changePercent) {
    if (changePercent > 15) return 'excellent_improvement';
    if (changePercent > 5) return 'good_improvement';
    if (changePercent >= -5) return 'stable_month';
    if (changePercent >= -15) return 'slight_decline';
    return 'major_decline';
  }

  function classificationLabel(classification) {
    const labels = { excellent_improvement: 'Excellent Improvement', good_improvement: 'Good Improvement',
      stable_month: 'Stable Month', slight_decline: 'Slight Decline', major_decline: 'Major Decline' };
    return labels[classification] || 'Stable Month';
  }

  function classificationEmoji(classification) {
    const emojis = { excellent_improvement: '&#128640;', good_improvement: '&#128200;', stable_month: '&#10145;',
      slight_decline: '&#128201;', major_decline: '&#9888;' };
    return emojis[classification] || '&#10145;';
  }

  function generateAIReflection(primary, secondary, overallChange, classification) {
    const parts = [];
    const direction = overallChange >= 0 ? 'improved' : 'declined';
    const absChange = Math.abs(overallChange);
    parts.push(`Compared with last month, your overall study performance ${direction} by ${absChange}%.`);

    const improvements = [
      { name: 'study time', change: primary.study_time.change_percent },
      { name: 'consistency', change: primary.consistency.change_percent },
      { name: 'topic completion', change: primary.topic_completion.change_percent },
      { name: 'goal completion', change: primary.goal_completion.change_percent }
    ].filter(i => i.change > 0).sort((a, b) => b.change - a.change);

    if (improvements.length > 0) {
      parts.push(`Your biggest improvement came from ${improvements[0].name}, which increased by ${improvements[0].change}%.`);
    }

    const declines = [
      { name: 'study time', change: primary.study_time.change_percent },
      { name: 'consistency', change: primary.consistency.change_percent },
      { name: 'topic completion', change: primary.topic_completion.change_percent },
      { name: 'goal completion', change: primary.goal_completion.change_percent }
    ].filter(i => i.change < 0).sort((a, b) => a.change - b.change);

    if (declines.length > 0) {
      parts.push(`Your ${declines[0].name} saw the biggest decline, dropping by ${Math.abs(declines[0].change)}%.`);
    }

    if (secondary.most_studied_subject && secondary.least_studied_subject) {
      parts.push(`${secondary.most_studied_subject} received the most attention this month, while ${secondary.least_studied_subject} needs more focus.`);
    }

    if (classification === 'excellent_improvement' || classification === 'good_improvement') {
      parts.push('Keep up the momentum — you are building excellent study habits.');
    } else if (classification === 'stable_month') {
      parts.push('Consider setting a specific challenge for next month to push beyond your comfort zone.');
    } else {
      parts.push('Next month, focus on consistency first. Even short daily sessions build stronger habits than occasional long ones.');
    }

    return parts.join(' ');
  }

  /* ============================================================
     REPORT MODAL RENDERING
     ============================================================ */

  function renderReportModal(report, isLive) {
    const container = document.getElementById('reportModalContent');
    if (!container) return;

    const p = report.primary_metrics;
    const s = report.secondary_metrics;
    const classification = report.overall_classification;
    const arrow = report.overall_change_percent >= 0 ? '&#8593;' : '&#8595;';
    const absChange = Math.abs(report.overall_change_percent);

    container.innerHTML = `
      <div class="report-document" id="reportDocument">
        <div class="report-header-section">
          <div class="report-logo"><span>Orion</span></div>
          <h1 class="report-title">Monthly Progress Report</h1>
          <div class="report-meta">
            <div class="report-meta-item">
              <span class="meta-label">Month</span>
              <span class="meta-value">${MONTH_NAMES[report.month]} ${report.year}</span>
            </div>
            <div class="report-meta-item">
              <span class="meta-label">Student</span>
              <span class="meta-value">${report.student_name}</span>
            </div>
            <div class="report-meta-item">
              <span class="meta-label">Generated</span>
              <span class="meta-value">${new Date(report.generated_at).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
            </div>
          </div>
          ${isLive ? '<div class="report-live-banner">LIVE REPORT &mdash; This report updates daily. Final version will be saved at month end.</div>' : ''}
        </div>

        <div class="report-section report-hero">
          <div class="report-hero-label">Compared with ${MONTH_NAMES[report.month === 0 ? 11 : report.month - 1]}</div>
          <div class="report-hero-title">Overall Performance</div>
          <div class="report-hero-score ${report.overall_change_percent >= 0 ? 'positive' : 'negative'}">${arrow} ${absChange}%</div>
          <div class="report-hero-classification">
            <span class="classification-emoji">${classificationEmoji(classification)}</span>
            <span class="classification-text">${classificationLabel(classification)}</span>
          </div>
        </div>

        <div class="report-section">
          <h2 class="report-section-title">Primary Metrics</h2>
          <div class="report-metrics-grid">
            <div class="report-metric-card">
              <div class="metric-icon">&#9201;</div>
              <div class="metric-name">Study Time</div>
              <div class="metric-value">${p.study_time.hours}h</div>
              <div class="metric-change ${p.study_time.change_percent >= 0 ? 'positive' : 'negative'}">
                ${p.study_time.change_percent >= 0 ? '&#8593;' : '&#8595;'} ${Math.abs(p.study_time.change_percent)}%
              </div>
              <div class="metric-compare">vs ${p.study_time.prev_hours}h last month</div>
            </div>
            <div class="report-metric-card">
              <div class="metric-icon">&#128197;</div>
              <div class="metric-name">Consistency</div>
              <div class="metric-value">${p.consistency.score}/100</div>
              <div class="metric-change ${p.consistency.change_percent >= 0 ? 'positive' : 'negative'}">
                ${p.consistency.change_percent >= 0 ? '&#8593;' : '&#8595;'} ${Math.abs(p.consistency.change_percent)}%
              </div>
              <div class="metric-compare">${p.consistency.study_days} days &middot; ${p.consistency.missed_days} missed</div>
            </div>
            <div class="report-metric-card">
              <div class="metric-icon">&#9989;</div>
              <div class="metric-name">Topics Completed</div>
              <div class="metric-value">${p.topic_completion.completed}</div>
              <div class="metric-change ${p.topic_completion.change_percent >= 0 ? 'positive' : 'negative'}">
                ${p.topic_completion.change_percent >= 0 ? '&#8593;' : '&#8595;'} ${Math.abs(p.topic_completion.change_percent)}%
              </div>
              <div class="metric-compare">vs ${p.topic_completion.prev_completed} last month</div>
            </div>
            <div class="report-metric-card">
              <div class="metric-icon">&#127919;</div>
              <div class="metric-name">Goal Completion</div>
              <div class="metric-value">${p.goal_completion.percent}%</div>
              <div class="metric-change ${p.goal_completion.change_percent >= 0 ? 'positive' : 'negative'}">
                ${p.goal_completion.change_percent >= 0 ? '&#8593;' : '&#8595;'} ${Math.abs(p.goal_completion.change_percent)}%
              </div>
              <div class="metric-compare">${p.goal_completion.actual_hours}h / ${p.goal_completion.target_hours}h</div>
            </div>
          </div>
        </div>

        <div class="report-section">
          <h2 class="report-section-title">Study Summary</h2>
          <div class="report-summary-row">
            <div class="report-summary-item">
              <div class="summary-value">${formatDuration(s.total_sessions * (s.avg_session_minutes || 0))}</div>
              <div class="summary-label">Total Study Time</div>
            </div>
            <div class="report-summary-item">
              <div class="summary-value">${s.total_sessions}</div>
              <div class="summary-label">Study Sessions</div>
            </div>
            <div class="report-summary-item">
              <div class="summary-value">${formatDuration(s.avg_session_minutes)}</div>
              <div class="summary-label">Average Session</div>
            </div>
          </div>
        </div>

        <div class="report-section">
          <h2 class="report-section-title">Consistency</h2>
          <div class="report-consistency-grid">
            <div class="consistency-item">
              <div class="consistency-value">${p.consistency.current_streak}</div>
              <div class="consistency-label">Current Streak</div>
            </div>
            <div class="consistency-item">
              <div class="consistency-value">${p.consistency.longest_streak}</div>
              <div class="consistency-label">Longest Streak</div>
            </div>
            <div class="consistency-item">
              <div class="consistency-value">${p.consistency.study_days}</div>
              <div class="consistency-label">Study Days</div>
            </div>
            <div class="consistency-item">
              <div class="consistency-value">${p.consistency.missed_days}</div>
              <div class="consistency-label">Missed Days</div>
            </div>
            <div class="consistency-item">
              <div class="consistency-value">${p.consistency.avg_gap_days}</div>
              <div class="consistency-label">Avg Gap (days)</div>
            </div>
          </div>
        </div>

        ${s.subjects && s.subjects.length > 0 ? `
        <div class="report-section">
          <h2 class="report-section-title">Subject Performance</h2>
          <div class="report-subjects">
            ${s.subjects.map(sub => `
              <div class="report-subject-bar">
                <div class="subject-bar-info">
                  <span class="subject-bar-name">${sub.name}</span>
                  <span class="subject-bar-hours">${sub.hours}h</span>
                </div>
                <div class="subject-bar-track">
                  <div class="subject-bar-fill" style="width: ${Math.min(100, (sub.hours / (s.subjects[0].hours || 1)) * 100)}%"></div>
                </div>
              </div>
            `).join('')}
          </div>
          <div class="report-subject-extremes">
            ${s.most_studied_subject ? `<div class="subject-extreme most">&#128293; Most Studied: <strong>${s.most_studied_subject}</strong></div>` : ''}
            ${s.least_studied_subject ? `<div class="subject-extreme least">&#128164; Least Studied: <strong>${s.least_studied_subject}</strong></div>` : ''}
          </div>
        </div>
        ` : ''}

        ${s.weekly_trends && s.weekly_trends.length > 0 ? `
        <div class="report-section">
          <h2 class="report-section-title">Weekly Trends</h2>
          <div class="report-weekly-trends">
            ${s.weekly_trends.map((week, i) => {
              const prev = i > 0 ? s.weekly_trends[i - 1] : null;
              const timeChange = prev ? Math.round(((week.hours - prev.hours) / (prev.hours || 1)) * 100) : 0;
              const sessionChange = prev ? week.sessions - prev.sessions : 0;
              return `
                <div class="weekly-trend-card">
                  <div class="weekly-trend-week">Week ${week.week}</div>
                  <div class="weekly-trend-stats">
                    <div class="weekly-stat">
                      <span class="weekly-stat-label">Study Time</span>
                      <span class="weekly-stat-value">${week.hours}h</span>
                      ${prev ? `<span class="weekly-stat-change ${timeChange >= 0 ? 'positive' : 'negative'}">${timeChange >= 0 ? '&#8593;' : '&#8595;'} ${Math.abs(timeChange)}%</span>` : '<span class="weekly-stat-change neutral">&#8212;</span>'}
                    </div>
                    <div class="weekly-stat">
                      <span class="weekly-stat-label">Sessions</span>
                      <span class="weekly-stat-value">${week.sessions}</span>
                      ${prev ? `<span class="weekly-stat-change ${sessionChange >= 0 ? 'positive' : 'negative'}">${sessionChange >= 0 ? '+' : ''}${sessionChange}</span>` : '<span class="weekly-stat-change neutral">&#8212;</span>'}
                    </div>
                    <div class="weekly-stat">
                      <span class="weekly-stat-label">Avg Session</span>
                      <span class="weekly-stat-value">${formatDuration(week.avg_session)}</span>
                    </div>
                    <div class="weekly-stat">
                      <span class="weekly-stat-label">Study Days</span>
                      <span class="weekly-stat-value">${week.study_days}</span>
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
        ` : ''}

        <div class="report-section report-reflection">
          <div class="reflection-header">
            <div class="reflection-icon">&#129302;</div>
            <h2>AI Reflection</h2>
          </div>
          <div class="reflection-quote">
            <span class="quote-mark">&ldquo;</span>
            ${report.ai_reflection}
            <span class="quote-mark">&rdquo;</span>
          </div>
        </div>

        <div class="report-section">
          <h2 class="report-section-title">Best Month Comparison</h2>
          ${report.best_month_comparison.is_new_record ? `
            <div class="report-new-record">
              <div class="new-record-icon">&#127942;</div>
              <div class="new-record-title">New Personal Best!</div>
              <div class="new-record-detail">Overall Score: ${report.overall_score}</div>
            </div>
          ` : report.best_month_comparison.best_month ? `
            <div class="report-best-month">
              <div class="best-month-header">
                <div class="best-month-label">Best Month Ever</div>
                <div class="best-month-name">${MONTH_NAMES[report.best_month_comparison.best_month.month]} ${report.best_month_comparison.best_month.year}</div>
                <div class="best-month-score">Score: ${report.best_month_comparison.best_month.score}</div>
              </div>
              <div class="best-month-divider"></div>
              <div class="current-month-header">
                <div class="current-month-label">This Month</div>
                <div class="current-month-score">Score: ${report.best_month_comparison.current_score}</div>
                <div class="current-month-diff ${report.best_month_comparison.difference >= 0 ? 'positive' : 'negative'}">
                  ${report.best_month_comparison.difference >= 0 ? '+' : ''}${report.best_month_comparison.difference}
                </div>
              </div>
            </div>
          ` : `
            <div class="report-best-month empty">
              <p>This is your first recorded month. Keep studying to build your history!</p>
            </div>
          `}
        </div>

        <div class="report-section">
          <h2 class="report-section-title">Historical Comparison</h2>
          <div class="report-historical">
            <div class="historical-row">
              <span class="historical-label">Study Time</span>
              <span class="historical-value ${p.study_time.change_percent >= 0 ? 'positive' : 'negative'}">
                ${p.study_time.change_percent >= 0 ? '&#8593;' : '&#8595;'} ${Math.abs(p.study_time.change_percent)}%
              </span>
            </div>
            <div class="historical-row">
              <span class="historical-label">Consistency</span>
              <span class="historical-value ${p.consistency.change_percent >= 0 ? 'positive' : 'negative'}">
                ${p.consistency.change_percent >= 0 ? '&#8593;' : '&#8595;'} ${Math.abs(p.consistency.change_percent)}%
              </span>
            </div>
            <div class="historical-row">
              <span class="historical-label">Topics Completed</span>
              <span class="historical-value ${p.topic_completion.change_percent >= 0 ? 'positive' : 'negative'}">
                ${p.topic_completion.change_percent >= 0 ? '&#8593;' : '&#8595;'} ${Math.abs(p.topic_completion.change_percent)}%
              </span>
            </div>
            <div class="historical-row">
              <span class="historical-label">Goal Completion</span>
              <span class="historical-value ${p.goal_completion.change_percent >= 0 ? 'positive' : 'negative'}">
                ${p.goal_completion.change_percent >= 0 ? '&#8593;' : '&#8595;'} ${Math.abs(p.goal_completion.change_percent)}%
              </span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function downloadReportPDF() {
    const element = document.getElementById('reportDocument');
    if (!element) return;
    if (typeof html2pdf === 'undefined') {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
      script.onload = () => generatePDF(element);
      script.onerror = () => window.showToast?.('Failed to load PDF generator', 'error');
      document.head.appendChild(script);
    } else {
      generatePDF(element);
    }
  }

  function generatePDF(element) {
    const opt = {
      margin: [10, 10],
      filename: `Orion_Report_${reportState.selectedYear}_${String(reportState.selectedMonth + 1).padStart(2, '0')}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    html2pdf().set(opt).from(element).save()
      .then(() => window.showToast?.('Report downloaded!', 'success'))
      .catch(() => window.showToast?.('Download failed', 'error'));
  }

  function isCurrentMonth(year, month) {
    const now = new Date();
    return year === now.getFullYear() && month === now.getMonth();
  }

  /* ============================================================
     EXISTING ACTIVITY FEATURES
     ============================================================ */

  async function renderActivity() {
    const user = window.Store.get('user');
    let courses = window.Store.get('courses') || [];
    let sessions = window.Store.get('sessions') || [];
    let allTopics = window.Store.get('topics') || {};

    const topicKeys = Object.keys(allTopics);
    if (topicKeys.length === 0 && courses.length > 0) {
      for (const course of courses) {
        try {
          const topics = await fetchTopics(course.id);
          allTopics[course.id] = topics;
        } catch (err) { console.error('Failed to fetch topics:', err); }
      }
      window.Store.set('topics', allTopics);
    }

    if (sessions.length === 0 && user) {
      try {
        sessions = await fetchSessions(user.uid);
        window.Store.set('sessions', sessions);
      } catch (err) { console.error('Failed to fetch sessions:', err); }
    }

    renderTopicProgressButton();
    renderProgressChart(sessions);
  }

  function renderTopicProgressButton() {
    const container = document.getElementById('subjectProgressList');
    if (!container) return;

    const allTopics = window.Store.get('topics') || {};
    let allTopicsList = [];
    Object.values(allTopics).forEach(topics => allTopicsList = allTopicsList.concat(topics));

    if (allTopicsList.length === 0) {
      container.innerHTML = '<p class="empty-state">No topics yet. Create topics in the Courses page!</p>';
      return;
    }

    const totalTopics = allTopicsList.length;
    const avgProgress = Math.round(allTopicsList.reduce((sum, t) => {
      return sum + (t.target_hours > 0 ? Math.min(100, Math.round((t.completed_hours || 0) / t.target_hours * 100)) : 0);
    }, 0) / totalTopics);

    container.innerHTML = `
      <div class="topic-progress-summary-card" id="openTopicProgressBtn">
        <div class="topic-progress-summary-icon">&#128200;</div>
        <div class="topic-progress-summary-info">
          <h4>Topic Progress</h4>
          <p>${totalTopics} topic${totalTopics !== 1 ? 's' : ''} &middot; ${avgProgress}% average completion</p>
        </div>
        <button class="btn btn-primary btn-sm">View Details</button>
      </div>
    `;
  }

  function getThisWeekTime(topicSessions) {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    return topicSessions
      .filter(s => {
        if (!s.ended_at) return false;
        const d = s.ended_at.toDate ? s.ended_at.toDate() : new Date(s.ended_at);
        return d >= startOfWeek;
      })
      .reduce((sum, s) => sum + (s.duration_minutes || 0), 0);
  }

  function renderProgressChart(sessions) {
    const container = document.getElementById('progressChart');
    if (!container) return;

    if (!sessions || sessions.length === 0) {
      container.innerHTML = '<p class="empty-state">No study data yet. Start studying!</p>';
      return;
    }

    const now = new Date();
    let labels = [];
    let data = [];

    if (currentView === 'weekly') {
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay());
      startOfWeek.setHours(0, 0, 0, 0);

      for (let i = 0; i < 7; i++) {
        const day = new Date(startOfWeek);
        day.setDate(startOfWeek.getDate() + i);
        const dayStr = day.toDateString();
        const dayMinutes = sessions
          .filter(s => {
            if (!s.ended_at) return false;
            const d = s.ended_at.toDate ? s.ended_at.toDate() : new Date(s.ended_at);
            return d.toDateString() === dayStr;
          })
          .reduce((sum, s) => sum + (s.duration_minutes || 0), 0);
        labels.push(days[day.getDay()]);
        data.push(dayMinutes);
      }
    } else {
      for (let i = 3; i >= 0; i--) {
        const month = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthStr = month.toLocaleDateString('en-US', { month: 'short' });
        const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);
        const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 0, 23, 59, 59);
        const monthMinutes = sessions
          .filter(s => {
            if (!s.ended_at) return false;
            const d = s.ended_at.toDate ? s.ended_at.toDate() : new Date(s.ended_at);
            return d >= monthStart && d <= monthEnd;
          })
          .reduce((sum, s) => sum + (s.duration_minutes || 0), 0);
        labels.push(monthStr);
        data.push(monthMinutes);
      }
    }

    const maxValue = Math.max(...data, 1);
    const chartHeight = 200;

    container.innerHTML = `
      <div class="chart-bars">
        ${labels.map((label, i) => {
          const barHeight = (data[i] / maxValue) * chartHeight;
          const hours = Math.floor(data[i] / 60);
          const mins = data[i] % 60;
          const timeText = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
          return `
            <div class="chart-bar-wrapper">
              <span class="chart-value">${timeText}</span>
              <div class="chart-bar" style="height: ${barHeight}px"></div>
              <span class="chart-label">${label}</span>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  function formatDuration(minutes) {
    if (!minutes || minutes === 0) return '0m';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  init();
})();