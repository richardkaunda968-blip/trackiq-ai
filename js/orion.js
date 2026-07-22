/* ============================================
   ORION — AI COMPANION MODULE (v1)
   Marble + Conversation Space + Chat History + Read-Only AI
   ============================================ */

import { sendChatMessage } from './firebase.js';

/* ============================================================
   ORION INSIGHT ENGINE (v1 — Lightweight)
   Generates personalised greeting insights from academic data.
   ============================================================ */

const OrionInsight = {
  // Priority order: lower number = higher priority
  PRIORITY: {
    upcoming_session: 1,
    upcoming_assessment: 1,
    neglected_subject: 2,
    missed_sessions: 2,
    weekly_goal_completed: 3,
    weekly_goal_near: 3,
    streak_at_risk: 3,
    milestone_completed: 3,
    planned_today: 4,
    default: 5
  },

  getTimeGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  },

  getInsightPriority(type) {
    return this.PRIORITY[type] || this.PRIORITY.default;
  },

  generateOrionInsight() {
    const profile = window.Store.get('profile') || {};
    const courses = window.Store.get('courses') || [];
    const allTopics = window.Store.get('topics') || {};
    const sessions = window.Store.get('sessions') || [];
    const planner = window.Store.get('planner') || [];
    const now = new Date();

    // Flatten topics
    const topicsList = Object.values(allTopics).flat();

    // --- Priority 1: Upcoming important events ---

    // Upcoming study session (within 2 hours)
    const todayName = now.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    const upcomingPlanner = planner
      .filter(p => p.day === todayName)
      .map(p => {
        const [h, m] = p.start_time.split(':').map(Number);
        const startMinutes = h * 60 + m;
        const diff = startMinutes - currentMinutes;
        return { ...p, startMinutes, diff };
      })
      .filter(p => p.diff > 0 && p.diff <= 120)
      .sort((a, b) => a.diff - b.diff);

    if (upcomingPlanner.length > 0) {
      const next = upcomingPlanner[0];
      const course = courses.find(c => c.id === next.course_id);
      const minsUntil = next.diff;
      const timeText = minsUntil < 60 ? `${minsUntil} minute${minsUntil !== 1 ? 's' : ''}` : `${Math.round(minsUntil / 60 * 10) / 10} hours`;
      return {
        type: 'upcoming_session',
        text: `${course?.name || 'Your session'} starts in ${timeText}.`
      };
    }

    // Upcoming assessment/deadline — not yet implemented in data model,
    // but structured for future expansion. For now, skip.

    // --- Priority 2: Student needs attention ---

    // Neglected subjects (not studied in 5+ days)
    const subjectLastStudy = {};
    sessions.forEach(s => {
      const topic = topicsList.find(t => t.id === s.topic_id);
      if (!topic) return;
      const course = courses.find(c => c.id === topic.course_id);
      if (!course) return;
      const ended = s.ended_at?.toDate?.() || new Date(s.ended_at);
      if (!subjectLastStudy[course.id] || ended > subjectLastStudy[course.id].date) {
        subjectLastStudy[course.id] = { date: ended, name: course.name };
      }
    });

    const neglected = Object.entries(subjectLastStudy)
      .map(([id, data]) => {
        const daysSince = Math.floor((now - data.date) / (1000 * 60 * 60 * 24));
        return { ...data, daysSince };
      })
      .filter(s => s.daysSince >= 5)
      .sort((a, b) => b.daysSince - a.daysSince);

    if (neglected.length > 0) {
      const sub = neglected[0];
      return {
        type: 'neglected_subject',
        text: `You haven't studied ${sub.name} in ${sub.daysSince} days.`
      };
    }

    // Missed planned sessions (planned today but no session for that topic)
    const todayPlanner = planner.filter(p => p.day === todayName);
    const todaySessionTopicIds = new Set(
      sessions
        .filter(s => {
          const d = s.ended_at?.toDate?.() || new Date(s.ended_at);
          return d.toDateString() === now.toDateString();
        })
        .map(s => s.topic_id)
    );

    const missedToday = todayPlanner.filter(p => !todaySessionTopicIds.has(p.topic_id));
    if (missedToday.length > 0) {
      const missed = missedToday[0];
      const course = courses.find(c => c.id === missed.course_id);
      return {
        type: 'missed_sessions',
        text: `You missed ${course?.name || 'a planned session'} today.`
      };
    }

    // --- Priority 3: Progress awareness ---

    // Weekly goal
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const thisWeekMinutes = sessions
      .filter(s => {
        if (!s.ended_at) return false;
        const d = s.ended_at.toDate ? s.ended_at.toDate() : new Date(s.ended_at);
        return d >= startOfWeek;
      })
      .reduce((sum, s) => sum + (s.duration_minutes || 0), 0);

    const weeklyGoalMinutes = (profile.weekly_goal || 15) * 60;
    const weeklyPercent = weeklyGoalMinutes > 0 ? Math.round((thisWeekMinutes / weeklyGoalMinutes) * 100) : 0;

    if (thisWeekMinutes >= weeklyGoalMinutes && weeklyGoalMinutes > 0) {
      return {
        type: 'weekly_goal_completed',
        text: 'You completed your weekly study goal.'
      };
    }

    if (weeklyPercent >= 80 && weeklyPercent < 100) {
      return {
        type: 'weekly_goal_near',
        text: `You're at ${weeklyPercent}% of your weekly goal.`
      };
    }

    // Streak at risk
    const streak = this.calculateStreak(sessions);
    const uniqueDates = [...new Set(
      sessions
        .filter(s => s.ended_at)
        .map(s => {
          const d = s.ended_at.toDate ? s.ended_at.toDate() : new Date(s.ended_at);
          return d.toDateString();
        })
    )].sort((a, b) => new Date(b) - new Date(a));

    if (streak > 0 && uniqueDates.length > 0) {
      const lastDate = new Date(uniqueDates[0]);
      const daysSinceLastStudy = Math.floor((now - lastDate) / (1000 * 60 * 60 * 24));
      if (daysSinceLastStudy === 1) {
        return {
          type: 'streak_at_risk',
          text: `Your ${streak}-day streak ends tonight.`
        };
      }
    }

    // --- Priority 4: General guidance ---

    // Planned sessions today
    if (todayPlanner.length > 0) {
      return {
        type: 'planned_today',
        text: `You have ${todayPlanner.length} session${todayPlanner.length !== 1 ? 's' : ''} planned today.`
      };
    }

    // Default
    return {
      type: 'default',
      text: "You're on track. Keep building consistency."
    };
  },

  calculateStreak(sessions) {
    if (!sessions || sessions.length === 0) return 0;
    const sessionDates = sessions
      .filter(s => s.ended_at)
      .map(s => {
        const d = s.ended_at.toDate ? s.ended_at.toDate() : new Date(s.ended_at);
        return d.toDateString();
      });
    const uniqueDates = [...new Set(sessionDates)].sort((a, b) => new Date(b) - new Date(a));
    if (uniqueDates.length === 0) return 0;
    const today = new Date().toDateString();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const mostRecent = uniqueDates[0];
    if (mostRecent !== today && mostRecent !== yesterday.toDateString()) return 0;
    let streak = 1;
    for (let i = 1; i < uniqueDates.length; i++) {
      const prevDate = new Date(uniqueDates[i - 1]);
      const currDate = new Date(uniqueDates[i]);
      const diffDays = (prevDate - currDate) / (1000 * 60 * 60 * 24);
      if (diffDays === 1) streak++;
      else break;
    }
    return streak;
  },

  getOrionGreeting() {
    const profile = window.Store.get('profile') || {};
    const name = profile.display_name || 'Student';
    const greeting = this.getTimeGreeting();
    const insight = this.generateOrionInsight();
    return `${greeting}, ${name} — ${insight.text}`;
  }
};

