const dotenv = require('dotenv');
dotenv.config();

const { GoogleGenerativeAI } = require('@google/generative-ai');

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

module.exports = { generateQAFromText };
