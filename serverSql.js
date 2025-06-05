const express = require('express');
const cors = require('cors');
const app = express();
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
require('dotenv').config();

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

app.get('/api/items/getUser', async (req, res) => {
  try {
    const [users] = await conn.execute("SELECT * FROM users")
    res.status(200).json(users);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to get users from db' });
  }
});

app.get('/api/items', async (req, res) => {
    const { userId } = req.query;
  
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
  

app.post('/api/items/deleteQuestionSet', async (req, res) => {
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

app.post('/api/items/question-set', async (req, res) => {
  const { userId, title } = req.body;
    
    try{
        const [insertRows] = await conn.execute("INSERT INTO questionSets (userId, title) VALUES (?, ?)", [userId, title]);
        return res.status(200).send('Empty question set added successfully');
    }catch(e){
        return res.status(500).send("Error adding the new questionSet");
    }
  
});

app.post('/api/items/saveForUser', async (req, res) => {
  const { inputData, questionSetId, userId } = req.body;

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
  const { username, password } = req.body;

  try {
    const [rows] = await conn.execute("SELECT * FROM users WHERE username = ?", [username]);
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

    res.status(200).json({ userId, role, username });
  } catch (error) {
    console.error('Error during sign-in:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post('/api/items/saveEdit', async (req, res) => {
  const { userId, item, questionId, state } = req.body;

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

app.delete('/api/items/admin/:id', async (req, res) => {
  try {
    const userId = req.params.id;
    if(!userId){
        console.error("no user id");
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
  const { username, password } = req.body;
  const saltRounds = 10;
  const hashedPassword = await bcrypt.hash(password, saltRounds);
  try {
    const [insertUser] = await conn.execute("INSERT INTO users (username, password, role) VALUES (?, ?, 'user')", [username, hashedPassword]);
    res.status(200).json("User signed up");
  } catch (error) {
    console.error('Error during sign-up:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/api/items/retreiveQuestions', async(req,res) => {
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
