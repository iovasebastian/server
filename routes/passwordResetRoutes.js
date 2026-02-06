const express = require('express');
const bcrypt = require('bcrypt');
const conn = require('../config/db');
const { createCodeForPasswordReset, sendMail } = require('../utils/nodeMailer');

const router = express.Router();

router.post('/api/items/checkEmail', async (req, res) => {
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

router.post('/api/items/addCodeToDb', async (req, res) => {
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

router.post('/api/items/changePassword', async (req, res) => {
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

module.exports = router;