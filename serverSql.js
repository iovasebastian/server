const express = require('express');
const cors = require('cors');
const app = express();
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { createWorker } = require('tesseract.js');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { generateQAFromText } = require('./gemeni.js');
const { createCodeForPasswordReset, sendMail } = require('./nodeMailer.js');
require('dotenv').config();

const secret = process.env.JWT_SECRET;
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, '/tmp'); 
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'upload-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });

const authenticate = (req, res, next) => {
  console.log('Entered authenticate');
  console.log("Authorization Header:", req.headers.authorization);

  const authHeader = req.headers.authorization;
  console.log("Authorization Header:", authHeader);

  if (!authHeader) return res.status(401).send('No token provided');

  const token = authHeader.split(' ')[1];
  jwt.verify(token, secret, (err, decoded) => {
    if (err) return res.status(403).send('Invalid token');

    req.user = decoded;
    next();
  });
};

app.use(cors({
  origin: '*',
  credentials: true,
}));
app.use(express.json({limit: '1mb'}));

const conn = mysql.createPool({
    host: process.env.SQL_HOST,
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
    database: process.env.SQL_DATABASE,
});

app.post('/api/items/gemini', authenticate, async (req, res) => {
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

app.post('/api/items/checkEmail', async (req, res) => {
    const {email} = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });
    try {
      const [rows] = await conn.execute("SELECT * FROM users WHERE email = ?", [email])
      if(rows.length === 0){
        res.status(200).json(false);
      }else{
        res.status(200).json(true);
      }
    } catch (err) {
      res.status(500).json({ error: 'Failed to generate questions' });
    }
});

app.post('/api/items/addCodeToDb', async (req, res) => {
    const {email} = req.body;
    const code = createCodeForPasswordReset();
    if (!email) return res.status(400).json({ error: 'Email is required' });
    try {
      await conn.execute("UPDATE users SET tokenPassword = ? WHERE email = ?", [code, email]);
      await sendMail(email, code);
      res.status(200).json({message: "Code added to db sucessfully"});
    } catch (err) {
      res.status(500).json({ error: 'Failed to generate questions' });
    }
});

app.get('/api/items/getTotalSets', authenticate, async (req, res) => {
    const userId = req.user.userId;
    try {
      const [rows] = await conn.execute("SELECT * FROM questionSets WHERE userId = ?", [userId]);
      const numberOfRows = rows.length;
      console.log(numberOfRows);
      res.status(200).json({setNumber: numberOfRows});
    } catch (err) {
      res.status(500).json({ error: 'Failed to get number of Rows' });
      console.error(err);
    }
});

app.get('/api/items/getCorrectQuestionsPercentage', authenticate, async (req, res) => {
    const userId = req.user.userId;
    try {
      const [knownQuestions] = await conn.execute("SELECT * FROM usersQuestionsStats WHERE userId = ? AND known = 1", [userId]);
      const [totalQuestions] = await conn.execute("SELECT * FROM usersQuestionsStats WHERE userId = ?", [userId]);
      const knownQuestionsNumber = knownQuestions.length;
      const totalQuestionsNumber = totalQuestions.length;
      const percentageOfCorrect = ((knownQuestionsNumber / totalQuestionsNumber) * 100).toFixed(2);
      res.status(200).json({percentageOfCorrect: percentageOfCorrect});
    } catch (err) {
      res.status(500).json({ error: 'Failed to get number of Rows' });
      console.error(err);
    }
});

