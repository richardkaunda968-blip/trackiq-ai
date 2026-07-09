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

// Groq AI Chat Proxy
app.post('/api/chat', async (req, res) => {
  const { message, history = [] } = req.body;
  
  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  if (!process.env.GROQ_API_KEY) {
    console.error('GROQ_API_KEY is not set in .env');
    return res.status(500).json({ error: 'Server configuration error: API key missing' });
  }

  try {
    // Build messages array from history + current message
    const messages = [
      {
        role: 'system',
        content: 'You are a helpful Study Assistant. Help students understand concepts, summarize material, quiz them, and suggest focus areas. Be concise and encouraging.'
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
        messages: messages
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Groq API error:', response.status, errorText);
      return res.status(500).json({ error: `Groq API error: ${response.status}`, details: errorText });
    }
    
    const data = await response.json();
    console.log('Groq response:', JSON.stringify(data, null, 2));
    
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
  console.log(`Server running on port ${PORT}`);
});