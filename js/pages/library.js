/* ============================================
   TRACKIQ — LIBRARY PAGE (v4)
   Course → Topic → Study Space (auto-load first doc)
   ============================================ */

import { fetchTopics, fetchResources } from '../firebase.js';

(function() {
  let currentView = 'courses'; // 'courses' | 'topics'
  let selectedCourseId = null;
  let selectedTopicId = null;

  function init() {
    renderLibrary();
    window.addEventListener('pagechange', (e) => {
      if (e.detail.page === 'library') {
        currentView = 'courses';
        selectedCourseId = null;
        selectedTopicId = null;
        updatePageSubtitle();
        renderLibrary();
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
    const subtitle = document.getElementById('librarySubtitle');
    const profile = window.Store.get('profile') || {};
    const name = profile.display_name || 'Student';
    if (subtitle) {
      subtitle.textContent = `${getGreeting()}, ${name} — your study library`;
    }
  }

  function renderLibrary() {
    const container = document.getElementById('librarySubjects');
    const breadcrumb = document.getElementById('libraryBreadcrumb');
    if (!container) return;

    if (currentView === 'courses') {
      renderCoursesView(container, breadcrumb);
    } else if (currentView === 'topics') {
      renderTopicsView(container, breadcrumb);
    }
  }

  function renderCoursesView(container, breadcrumb) {
    if (breadcrumb) breadcrumb.innerHTML = '<span>Library</span>';
    const courses = window.Store.get('courses') || [];

    if (courses.length === 0) {
      container.innerHTML = '<p class="empty-state">No courses yet. Create one in the Courses page!</p>';
      return;
    }

    container.innerHTML = courses.map(c => `
      <div class="library-card course-card" data-id="${c.id}">
        <div class="library-icon">📚</div>
        <div class="library-info">
          <h4 class="library-name">${c.name}</h4>
          <span class="library-meta">${c.topicCount || 0} topics</span>
        </div>
        <div class="library-arrow">→</div>
      </div>
    `).join('');

    container.querySelectorAll('.library-card').forEach(card => {
      card.addEventListener('click', () => {
        selectedCourseId = card.dataset.id;
        currentView = 'topics';
        renderLibrary();
      });
    });
  }

  async function renderTopicsView(container, breadcrumb) {
    const courses = window.Store.get('courses') || [];
    const course = courses.find(c => c.id === selectedCourseId);
    if (!course) {
      currentView = 'courses';
      renderLibrary();
      return;
    }

    if (breadcrumb) {
      breadcrumb.innerHTML = `
        <span class="breadcrumb-link" data-view="courses">Library</span>
        <span class="breadcrumb-sep">›</span>
        <span>${course.name}</span>
      `;
      breadcrumb.querySelector('.breadcrumb-link')?.addEventListener('click', () => {
        currentView = 'courses';
        selectedCourseId = null;
        selectedTopicId = null;
        renderLibrary();
      });
    }

    try {
      // Try store first, fetch only if missing
      const allTopics = window.Store.get('topics') || {};
      let topics = allTopics[selectedCourseId];

      if (!topics) {
        topics = await fetchTopics(selectedCourseId);
        allTopics[selectedCourseId] = topics;
        window.Store.set('topics', allTopics);
      }

      // Update course topic count in store
      const courseIndex = courses.findIndex(c => c.id === selectedCourseId);
      if (courseIndex >= 0) {
        courses[courseIndex] = { ...courses[courseIndex], topicCount: topics.length };
        window.Store.set('courses', [...courses]);
      }

      if (topics.length === 0) {
        container.innerHTML = '<p class="empty-state">No topics in this course yet. Create one in the Courses page!</p>';
        return;
      }

      container.innerHTML = topics.map(t => {
        const progress = t.target_hours > 0 
          ? Math.min(100, Math.round((t.completed_hours || 0) / t.target_hours * 100))
          : 0;
        return `
          <div class="library-card topic-card" data-id="${t.id}">
            <div class="library-icon">📖</div>
            <div class="library-info">
              <h4 class="library-name">${t.name}</h4>
              <span class="library-meta">${formatDuration((t.completed_hours || 0) * 60)} / ${t.target_hours}h · ${progress}%</span>
            </div>
            <div class="library-arrow">→</div>
          </div>
        `;
      }).join('');

      container.querySelectorAll('.library-card').forEach(card => {
        card.addEventListener('click', () => {
          selectedTopicId = card.dataset.id;
          openStudySpace();
        });
      });
    } catch (err) {
      container.innerHTML = '<p class="empty-state">Failed to load topics.</p>';
    }
  }

  async function openStudySpace() {
    const courses = window.Store.get('courses') || [];
    const course = courses.find(c => c.id === selectedCourseId);
    const allTopics = window.Store.get('topics') || {};
    const topics = allTopics[selectedCourseId] || [];
    const topic = topics.find(t => t.id === selectedTopicId);

    if (!course || !topic) return;

    // Fetch resources for this topic
    let resources = [];
    try {
      resources = await fetchResources(selectedTopicId);
      const allResources = window.Store.get('resources') || {};
      allResources[selectedTopicId] = resources;
      window.Store.set('resources', allResources);
    } catch (err) {
      console.error('Failed to fetch resources:', err);
    }

    // Store context
    window.Store.set('activeCourse', course);
    window.Store.set('activeTopic', topic);
    window.Store.set('activeResources', resources);
    window.Store.set('documentText', '');

    const studySpace = document.getElementById('studySpace');
    const docViewer = document.getElementById('studyDocViewer');
    const studyTitle = document.getElementById('studyTitle');
    if (!studySpace || !docViewer) return;

    studyTitle.textContent = `${course.name} › ${topic.name}`;

    // If no resources, show message
    if (resources.length === 0) {
      docViewer.innerHTML = `
        <div class="study-welcome">
          <div class="study-welcome-icon">📂</div>
          <h3>No resources for ${topic.name}</h3>
          <p>Upload files in the Courses page to study here.</p>
        </div>
      `;
      studySpace.classList.remove('hidden');
      attachEndSessionListener();
      window.dispatchEvent(new CustomEvent('studysession:start', { 
        detail: { courseId: course.id, topicId: topic.id } 
      }));
      return;
    }

    // Auto-load the first resource
    const firstResource = resources[0];
    window.Store.set('activeResource', firstResource);
    await loadDocumentIntoViewer(firstResource, docViewer);

    studySpace.classList.remove('hidden');
    attachEndSessionListener();
    window.dispatchEvent(new CustomEvent('studysession:start', { 
      detail: { courseId: course.id, topicId: topic.id, resourceId: firstResource.id } 
    }));
  }

  async function loadDocumentIntoViewer(resource, docViewer) {
    if (!resource || !docViewer) return;

    // Support both old base64 data and new Cloudinary URLs
    const fileUrl = resource.file_url || resource.file_data;

    if (!fileUrl) {
      docViewer.innerHTML = `
        <div class="study-welcome">
          <div class="study-welcome-icon">⚠️</div>
          <h3>Resource file not available</h3>
          <p>The file data is missing for ${resource.name}.</p>
        </div>
      `;
      return;
    }

    // Show loading state
    docViewer.innerHTML = `
      <div class="study-welcome">
        <div class="study-welcome-icon">⏳</div>
        <h3>Loading ${resource.name}...</h3>
      </div>
    `;

    try {
      if (resource.file_type && resource.file_type.startsWith('image/')) {
        docViewer.innerHTML = `<img src="${fileUrl}" style="max-width:100%; height:auto; display:block;" onload="this.style.opacity=1" onerror="this.parentElement.innerHTML='<div class='study-welcome'><div class='study-welcome-icon'>❌</div><h3>Failed to load image</h3></div>'" />`;
        await extractTextFromImage(fileUrl);
      } else if (resource.file_type === 'application/pdf') {
        docViewer.innerHTML = `<iframe src="${fileUrl}" style="width:100%; height:100%; border:none; min-height:500px;"></iframe>`;
        await extractTextFromPDF(fileUrl);
      } else if (resource.file_type && (
        resource.file_type.includes('word') || 
        resource.file_type.includes('officedocument')
      )) {
        docViewer.innerHTML = `
          <div class="study-file-preview">
            <div class="file-preview-icon">📝</div>
            <h4>${resource.name}</h4>
            <a href="${fileUrl}" target="_blank" class="btn btn-primary">Download Document</a>
          </div>
        `;
        try {
          const response = await fetch(fileUrl);
          const blob = await response.blob();
          const arrayBuffer = await blob.arrayBuffer();
          const result = await mammoth.extractRawText({ arrayBuffer });
          window.Store.set('documentText', result.value);
        } catch (err) {
          console.error('Word extraction failed:', err);
          window.Store.set('documentText', '');
        }
      } else if (resource.file_type && resource.file_type.startsWith('text/')) {
        try {
          const response = await fetch(fileUrl);
          const text = await response.text();
          docViewer.innerHTML = `<pre style="white-space:pre-wrap; padding:1rem; color:var(--text-primary);">${escapeHtml(text)}</pre>`;
          window.Store.set('documentText', text);
        } catch (err) {
          docViewer.innerHTML = `
            <div class="study-welcome">
              <div class="study-welcome-icon">❌</div>
              <h3>Failed to load text file</h3>
            </div>
          `;
          window.Store.set('documentText', '');
        }
      } else {
        docViewer.innerHTML = `
          <div class="study-file-preview">
            <div class="file-preview-icon">📄</div>
            <h4>${resource.name}</h4>
            <a href="${fileUrl}" target="_blank" class="btn btn-primary">Open File</a>
          </div>
        `;
        window.Store.set('documentText', '');
      }
    } catch (err) {
      console.error('Document load error:', err);
      docViewer.innerHTML = `
        <div class="study-welcome">
          <div class="study-welcome-icon">❌</div>
          <h3>Failed to load document</h3>
          <p>${err.message || 'Unknown error'}</p>
        </div>
      `;
    }
  }

  async function extractTextFromImage(imageDataUrl) {
    try {
      const result = await Tesseract.recognize(imageDataUrl, 'eng', { logger: m => console.log(m) });
      window.Store.set('documentText', result.data.text.trim());
    } catch (err) {
      console.error('OCR failed:', err);
      window.Store.set('documentText', '');
    }
  }

  async function extractTextFromPDF(pdfDataUrl) {
    try {
      const loadingTask = pdfjsLib.getDocument(pdfDataUrl);
      const pdf = await loadingTask.promise;
      let fullText = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        fullText += textContent.items.map(item => item.str).join(' ') + '\n\n';
      }
      window.Store.set('documentText', fullText.trim());
    } catch (err) {
      console.error('PDF extraction failed:', err);
      window.Store.set('documentText', '');
    }
  }

  function attachEndSessionListener() {
    const endBtn = document.getElementById('endSessionBtn');
    if (!endBtn) return;
    const newBtn = endBtn.cloneNode(true);
    endBtn.parentNode.replaceChild(newBtn, endBtn);
    newBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      window.dispatchEvent(new CustomEvent('studysession:end'));
    });
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function formatDuration(minutes) {
    if (minutes < 60) return `${Math.round(minutes)}m`;
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }

  init();
})();