/* ============================================================
   ORION MARBLE
   ============================================================ */

class OrionMarble {
  constructor() {
    this.element = null;
  }

  create() {
    const wrapper = document.createElement('div');
    wrapper.className = 'orion-marble-wrapper';
    wrapper.title = 'Talk to Orion';

    const marble = document.createElement('div');
    marble.className = 'orion-marble';

    const innerLight = document.createElement('div');
    innerLight.className = 'marble-inner-light';
    marble.appendChild(innerLight);

    wrapper.appendChild(marble);

    marble.addEventListener('click', () => {
      window.OrionSpace.open();
    });

    this.element = wrapper;
    return wrapper;
  }
}

/* ============================================================
   ORION CHAT HISTORY (localStorage — separate from academic data)
   ============================================================ */

const ORION_STORAGE_KEY = 'orion_conversations';
const ORION_ACTIVE_KEY = 'orion_active_conversation';

class OrionChatHistory {
  constructor() {
    this.conversations = this.load();
  }

  load() {
    try {
      const raw = localStorage.getItem(ORION_STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  save() {
    localStorage.setItem(ORION_STORAGE_KEY, JSON.stringify(this.conversations));
  }

  getAll() {
    return Object.entries(this.conversations).map(([id, convo]) => ({
      id,
      ...convo
    })).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  get(id) {
    return this.conversations[id] || null;
  }

  create(name = 'New Chat') {
    const id = 'orion_' + Date.now();
    this.conversations[id] = {
      name,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    this.save();
    return id;
  }

  addMessage(id, role, content) {
    const convo = this.conversations[id];
    if (!convo) return;
    convo.messages.push({
      role,
      content,
      timestamp: Date.now()
    });
    convo.updatedAt = Date.now();
    this.save();
  }

  updateMessage(id, messageIndex, newContent) {
    const convo = this.conversations[id];
    if (!convo || !convo.messages[messageIndex]) return;
    convo.messages[messageIndex].content = newContent;
    convo.messages[messageIndex].edited = true;
    convo.updatedAt = Date.now();
    this.save();
  }

  rename(id, newName) {
    const convo = this.conversations[id];
    if (!convo) return;
    convo.name = newName;
    this.save();
  }

  delete(id) {
    delete this.conversations[id];
    this.save();
  }

  getActiveId() {
    return localStorage.getItem(ORION_ACTIVE_KEY);
  }

  setActiveId(id) {
    if (id) {
      localStorage.setItem(ORION_ACTIVE_KEY, id);
    } else {
      localStorage.removeItem(ORION_ACTIVE_KEY);
    }
  }
}

/* ============================================================
   ORION AI — READ-ONLY DATA CONTEXT BUILDER
   ============================================================ */

class OrionAI {
  constructor() {
    this.systemPrompt = this.buildSystemPrompt();
  }

  buildSystemPrompt() {
    return `You are Orion, an AI academic companion. You help students understand their academic ecosystem.

CRITICAL RULE — YOU CANNOT CHANGE ANYTHING:
- You are READ-ONLY. You cannot create, edit, or delete any data.
- You cannot modify courses, topics, planner items, notes, files, settings, progress, or account data.
- Even if the user asks you to make a change, you MUST refuse and instead offer analysis, explanation, recommendation, suggestion, or guidance.
- The user always performs actions themselves.

Example:
User: "Move my Physics session to Friday."
Orion: "I can't change your timetable, but I recommend moving it to Friday because you have more available time. You can make the change manually from your planner."

You have access to the user's academic data. Use their display name and reference actual data when responding. Be concise but helpful.`;
  }

  buildContext() {
    const profile = window.Store.get('profile') || {};
    const courses = window.Store.get('courses') || [];
    const allTopics = window.Store.get('topics') || {};
    const sessions = window.Store.get('sessions') || [];
    const planner = window.Store.get('planner') || [];

    const name = profile.display_name || 'Student';
    const totalMinutes = profile.total_study_time || 0;
    const totalHours = Math.floor(totalMinutes / 60);
    const xp = profile.xp || 0;
    const level = profile.level || 1;

    // Calculate streak
    const streak = this.calculateStreak(sessions);

    // Weekly study time
    const thisWeekMinutes = this.getThisWeekStudyTime(sessions);
    const weeklyGoal = (profile.weekly_goal || 15) * 60;
    const weeklyPercent = weeklyGoal > 0 ? Math.round((thisWeekMinutes / weeklyGoal) * 100) : 0;

    // Subject breakdown
    const subjectStats = {};
    sessions.forEach(s => {
      const topic = Object.values(allTopics).flat().find(t => t.id === s.topic_id);
      if (!topic) return;
      const course = courses.find(c => c.id === topic.course_id);
      if (!course) return;
      if (!subjectStats[course.name]) {
        subjectStats[course.name] = { minutes: 0, lastStudied: null };
      }
      subjectStats[course.name].minutes += s.duration_minutes || 0;
      const ended = s.ended_at?.toDate?.() || new Date(s.ended_at);
      if (!subjectStats[course.name].lastStudied || ended > subjectStats[course.name].lastStudied) {
        subjectStats[course.name].lastStudied = ended;
      }
    });

    // Topics needing attention (not studied in 5+ days)
    const now = new Date();
    const neglected = [];
    Object.entries(subjectStats).forEach(([name, stats]) => {
      if (stats.lastStudied) {
        const daysSince = (now - stats.lastStudied) / (1000 * 60 * 60 * 24);
        if (daysSince >= 5) {
          neglected.push({ name, daysSince: Math.floor(daysSince) });
        }
      }
    });

    // Upcoming planner items
    const today = now.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    const upcoming = planner
      .filter(p => p.day === today)
      .sort((a, b) => a.start_time.localeCompare(b.start_time))
      .slice(0, 3);

    return {
      name,
      level,
      xp,
      totalHours,
      streak,
      weeklyPercent,
      courseCount: courses.length,
      topicCount: Object.values(allTopics).flat().length,
      sessionCount: sessions.length,
      subjectStats,
      neglected,
      upcoming: upcoming.map(p => {
        const course = courses.find(c => c.id === p.course_id);
        return { course: course?.name || 'Unknown', time: p.start_time };
      })
    };
  }

  calculateStreak(sessions) {
    if (!sessions || sessions.length === 0) return 0;
    const sessionDates = sessions
      .filter(s => s.ended_at)
      .map(s => {
        const d = s.ended_at.toDate ? s.ended_at.toDate() : new Date(s.ended_at);
        return d.toDateString();
      });
    const uniqueDates = [...new Set(sessionDates)].sort((a, b) => new Date(b) - new Date(a));
    if (uniqueDates.length === 0) return 0;
    const today = new Date().toDateString();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const mostRecent = uniqueDates[0];
    if (mostRecent !== today && mostRecent !== yesterday.toDateString()) return 0;
    let streak = 1;
    for (let i = 1; i < uniqueDates.length; i++) {
      const prevDate = new Date(uniqueDates[i - 1]);
      const currDate = new Date(uniqueDates[i]);
      const diffDays = (prevDate - currDate) / (1000 * 60 * 60 * 24);
      if (diffDays === 1) streak++;
      else break;
    }
    return streak;
  }

  getThisWeekStudyTime(sessions) {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    return sessions
      .filter(s => {
        if (!s.ended_at) return false;
        const d = s.ended_at.toDate ? s.ended_at.toDate() : new Date(s.ended_at);
        return d >= startOfWeek;
      })
      .reduce((sum, s) => sum + (s.duration_minutes || 0), 0);
  }

  async send(message, history = []) {
    const context = this.buildContext();

    const historyForAPI = history.map(m => ({
      role: m.role,
      content: m.content
    }));

    try {
      const result = await sendChatMessage(message, historyForAPI, context);
      return result.response || result.message || result.text || "I'm here to help. What would you like to know about your studies?";
    } catch (err) {
      console.error('Orion AI error:', err);
      // Fallback: generate a contextual response locally
      return this.generateFallbackResponse(message, context);
    }
  }

  generateFallbackResponse(message, context) {
    const lower = message.toLowerCase();
    const { name, totalHours, streak, weeklyPercent, neglected, courseCount, sessionCount } = context;

    if (lower.includes('how am i doing') || lower.includes('progress')) {
      return `${name}, you've studied ${totalHours} hours total with a ${streak}-day streak. You're at ${weeklyPercent}% of your weekly goal. ${neglected.length > 0 ? `I'd recommend reviewing ${neglected[0].name} — it's been ${neglected[0].daysSince} days.` : 'Keep up the great work!'}`;
    }
    if (lower.includes('what should') || lower.includes('focus') || lower.includes('recommend')) {
      if (neglected.length > 0) {
        return `I recommend starting with ${neglected[0].name}. It's been ${neglected[0].daysSince} days since your last session there. You can find it in your Library.`;
      }
      return `You're doing well across all subjects, ${name}! With ${courseCount} courses and ${sessionCount} sessions, consider deepening your understanding of your weakest topic.`;
    }
    if (lower.includes('streak')) {
      return streak > 0
        ? `Your current streak is ${streak} day${streak > 1 ? 's' : ''}, ${name}! Study today to keep it alive.`
        : `No active streak right now, ${name}. Start a session today to begin one!`;
    }
    if (lower.includes('time') || lower.includes('hours')) {
      return `You've logged ${totalHours} hours of study time, ${name}. Your weekly goal progress is at ${weeklyPercent}%.`;
    }
    if (lower.includes('hello') || lower.includes('hi') || lower.includes('hey')) {
      return `Hello, ${name}! I'm Orion, your academic companion. I can help you analyze your study patterns, suggest what to focus on, or answer questions about your progress. What would you like to know?`;
    }

    return `I'm here to help, ${name}. I can analyze your study data, suggest focus areas, or explain your progress. What would you like to know?`;
  }
}

/* ============================================================
   ORION CONVERSATION SPACE
   ============================================================ */

class OrionSpace {
  constructor() {
    this.history = new OrionChatHistory();
    this.ai = new OrionAI();
    this.currentConvoId = null;
    this.isTyping = false;
    this.previousPage = null;

    this.elements = {};
    this.init();
  }

  init() {
    this.cacheElements();
    this.bindEvents();
  }

  cacheElements() {
    this.elements.space = document.getElementById('orionSpace');
    this.elements.conversation = document.getElementById('orionConversation');
    this.elements.input = document.getElementById('orionInput');
    this.elements.sendBtn = document.getElementById('orionSendBtn');
    this.elements.exitBtn = document.getElementById('orionExitBtn');
    this.elements.chatsBtn = document.getElementById('orionChatsBtn');
    this.elements.historySidebar = document.getElementById('orionHistorySidebar');
    this.elements.historyList = document.getElementById('orionHistoryList');
    this.elements.historyBackdrop = document.getElementById('orionHistoryBackdrop');
    this.elements.newChatBtn = document.getElementById('orionNewChatBtn');
    this.elements.closeHistoryBtn = document.getElementById('orionCloseHistoryBtn');
  }

  bindEvents() {
    if (this.elements.exitBtn) {
      this.elements.exitBtn.addEventListener('click', () => this.close());
    }
    if (this.elements.chatsBtn) {
      this.elements.chatsBtn.addEventListener('click', () => this.toggleHistory());
    }
    if (this.elements.sendBtn) {
      this.elements.sendBtn.addEventListener('click', () => this.sendMessage());
    }
    if (this.elements.input) {
      this.elements.input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.sendMessage();
        }
      });
    }
    if (this.elements.newChatBtn) {
      this.elements.newChatBtn.addEventListener('click', () => this.startNewChat());
    }
    if (this.elements.closeHistoryBtn) {
      this.elements.closeHistoryBtn.addEventListener('click', () => this.closeHistory());
    }
    if (this.elements.historyBackdrop) {
      this.elements.historyBackdrop.addEventListener('click', () => this.closeHistory());
    }

    // Suggestion chips
    document.querySelectorAll('.orion-suggestion-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const prompt = chip.dataset.prompt;
        if (prompt) {
          this.elements.input.value = prompt;
          this.sendMessage();
        }
      });
    });
  }

  open() {
    this.previousPage = window.Router ? window.Router.getCurrentPage() : null;

    // Restore active conversation or start new
    const activeId = this.history.getActiveId();
    if (activeId && this.history.get(activeId)) {
      this.currentConvoId = activeId;
    } else {
      this.currentConvoId = this.history.create();
      this.history.setActiveId(this.currentConvoId);
    }

    if (this.elements.space) {
      this.elements.space.classList.add('active');
    }

    this.renderConversation();
    this.scrollToBottom();

    // Focus input
    setTimeout(() => {
      if (this.elements.input) this.elements.input.focus();
    }, 100);
  }

  close() {
    if (this.elements.space) {
      this.elements.space.classList.remove('active');
    }
    this.closeHistory();

    // Return to previous page
    if (this.previousPage && window.Router) {
      window.Router.navigate(this.previousPage);
    }
  }

  toggleHistory() {
    const sidebar = this.elements.historySidebar;
    const backdrop = this.elements.historyBackdrop;
    if (!sidebar) return;

    const isOpen = sidebar.classList.contains('active');
    if (isOpen) {
      this.closeHistory();
    } else {
      this.renderHistoryList();
      sidebar.classList.add('active');
      if (backdrop) backdrop.classList.add('active');
    }
  }

  closeHistory() {
    if (this.elements.historySidebar) {
      this.elements.historySidebar.classList.remove('active');
    }
    if (this.elements.historyBackdrop) {
      this.elements.historyBackdrop.classList.remove('active');
    }
  }

  startNewChat() {
    this.currentConvoId = this.history.create();
    this.history.setActiveId(this.currentConvoId);
    this.closeHistory();
    this.renderConversation();
    this.scrollToBottom();
  }

  async sendMessage() {
    if (this.isTyping) return;

    const text = this.elements.input.value.trim();
    if (!text) return;

    // Clear input
    this.elements.input.value = '';

    // Add user message
    this.history.addMessage(this.currentConvoId, 'user', text);
    this.renderConversation();
    this.scrollToBottom();

    // Show typing
    this.isTyping = true;
    this.showTyping();
    this.scrollToBottom();

    // Get conversation history for context
    const convo = this.history.get(this.currentConvoId);
    const history = convo ? convo.messages.slice(0, -1) : [];

    // Get AI response
    const response = await this.ai.send(text, history);

    // Hide typing and add response
    this.isTyping = false;
    this.hideTyping();
    this.history.addMessage(this.currentConvoId, 'assistant', response);
    this.renderConversation();
    this.scrollToBottom();

    // Auto-rename conversation on first exchange
    if (convo && convo.messages.length <= 3 && convo.name === 'New Chat') {
      const shortName = text.length > 30 ? text.substring(0, 30) + '...' : text;
      this.history.rename(this.currentConvoId, shortName);
    }
  }

  showTyping() {
    const container = this.elements.conversation;
    if (!container) return;

    const typingEl = document.createElement('div');
    typingEl.className = 'orion-message orion-orion orion-typing-indicator';
    typingEl.innerHTML = `
      <div class="orion-msg-avatar orion"></div>
      <div class="orion-typing">
        <div class="orion-typing-dot"></div>
        <div class="orion-typing-dot"></div>
        <div class="orion-typing-dot"></div>
      </div>
    `;
    container.appendChild(typingEl);
  }

  hideTyping() {
    const indicators = document.querySelectorAll('.orion-typing-indicator');
    indicators.forEach(el => el.remove());
  }

  renderConversation() {
    const container = this.elements.conversation;
    if (!container) return;

    const convo = this.history.get(this.currentConvoId);
    if (!convo || convo.messages.length === 0) {
      this.renderEmptyState();
      return;
    }

    const profile = window.Store.get('profile') || {};
    const userInitial = (profile.display_name || 'You').charAt(0).toUpperCase();

    container.innerHTML = convo.messages.map((msg, index) => {
      const isUser = msg.role === 'user';
      const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const edited = msg.edited ? ' (edited)' : '';

      return `
        <div class="orion-message ${isUser ? 'orion-user' : 'orion-orion'}">
          <div class="orion-msg-avatar ${isUser ? 'user' : 'orion'}">
            ${isUser ? userInitial : ''}
          </div>
          <div>
            <div class="orion-msg-bubble">${this.escapeHtml(msg.content)}</div>
            <div class="orion-msg-meta">${time}${edited}</div>
            ${isUser ? `<button class="orion-msg-edit" data-index="${index}">Edit</button>` : ''}
          </div>
        </div>
      `;
    }).join('');

    // Bind edit buttons
    container.querySelectorAll('.orion-msg-edit').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.target.dataset.index);
        this.editMessage(idx);
      });
    });
  }

  renderEmptyState() {
    const container = this.elements.conversation;
    if (!container) return;

    const profile = window.Store.get('profile') || {};
    const name = profile.display_name || 'Student';
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

    container.innerHTML = `
      <div class="orion-empty-convo">
        <div class="orion-marble"><div class="marble-inner-light"></div></div>
        <h3>${greeting}, ${name}</h3>
        <p>I'm Orion, your academic companion. I can analyze your study patterns, suggest what to focus on, or answer questions about your progress.</p>
        <div class="orion-suggestion-chips">
          <button class="orion-suggestion-chip" data-prompt="How am I doing?">How am I doing?</button>
          <button class="orion-suggestion-chip" data-prompt="What should I focus on?">What should I focus on?</button>
          <button class="orion-suggestion-chip" data-prompt="Tell me about my streak">My streak</button>
          <button class="orion-suggestion-chip" data-prompt="How much time have I studied?">Study time</button>
        </div>
      </div>
    `;

    // Re-bind suggestion chips
    container.querySelectorAll('.orion-suggestion-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const prompt = chip.dataset.prompt;
        if (prompt) {
          this.elements.input.value = prompt;
          this.sendMessage();
        }
      });
    });
  }

  renderHistoryList() {
    const list = this.elements.historyList;
    if (!list) return;

    const conversations = this.history.getAll();

    if (conversations.length === 0) {
      list.innerHTML = '<div class="orion-history-empty">No conversations yet</div>';
      return;
    }

    list.innerHTML = conversations.map(convo => {
      const isActive = convo.id === this.currentConvoId;
      const date = new Date(convo.updatedAt).toLocaleDateString();
      return `
        <div class="orion-history-item ${isActive ? 'active' : ''}" data-id="${convo.id}">
          <span class="orion-history-item-name">${this.escapeHtml(convo.name)}</span>
          <div class="orion-history-item-actions">
            <button class="orion-history-item-btn orion-rename-btn" data-id="${convo.id}" title="Rename">✏️</button>
            <button class="orion-history-item-btn orion-delete-btn" data-id="${convo.id}" title="Delete">🗑️</button>
          </div>
        </div>
      `;
    }).join('');

    // Bind clicks
    list.querySelectorAll('.orion-history-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('.orion-history-item-btn')) return;
        const id = item.dataset.id;
        this.loadConversation(id);
      });
    });

    list.querySelectorAll('.orion-rename-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const convo = this.history.get(id);
        const newName = prompt('Rename conversation:', convo?.name || 'New Chat');
        if (newName && newName.trim()) {
          this.history.rename(id, newName.trim());
          this.renderHistoryList();
        }
      });
    });

    list.querySelectorAll('.orion-delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        if (confirm('Delete this conversation?')) {
          this.history.delete(id);
          if (this.currentConvoId === id) {
            this.startNewChat();
          }
          this.renderHistoryList();
        }
      });
    });
  }

  loadConversation(id) {
    this.currentConvoId = id;
    this.history.setActiveId(id);
    this.closeHistory();
    this.renderConversation();
    this.scrollToBottom();
  }

  editMessage(index) {
    const convo = this.history.get(this.currentConvoId);
    if (!convo || !convo.messages[index]) return;

    const msg = convo.messages[index];
    const newContent = prompt('Edit your message:', msg.content);
    if (newContent !== null && newContent.trim() !== '') {
      this.history.updateMessage(this.currentConvoId, index, newContent.trim());
      // Remove all messages after this one and re-send
      convo.messages = convo.messages.slice(0, index + 1);
      this.history.save();
      this.renderConversation();
      this.scrollToBottom();

      // Trigger new AI response
      this.isTyping = true;
      this.showTyping();
      this.scrollToBottom();

      const history = convo.messages.slice(0, -1);
      this.ai.send(newContent.trim(), history).then(response => {
        this.isTyping = false;
        this.hideTyping();
        this.history.addMessage(this.currentConvoId, 'assistant', response);
        this.renderConversation();
        this.scrollToBottom();
      });
    }
  }

  scrollToBottom() {
    const container = this.elements.conversation;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

/* ============================================================
   ORION INJECTOR — Place marble beside greeting on any page
   ============================================================ */

const OrionInjector = {
  inject(pageId, subtitleId) {
    const page = document.getElementById(pageId);
    const subtitle = document.getElementById(subtitleId);
    if (!page || !subtitle) return;

    // Don't inject twice
    if (subtitle.closest('.orion-marble-wrapper') || subtitle.previousElementSibling?.classList?.contains('orion-marble-wrapper')) {
      return;
    }

    const marble = new OrionMarble().create();

    // Wrap subtitle in a flex container with the marble
    const wrapper = document.createElement('div');
    wrapper.style.display = 'flex';
    wrapper.style.alignItems = 'center';
    wrapper.style.gap = 'var(--space-sm)';
    wrapper.style.flexWrap = 'wrap';

    subtitle.parentNode.insertBefore(wrapper, subtitle);
    wrapper.appendChild(marble);
    wrapper.appendChild(subtitle);
  },

  updateGreeting(subtitleElement) {
    if (!subtitleElement) return;
    const greeting = OrionInsight.getOrionGreeting();
    subtitleElement.textContent = greeting;
    // The marble injection is handled separately by each page's inject() call
  }
};

/* ============================================================
   EXPORT
   ============================================================ */

window.OrionSpace = new OrionSpace();
window.OrionInjector = OrionInjector;
window.OrionInsight = OrionInsight;

export { OrionMarble, OrionSpace, OrionChatHistory, OrionAI, OrionInjector, OrionInsight };