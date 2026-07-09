/* ============================================
   TRACKIQ — SPA ROUTER
   Hash-based routing with page transitions
   ============================================ */

const Router = (function() {
  const routes = {
    '': 'auth',
    'auth': 'auth',
    'home': 'home',
    'courses': 'courses',
    'library': 'library',
    'activity': 'activity',
    'milestones': 'milestones',
    'settings': 'settings'
  };

  let currentPage = 'auth';

  function init() {
    window.addEventListener('hashchange', handleRoute);
    handleRoute();
  }

  function handleRoute() {
    const hash = window.location.hash.replace('#/', '').replace('#', '');
    const page = routes[hash] || 'home';
    
    const user = Store.get('user');
    const protectedPages = ['home', 'courses', 'library', 'activity', 'milestones', 'settings'];
    
    if (protectedPages.includes(page) && !user) {
      navigate('auth');
      return;
    }
    if (page === 'auth' && user) {
      navigate('home');
      return;
    }

    switchPage(page);
  }

  function switchPage(page) {
    if (currentPage === page) return;
    
    document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
    
    const target = document.getElementById(`page-${page}`);
    if (target) {
      target.classList.remove('hidden');
    }
    
    updateNavStates(page);
    
    Store.set('currentPage', page);
    currentPage = page;
    
    window.dispatchEvent(new CustomEvent('pagechange', { detail: { page } }));
  }

  function updateNavStates(page) {
    document.querySelectorAll('.nav-link, .mob-nav-link').forEach(link => {
      link.classList.toggle('active', link.dataset.page === page);
    });
  }

  function navigate(page) {
    window.location.hash = `#/${page}`;
  }

  function getCurrentPage() {
    return currentPage;
  }

  return { init, navigate, getCurrentPage };
})();

window.Router = Router;