app.get('/api/items/getDailyData', authenticate, async (req,res) =>{
    const userId = req.user.userId;
    try{
      const [rows] = await conn.execute("SELECT * FROM usersQuestionSetsStats WHERE userId = ?", [userId]);
      let dates = [];
      rows.map((item, index)=>{
        dates.push(item.date);
      })
      function getMonday(date = new Date()) {
        const day = date.getDay(); // 0 (Sun) to 6 (Sat)
        const diff = day === 0 ? -6 : 1 - day; // shift for Sunday
        const monday = new Date(date);
        monday.setDate(date.getDate() + diff);
        monday.setHours(0, 0, 0, 0); // optional: reset time
        return monday;
      }
      const monday = getMonday();
      const filtered = dates.filter(dateStr => {
        return new Date(dateStr) > monday;
      });
      let daysOfWeek = [];
      filtered.map((item, index)=>{
        daysOfWeek.push(item.getDay()-1);
      });
      const entryPerDay = daysOfWeek.reduce((acc, val) => {
        acc[val] = (acc[val] || 0) + 1;
        return acc;
      }, {});
      res.status(200).json({entryPerDay:entryPerDay});
    }catch(error){
      res.status(500).json({ error: 'Failed to get daily numbers' });
      console.error(error);
    }
});

app.get('/api/items/getWeeklyPercentage', authenticate, async (req, res) => {
  const userId = req.user.userId;

  try {
    // 1. Fetch relevant stats (last 4 ISO weeks)
    const [rows] = await conn.execute(`
      SELECT known, date 
      FROM usersQuestionsStats 
      WHERE userId = ? 
        AND YEARWEEK(date, 1) >= YEARWEEK(CURDATE() - INTERVAL 3 WEEK, 1)
    `, [userId]);

    // 2. Get ISO week number helper
    function getISOWeekKey(date) {
      const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
      const day = d.getUTCDay() || 7;
      d.setUTCDate(d.getUTCDate() + 4 - day);
      const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
      const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
      return `${d.getUTCFullYear()}-W${week}`;
    }

    // 3. Count known and total per week
    const weekStats = {};
    rows.forEach(({ known, date }) => {
      const key = getISOWeekKey(new Date(date));
      if (!weekStats[key]) {
        weekStats[key] = { known: 0, total: 0 };
      }
      weekStats[key].total++;
      if (known === 1) weekStats[key].known++;
    });

    // 4. Build list of last 4 ISO weeks
    const now = new Date();
    const last4Weeks = Array.from({ length: 4 }, (_, i) => {
      const pastDate = new Date(now);
      pastDate.setDate(now.getDate() - i * 7);
      return getISOWeekKey(pastDate);
    }).reverse(); // Ensure chronological order

    // 5. Map into final response
    const percentageByWeek = last4Weeks.map(week => {
      const stats = weekStats[week] || { known: 0, total: 0 };
      const percentage = stats.total === 0 ? 0 : ((stats.known / stats.total) * 100).toFixed(2);
      return { week, percentage: Number(percentage) };
    });
    console.log(percentageByWeek);
    res.status(200).json({ percentageByWeek });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to get weekly percentage' });
  }
});


app.get('/api/items/getDataProgressChart', authenticate, async (req, res) =>{
    const userId = req.user.userId;
    //transform date into week number
    function getISOWeekNumber(dateString) {
      const date = new Date(dateString);
      const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
      const day = utcDate.getUTCDay() || 7;
      utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day);
      const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
      const weekNo = Math.ceil((((utcDate - yearStart) / 86400000) + 1) / 7);
      return weekNo;
    }
    try{
      const [data] = await conn.execute("SELECT * FROM usersQuestionSetsStats WHERE userId = ?", [userId]);
      let weeks = {};
      let currentWeek = getISOWeekNumber(new Date().toISOString());
      data.map((item, index) =>{
        if(!getISOWeekNumber(item.date) < currentWeek-4){
          const week = getISOWeekNumber(item.date);
          if(!weeks[week])weeks[week] = 0;
          weeks[week]++;
        }
      });
      res.status(200).json({weeks:weeks});
    }catch(error){
      res.status(500).json({error:'Failed to get chart Data'});
      console.error(error);
    }
});

