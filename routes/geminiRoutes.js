const express = require('express');
const dotenv = require('dotenv');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const conn = require('../config/db');
const authenticate = require('../middleware/auth');

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API);

async function generateQAFromText(text, numberOfQuestions) {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const prompt = `
Given the following text, generate a JSON array of ${numberOfQuestions} questions and answers. The questions must have the answers in the text:
Text:
"""
${text}
"""
Format:
[
  { "question": "...", "answer": "..." },
  { "question": "...", "answer": "..." },
  ...
]
`;

  const result = await model.generateContent(prompt);
  const responseText = await result.response.text();

  try {
    const jsonStart = responseText.indexOf('[');
    const jsonEnd = responseText.lastIndexOf(']') + 1;
    const jsonString = responseText.slice(jsonStart, jsonEnd);
    return JSON.parse(jsonString);
  } catch (e) {
    console.error('Failed to parse JSON from Gemini:', responseText);
    return { error: 'Could not parse Gemini response.' };
  }
}

const router = express.Router();

router.post('/api/items/gemini', authenticate, async (req, res) => {
    const { text, numberOfQuestions } = req.body;
    if (!text) return res.status(400).json({ error: 'Text is required' });
    try {
      const qa = await generateQAFromText(text, numberOfQuestions);
      res.json({ questionsAndAnswers: qa });
    } catch (err) {
      console.error('Gemini generation error:', err);
      res.status(500).json({ error: 'Failed to generate questions' });
    }
});

router.post('/api/items/ocr-upload', authenticate, async (req, res) => {
  const { qaPairs, questionSetId } = req.body;

  if (!Array.isArray(qaPairs) || !questionSetId) {
    return res.status(400).json({ message: "Missing or invalid data" });
  }

  try {
    const values = qaPairs.map(q => [questionSetId, q.question, q.answer]);
    await conn.query(
     "INSERT INTO questions (questionSetId, questionText, answerText) VALUES ?",
      [values]
    );

    res.status(200).json({ message: "Items uploaded to DB" });
  } catch (e) {
    console.error("Upload error:", e.message);
    res.status(500).json({ message: `Error uploading items: ${e.message}` });
  }
});

module.exports = router;
