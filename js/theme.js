/* ============================================
   TRACKIQ — THEME MANAGER
   ============================================ */

const ThemeManager = (function() {
  function init() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    const savedAccent = localStorage.getItem('accent') || 'blue';
    
    document.documentElement.setAttribute('data-theme', savedTheme);
    document.documentElement.setAttribute('data-accent', savedAccent);
  }

  return { init };
})();

window.ThemeManager = ThemeManager;