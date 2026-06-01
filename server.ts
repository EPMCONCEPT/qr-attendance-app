import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

// Load environment variables from .env
dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';
const PORT = 3000;

async function startServer() {
  const app = express();
  app.use(express.json());

  // Initialize server-side Gemini client
  const geminiApiKey = process.env.GEMINI_API_KEY;
  let ai: GoogleGenAI | null = null;
  
  if (geminiApiKey) {
    ai = new GoogleGenAI({
      apiKey: geminiApiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  } else {
    console.warn("GEMINI_API_KEY is missing from environment. AI summaries will fall back to local template.");
  }

  // ==========================================
  // Backend API Endpoints
  // ==========================================

  // AI Weekly Summary generation endpoint
  app.post('/api/summarize', async (req, res) => {
    const { attendanceRecords, className, courseCode } = req.body;

    if (!attendanceRecords || !Array.isArray(attendanceRecords)) {
      return res.status(400).json({ error: 'Missing active attendance logs array.' });
    }

    // Fallback if AI not initialized
    if (!ai) {
      return res.json({
        summary: `### Weekly Attendance Report for ${className || 'Class'} (${courseCode || 'N/A'}) - Sandbox Mode\n\n` +
          `* **Roster Total Logs**: ${attendanceRecords.length} records processed.\n` +
          `* **Attendance Status**: Dynamic student presence sheets have been saved. Since no \`GEMINI_API_KEY\` was configured in secrets, this standard report has been populated locally.\n\n` +
          `*Tip: Configure your Gemini API secret in the AI Studio Settings panel to unlock full machine learning summaries on student streaks and late arrivals.*`
      });
    }

    try {
      // Compile student list summary
      const recordSummary = attendanceRecords.map(r => 
        `- Student Name: ${r.studentName}, Email: ${r.studentEmail}, Status: ${r.status}, Time: ${r.timestamp}`
      ).join('\n');

      const systemPrompt = `You are an expert college registrar and educational counselor assistant. 
Review the attendance JSON records for the class and generate a clear, executive, warm weekly attendance report.
Structure the response beautifully using Markdown with these core sections:
1. **Attendance Rate Overview**: Summary statistics (e.g. participation percentage) and student count.
2. **Weekly Student Engagement & Streaks**: Call out students who have perfect attendance or who have missed classes/arrived late.
3. **Counselor Recommendations**: Friendly, actionable instructional advice for the teacher to help student retention and support struggling students.`;

      const promptMsg = `Generate are the attendance records of the past week for course ${className} (${courseCode}):\n\n${recordSummary || 'No records submitted for this week yet.'}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: promptMsg,
        config: {
          systemInstruction: systemPrompt,
          temperature: 0.7,
        }
      });

      const textOutput = response.text || "Unable to extract text output.";
      res.json({ summary: textOutput });
    } catch (err: any) {
      console.error("Gemini API server-route Error: ", err);
      res.status(500).json({ error: `AI Generation failed: ${err.message || String(err)}` });
    }
  });

  // Health probe endpoint
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', isProduction });
  });

  // ==========================================
  // Vite Middleware & Static Assets Routing
  // ==========================================

  if (!isProduction) {
    // Mount Vite development middlewares to handle hot TS assets compilation
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Serve bundled build static files in production containers
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`EduQR server running on http://localhost:${PORT}`);
  });
}

startServer();
