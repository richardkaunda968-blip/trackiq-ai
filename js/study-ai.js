/* ============================================
   ORION — STUDY SPACE (v3.2)
   D.N.D. Mode + AI Memory + Enhanced Context
   + Study AI Workspace Support
   ============================================ */

import { 
  createSession, 
  endSession, 
  updateProfileData, 
  sendChatMessage, 
  getProfile, 
  updateTopic,
  saveChatMessage,
  fetchChatHistory,
  getUserSettings
} from './firebase.js';

(function() {
  let sessionStartTime = null;
  let sessionId = null;
  let pausedTime = 0;
  let isPaused = false;
  let pauseStart = null;
  let timerInterval = null;
  let chatListenersAttached = false;
  let workspaceChatListenersAttached = false;
  let dndActive = false;
  let dndPaused = false;
  let dndPauseTimeout = null;
  let chatHistory = [];

  function init() {
    setupEventListeners();
    setupAIChat();
    setupWorkspaceAIChat();
    setupMobileAIPanel();
    setupDND();
  }

  function setupEventListeners() {
    window.addEventListener('studysession:start', (e) => {
      startTimer(e.detail.courseId, e.detail.topicId, e.detail.resourceId);
      resetAIChat();
      activateDND();
    });

    window.addEventListener('planner:startStudy', (e) => {
      startTimer(e.detail.courseId, e.detail.topicId, e.detail.resourceId);
      resetAIChat();
      activateDND();
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

  /* ============================================
     D.N.D. STUDY MODE
     ============================================ */

  function setupDND() {
    const pauseBtn = document.getElementById('dndPauseBtn');
    if (pauseBtn) {
      pauseBtn.addEventListener('click', toggleDNDPause);
    }
  }

  async function activateDND() {
    const user = window.Store.get('user');
    if (!user) return;

    const settings = await getUserSettings(user.uid);
    if (!settings.dnd_auto_enable) return;

    dndActive = true;
    dndPaused = false;

    const indicator = document.getElementById('dndIndicator');
    if (indicator) {
      indicator.classList.remove('hidden');
      indicator.classList.remove('paused');
    }

    suppressExternalNotifications();
    window.showToast?.('D.N.D. activated — external notifications silenced', 'info');
  }

  function deactivateDND() {
    dndActive = false;
    dndPaused = false;
    if (dndPauseTimeout) {
      clearTimeout(dndPauseTimeout);
      dndPauseTimeout = null;
    }

    const indicator = document.getElementById('dndIndicator');
    if (indicator) {
      indicator.classList.add('hidden');
      indicator.classList.remove('paused');
    }

    restoreExternalNotifications();
  }

  function toggleDNDPause() {
    if (!dndActive) return;

    const indicator = document.getElementById('dndIndicator');
    const pauseBtn = document.getElementById('dndPauseBtn');

    if (dndPaused) {
      dndPaused = false;
      if (dndPauseTimeout) {
        clearTimeout(dndPauseTimeout);
        dndPauseTimeout = null;
      }
      if (indicator) indicator.classList.remove('paused');
      if (pauseBtn) pauseBtn.textContent = 'Pause';
      suppressExternalNotifications();
      window.showToast?.('D.N.D. resumed', 'info');
    } else {
      dndPaused = true;
      if (indicator) indicator.classList.add('paused');
      if (pauseBtn) pauseBtn.textContent = 'Resume';
      restoreExternalNotifications();
      window.showToast?.('D.N.D. paused for 10 minutes', 'info');

      dndPauseTimeout = setTimeout(() => {
        if (dndActive && dndPaused) {
          toggleDNDPause();
        }
      }, 10 * 60 * 1000);
    }
  }

  function suppressExternalNotifications() {
    window.Store.set('dndActive', true);
    document.title = '🔇 Orion — Focus Mode';
  }

  function restoreExternalNotifications() {
    window.Store.set('dndActive', false);
    document.title = 'Orion';
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

    deactivateDND();

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
      const { fetchSessions } = await import('./firebase.js');
      const sessions = await fetchSessions(user.uid);
      window.Store.set('sessions', sessions);
    } catch (err) {
      console.error('Session refresh failed:', err);
    }

    try {
      await saveChatMessage(user.uid, {
        role: 'system',
        content: `Study session completed: ${topic?.name || 'Unknown topic'} for ${durationMinutes} minutes. +${xpEarned} XP earned.`,
        course_id: window.Store.get('activeCourse')?.id,
        topic_id: topic?.id,
        session_id: sessionId,
        type: 'session_summary'
      });
    } catch (err) {
      console.error('Failed to save session summary:', err);
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
    
    const workspace = document.getElementById('studyAiWorkspace');
    if (workspace) workspace.classList.add('hidden');
    
    sessionStartTime = null;
    sessionId = null;
    pausedTime = 0;
    isPaused = false;
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    deactivateDND();

    const appShell = document.getElementById('appShell');
    const mobileNav = document.getElementById('mobileNav');
    if (appShell) appShell.classList.remove('hidden');
    if (mobileNav) mobileNav.classList.remove('hidden');
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
     AI CHAT — SIDE PANEL
     ============================================ */

  async function resetAIChat() {
    const chatMessages = document.getElementById('studyChatMessages');
    if (!chatMessages) return;

    chatMessages.innerHTML = '';
    chatHistory = [];

    const user = window.Store.get('user');
    if (user) {
      try {
        const history = await fetchChatHistory(user.uid, 20);
        const course = window.Store.get('activeCourse');
        const topic = window.Store.get('activeTopic');

        const relevantHistory = history.filter(h => {
          if (!h.course_id) return true;
          if (course && h.course_id === course.id) return true;
          return false;
        });

        chatHistory = relevantHistory.map(h => ({
          role: h.role,
          text: h.content || h.text
        }));

        const recentExchanges = relevantHistory.slice(-6);
        if (recentExchanges.length > 0) {
          const contextDiv = document.createElement('div');
          contextDiv.className = 'chat-context-hint';
          contextDiv.innerHTML = `
            <div class="context-hint-header">
              <span>💡</span> Previous conversations about this topic
            </div>
          `;
          chatMessages.appendChild(contextDiv);
        }
      } catch (err) {
        console.error('Failed to load chat history:', err);
      }
    }

    const course = window.Store.get('activeCourse');
    const topic = window.Store.get('activeTopic');
    const resource = window.Store.get('activeResource');
    const profile = window.Store.get('profile') || {};
    const name = profile.display_name || 'Student';

    const contextParts = [];
    if (course) contextParts.push(`Course: ${course.name}`);
    if (topic) contextParts.push(`Topic: ${topic.name}`);
    if (resource) contextParts.push(`Resource: ${resource.name}`);

    const welcomeDiv = document.createElement('div');
    welcomeDiv.className = 'chat-msg bot';

    const hour = new Date().getHours();
    let greeting = 'Hello';
    if (hour < 12) greeting = 'Good morning';
    else if (hour < 17) greeting = 'Good afternoon';
    else greeting = 'Good evening';

    welcomeDiv.innerHTML = `
      <div class="chat-bubble">
        <p><strong>${greeting}, ${name}!</strong> Ready to study.</p>
        ${contextParts.length > 0 ? `<p style="margin-top:0.5rem; opacity:0.8; font-size:0.85rem;">${contextParts.join(' · ')}</p>` : ''}
        <p style="margin-top:0.75rem;">Ask me anything about this topic, or use the quick actions below. I remember our previous conversations.</p>
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
        const response = await getAIResponse(text);
        
        const user = window.Store.get('user');
        const course = window.Store.get('activeCourse');
        const topic = window.Store.get('activeTopic');
        const resource = window.Store.get('activeResource');

        if (user) {
          await saveChatMessage(user.uid, {
            role: 'user',
            content: text,
            course_id: course?.id,
            topic_id: topic?.id,
            resource_id: resource?.id,
            type: 'chat'
          });
          await saveChatMessage(user.uid, {
            role: 'assistant',
            content: response.reply || response.text,
            course_id: course?.id,
            topic_id: topic?.id,
            resource_id: resource?.id,
            type: 'chat'
          });
        }

        chatHistory.push({ role: 'user', text });
        chatHistory.push({ role: 'assistant', text: response.reply || response.text });

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
                {left: '\[', right: '\]', display: true},
                {left: '\(', right: '\)', display: false}
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

  /* ============================================
     AI CHAT — STUDY AI WORKSPACE (OVERLAY)
     ============================================ */

  function setupWorkspaceAIChat() {
    if (workspaceChatListenersAttached) return;

    const workspace = document.getElementById('studyAiWorkspace');
    const input = document.getElementById('studyAiInput');
    const sendBtn = document.getElementById('studyAiSend');
    const messages = document.getElementById('studyAiConversation');
    const exitBtn = document.getElementById('studyAiExit');
    const clearBtn = document.getElementById('studyAiClear');

    if (!workspace || !input || !sendBtn || !messages) return;

    workspaceChatListenersAttached = true;
    let workspaceHistory = [];

    async function loadWorkspaceHistory() {
      const user = window.Store.get('user');
      const course = window.Store.get('activeCourse');
      if (!user) return;
      try {
        const history = await fetchChatHistory(user.uid, 50);
        const courseHistory = history.filter(h => {
          if (h.role === 'system') return false;
          if (!course) return true;
          return h.course_id === course.id || !h.course_id;
        });
        workspaceHistory = courseHistory.map(h => ({
          role: h.role,
          text: h.content || h.text
        }));
      } catch (err) {
        console.error('Failed to load workspace history:', err);
        workspaceHistory = [];
      }
    }

    function renderWorkspaceHistory() {
      messages.innerHTML = '';

      workspaceHistory.forEach((msg, index) => {
        const div = document.createElement('div');
        div.className = `chat-msg ${msg.role === 'user' ? 'user' : 'bot'}`;
        div.dataset.index = index;

        const bubble = document.createElement('div');
        bubble.className = 'chat-bubble';

        if (msg.role === 'assistant') {
          bubble.innerHTML = formatBotMessage(msg.text);
        } else {
          bubble.textContent = msg.text;
        }

        div.appendChild(bubble);

        if (msg.role === 'user') {
          const editBtn = document.createElement('button');
          editBtn.className = 'msg-edit-btn';
          editBtn.textContent = 'Edit';
          editBtn.addEventListener('click', () => {
            input.value = msg.text;
            input.focus();
            workspaceHistory = workspaceHistory.slice(0, index);
            renderWorkspaceHistory();
          });
          div.appendChild(editBtn);
        }

        messages.appendChild(div);
      });

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
      messages.appendChild(welcomeDiv);
      messages.scrollTop = messages.scrollHeight;
    }

    function clearWorkspaceChat() {
      workspaceHistory = [];
      renderWorkspaceHistory();
    }

    async function sendWorkspaceMessage() {
      const text = input.value.trim();
      if (!text) return;

      const welcomeMsg = messages.querySelector('.chat-msg.bot:last-child');
      if (welcomeMsg && welcomeMsg.querySelector('strong')?.textContent === 'Ready to study!') {
        welcomeMsg.remove();
      }

      addWorkspaceMessage(text, 'user');
      input.value = '';
      const typingId = addWorkspaceTyping();

      try {
        const response = await getAIResponse(text);

        const user = window.Store.get('user');
        const course = window.Store.get('activeCourse');
        const topic = window.Store.get('activeTopic');
        const resource = window.Store.get('activeResource');

        if (user) {
          await saveChatMessage(user.uid, {
            role: 'user',
            content: text,
            course_id: course?.id,
            topic_id: topic?.id,
            resource_id: resource?.id,
            type: 'chat'
          });
          await saveChatMessage(user.uid, {
            role: 'assistant',
            content: response.reply || response.text,
            course_id: course?.id,
            topic_id: topic?.id,
            resource_id: resource?.id,
            type: 'chat'
          });
        }

        workspaceHistory.push({ role: 'user', text });
        workspaceHistory.push({ role: 'assistant', text: response.reply || response.text });
        chatHistory.push({ role: 'user', text });
        chatHistory.push({ role: 'assistant', text: response.reply || response.text });

        removeWorkspaceTyping(typingId);
        const reply = response.reply || response.text || 'I received your message!';
        addWorkspaceMessage(reply, 'bot');
      } catch (err) {
        removeWorkspaceTyping(typingId);
        addWorkspaceMessage('Sorry, I had trouble connecting. Please try again.', 'bot');
      }
    }

    function addWorkspaceMessage(text, sender) {
      const div = document.createElement('div');
      div.className = `chat-msg ${sender}`;
      div.dataset.index = workspaceHistory.length;

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
                {left: '\[', right: '\]', display: true},
                {left: '\(', right: '\)', display: false}
              ],
              throwOnError: false
            });
          }
        }, 0);
      } else {
        bubble.textContent = text;
      }
      div.appendChild(bubble);

      if (sender === 'user') {
        const editBtn = document.createElement('button');
        editBtn.className = 'msg-edit-btn';
        editBtn.textContent = 'Edit';
        editBtn.addEventListener('click', () => {
          input.value = text;
          input.focus();
          const idx = parseInt(div.dataset.index);
          workspaceHistory = workspaceHistory.slice(0, idx);
          renderWorkspaceHistory();
        });
        div.appendChild(editBtn);
      }

      messages.appendChild(div);
      messages.scrollTop = messages.scrollHeight;
    }

    function addWorkspaceTyping() {
      const id = 'typing-ws-' + Date.now();
      const div = document.createElement('div');
      div.className = 'chat-msg bot';
      div.id = id;
      div.innerHTML = `<div class="chat-bubble typing"><span></span><span></span><span></span></div>`;
      messages.appendChild(div);
      messages.scrollTop = messages.scrollHeight;
      return id;
    }

    function removeWorkspaceTyping(id) {
      const el = document.getElementById(id);
      if (el) el.remove();
    }

    sendBtn.addEventListener('click', sendWorkspaceMessage);
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') sendWorkspaceMessage();
    });

    const quickActions = document.getElementById('studyAiQuickActions');
    if (quickActions) {
      quickActions.addEventListener('click', (e) => {
        const btn = e.target.closest('.study-ai-quick-btn');
        if (btn) {
          input.value = btn.dataset.prompt;
          sendWorkspaceMessage();
        }
      });
    }

    if (exitBtn) {
      exitBtn.addEventListener('click', () => {
        window.closeStudyAIWorkspace();
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (confirm('Clear all chat history for this topic?')) {
          clearWorkspaceChat();
        }
      });
    }

    window.addEventListener('studyai:workspaceopen', async () => {
      await loadWorkspaceHistory();
      renderWorkspaceHistory();
    });
  }

  /* ============================================
     SHARED AI RESPONSE BUILDER
     ============================================ */

  async function getAIResponse(text) {
    const documentText = window.Store.get('documentText') || '';
    const course = window.Store.get('activeCourse');
    const topic = window.Store.get('activeTopic');
    const resource = window.Store.get('activeResource');
    const profile = window.Store.get('profile') || {};
    const user = window.Store.get('user');

    const context = {
      course: course ? { id: course.id, name: course.name } : null,
      topic: topic ? { id: topic.id, name: topic.name } : null,
      resource: resource ? { id: resource.id, name: resource.name } : null,
      document_text: documentText ? documentText.substring(0, 4000) : '',
      education_region: profile.education_region || 'commonwealth',
      student_name: profile.display_name || 'Student',
      previous_weaknesses: await getWeakTopics(user.uid),
      recent_sessions: await getRecentSessions(user.uid)
    };

    let messageWithContext = text;
    if (documentText) {
      const truncatedDoc = documentText.length > 4000 
        ? documentText.substring(0, 4000) + '... [truncated]' 
        : documentText;
      messageWithContext = `Document content:

${truncatedDoc}

---

User question: ${text}`;
    }

    const contextParts = [];
    if (course) contextParts.push(`Course: ${course.name}`);
    if (topic) contextParts.push(`Topic: ${topic.name}`);
    if (resource) contextParts.push(`Resource: ${resource.name}`);
    if (contextParts.length > 0) {
      messageWithContext = `${contextParts.join('\n')}

${messageWithContext}`;
    }

    const apiHistory = chatHistory.slice(-10).map(h => ({
      role: h.role,
      text: h.text
    }));

    const response = await sendChatMessage(messageWithContext, apiHistory, context);
    return { ...response, user, course, topic, resource };
  }

  async function getWeakTopics(userId) {
    try {
      const { fetchQuizResults } = await import('./firebase.js');
      const results = await fetchQuizResults(userId);
      const weakTopics = results
        .filter(r => (r.score || 0) < 60)
        .map(r => r.topic_name)
        .filter((v, i, a) => a.indexOf(v) === i);
      return weakTopics.slice(0, 5);
    } catch (err) {
      return [];
    }
  }

  async function getRecentSessions(userId) {
    try {
      const { fetchSessions } = await import('./firebase.js');
      const sessions = await fetchSessions(userId);
      return sessions.slice(0, 3).map(s => ({
        topic_id: s.topic_id,
        duration: s.duration_minutes,
        date: s.started_at
      }));
    } catch (err) {
      return [];
    }
  }

  init();
})();

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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