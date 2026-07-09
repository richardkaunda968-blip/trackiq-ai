/* ============================================
   TRACKIQ — APP INITIALIZATION (v2)
   ============================================ */

import { onAuthChange, getProfile, fetchCourses, fetchSessions, fetchPlanner, fetchTopics } from './firebase.js';

const App = (function() {
  let initialAuthChecked = false;

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
    console.log('TrackIQ v2 initialized');
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

        document.getElementById('page-auth').classList.remove('hidden');
        document.getElementById('appShell').classList.add('hidden');
        document.getElementById('mobileNav').classList.add('hidden');

        window.Router.navigate('auth');
      }

      // Only resolve the initial check once
      if (!initialAuthChecked) {
        initialAuthChecked = true;
      }
    });
  }

  async function loadUserData(userId) {
    try {
      const profile = await getProfile(userId);
      window.Store.set('profile', profile);

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

      // Only navigate if we're currently on auth page
      if (window.Router.getCurrentPage() === 'auth' || !window.location.hash.includes('home')) {
        window.Router.navigate('home');
      }
    } catch (err) {
      console.error('Failed to load user data:', err);
    }
  }

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