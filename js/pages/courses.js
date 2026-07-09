/* ============================================
   TRACKIQ — COURSES PAGE (v5)
   Course → Topic hierarchy with Cloudinary unsigned uploads
   ============================================ */

import { createCourse, updateCourse, deleteCourse, fetchCourses, createTopic, fetchTopics, deleteTopic, updateTopic, uploadFile } from '../firebase.js';

(function() {
  let editingCourseId = null;
  let editingTopicId = null;
  let activeCourseId = null;

  function init() {
    renderCoursesList();
    setupForms();

    // Listen for store changes to auto-refresh course list when topics change
    window.Store.subscribe('courses', () => {
      renderCoursesList();
    });

    window.addEventListener('pagechange', (e) => {
      if (e.detail.page === 'courses') {
        renderCoursesList();
        updatePageSubtitle();
        resetCourseForm();
        resetTopicForm();
        hideTopicPanel();
      }
    });
  }

  /* ---------- GREETING HELPER ---------- */
  function getGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }

  function updatePageSubtitle() {
    const subtitle = document.getElementById('coursesSubtitle');
    const profile = window.Store.get('profile') || {};
    const name = profile.display_name || 'Student';
    if (subtitle) {
      subtitle.textContent = `${getGreeting()}, ${name} — manage your subjects and topics`;
    }
  }

  function setupForms() {
    // Course form
    const courseForm = document.getElementById('courseForm');
    const cancelCourseBtn = document.getElementById('cancelCourseBtn');
    if (courseForm) {
      courseForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const user = window.Store.get('user');
        if (!user) return;

        const name = document.getElementById('courseName').value.trim();
        if (!name) {
          window.showToast('Please enter a course name', 'error');
          return;
        }

        try {
          if (editingCourseId) {
            await updateCourse(editingCourseId, { name });
            window.showToast('Course updated!', 'success');
          } else {
            await createCourse(user.uid, name);
            window.showToast('Course created!', 'success');
          }
          resetCourseForm();
          const courses = await fetchCourses(user.uid);
          window.Store.set('courses', courses);
        } catch (err) {
          window.showToast(err.message, 'error');
        }
      });
    }

    if (cancelCourseBtn) {
      cancelCourseBtn.addEventListener('click', () => {
        resetCourseForm();
      });
    }

    // Topic form
    const topicForm = document.getElementById('topicForm');
    const cancelTopicBtn = document.getElementById('cancelTopicBtn');
    if (topicForm) {
      topicForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!activeCourseId) return;

        const name = document.getElementById('topicName').value.trim();
        const targetHours = parseFloat(document.getElementById('topicTargetHours').value) || 1;
        const fileInput = document.getElementById('topicResources');

        if (!name) {
          window.showToast('Please enter a topic name', 'error');
          return;
        }

        try {
          let topic;
          if (editingTopicId) {
            await updateTopic(editingTopicId, { name, target_hours: targetHours });
            topic = { id: editingTopicId, course_id: activeCourseId, name, target_hours: targetHours };
            window.showToast('Topic updated!', 'success');
          } else {
            topic = await createTopic(activeCourseId, name, targetHours);
            window.showToast('Topic created!', 'success');
          }

          // Upload files to Cloudinary (unsigned)
          if (fileInput && fileInput.files && fileInput.files.length > 0) {
            window.showToast(`Uploading ${fileInput.files.length} file(s)...`, 'info');

            for (const file of fileInput.files) {
              try {
                const folder = `trackiq/users/${window.Store.get('user').uid}/topics/${topic.id}`;
                const downloadURL = await uploadFile(file, folder);

                // Create resource record in Firestore
                const { createResource } = await import('../firebase.js');
                await createResource(topic.id, file.name, downloadURL, file.type);
              } catch (uploadErr) {
                console.error('File upload failed:', uploadErr);
                window.showToast(`Failed to upload ${file.name}`, 'error');
              }
            }
            window.showToast('Files uploaded!', 'success');
          }

          resetTopicForm();
          // Refresh both topics list AND course counts
          await refreshTopicsAndCounts(activeCourseId);
        } catch (err) {
          window.showToast(err.message, 'error');
        }
      });
    }

    if (cancelTopicBtn) {
      cancelTopicBtn.addEventListener('click', () => {
        resetTopicForm();
      });
    }

    // Close topic panel (✕ button)
    const closeTopicPanelBtn = document.getElementById('closeTopicPanel');
    if (closeTopicPanelBtn) {
      closeTopicPanelBtn.addEventListener('click', () => {
        hideTopicPanel();
      });
    }
  }

  function renderCoursesList() {
    const container = document.getElementById('coursesList');
    const courses = window.Store.get('courses') || [];
    if (!container) return;

    if (courses.length === 0) {
      container.innerHTML = '<p class="empty-state">No courses yet. Create your first one above!</p>';
      return;
    }

    container.innerHTML = courses.map(c => `
      <div class="course-card" data-id="${c.id}">
        <div class="course-info">
          <h4 class="course-name">${c.name}</h4>
          <div class="course-meta">
            <span>📚 ${c.topicCount || 0} topics</span>
          </div>
        </div>
        <div class="course-actions">
          <button class="btn btn-icon btn-manage" data-id="${c.id}" title="Manage Topics">📂</button>
          <button class="btn btn-icon btn-edit" data-id="${c.id}" title="Edit">✏️</button>
          <button class="btn btn-icon btn-delete" data-id="${c.id}" title="Delete">🗑️</button>
        </div>
      </div>
    `).join('');

    container.querySelectorAll('.btn-manage').forEach(btn => {
      btn.addEventListener('click', () => showTopicPanel(btn.dataset.id));
    });

    container.querySelectorAll('.btn-edit').forEach(btn => {
      btn.addEventListener('click', () => loadCourseForEdit(btn.dataset.id));
    });

    container.querySelectorAll('.btn-delete').forEach(btn => {
      btn.addEventListener('click', () => deleteCourseHandler(btn.dataset.id));
    });
  }

  async function showTopicPanel(courseId) {
    activeCourseId = courseId;
    const courses = window.Store.get('courses') || [];
    const course = courses.find(c => c.id === courseId);
    if (!course) return;

    const panel = document.getElementById('topicPanel');
    const courseTitle = document.getElementById('topicPanelCourseTitle');
    if (panel) panel.classList.remove('hidden');
    if (courseTitle) courseTitle.textContent = course.name;

    await renderTopicsList(courseId);
  }

  function hideTopicPanel() {
    const panel = document.getElementById('topicPanel');
    if (panel) panel.classList.add('hidden');
    activeCourseId = null;
  }

  async function refreshTopicsAndCounts(courseId) {
    // Re-fetch fresh topics from Firestore
    const topics = await fetchTopics(courseId);

    // Update topics in store
    const allTopics = window.Store.get('topics') || {};
    allTopics[courseId] = topics;
    window.Store.set('topics', allTopics);

    // Update course topic count in store
    const courses = window.Store.get('courses') || [];
    const courseIndex = courses.findIndex(c => c.id === courseId);
    if (courseIndex >= 0) {
      courses[courseIndex] = { ...courses[courseIndex], topicCount: topics.length };
      window.Store.set('courses', [...courses]);
    }

    // Re-render the topics list in the panel
    await renderTopicsList(courseId);
  }

  async function renderTopicsList(courseId) {
    const container = document.getElementById('topicsList');
    if (!container) return;

    try {
      // Read topics from store (they should be fresh after refreshTopicsAndCounts)
      const allTopics = window.Store.get('topics') || {};
      const topics = allTopics[courseId] || [];

      if (topics.length === 0) {
        container.innerHTML = '<p class="empty-state">No topics yet. Create your first topic above!</p>';
        return;
      }

      container.innerHTML = topics.map(t => {
        const progress = t.target_hours > 0 
          ? Math.min(100, Math.round((t.completed_hours || 0) / t.target_hours * 100))
          : 0;
        return `
          <div class="topic-card" data-id="${t.id}">
            <div class="topic-info">
              <h5 class="topic-name">${t.name}</h5>
              <div class="topic-progress">
                <div class="progress-bar-bg">
                  <div class="progress-bar-fill" style="width: ${progress}%"></div>
                </div>
                <span class="progress-text">${formatDuration((t.completed_hours || 0) * 60)} / ${t.target_hours}h (${progress}%)</span>
              </div>
            </div>
            <div class="topic-actions">
              <button class="btn btn-icon btn-edit-topic" data-id="${t.id}" title="Edit">✏️</button>
              <button class="btn btn-icon btn-delete-topic" data-id="${t.id}" title="Delete">🗑️</button>
            </div>
          </div>
        `;
      }).join('');

      container.querySelectorAll('.btn-edit-topic').forEach(btn => {
        btn.addEventListener('click', () => loadTopicForEdit(btn.dataset.id));
      });

      container.querySelectorAll('.btn-delete-topic').forEach(btn => {
        btn.addEventListener('click', () => deleteTopicHandler(btn.dataset.id));
      });
    } catch (err) {
      console.error('Failed to render topics:', err);
      container.innerHTML = '<p class="empty-state">Failed to load topics.</p>';
    }
  }

  function loadCourseForEdit(id) {
    const courses = window.Store.get('courses') || [];
    const course = courses.find(c => c.id === id);
    if (!course) return;

    document.getElementById('courseName').value = course.name;
    editingCourseId = id;
    document.getElementById('courseSubmitBtn').textContent = 'Update Course';
    document.getElementById('cancelCourseBtn').classList.remove('hidden');
  }

  function loadTopicForEdit(id) {
    const allTopics = window.Store.get('topics') || {};
    const topics = allTopics[activeCourseId] || [];
    const topic = topics.find(t => t.id === id);
    if (!topic) return;

    document.getElementById('topicName').value = topic.name;
    document.getElementById('topicTargetHours').value = topic.target_hours || 1;
    editingTopicId = id;
    document.getElementById('topicSubmitBtn').textContent = 'Update Topic';
    document.getElementById('cancelTopicBtn').classList.remove('hidden');
  }

  async function deleteCourseHandler(id) {
    if (!confirm('Are you sure? This will delete the course and all its topics and resources.')) return;
    try {
      await deleteCourse(id);
      const user = window.Store.get('user');
      const courses = await fetchCourses(user.uid);
      window.Store.set('courses', courses);
      hideTopicPanel();
      window.showToast('Course deleted', 'success');
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  }

  async function deleteTopicHandler(id) {
    if (!confirm('Are you sure? This will delete the topic and all its resources.')) return;
    try {
      await deleteTopic(id);
      // Refresh both topics list AND course counts after deletion
      await refreshTopicsAndCounts(activeCourseId);
      window.showToast('Topic deleted', 'success');
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  }

  function resetCourseForm() {
    const form = document.getElementById('courseForm');
    if (form) form.reset();
    editingCourseId = null;
    const submitBtn = document.getElementById('courseSubmitBtn');
    const cancelBtn = document.getElementById('cancelCourseBtn');
    if (submitBtn) submitBtn.textContent = 'Create Course';
    if (cancelBtn) cancelBtn.classList.add('hidden');
  }

  function resetTopicForm() {
    const form = document.getElementById('topicForm');
    if (form) form.reset();
    editingTopicId = null;
    const submitBtn = document.getElementById('topicSubmitBtn');
    const cancelBtn = document.getElementById('cancelTopicBtn');
    if (submitBtn) submitBtn.textContent = 'Create Topic';
    if (cancelBtn) cancelBtn.classList.add('hidden');
  }

  function formatDuration(minutes) {
    if (minutes < 60) return `${Math.round(minutes)}m`;
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }

  init();
})();