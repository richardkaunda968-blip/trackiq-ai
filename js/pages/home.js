/* ============================================
   TRACKIQ — HOME PAGE (v2)
   Planner with overlay form, auto end time
   ============================================ */

import { createPlannerItem, deletePlannerItem, fetchPlanner, fetchTopics } from '../firebase.js';

(function() {
  let dataCheckInterval = null;

  function init() {
    console.log('home.js init() called');
    setupPlannerForm();
    setupProfilePopup();

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

  /* ---------- GREETING HELPER ---------- */
  function getGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }

  function updatePageSubtitle() {
    const subtitle = document.getElementById('homeSubtitle');
    const profile = window.Store.get('profile') || {};
    const name = profile.display_name || 'Student';
    if (subtitle) {
      subtitle.textContent = `${getGreeting()}, ${name} — here's your study overview`;
    }
  }

  function renderHome() {
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
    renderPlanner();
    renderStudyTips();
    populatePlannerCourses();
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

  /* ---------- PLANNER OVERLAY ---------- */
  function populatePlannerCourses() {
    const courseSelect = document.getElementById('plannerCourse');
    if (!courseSelect) return;
    const courses = window.Store.get('courses') || [];
    courseSelect.innerHTML = '<option value="">Select Course</option>' +
      courses.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  }

  function openPlannerOverlay() {
    const overlay = document.getElementById('plannerOverlay');
    if (overlay) {
      overlay.classList.remove('hidden');
      // Reset form
      const form = document.getElementById('plannerForm');
      if (form) form.reset();
      const topicSelect = document.getElementById('plannerTopic');
      if (topicSelect) {
        topicSelect.innerHTML = '<option value="">Select Topic</option>';
        topicSelect.disabled = true;
      }
      populatePlannerCourses();
    }
  }

  function closePlannerOverlay() {
    const overlay = document.getElementById('plannerOverlay');
    if (overlay) overlay.classList.add('hidden');
  }

  function setupPlannerForm() {
    const addBtn = document.getElementById('plannerAddBtn');
    const closeBtn = document.getElementById('plannerOverlayClose');
    const cancelBtn = document.getElementById('plannerOverlayCancel');
    const backdrop = document.getElementById('plannerOverlayBackdrop');
    const form = document.getElementById('plannerForm');

    if (addBtn) addBtn.addEventListener('click', openPlannerOverlay);
    if (closeBtn) closeBtn.addEventListener('click', closePlannerOverlay);
    if (cancelBtn) cancelBtn.addEventListener('click', closePlannerOverlay);
    if (backdrop) backdrop.addEventListener('click', closePlannerOverlay);

    const courseSelect = document.getElementById('plannerCourse');
    const topicSelect = document.getElementById('plannerTopic');

    if (courseSelect) {
      courseSelect.addEventListener('change', async () => {
        const courseId = courseSelect.value;
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
            topics.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
          topicSelect.disabled = false;
        } catch (err) {
          console.error('Failed to fetch topics:', err);
        }
      });
    }

    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const user = window.Store.get('user');
        if (!user) return;

        const courseId = document.getElementById('plannerCourse').value;
        const topicId = document.getElementById('plannerTopic').value;
        const day = document.getElementById('plannerDay').value;
        const startTime = document.getElementById('plannerStartTime').value;
        const durationHours = parseInt(document.getElementById('plannerDurationHours').value) || 0;
        const durationMinutes = parseInt(document.getElementById('plannerDurationMinutes').value) || 0;
        const totalDurationMinutes = (durationHours * 60) + durationMinutes;

        if (!courseId || !topicId || !day || !startTime || totalDurationMinutes <= 0) {
          window.showToast('Please fill in all fields', 'error');
          return;
        }

        try {
          await createPlannerItem(user.uid, {
            course_id: courseId,
            topic_id: topicId,
            day: day,
            start_time: startTime,
            duration_minutes: totalDurationMinutes
          });
          window.showToast('Study block added!', 'success');
          closePlannerOverlay();
          renderPlanner();
        } catch (err) {
          window.showToast(err.message, 'error');
        }
      });
    }
  }

  async function renderPlanner() {
    const container = document.getElementById('plannerContainer');
    if (!container) return;

    const user = window.Store.get('user');
    if (!user) return;

    try {
      const plannerItems = await fetchPlanner(user.uid);
      window.Store.set('planner', plannerItems);

      const courses = window.Store.get('courses') || [];
      const allTopics = window.Store.get('topics') || {};

      const dayOrder = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
      const today = new Date().toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();

      const grouped = {};
      plannerItems.forEach(item => {
        if (!grouped[item.day]) grouped[item.day] = [];
        grouped[item.day].push(item);
      });

      Object.keys(grouped).forEach(day => {
        grouped[day].sort((a, b) => a.start_time.localeCompare(b.start_time));
      });

      if (plannerItems.length === 0) {
        container.innerHTML = '<p class="empty-state">No study blocks planned. Add one above!</p>';
        return;
      }

      container.innerHTML = dayOrder.map(day => {
        if (!grouped[day]) return '';
        const isToday = day === today;
        const dayLabel = day.charAt(0).toUpperCase() + day.slice(1);

        return `
          <div class="planner-day ${isToday ? 'planner-today' : ''}">
            <h4 class="planner-day-title">${dayLabel} ${isToday ? '(Today)' : ''}</h4>
            ${grouped[day].map(item => {
              const course = courses.find(c => c.id === item.course_id);
              const topics = allTopics[item.course_id] || [];
              const topic = topics.find(t => t.id === item.topic_id);
              const endTime = calculateEndTime(item.start_time, item.duration_minutes);
              return `
                <div class="planner-item" data-id="${item.id}">
                  <div class="planner-time">${formatTime12(item.start_time)} – ${formatTime12(endTime)}</div>
                  <div class="planner-detail">
                    <span class="planner-course">${course ? course.name : 'Unknown Course'}</span>
                    <span class="planner-sep">→</span>
                    <span class="planner-topic">${topic ? topic.name : 'Unknown Topic'}</span>
                  </div>
                  <button class="btn btn-icon btn-delete-planner" data-id="${item.id}" title="Remove">🗑️</button>
                </div>
              `;
            }).join('')}
          </div>
        `;
      }).join('');

      container.querySelectorAll('.btn-delete-planner').forEach(btn => {
        btn.addEventListener('click', async () => {
          try {
            await deletePlannerItem(btn.dataset.id);
            renderPlanner();
            window.showToast('Study block removed', 'success');
          } catch (err) {
            window.showToast(err.message, 'error');
          }
        });
      });
    } catch (err) {
      container.innerHTML = '<p class="empty-state">Failed to load planner.</p>';
    }
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

  function renderStudyTips() {
    const container = document.getElementById('studyTipsContainer');
    if (!container) return;
    const tips = [
      'Take a 5-minute break every 25 minutes (Pomodoro technique)',
      'Review your notes within 24 hours for better retention',
      'Teach what you learned to someone else to reinforce memory',
      'Stay hydrated — dehydration affects concentration',
      'Get 7-9 hours of sleep for optimal memory consolidation'
    ];
    const randomTip = tips[Math.floor(Math.random() * tips.length)];
    container.innerHTML = `
      <div class="tip-card">
        <span class="tip-icon">💡</span>
        <p class="tip-text">${randomTip}</p>
      </div>
    `;
  }

  init();
})();