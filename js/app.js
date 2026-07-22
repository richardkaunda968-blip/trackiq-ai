/* ============================================
   ORION — APP INITIALIZATION (v3)
   Notifications + D.N.D. Global State + Enhanced Auth
   ============================================ */

import { onAuthChange, getProfile, fetchCourses, fetchSessions, fetchPlanner, fetchTopics, getUserSettings } from './firebase.js';

const App = (function() {
  let initialAuthChecked = false;
  let notificationPermission = 'default';

  async function init() {
    if (window.ThemeManager && window.ThemeManager.init) {
      window.ThemeManager.init();
    }
    setupAuthListener();
    if (window.Router && window.Router.init) {
      window.Router.init();
    }
    setupGlobalHandlers();
    setupStudySpaceClose();
    setupNotificationBanner();
    setupServiceWorker();
    console.log('Orion v3 initialized');
  }

  function setupAuthListener() {
    onAuthChange(async (user) => {
      if (user) {
        window.Store.set('user', user);
        await loadUserData(user.uid);
      } else {
        window.Store.set('user', null);
        window.Store.set('profile', null);
        window.Store.set('courses', []);
        window.Store.set('topics', {});
        window.Store.set('resources', {});
        window.Store.set('sessions', []);
        window.Store.set('planner', []);
        window.Store.set('userSettings', null);

        document.getElementById('page-auth').classList.remove('hidden');
        document.getElementById('appShell').classList.add('hidden');
        document.getElementById('mobileNav').classList.add('hidden');

        window.Router.navigate('auth');
      }

      if (!initialAuthChecked) {
        initialAuthChecked = true;
      }
    });
  }

  async function loadUserData(userId) {
    try {
      const [profile, settings] = await Promise.all([
        getProfile(userId),
        getUserSettings(userId)
      ]);
      
      window.Store.set('profile', profile);
      window.Store.set('userSettings', settings);

      const [courses, sessions, plannerItems] = await Promise.all([
        fetchCourses(userId),
        fetchSessions(userId),
        fetchPlanner(userId)
      ]);

      const allTopics = {};
      const coursesWithCounts = await Promise.all(
        courses.map(async (course) => {
          try {
            const topics = await fetchTopics(course.id);
            allTopics[course.id] = topics;
            return { ...course, topicCount: topics.length };
          } catch (err) {
            console.error(`Failed to fetch topics for course ${course.id}:`, err);
            allTopics[course.id] = [];
            return { ...course, topicCount: 0 };
          }
        })
      );

      window.Store.set('courses', coursesWithCounts);
      window.Store.set('topics', allTopics);
      window.Store.set('sessions', sessions);
      window.Store.set('planner', plannerItems);

      document.getElementById('page-auth').classList.add('hidden');
      document.getElementById('appShell').classList.remove('hidden');
      document.getElementById('mobileNav').classList.remove('hidden');

      window.dispatchEvent(new CustomEvent('userdata:loaded'));

      if (window.Router.getCurrentPage() === 'auth' || !window.location.hash.includes('home')) {
        window.Router.navigate('home');
      }

      // Check notification permission status
      checkNotificationStatus();
    } catch (err) {
      console.error('Failed to load user data:', err);
    }
  }

  /* ============================================
     NOTIFICATION SYSTEM
     ============================================ */

  function setupNotificationBanner() {
    const banner = document.getElementById('notificationBanner');
    const enableBtn = document.getElementById('enableNotificationsBtn');
    const dismissBtn = document.getElementById('dismissNotificationsBtn');

    if (!banner || !enableBtn || !dismissBtn) return;

    enableBtn.addEventListener('click', async () => {
      if (!('Notification' in window)) {
        window.showToast('Notifications not supported in this browser', 'error');
        return;
      }

      const permission = await Notification.requestPermission();
      notificationPermission = permission;

      if (permission === 'granted') {
        const user = window.Store.get('user');
        if (user) {
          const { updateUserSettings } = await import('./firebase.js');
          await updateUserSettings(user.uid, { notification_enabled: true });
        }
        banner.classList.add('hidden');
        window.showToast('Notifications enabled! You will receive study reminders.', 'success');
        scheduleStudyReminders();
      } else {
        window.showToast('Notification permission denied', 'error');
      }
    });

    dismissBtn.addEventListener('click', () => {
      banner.classList.add('hidden');
      localStorage.setItem('notificationBannerDismissed', Date.now().toString());
    });
  }

  function checkNotificationStatus() {
    if (!('Notification' in window)) return;

    const settings = window.Store.get('userSettings') || {};
    const dismissed = localStorage.getItem('notificationBannerDismissed');
    const banner = document.getElementById('notificationBanner');

    // Show banner if: notifications not enabled, not dismissed in last 7 days, and user has data
    if (settings.notification_enabled) {
      if (banner) banner.classList.add('hidden');
      if (Notification.permission === 'granted') {
        scheduleStudyReminders();
      }
      return;
    }

    if (dismissed) {
      const daysSince = (Date.now() - parseInt(dismissed)) / (1000 * 60 * 60 * 24);
      if (daysSince < 7) {
        if (banner) banner.classList.add('hidden');
        return;
      }
    }

    // Show banner after 3 sessions (not immediately on signup)
    const sessions = window.Store.get('sessions') || [];
    if (sessions.length >= 3 && banner) {
      banner.classList.remove('hidden');
    }
  }

  function scheduleStudyReminders() {
    // Check for upcoming planner items and schedule reminders
    const planner = window.Store.get('planner') || [];
    const now = new Date();
    const currentDay = now.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();

    const upcomingToday = planner.filter(p => {
      if (p.day !== currentDay) return false;
      const [hour, minute] = p.start_time.split(':').map(Number);
      const planTime = hour * 60 + minute;
      const currentTime = now.getHours() * 60 + now.getMinutes();
      const diff = planTime - currentTime;
      return diff > 15 && diff <= 60; // Remind 15-60 min before
    });

    upcomingToday.forEach(item => {
      const courses = window.Store.get('courses') || [];
      const course = courses.find(c => c.id === item.course_id);
      const courseName = course?.name || 'Study Session';
      
      // Simple browser notification
      if ('Notification' in window && Notification.permission === 'granted') {
        setTimeout(() => {
          new Notification('Orion — Study Reminder', {
            body: `${courseName} starts in ${Math.round((item.start_time.split(':')[0] * 60 + parseInt(item.start_time.split(':')[1]) - (now.getHours() * 60 + now.getMinutes())) / 60 * 10) / 10} hours. Ready to focus?`,
            icon: '/favicon.ico',
            tag: `planner-${item.id}`,
            requireInteraction: false
          });
        }, 100); // Immediate for demo; in production, calculate actual delay
      }
    });
  }

  /* ============================================
     SERVICE WORKER (for push notifications later)
     ============================================ */

  function setupServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(err => {
        console.log('Service worker registration failed:', err);
      });
    }
  }

  /* ============================================
     GLOBAL HANDLERS
     ============================================ */

  function setupGlobalHandlers() {
    document.querySelectorAll('.mob-nav-link, .nav-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const page = link.dataset.page;
        if (page) window.Router.navigate(page);
      });
    });

    window.showToast = function(message, type = 'info') {
      const container = document.getElementById('toastContainer');
      if (!container) return;
      const toast = document.createElement('div');
      toast.className = `toast toast-${type}`;
      toast.textContent = message;
      container.appendChild(toast);
      setTimeout(() => toast.remove(), 3000);
    };
  }

  function setupStudySpaceClose() {
    window.addEventListener('beforeunload', (e) => {
      const studySpace = document.getElementById('studySpace');
      if (studySpace && !studySpace.classList.contains('hidden')) {
        window.dispatchEvent(new CustomEvent('studysession:end'));
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        window.dispatchEvent(new CustomEvent('studysession:pause'));
      } else {
        window.dispatchEvent(new CustomEvent('studysession:resume'));
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { init };
})();