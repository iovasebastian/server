const express = require('express');
const cors = require('cors');
const app = express();
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const secret = process.env.JWT_SECRET;

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

    const token = jwt.sign({userId: userId, role:role}, secret, {expiresIn: '2h'})
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
