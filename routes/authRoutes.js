const bcrypt = require('bcrypt');
const express = require('express');
const jwt = require('jsonwebtoken');
const conn = require('../config/db');
const secret = process.env.JWT_SECRET;

const router = express.Router();

router.post('/api/items/signin', async (req, res) => {
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

router.post('/api/items/signup', async (req, res) => {
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

module.exports = router;