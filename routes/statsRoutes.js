const express = require('express');
const conn = require('../config/db');      
const authenticate = require('../middleware/auth'); 

const router = express.Router();

router.get('/api/items/getCorrectQuestionsPercentage', authenticate, async (req, res) => {
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

router.get('/api/items/getDailyData', authenticate, async (req,res) =>{
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

router.get('/api/items/getWeeklyPercentage', authenticate, async (req, res) => {
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


router.get('/api/items/getDataProgressChart', authenticate, async (req, res) =>{
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

router.post('/api/items/addEntryToDb', authenticate, async (req, res) => {
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

module.exports = router;
