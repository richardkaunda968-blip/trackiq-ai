/* ============================================
   TRACKIQ — SIMPLE STORE
   ============================================ */

const Store = (function() {
  const data = {};
  const listeners = {};

  function set(key, value) {
    data[key] = value;
    window.dispatchEvent(new CustomEvent('storechange', { detail: { key, value } }));
    if (listeners[key]) {
      listeners[key].forEach(cb => cb(value));
    }
  }

  function get(key) {
    return data[key];
  }

  function remove(key) {
    delete data[key];
  }

  function subscribe(key, callback) {
    if (!listeners[key]) listeners[key] = [];
    listeners[key].push(callback);
    // Return unsubscribe function
    return () => {
      listeners[key] = listeners[key].filter(cb => cb !== callback);
    };
  }

  return { set, get, remove, subscribe };
})();

window.Store = Store;