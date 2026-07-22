require('dotenv').config();

const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.use((req, res, next) => {
  if (req.path.endsWith('.js')) {
    res.setHeader('Content-Type', 'application/javascript');
  }
  next();
});

app.use(express.static(path.join(__dirname)));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Groq AI Chat Proxy — Enhanced with Memory + Regional Context
app.post('/api/chat', async (req, res) => {
  const { message, history = [], context = {} } = req.body;
  
  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  if (!process.env.GROQ_API_KEY) {
    console.error('GROQ_API_KEY is not set in .env');
    return res.status(500).json({ error: 'Server configuration error: API key missing' });
  }

  try {
    // Build enhanced system prompt with context
    const systemPrompt = buildSystemPrompt(context);
    
    // Build messages array from history + current message
    const messages = [
      {
        role: 'system',
        content: systemPrompt
      }
    ];
    
    if (history && history.length > 0) {
      for (const msg of history) {
        messages.push({
          role: msg.role === 'user' ? 'user' : 'assistant',
          content: msg.text || msg.content || ''
        });
      }
    }
    
    messages.push({
      role: 'user',
      content: message
    });

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: messages,
        temperature: 0.7,
        max_tokens: 2048
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Groq API error:', response.status, errorText);
      return res.status(500).json({ error: `Groq API error: ${response.status}`, details: errorText });
    }
    
    const data = await response.json();
    
    if (data.error) {
      return res.status(500).json({ error: data.error.message });
    }
    
    const reply = data.choices?.[0]?.message?.content || 'No response from AI';
    res.json({ reply, text: reply });
    
  } catch (error) {
    console.error('Chat endpoint error:', error);
    res.status(500).json({ error: error.message });
  }
});

function buildSystemPrompt(context) {
  const parts = [];

  // Base identity
  parts.push('You are Orion, an intelligent academic companion and study assistant. You help students understand concepts, summarize material, quiz them, suggest focus areas, and provide personalized study guidance.');

  // Personalization
  if (context.student_name) {
    parts.push(`The student's name is ${context.student_name}. Greet them naturally and address them by name when appropriate.`);
  }

  // Regional teaching profile
  const region = context.education_region || 'commonwealth';
  const regionPrompts = {
    commonwealth: 'Use British English spelling (e.g., "colour", "analyse", "maths"), Commonwealth educational terminology, metric units, and examples familiar to students from UK, Australian, Canadian, or similar education systems. Refer to "university" rather than "college" for higher education.',
    us: 'Use American English spelling (e.g., "color", "analyze", "math"), US educational terminology, and examples familiar to American students. Use GPA terminology where relevant.',
    europe: 'Use International English, metric units, and Bologna Process terminology (ECTS, bachelor/master structure) where relevant.',
    other: 'Use clear, neutral International English and universally understood examples.'
  };
  parts.push(regionPrompts[region] || regionPrompts.commonwealth);

  // Course/topic context
  if (context.course) {
    parts.push(`Current course: ${context.course.name}.`);
  }
  if (context.topic) {
    parts.push(`Current topic: ${context.topic.name}. Tailor your explanations to this specific topic.`);
  }
  if (context.resource) {
    parts.push(`Current resource: ${context.resource.name}. Reference this material in your responses.`);
  }

  // Document context
  if (context.document_text) {
    parts.push('The student has uploaded a document. Use the document content to provide specific, contextual answers. Do not make up information not present in the document unless the student asks for external knowledge.');
  }

  // Weakness awareness
  if (context.previous_weaknesses && context.previous_weaknesses.length > 0) {
    parts.push(`The student has previously struggled with these topics: ${context.previous_weaknesses.join(', ')}. When relevant, gently reinforce these areas and provide extra practice.`);
  }

  // Recent session context
  if (context.recent_sessions && context.recent_sessions.length > 0) {
    const recent = context.recent_sessions.map(s => {
      const mins = s.duration || '?';
      return `${mins}min session`;
    }).join(', ');
    parts.push(`Recent study activity: ${recent}. Use this to gauge their current engagement level.`);
  }

  // Behavioral guidelines
  parts.push('Be concise but thorough. Use examples, analogies, and step-by-step explanations. When quizzing, start with easier questions and progressively increase difficulty based on performance. Encourage the student and celebrate progress. If they seem stuck, offer to break the concept down further. Remember: you are a long-term companion, not a one-off chatbot. Reference previous conversations when relevant.');

  return parts.join('\n\n');
}

// Support email endpoint
app.post('/api/support', async (req, res) => {
  const { name, email, subject, message } = req.body;
  
  if (!name || !email || !subject || !message) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  console.log('Support request:', { name, email, subject, message });
  res.json({ success: true, message: 'Support request received' });
});

// SPA fallback
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Orion server running on port ${PORT}`);
});