app.post('/api/items/changePassword', async (req, res) => {
    const {email, code, password} = req.body;
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    if (!email) return res.status(400).json({ error: 'Email is required' });
    try {
      const [rows] = await conn.execute("SELECT tokenPassword FROM users WHERE email = ?", [email]);
      const dbCode = rows[0].tokenPassword;
      console.log('dbCode', dbCode);
      if(dbCode === code){
        try{
          await conn.execute("UPDATE users SET password = ? WHERE email = ?", [hashedPassword, email]);
          res.status(200).json({message:"User password updated sucessfully"});
        }catch(error){
          res.status(500).json({message:"error"})
          console.error(error);
        }
      }else{
        res.status(403).json({message:"Wrong code"})
      }
    } catch (err) {
      res.status(500).json({ error: 'Failed to generate questions' });
    }
});

app.post('/api/items/ocr-upload', authenticate, async (req, res) => {
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


app.get('/api/items/getUser', authenticate,  async (req, res) => {
  const role = req.user.role;
  if(role!="admin"){
    return res.status(504).json({error: "No admin!"});
  }
  try {
    const [users] = await conn.execute("SELECT * FROM users")
    res.status(200).json(users);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to get users from db' });
  }
});

app.get('/api/items', authenticate, async (req, res) => {
    const userId  = req.user.userId;
    console.log(userId);
  
    try {
      // Get all question sets for this user
      const [questionSets] = await conn.execute(
        'SELECT * FROM questionSets WHERE userId = ?',
        [userId]
      );
  
      res.status(200).json(questionSets);
    } catch (error) {
      console.error('Error fetching items:', error.message);
      res.status(500).json({ error: 'Error getting items from DB' });
    }
});
  

app.post('/api/items/deleteQuestionSet', authenticate, async (req, res) => {
  const { questionSetId } = req.body;

  try {
    const [result] = await conn.execute(
        "DELETE FROM questionSets WHERE questionSetId = ?",
        [questionSetId]
    );
    
    if (result.affectedRows === 0) {
    return res.status(404).send('Question set not found');
    }

    res.send('Question set deleted successfully');
  } catch (error) {
    console.log(error);
    res.status(500).send('Error deleting question set: ' + error.message);
  }
});

app.post('/api/items/question-set', authenticate, async (req, res) => {
  const userId = req.user.userId;
  const { title } = req.body;
    
    try{
        const [insertRows] = await conn.execute("INSERT INTO questionSets (userId, title) VALUES (?, ?)", [userId, title]);
        return res.status(200).send('Empty question set added successfully');
    }catch(e){
        return res.status(500).send("Error adding the new questionSet");
    }
  
});

app.post('/api/items/addKnowledge', authenticate, async (req, res) => {
  const userId = req.user.userId;
  const { questionId, known } = req.body;

  try {
    await conn.execute(
      `INSERT INTO usersQuestionsStats (userId, questionId, known)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE known = VALUES(known)`,
      [userId, questionId, known]
    );

    return res.status(200).send('Knowledge saved or updated');
  } catch (e) {
    console.error(e);
    return res.status(500).send("Error saving question knowledge");
  }
});

app.post('/api/items/addEntryToDb', authenticate, async (req, res) => {
  const userId = req.user.userId;
  const { questionSetId } = req.body;

  try {
    await conn.execute(
      `INSERT INTO usersQuestionSetsStats (userId, questionSetId)
       VALUES (?, ?)`,
      [userId, questionSetId]
    );

    return res.status(200).send('Knowledge saved or updated');
  } catch (e) {
    console.error(e);
    return res.status(500).send("Error saving question knowledge");
  }
});

app.get('/api/items/getRole', authenticate, async(req, res) =>{
  const role = req.user.role;
  return res.status(200).send({role: role});
})

app.post('/api/items/editTitle', authenticate,  async(req, res) =>{
    const {questionSetId, title} = req.body;

    if(!questionSetId || !title){
      console.log(questionSetId, title);
      return res.status(400).send("Question set Id or title not found");
    }

    try{
      await conn.execute("UPDATE questionSets SET title = ? WHERE questionSetId = ?", [title, questionSetId]);
      res.status(200).send("Title updated succesfully");
    }catch(e){
      console.error(e);
      res.status(500).send("Title did not save, error");
    }
})

app.post('/api/items/saveForUser', authenticate, async (req, res) => {
  const userId = req.user.userId;
  const { inputData, questionSetId } = req.body;

  if (!userId || !questionSetId || !Array.isArray(inputData)) {
    return res.status(400).send("Invalid data.");
  }

  const connection = await conn.getConnection();

  try {
    await connection.beginTransaction();

    await connection.execute("DELETE FROM questions WHERE questionSetId = ?", [questionSetId]);

    if (inputData.length > 0) {
      const values = inputData.map(item => [questionSetId, item.questionText, item.answerText]);
      await connection.query(
        "INSERT INTO questions (questionSetId, questionText, answerText) VALUES ?",
        [values]
      );
    }

    const [newRows] = await connection.execute("SELECT * FROM questions WHERE questionSetId = ?", [questionSetId]);

    await connection.commit();
    res.status(200).json(newRows);
  } catch (error) {
    await connection.rollback();
    console.error("SQL Error:", error.message);
    res.status(500).send("Error saving data.");
  } finally {
    connection.release();
  }
});

  

app.post('/api/items/signin', async (req, res) => {
  const { email, password } = req.body;

  try {
    const [rows] = await conn.execute("SELECT * FROM users WHERE email = ?", [email]);
    const userId = rows[0].userId;
    const passwordFetched = rows[0].password;
    const role = rows[0].role;

    if (!userId) {
        return res.status(401).json({ error: 'Invalid credentials userId' });
      }
      
    const isPasswordValid = await bcrypt.compare(password, passwordFetched);
    if (!isPasswordValid) {
    return res.status(401).json({ error: `Invalid credentials password${isPasswordValid}`});
    }

    const token = jwt.sign({userId: userId, role:role}, secret, {expiresIn: '23h'})
    res.status(200).json({token});
  } catch (error) {
    console.error('Error during sign-in:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post('/api/items/saveEdit', authenticate, async (req, res) => {
  const userId = req.user.userId
  const { item, questionId, state } = req.body;

  try {
    // Log the incoming IDs for verification
    console.log("Received IDs:", { userId, questionId });

    if (!state) {
      // Log which field is being updated (questions in this case)
      console.log("Updating questions with item:", item);
      const [result] = await conn.execute(
        "UPDATE questions SET questionText = ? WHERE questionId = ?",
        [item, questionId]
      );
    } else {
      // Log which field is being updated (answers in this case)
      console.log("Updating answers with item:", item);
      const [result] = await conn.execute(
        "UPDATE questions SET answerText = ? WHERE questionId = ?",
        [item, questionId]
      );
    }
  
    // Send success response
    res.status(200).send({ message: 'all good' });
  } catch (error) {
    // Log the error details
    console.error("An error occurred during the update operation:", error);
  
    // Send error response
    res.status(500).send({ message: 'An error occurred during the database operation', error: error.message });
  }

});

app.delete('/api/items/admin/:id', authenticate, async (req, res) => {
  try {
    const userId = req.params.id;
    const role = req.user.role;
    //const userId = req.params.id;
    if(!userId){
        console.error("no user id");
    }
    if(role!="admin"){
        return res.status(504).json({error: "No admin!"});
    }
    const [rows] = await conn.execute("DELETE FROM users WHERE userId = ?", [userId]);
    if (rows.affectedRows===0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post('/api/items/signup', async (req, res) => {
  const { email, password } = req.body;
  const saltRounds = 10;
  const hashedPassword = await bcrypt.hash(password, saltRounds);
  try {
    const [insertUser] = await conn.execute("INSERT INTO users (email, password, role) VALUES (?, ?, 'user')", [email, hashedPassword]);
    res.status(200).json("User signed up");
  } catch (error) {
    console.error('Error during sign-up:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/api/items/retreiveQuestions', authenticate, async(req,res) => {
    const {questionSetId} = req.query;
    try{
        const [rows] = await conn.execute("SELECT * FROM questions WHERE questionSetId = ?", [questionSetId]);
        res.status(200).json(rows);
    }catch(e){
        res.status(500).json({error: {e}})
        console.error(e);
    }
});

const PORT = process.env.PORT || 3000; // Use the provided port or default to 3000
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
