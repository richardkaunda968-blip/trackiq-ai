/* ============================================
   TRACKIQ — SETTINGS PAGE (v5)
   Cloudinary unsigned avatar upload + Avatar Lightbox
   ============================================ */

import { updateProfileData, signOutUser, getProfile, changeUserPassword, sendPasswordReset, deleteUserAccount, uploadFile } from '../firebase.js';

(function() {
  const ACCENT_COLORS = [
    { name: 'red', hex: '#ef4444' },
    { name: 'orange', hex: '#f97316' },
    { name: 'gold', hex: '#eab308' },
    { name: 'green', hex: '#22c55e' },
    { name: 'blue', hex: '#3b82f6' },
    { name: 'indigo', hex: '#6366f1' },
    { name: 'violet', hex: '#8b5cf6' },
    { name: 'pink', hex: '#ec4899' },
    { name: 'grey', hex: '#6b7280' }
  ];

  function setupAvatarUpload() {
    const uploadInput = document.getElementById('avatarUpload');
    const addBtn = document.getElementById('addAvatarBtn');
    const removeBtn = document.getElementById('removeAvatarBtn');

    if (addBtn && uploadInput) {
      addBtn.addEventListener('click', () => uploadInput.click());

      uploadInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (file.size > 5 * 1024 * 1024) {
          window.showToast('Image must be under 5MB', 'error');
          return;
        }

        const user = window.Store.get('user');
        if (!user) {
          window.showToast('Not logged in', 'error');
          return;
        }

        try {
          window.showToast('Uploading avatar...', 'info');

          const folder = `trackiq/users/${user.uid}/avatar`;
          const downloadURL = await uploadFile(file, folder);

          await updateProfileData(user.uid, { 
            avatar: downloadURL
          });

          const profile = await getProfile(user.uid);
          window.Store.set('profile', profile);
          renderAvatar();
          window.showToast('Avatar updated!', 'success');
        } catch (err) {
          console.error('Avatar upload error:', err);
          window.showToast('Failed to update avatar: ' + (err.message || 'Unknown error'), 'error');
        }
      });
    }

    if (removeBtn) {
      removeBtn.addEventListener('click', async () => {
        const user = window.Store.get('user');
        if (!user) return;

        try {
          await updateProfileData(user.uid, { 
            avatar: null
          });
          const updatedProfile = await getProfile(user.uid);
          window.Store.set('profile', updatedProfile);
          renderAvatar();
          window.showToast('Avatar removed', 'success');
        } catch (err) {
          console.error('Avatar remove error:', err);
          window.showToast('Failed to remove avatar: ' + (err.message || 'Unknown error'), 'error');
        }
      });
    }
  }

  function setupAvatarLightbox() {
    const preview = document.getElementById('profileAvatarPreview');
    const lightbox = document.getElementById('avatarLightbox');
    const lightboxImg = document.getElementById('avatarLightboxImg');
    const lightboxClose = document.getElementById('avatarLightboxClose');

    if (!preview || !lightbox || !lightboxImg) return;

    preview.addEventListener('click', () => {
      const profile = window.Store.get('profile') || {};
      if (!profile.avatar) return;

      lightboxImg.src = profile.avatar;
      lightbox.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
    });

    if (lightboxClose) {
      lightboxClose.addEventListener('click', closeLightbox);
    }

    lightbox.addEventListener('click', (e) => {
      if (e.target === lightbox) {
        closeLightbox();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !lightbox.classList.contains('hidden')) {
        closeLightbox();
      }
    });

    function closeLightbox() {
      lightbox.classList.add('hidden');
      lightboxImg.src = '';
      document.body.style.overflow = '';
    }
  }

  function renderProfile() {
    const profile = window.Store.get('profile') || {};
    const user = window.Store.get('user');

    const displayNameInput = document.getElementById('settingsDisplayName');
    const rankDisplay = document.getElementById('settingsRank');
    const xpDisplay = document.getElementById('settingsXP');
    const milestonesDisplay = document.getElementById('settingsMilestones');
    const totalTimeDisplay = document.getElementById('settingsTotalTime');
    const badgeName = document.getElementById('badgeName');
    const badgeLevel = document.getElementById('badgeLevel');
    const badgeXP = document.getElementById('badgeXP');

    if (displayNameInput) displayNameInput.value = profile.display_name || '';
    if (rankDisplay) rankDisplay.textContent = `Lv. ${profile.level || 1}`;
    if (xpDisplay) xpDisplay.textContent = `${profile.xp || 0} XP`;
    if (milestonesDisplay) milestonesDisplay.textContent = profile.milestones_count || 0;
    if (totalTimeDisplay) totalTimeDisplay.textContent = formatDuration(profile.total_study_time || 0);

    if (badgeName) badgeName.textContent = profile.display_name || 'Student';
    if (badgeLevel) badgeLevel.textContent = `Lv. ${profile.level || 1}`;
    if (badgeXP) badgeXP.textContent = `${profile.xp || 0} XP`;
  }

  function renderAvatar() {
    const profile = window.Store.get('profile') || {};
    const preview = document.getElementById('profileAvatarPreview');
    const removeBtn = document.getElementById('removeAvatarBtn');
    const badgeAvatar = document.getElementById('badgeAvatar');
    const popupAvatar = document.getElementById('popupAvatar');

    const initial = (profile.display_name || 'S').charAt(0).toUpperCase();

    if (profile.avatar) {
      const imgHtml = `<img src="${profile.avatar}" alt="Avatar">`;
      if (preview) {
        preview.innerHTML = imgHtml;
        preview.classList.add('has-image');
      }
      if (badgeAvatar) {
        badgeAvatar.innerHTML = imgHtml;
        badgeAvatar.classList.add('has-image');
      }
      if (popupAvatar) {
        popupAvatar.innerHTML = imgHtml;
        popupAvatar.classList.add('has-image');
      }
      if (removeBtn) removeBtn.classList.remove('hidden');
    } else {
      if (preview) {
        preview.textContent = initial;
        preview.classList.remove('has-image');
      }
      if (badgeAvatar) {
        badgeAvatar.textContent = initial;
        badgeAvatar.classList.remove('has-image');
      }
      if (popupAvatar) {
        popupAvatar.textContent = initial;
        popupAvatar.classList.remove('has-image');
      }
      if (removeBtn) removeBtn.classList.add('hidden');
    }
  }

  function renderAppearance() {
    const themeContainer = document.getElementById('themeSelector');
    const accentContainer = document.getElementById('accentSelector');
    const tierContainer = document.getElementById('tierSelector');

    if (themeContainer) {
      themeContainer.innerHTML = `
        <button class="theme-btn ${getCurrentTheme() === 'dark' ? 'active' : ''}" data-theme="dark">🌙 Dark</button>
        <button class="theme-btn ${getCurrentTheme() === 'light' ? 'active' : ''}" data-theme="light">☀️ Light</button>

      `;
      themeContainer.querySelectorAll('.theme-btn').forEach(btn => {
        btn.addEventListener('click', () => setTheme(btn.dataset.theme));
      });
    }

    if (accentContainer) {
      accentContainer.innerHTML = ACCENT_COLORS.map(c => `
        <button class="accent-btn ${getCurrentAccent() === c.name ? 'active' : ''}" 
          data-accent="${c.name}" 
          style="background: ${c.hex};"
          title="${c.name}"></button>
      `).join('');
      accentContainer.querySelectorAll('.accent-btn').forEach(btn => {
        btn.addEventListener('click', () => setAccent(btn.dataset.accent));
      });
    }

    if (tierContainer) {
      const tiers = ['relaxed', 'balanced', 'intense', 'extreme'];
      tierContainer.innerHTML = tiers.map(t => `
        <button class="tier-btn ${getCurrentTier() === t ? 'active' : ''}" data-tier="${t}">
          ${t.charAt(0).toUpperCase() + t.slice(1)}
        </button>
      `).join('');
      tierContainer.querySelectorAll('.tier-btn').forEach(btn => {
        btn.addEventListener('click', () => setTier(btn.dataset.tier));
      });
    }
  }

  function setupForms() {
    const profileForm = document.getElementById('profileForm');
    const supportForm = document.getElementById('supportForm');

    if (profileForm) {
      profileForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const user = window.Store.get('user');
        if (!user) return;

        const displayName = document.getElementById('settingsDisplayName').value.trim();

        try {
          await updateProfileData(user.uid, {
            display_name: displayName
          });
          const profile = await getProfile(user.uid);
          window.Store.set('profile', profile);
          renderAvatar();
          renderProfile();
          updatePageSubtitle();
          window.showToast('Profile updated!', 'success');
        } catch (err) {
          window.showToast(err.message, 'error');
        }
      });
    }

    if (supportForm) {
      supportForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('supportName').value.trim();
        const email = document.getElementById('supportEmail').value.trim();
        const subject = document.getElementById('supportSubject').value.trim();
        const message = document.getElementById('supportMessage').value.trim();

        if (!name || !email || !subject || !message) {
          window.showToast('Please fill in all fields', 'error');
          return;
        }

        try {
          const response = await fetch('/api/support', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, subject, message })
          });
          if (response.ok) {
            window.showToast('Message sent! We will get back to you soon.', 'success');
            supportForm.reset();
          } else {
            throw new Error('Failed to send message');
          }
        } catch (err) {
          const mailto = `mailto:richardkaunda968@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(`From: ${name} (${email})\n\n${message}`)}`;
          window.location.href = mailto;
        }
      });
    }
  }

  function setupAccountSecurity() {
    const securityBtn = document.getElementById('accountSecurityBtn');
    const securityOverlay = document.getElementById('accountSecurityOverlay');
    const closeSecurity = document.getElementById('closeSecurityOverlay');
    const changePasswordForm = document.getElementById('changePasswordForm');
    const resetPasswordBtn = document.getElementById('resetPasswordBtn');
    const deleteAccountBtn = document.getElementById('deleteAccountBtn');
    const deleteConfirmSection = document.getElementById('deleteConfirmSection');
    const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
    const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');

    if (securityBtn && securityOverlay) {
      securityBtn.addEventListener('click', () => {
        securityOverlay.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
      });
    }

    if (closeSecurity) {
      closeSecurity.addEventListener('click', () => {
        securityOverlay.classList.add('hidden');
        document.body.style.overflow = '';
        resetSecurityForm();
      });
    }

    if (securityOverlay) {
      securityOverlay.addEventListener('click', (e) => {
        if (e.target === securityOverlay) {
          securityOverlay.classList.add('hidden');
          document.body.style.overflow = '';
          resetSecurityForm();
        }
      });
    }

    if (changePasswordForm) {
      changePasswordForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const newPassword = document.getElementById('newPassword').value;
        const confirmPassword = document.getElementById('confirmNewPassword').value;

        if (newPassword !== confirmPassword) {
          window.showToast('Passwords do not match', 'error');
          return;
        }

        if (newPassword.length < 6) {
          window.showToast('Password must be at least 6 characters', 'error');
          return;
        }

        try {
          await changeUserPassword(newPassword);
          window.showToast('Password changed successfully!', 'success');
          changePasswordForm.reset();
        } catch (err) {
          console.error('Change password error:', err);
          if (err.code === 'auth/requires-recent-login') {
            window.showToast('Please log out and log back in to change your password', 'error');
          } else {
            window.showToast('Failed to change password: ' + (err.message || 'Unknown error'), 'error');
          }
        }
      });
    }

    if (resetPasswordBtn) {
      resetPasswordBtn.addEventListener('click', async () => {
        const user = window.Store.get('user');
        if (!user || !user.email) {
          window.showToast('No email found', 'error');
          return;
        }

        try {
          await sendPasswordReset(user.email);
          window.showToast('Password reset email sent!', 'success');
        } catch (err) {
          window.showToast('Failed to send reset email: ' + (err.message || 'Unknown error'), 'error');
        }
      });
    }

    if (deleteAccountBtn) {
      deleteAccountBtn.addEventListener('click', () => {
        deleteConfirmSection.classList.remove('hidden');
        deleteAccountBtn.classList.add('hidden');
      });
    }

    if (cancelDeleteBtn) {
      cancelDeleteBtn.addEventListener('click', () => {
        deleteConfirmSection.classList.add('hidden');
        deleteAccountBtn.classList.remove('hidden');
        document.getElementById('deletePassword').value = '';
      });
    }

    if (confirmDeleteBtn) {
      confirmDeleteBtn.addEventListener('click', async () => {
        const password = document.getElementById('deletePassword').value;
        if (!password) {
          window.showToast('Please enter your password to confirm', 'error');
          return;
        }

        if (!confirm('This will permanently delete your account and all data. This cannot be undone. Are you sure?')) {
          return;
        }

        try {
          await deleteUserAccount(password);
          window.showToast('Account deleted. Goodbye!', 'success');
          setTimeout(() => {
            window.location.reload();
          }, 2000);
        } catch (err) {
          console.error('Delete account error:', err);
          if (err.code === 'auth/wrong-password') {
            window.showToast('Incorrect password', 'error');
          } else {
            window.showToast('Failed to delete account: ' + (err.message || 'Unknown error'), 'error');
          }
        }
      });
    }
  }

  function resetSecurityForm() {
    const changePasswordForm = document.getElementById('changePasswordForm');
    const deleteConfirmSection = document.getElementById('deleteConfirmSection');
    const deleteAccountBtn = document.getElementById('deleteAccountBtn');

    if (changePasswordForm) changePasswordForm.reset();
    if (deleteConfirmSection) deleteConfirmSection.classList.add('hidden');
    if (deleteAccountBtn) deleteAccountBtn.classList.remove('hidden');
    const deletePassword = document.getElementById('deletePassword');
    if (deletePassword) deletePassword.value = '';
  }

  function setupLogout() {
    const logoutBtn = document.getElementById('logoutBtn');
    const logoutModal = document.getElementById('logoutModal');
    const cancelLogout = document.getElementById('cancelLogout');
    const confirmLogout = document.getElementById('confirmLogout');

    if (logoutBtn && logoutModal) {
      logoutBtn.addEventListener('click', () => {
        logoutModal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
      });
    }

    if (cancelLogout) {
      cancelLogout.addEventListener('click', () => {
        logoutModal.classList.add('hidden');
        document.body.style.overflow = '';
      });
    }

    if (confirmLogout) {
      confirmLogout.addEventListener('click', async () => {
        try {
          await signOutUser();
          logoutModal.classList.add('hidden');
          document.body.style.overflow = '';
          window.showToast('Logged out successfully', 'success');
          setTimeout(() => {
            window.location.hash = '#/auth';
            window.location.reload();
          }, 600);
        } catch (err) {
          console.error('Logout error:', err);
          window.showToast('Failed to log out: ' + (err.message || 'Unknown error'), 'error');
        }
      });
    }

    if (logoutModal) {
      logoutModal.addEventListener('click', (e) => {
        if (e.target === logoutModal) {
          logoutModal.classList.add('hidden');
          document.body.style.overflow = '';
        }
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && logoutModal && !logoutModal.classList.contains('hidden')) {
        logoutModal.classList.add('hidden');
        document.body.style.overflow = '';
      }
    });
  }

  function getCurrentTheme() {
    return localStorage.getItem('theme') || 'dark';
  }

  function setTheme(theme) {
    localStorage.setItem('theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
    renderAppearance();
    window.showToast(`Theme set to ${theme}`, 'success');
  }

  function getCurrentAccent() {
    return localStorage.getItem('accent') || 'blue';
  }

  function setAccent(accent) {
    localStorage.setItem('accent', accent);
    document.documentElement.setAttribute('data-accent', accent);
    renderAppearance();
    window.showToast(`Accent color updated`, 'success');
  }

  function getCurrentTier() {
    const profile = window.Store.get('profile') || {};
    return profile.tier || 'balanced';
  }

  async function setTier(tier) {
    const user = window.Store.get('user');
    if (!user) return;
    try {
      await updateProfileData(user.uid, { tier });
      const profile = await getProfile(user.uid);
      window.Store.set('profile', profile);
      renderAppearance();
      window.showToast(`Study intensity set to ${tier}`, 'success');
    } catch (err) {
      window.showToast(err.message, 'error');
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
    const subtitle = document.getElementById('settingsSubtitle');
    const profile = window.Store.get('profile') || {};
    const name = profile.display_name || 'Student';
    if (subtitle) {
      subtitle.textContent = `${getGreeting()}, ${name} — customize your experience`;
    }
  }

  function formatDuration(minutes) {
    if (!minutes || minutes === 0) return '0h';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }

  function init() {
    renderProfile();
    renderAvatar();
    renderAppearance();
    setupForms();
    setupAvatarUpload();
    setupAvatarLightbox();
    setupLogout();
    setupAccountSecurity();
    updatePageSubtitle();
    window.addEventListener('pagechange', (e) => {
      if (e.detail.page === 'settings') {
        renderProfile();
        renderAvatar();
        updatePageSubtitle();
      }
    });
  }

  init();
})();