/* ============================================
   TRACKIQ — STUDY SPACE (v2)
   Course → Topic → Resource context
   ============================================ */

import { createSession, endSession, updateProfileData, sendChatMessage, getProfile, updateTopic } from '../firebase.js';

(function() {
  let sessionStartTime = null;
  let sessionId = null;
  let pausedTime = 0;
  let isPaused = false;
  let pauseStart = null;
  let timerInterval = null;
  let chatListenersAttached = false;

  function init() {
    setupEventListeners();
    setupAIChat();
    setupMobileAIPanel();
  }

  function setupEventListeners() {
    window.addEventListener('studysession:start', (e) => {
      startTimer(e.detail.courseId, e.detail.topicId, e.detail.resourceId);
      resetAIChat(); // ← RESET CHAT ON EVERY NEW SESSION
    });

    window.addEventListener('studysession:pause', () => {
      if (sessionStartTime && !isPaused) {
        isPaused = true;
        pauseStart = Date.now();
      }
    });

    window.addEventListener('studysession:resume', () => {
      if (isPaused) {
        pausedTime += Date.now() - pauseStart;
        isPaused = false;
        pauseStart = null;
      }
    });

    window.addEventListener('studysession:end', () => {
      if (sessionStartTime) {
        endStudySession();
      }
    });
  }

  function startTimer(courseId, topicId, resourceId) {
    sessionStartTime = Date.now();
    pausedTime = 0;
    isPaused = false;

    const user = window.Store.get('user');
    createSession({
      user_id: user.uid,
      course_id: courseId,
      topic_id: topicId,
      resource_id: resourceId,
      duration_minutes: 0,
      xp_earned: 0,
      status: 'active'
    }).then(doc => {
      sessionId = doc.id;
    });
  }

  async function endStudySession() {
    if (!sessionStartTime) return;

    const endTime = Date.now();
    const totalMs = endTime - sessionStartTime - pausedTime;
    const durationMinutes = Math.round(totalMs / 60000);

    if (durationMinutes < 1) {
      closeStudySpace();
      return;
    }

    const user = window.Store.get('user');
    const profile = window.Store.get('profile') || {};
    const topic = window.Store.get('activeTopic');
    const tier = profile.tier || 'balanced';
    const xpEarned = calculateXP(durationMinutes, tier);

    if (sessionId) {
      await endSession(sessionId, {
        duration_minutes: durationMinutes,
        xp_earned: xpEarned,
        status: 'completed'
      });
    }

    // Update topic completed_hours
    if (topic) {
      try {
        const newCompletedHours = (topic.completed_hours || 0) + (durationMinutes / 60);
        await updateTopic(topic.id, { completed_hours: newCompletedHours });
        topic.completed_hours = newCompletedHours;
        window.Store.set('activeTopic', topic);
      } catch (err) {
        console.error('Topic update failed:', err);
      }
    }

    // Update profile
    try {
      const newXP = (profile.xp || 0) + xpEarned;
      const newTotalTime = (profile.total_study_time || 0) + durationMinutes;
      const newLevel = calculateLevel(newXP);
      await updateProfileData(user.uid, {
        xp: newXP,
        level: newLevel,
        total_study_time: newTotalTime
      });
      const updatedProfile = await getProfile(user.uid);
      window.Store.set('profile', updatedProfile);
    } catch (err) {
      console.error('Profile update failed:', err);
    }

    try {
      const { fetchSessions } = await import('../firebase.js');
      const sessions = await fetchSessions(user.uid);
      window.Store.set('sessions', sessions);
    } catch (err) {
      console.error('Session refresh failed:', err);
    }

    window.showToast(`Session ended! +${xpEarned} XP earned`, 'success');
    closeStudySpace();
  }

  function calculateXP(minutes, tier) {
    const rates = { relaxed: 1 / 5, balanced: 1 / 3, intense: 1 / 2, extreme: 1 / 1 };
    const rate = rates[tier] || rates.balanced;
    return Math.floor(minutes * rate);
  }

  function calculateLevel(xp) {
    let level = 1;
    while (true) {
      const needed = 50 * level * level;
      if (xp >= needed) { level++; xp -= needed; } else break;
    }
    return level;
  }

  function closeStudySpace() {
    const studySpace = document.getElementById('studySpace');
    if (studySpace) studySpace.classList.add('hidden');
    const panel = document.getElementById('studyAiPanel');
    if (panel) panel.classList.remove('mobile-open');
    sessionStartTime = null;
    sessionId = null;
    pausedTime = 0;
    isPaused = false;
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  }

  function setupMobileAIPanel() {
    const fab = document.getElementById('aiChatFab');
    const panel = document.getElementById('studyAiPanel');
    const backBtn = document.getElementById('aiBackBtn');
    if (!fab || !panel || !backBtn) return;

    fab.addEventListener('click', () => {
      panel.classList.add('mobile-open');
      setTimeout(() => document.getElementById('studyChatInput')?.focus(), 350);
    });

    backBtn.addEventListener('click', () => {
      panel.classList.remove('mobile-open');
    });

    let touchStartY = 0;
    panel.addEventListener('touchstart', (e) => { touchStartY = e.touches[0].clientY; }, { passive: true });
    panel.addEventListener('touchend', (e) => {
      const touchEndY = e.changedTouches[0].clientY;
      const diff = touchEndY - touchStartY;
      if (diff > 100 && touchStartY < 80) panel.classList.remove('mobile-open');
    }, { passive: true });
  }

  /* ============================================
     AI CHAT — RESETS ON EVERY NEW STUDY SESSION
     ============================================ */

  function resetAIChat() {
    const chatMessages = document.getElementById('studyChatMessages');
    if (!chatMessages) return;

    // Clear all previous messages
    chatMessages.innerHTML = '';

    // Build fresh welcome message with current context
    const course = window.Store.get('activeCourse');
    const topic = window.Store.get('activeTopic');
    const resource = window.Store.get('activeResource');

    const contextParts = [];
    if (course) contextParts.push(`Course: ${course.name}`);
    if (topic) contextParts.push(`Topic: ${topic.name}`);
    if (resource) contextParts.push(`Resource: ${resource.name}`);

    const welcomeDiv = document.createElement('div');
    welcomeDiv.className = 'chat-msg bot';
    welcomeDiv.innerHTML = `
      <div class="chat-bubble">
        <p><strong>Ready to study!</strong></p>
        ${contextParts.length > 0 ? `<p style="margin-top:0.5rem; opacity:0.8; font-size:0.85rem;">${contextParts.join(' · ')}</p>` : ''}
        <p style="margin-top:0.75rem;">Ask me anything about this topic, or use the quick actions below.</p>
      </div>
    `;
    chatMessages.appendChild(welcomeDiv);
    chatMessages.scrollTop = 0;
  }

  function setupAIChat() {
    if (chatListenersAttached) return;
    chatListenersAttached = true;

    const chatInput = document.getElementById('studyChatInput');
    const chatSend = document.getElementById('studyChatSend');
    const chatMessages = document.getElementById('studyChatMessages');
    if (!chatInput || !chatSend || !chatMessages) return;

    async function sendMessage() {
      const text = chatInput.value.trim();
      if (!text) return;

      addMessage(text, 'user');
      chatInput.value = '';
      const typingId = addTyping();

      try {
        const documentText = window.Store.get('documentText') || '';
        const course = window.Store.get('activeCourse');
        const topic = window.Store.get('activeTopic');
        const resource = window.Store.get('activeResource');

        let messageWithContext = text;
        if (documentText) {
          const truncatedDoc = documentText.length > 4000 
            ? documentText.substring(0, 4000) + '... [truncated]' 
            : documentText;
          messageWithContext = `Document content:\n\n${truncatedDoc}\n\n---\n\nUser question: ${text}`;
        }

        const contextParts = [];
        if (course) contextParts.push(`Course: ${course.name}`);
        if (topic) contextParts.push(`Topic: ${topic.name}`);
        if (resource) contextParts.push(`Resource: ${resource.name}`);
        if (contextParts.length > 0) {
          messageWithContext = `${contextParts.join('\n')}\n\n${messageWithContext}`;
        }

        const response = await sendChatMessage(messageWithContext);
        removeTyping(typingId);
        const reply = response.reply || response.text || 'I received your message!';
        addMessage(reply, 'bot');
      } catch (err) {
        removeTyping(typingId);
        addMessage('Sorry, I had trouble connecting. Please try again.', 'bot');
      }
    }

    function addMessage(text, sender) {
      const div = document.createElement('div');
      div.className = `chat-msg ${sender}`;
      const bubble = document.createElement('div');
      bubble.className = 'chat-bubble';
      if (sender === 'bot') {
        bubble.innerHTML = formatBotMessage(text);
        setTimeout(() => {
          if (typeof renderMathInElement !== 'undefined') {
            renderMathInElement(bubble, {
              delimiters: [
                {left: '$$', right: '$$', display: true},
                {left: '$', right: '$', display: false},
                {left: '\\[', right: '\\]', display: true},
                {left: '\\(', right: '\\)', display: false}
              ],
              throwOnError: false
            });
          }
        }, 0);
      } else {
        bubble.textContent = text;
      }
      div.appendChild(bubble);
      chatMessages.appendChild(div);
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function formatBotMessage(text) {
      let html = escapeHtml(text);
      html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
      html = html.replace(/### (.*?)(\n|$)/g, '<h3>$1</h3>');
      html = html.replace(/## (.*?)(\n|$)/g, '<h2>$1</h2>');
      html = html.replace(/# (.*?)(\n|$)/g, '<h1>$1</h1>');
      html = html.replace(/^\d+\.\s+(.*?)$/gm, '<li>$1</li>');
      html = html.replace(/^[\-\*]\s+(.*?)$/gm, '<li>$1</li>');
      html = html.replace(/(<li>.*?<\/li>\n?)+/g, '<ul>$&</ul>');
      html = html.replace(/\n/g, '<br>');
      html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
      html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
      return html;
    }

    function addTyping() {
      const id = 'typing-' + Date.now();
      const div = document.createElement('div');
      div.className = 'chat-msg bot';
      div.id = id;
      div.innerHTML = `<div class="chat-bubble typing"><span></span><span></span><span></span></div>`;
      chatMessages.appendChild(div);
      chatMessages.scrollTop = chatMessages.scrollHeight;
      return id;
    }

    function removeTyping(id) {
      const el = document.getElementById(id);
      if (el) el.remove();
    }

    chatSend.addEventListener('click', sendMessage);
    chatInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') sendMessage();
    });

    document.querySelector('.study-ai-panel')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.ai-quick-action');
      if (btn) {
        chatInput.value = btn.dataset.prompt || btn.textContent;
        sendMessage();
      }
    });
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  init();
})();