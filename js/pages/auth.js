/* ============================================
   TRACKIQ — AUTH PAGE
   ============================================ */

import { signUp, signIn } from '../firebase.js';

(function() {
  let isSignUp = false;

  const els = {
    form: document.getElementById('authForm'),
    title: document.getElementById('authTitle'),
    subtitle: document.getElementById('authSubtitle'),
    nameGroup: document.getElementById('nameGroup'),
    confirmGroup: document.getElementById('confirmGroup'),
    rememberGroup: document.getElementById('rememberGroup'),
    submitBtn: document.getElementById('authSubmitBtn'),
    btnText: document.querySelector('#authSubmitBtn .btn-text'),
    toggleText: document.getElementById('authToggleText'),
    toggleBtn: document.getElementById('authToggleBtn'),
    error: document.getElementById('authError'),
    email: document.getElementById('authEmail'),
    password: document.getElementById('authPassword'),
    displayName: document.getElementById('displayName'),
    confirmPassword: document.getElementById('confirmPassword'),
    rememberMe: document.getElementById('rememberMe')
  };

  function init() {
    if (!els.form) return;

    const savedEmail = localStorage.getItem('trackiq_remember_email');
    if (savedEmail) {
      els.email.value = savedEmail;
      if (els.rememberMe) els.rememberMe.checked = true;
    }

    els.toggleBtn.addEventListener('click', toggleMode);
    els.form.addEventListener('submit', handleSubmit);
  }

  function toggleMode() {
    isSignUp = !isSignUp;
    els.title.textContent = isSignUp ? 'Create Account' : 'Welcome Back';
    els.subtitle.textContent = isSignUp ? 'Start tracking your studies' : 'Sign in to continue tracking';
    els.btnText.textContent = isSignUp ? 'Sign Up' : 'Sign In';
    els.toggleText.textContent = isSignUp ? 'Already have an account?' : "Don't have an account?";
    els.toggleBtn.textContent = isSignUp ? 'Sign In' : 'Sign Up';

    els.nameGroup.classList.toggle('hidden', !isSignUp);
    els.confirmGroup.classList.toggle('hidden', !isSignUp);
    els.rememberGroup.classList.toggle('hidden', isSignUp);

    els.error.textContent = '';

    if (!isSignUp) {
      els.displayName.value = '';
      els.confirmPassword.value = '';
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    els.error.textContent = '';

    const email = els.email.value.trim();
    const password = els.password.value;

    if (!email || !password) {
      els.error.textContent = 'Please fill in all fields';
      return;
    }

    setLoading(true);

    try {
      if (isSignUp) {
        const displayName = els.displayName.value.trim();
        const confirmPassword = els.confirmPassword.value;

        if (!displayName) throw new Error('Display name is required');
        if (password !== confirmPassword) throw new Error('Passwords do not match');
        if (password.length < 6) throw new Error('Password must be at least 6 characters');

        await signUp(email, password, displayName);
        window.showToast('Account created! Welcome to TrackIQ.', 'success');
      } else {
        await signIn(email, password);

        if (els.rememberMe && els.rememberMe.checked) {
          localStorage.setItem('trackiq_remember_email', email);
        } else {
          localStorage.removeItem('trackiq_remember_email');
        }

        window.showToast('Welcome back!', 'success');
      }
    } catch (err) {
      els.error.textContent = err.message || 'Something went wrong';
    } finally {
      setLoading(false);
    }
  }

  function setLoading(loading) {
    els.submitBtn.disabled = loading;
    els.btnText.style.display = loading ? 'none' : 'inline';
    const loader = document.querySelector('#authSubmitBtn .btn-loader');
    if (loader) loader.style.display = loading ? 'inline-block' : 'none';
  }

  window.addEventListener('pagechange', (e) => {
    if (e.detail.page === 'auth') {
      els.error.textContent = '';
      if (els.form) els.form.reset();

      const savedEmail = localStorage.getItem('trackiq_remember_email');
      if (savedEmail && els.email) els.email.value = savedEmail;
      if (els.rememberMe) els.rememberMe.checked = !!savedEmail;

      if (isSignUp) toggleMode();
    }
  });

  init();
})();