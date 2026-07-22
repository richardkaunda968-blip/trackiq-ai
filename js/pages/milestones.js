/* ============================================
   ORION — MILESTONES PAGE (v2)
   Gamification with Focus Block daily milestone
   ============================================ */

import { createMilestone, fetchMilestones, updateProfileData, getProfile } from '../firebase.js';

(function() {
  const MILESTONE_DEFINITIONS = [
    {
      id: 'daily_streak',
      name: 'Daily Streak',
      description: 'Study a specific subject for a set goal time. Resets daily.',
      icon: '🔥',
      type: 'daily'
    },
    {
      id: 'no_days_off',
      name: 'No Days Off',
      description: 'Complete all scheduled study slots for the week. Resets weekly. Auto tracked.',
      icon: '💪',
      type: 'weekly'
    },
    {
      id: 'time_target',
      name: 'Time Target',
      description: 'Reach a weekly study hour goal. Resets weekly.',
      icon: '⏰',
      type: 'weekly'
    },
    {
      id: 'focus_block',
      name: 'Focus Block',
      description: 'Complete a full-duration study session without interruption. Resets daily.',
      icon: '🎯',
      type: 'daily'
    },
    {
      id: 'study_progress',
      name: 'Study Progress',
      description: 'Reach 100% in any subject progress ring from the Activity page. Per subject. Auto tracked.',
      icon: '📈',
      type: 'per_subject'
    }
  ];

  // Track focus block state for daily reset
  let focusBlockState = {
    completedToday: false,
    lastResetDate: null
  };

  function init() {
    loadFocusBlockState();
    renderMilestones();
    renderRecentAchievements();
    renderXPLevel();
    setupFocusBlockListener();

    window.addEventListener('pagechange', (e) => {
      if (e.detail.page === 'milestones') {
        updatePageSubtitle();
        renderMilestones();
        renderRecentAchievements();
        renderXPLevel();
      }
    });
  }

  /* ---------- FOCUS BLOCK MILESTONE SYSTEM ---------- */

  function loadFocusBlockState() {
    const stored = localStorage.getItem('focusBlockState');
    if (stored) {
      focusBlockState = JSON.parse(stored);
    }
    checkAndResetFocusBlock();
  }

  function saveFocusBlockState() {
    localStorage.setItem('focusBlockState', JSON.stringify(focusBlockState));
  }

  function checkAndResetFocusBlock() {
    const now = new Date();
    const today = now.toDateString();

    if (focusBlockState.lastResetDate !== today) {
      focusBlockState.completedToday = false;
      focusBlockState.lastResetDate = today;
      saveFocusBlockState();
    }
  }

  function setupFocusBlockListener() {
    // Listen for study session end events
    window.addEventListener('studysession:end', async (e) => {
      const sessionData = e.detail;
      if (!sessionData) return;

      // Check if this was a successful full-duration session
      const { duration_minutes, planned_duration_minutes, interrupted } = sessionData;

      // A focus block is: completed full planned duration, not interrupted
      const isFullDuration = planned_duration_minutes && 
        duration_minutes >= planned_duration_minutes * 0.95; // Allow 5% tolerance
      const wasNotInterrupted = interrupted !== true;

      if (isFullDuration && wasNotInterrupted && !focusBlockState.completedToday) {
        await completeFocusBlockMilestone(sessionData);
      }
    });

    // Also check on page load in case session ended while on another page
    window.addEventListener('focus', () => {
      checkAndResetFocusBlock();
    });
  }

  async function completeFocusBlockMilestone(sessionData) {
    const user = window.Store.get('user');
    if (!user) return;

    checkAndResetFocusBlock();

    if (focusBlockState.completedToday) return; // Already completed today

    try {
      // Award XP for focus block
      const xpEarned = 25; // Base XP for focus block
      const profile = window.Store.get('profile') || {};
      const currentXP = profile.xp || 0;
      const currentLevel = profile.level || 1;

      const newXP = currentXP + xpEarned;
      const xpForNext = 50 * currentLevel * currentLevel;

      let newLevel = currentLevel;
      let levelUp = false;

      if (newXP >= xpForNext) {
        newLevel = currentLevel + 1;
        levelUp = true;
      }

      // Update profile
      await updateProfileData(user.uid, {
        xp: newXP,
        level: newLevel,
        milestones_count: (profile.milestones_count || 0) + 1
      });

      // Create milestone record
      await createMilestone(user.uid, {
        name: 'Focus Block',
        description: `Completed a ${sessionData.duration_minutes}min uninterrupted study session`,
        icon: '🎯',
        type: 'daily',
        xp_earned: xpEarned,
        session_id: sessionData.id || null,
        achieved_at: new Date()
      });

      // Update local state
      focusBlockState.completedToday = true;
      focusBlockState.lastResetDate = new Date().toDateString();
      saveFocusBlockState();

      // Update store
      const updatedProfile = await getProfile(user.uid);
      window.Store.set('profile', updatedProfile);

      // Show toast
      if (levelUp) {
        window.showToast(`🎯 Focus Block Complete! +${xpEarned} XP — LEVEL UP! Lv. ${newLevel}`, 'success');
      } else {
        window.showToast(`🎯 Focus Block Complete! +${xpEarned} XP`, 'success');
      }

      // Refresh milestones page if visible
      renderMilestones();
      renderRecentAchievements();
      renderXPLevel();

    } catch (err) {
      console.error('Failed to complete focus block milestone:', err);
    }
  }

  /* ---------- GREETING HELPER ---------- */
  function updatePageSubtitle() {
    const subtitle = document.getElementById('milestonesSubtitle');
    if (subtitle) {
      window.OrionInjector.updateGreeting(subtitle);
    }
    if (window.OrionInjector) window.OrionInjector.inject('page-milestones', 'milestonesSubtitle');
  }

  function renderMilestones() {
    const container = document.getElementById('milestonesList');
    const profile = window.Store.get('profile') || {};
    const sessions = window.Store.get('sessions') || [];
    const courses = window.Store.get('courses') || [];

    if (!container) return;

    const progress = calculateMilestoneProgress(sessions, courses, profile);

    container.innerHTML = MILESTONE_DEFINITIONS.map(m => {
      const prog = progress[m.id] || { current: 0, target: 1, completed: false };
      const percent = Math.min(100, Math.round((prog.current / prog.target) * 100));

      return `
        <div class="milestone-card ${prog.completed ? 'completed' : ''}" data-id="${m.id}">
          <div class="milestone-icon">${m.icon}</div>
          <div class="milestone-info">
            <h4>${m.name}</h4>
            <p>${m.description}</p>
            <div class="milestone-progress-bar">
              <div class="milestone-progress-fill" style="width: ${percent}%"></div>
            </div>
            <span class="milestone-progress-text">${prog.current} / ${prog.target}</span>
          </div>
          ${prog.completed ? '<div class="milestone-badge">✓</div>' : ''}
        </div>
      `;
    }).join('');
  }

  function calculateMilestoneProgress(sessions, courses, profile) {
    const progress = {};
    const now = new Date();

    // Daily Streak
    const todaySessions = sessions.filter(s => {
      const d = s.ended_at?.toDate();
      return d && d.toDateString() === now.toDateString();
    });
    const todayMinutes = todaySessions.reduce((sum, s) => sum + (s.duration_minutes || 0), 0);
    progress.daily_streak = {
      current: todayMinutes,
      target: 60,
      completed: todayMinutes >= 60
    };

    // No Days Off (weekly)
    const thisWeekDays = new Set();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    sessions.forEach(s => {
      const d = s.ended_at?.toDate();
      if (d && d >= startOfWeek) {
        thisWeekDays.add(d.toDateString());
      }
    });
    const scheduledDays = courses.length * 7;
    progress.no_days_off = {
      current: thisWeekDays.size,
      target: 7,
      completed: thisWeekDays.size >= 7
    };

    // Time Target
    const thisWeekMinutes = sessions
      .filter(s => {
        const d = s.ended_at?.toDate();
        return d && d >= startOfWeek;
      })
      .reduce((sum, s) => sum + (s.duration_minutes || 0), 0);
    const weeklyGoal = (profile.weekly_goal || 15) * 60;
    progress.time_target = {
      current: Math.round(thisWeekMinutes / 60),
      target: profile.weekly_goal || 15,
      completed: thisWeekMinutes >= weeklyGoal
    };

    // Focus Block — daily, resets at midnight
    checkAndResetFocusBlock();
    const focusSessionsToday = sessions.filter(s => {
      const d = s.ended_at?.toDate?.() || new Date(s.ended_at);
      return d && d.toDateString() === now.toDateString() && 
             (s.duration_minutes || 0) >= 25 &&
             s.interrupted !== true;
    });

    // Also check the stored state
    const isFocusCompleted = focusBlockState.completedToday || focusSessionsToday.length > 0;

    progress.focus_block = {
      current: isFocusCompleted ? 1 : 0,
      target: 1,
      completed: isFocusCompleted
    };

    // Study Progress
    const completedSubjects = courses.filter(c => {
      const subjectSessions = sessions.filter(s => s.course_id === c.id);
      const weekMinutes = subjectSessions
        .filter(s => {
          const d = s.ended_at?.toDate();
          return d && d >= startOfWeek;
        })
        .reduce((sum, s) => sum + (s.duration_minutes || 0), 0);
      return weekMinutes >= (c.weekly_goal || 5) * 60;
    });
    progress.study_progress = {
      current: completedSubjects.length,
      target: Math.max(1, courses.length),
      completed: completedSubjects.length > 0
    };

    return progress;
  }

  function renderRecentAchievements() {
    const container = document.getElementById('recentAchievements');
    const milestones = window.Store.get('milestones') || [];

    if (!container) return;

    const recent = milestones.slice(0, 5);

    if (recent.length === 0) {
      container.innerHTML = '<p class="empty-state">No achievements yet. Keep studying!</p>';
      return;
    }

    container.innerHTML = recent.map(m => `
      <div class="achievement-item">
        <span class="achievement-icon">${m.icon || '🏆'}</span>
        <div class="achievement-info">
          <span class="achievement-name">${m.name}</span>
          <span class="achievement-date">${formatDate(m.achieved_at)}</span>
        </div>
        <span class="achievement-xp">+${m.xp_earned || 0} XP</span>
      </div>
    `).join('');
  }

  function renderXPLevel() {
    const profile = window.Store.get('profile') || {};
    const xp = profile.xp || 0;
    const level = profile.level || 1;

    const xpForNext = 50 * level * level;
    const xpForCurrent = 50 * (level - 1) * (level - 1);
    const xpInLevel = xp - xpForCurrent;
    const xpNeeded = xpForNext - xpForCurrent;
    const percent = Math.min(100, Math.round((xpInLevel / xpNeeded) * 100));

    const levelDisplay = document.getElementById('milestoneLevel');
    const xpDisplay = document.getElementById('milestoneXP');
    const progressBar = document.getElementById('milestoneXPBar');

    if (levelDisplay) levelDisplay.textContent = `Level ${level}`;
    if (xpDisplay) xpDisplay.textContent = `${xpInLevel} / ${xpNeeded} XP`;
    if (progressBar) progressBar.style.width = `${percent}%`;
  }

  function formatDate(timestamp) {
    if (!timestamp) return '--';
    const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  init();
})();