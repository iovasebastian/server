const express = require('express');
const conn = require('../config/db');
const authenticate = require('../middleware/auth');

const router = express.Router()

router.get('/api/items/getUser', authenticate,  async (req, res) => {
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

router.get('/api/items/getRole', authenticate, async(req, res) =>{
  const role = req.user.role;
  return res.status(200).send({role: role});
})

router.delete('/api/items/admin/:id', authenticate, async (req, res) => {
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

module.exports = router;