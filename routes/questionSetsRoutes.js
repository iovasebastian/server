const express = require('express');
const conn = require('../config/db');
const authenticate = require('../middleware/auth');

const router = express.Router();

router.get('/api/items', authenticate, async (req, res) => {
    const userId  = req.user.userId;
  
    try {
      // Get all question sets for this user
      const [questionSets] = await conn.execute(
        'SELECT * FROM questionSets WHERE userId = ? AND public = 0',
        [userId]
      );
  
      res.status(200).json(questionSets);
    } catch (error) {
      console.error('Error fetching items:', error.message);
      res.status(500).json({ error: 'Error getting items from DB' });
    }
});

router.post('/api/items/question-set', authenticate, async (req, res) => {
  const userId = req.user.userId;
  const { title } = req.body;
    try{
        const [insertRows] = await conn.execute("INSERT INTO questionSets (userId, title) VALUES (?, ?)", [userId, title]);
        return res.status(200).send('Empty question set added successfully');
    }catch(e){
        return res.status(500).send("Error adding the new questionSet");
    }
  
});

router.get('/api/items/retreiveQuestions', authenticate, async(req,res) => {
    const {questionSetId} = req.query;
    try{
        const [rows] = await conn.execute("SELECT * FROM questions WHERE questionSetId = ?", [questionSetId]);
        res.status(200).json(rows);
    }catch(e){
        res.status(500).json({error: {e}})
        console.error(e);
    }
});

router.post('/api/items/deleteQuestionSet', authenticate, async (req, res) => {
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
    res.status(500).send('Error deleting question set: ' + error.message);
  }
});

router.post('/api/items/saveForUser', authenticate, async (req, res) => {
  const userId = req.user.userId;
  const { inputData, questionSetId } = req.body;

  if (!userId || !questionSetId || !Array.isArray(inputData)) {
    return res.status(400).send("Invalid data.");
  }

  const connection = await conn.getConnection();

  try {
    await connection.beginTransaction();
    const [beforeRows] = await connection.execute("SELECT COUNT(*) AS cnt FROM questions WHERE questionSetId = ?",[questionSetId]);
    await connection.execute("DELETE FROM questions WHERE questionSetId = ?", [questionSetId]);


    if (inputData.length > 0) {
      const values = inputData.map(item => [questionSetId, item.questionText, item.answerText]);
      await connection.query(
        "INSERT INTO questions (questionSetId, questionText, answerText) VALUES ?",
        [values]
      );
    }else{
      await connection.execute(
        `INSERT INTO logs 
        (questionSetId, numberOfSaved, timeOfQuery, place, info) 
        VALUES (?, ?, NOW(), ?, ?)`,
        [
          questionSetId,
          0,
          "inputData empty",
          `rows before delete: ${beforeRows[0].cnt}`
        ]
      );

    }

    const [newRows] = await connection.execute("SELECT * FROM questions WHERE questionSetId = ?", [questionSetId]);

    await connection.commit();
    res.status(200).json(newRows);
  } catch (error) {
    try {
      await connection.rollback();
      const [afterRollbackRows] = await connection.execute("SELECT COUNT(*) AS cnt FROM questions WHERE questionSetId = ?",[questionSetId]);
      await connection.execute(
        `INSERT INTO logs 
        (questionSetId, numberOfSaved, timeOfQuery, place, info) 
        VALUES (?, ?, NOW(), ?, ?)`,
        [
          questionSetId,
          inputData.length,
          "rollback",
          `error: ${error.message} | rows before delete: ${beforeRows?.[0]?.cnt ?? "unknown"} | rows after rollback: ${afterRollbackRows[0].cnt}`
        ]
      );
    } catch (rbError) {
      console.error("Rollback failed:", rbError);
    }
    console.error("SQL Error:", error);
    res.status(500).send("Error saving data.");
  } finally {
    connection.release();
  }
});

router.post('/api/items/saveEdit', authenticate, async (req, res) => {
  const userId = req.user.userId
  const { item, questionId, state } = req.body;

  try {

    if (!state) {
      const [result] = await conn.execute(
        "UPDATE questions SET questionText = ? WHERE questionId = ?",
        [item, questionId]
      );
    } else {
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


router.post('/api/items/editTitle', authenticate,  async(req, res) =>{
    const {questionSetId, title} = req.body;

    if(!questionSetId || !title){
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

router.get('/api/items/getTotalSets', authenticate, async (req, res) => {
    const userId = req.user.userId;
    try {
      const [rows] = await conn.execute("SELECT * FROM questionSets WHERE userId = ?", [userId]);
      const numberOfRows = rows.length;
      res.status(200).json({setNumber: numberOfRows, sets:rows});
    } catch (err) {
      res.status(500).json({ error: 'Failed to get number of Rows' });
      console.error(err);
    }
});

router.get('/api/items/getManageSets', authenticate, async (req, res) => {
    const userId  = req.user.userId;
  
    try {
      // Get all question sets for this user
      const [questionSets] = await conn.execute(`SELECT * FROM publicSets WHERE ownerId = ?`,
        [userId]
      );
  
      res.status(200).json(questionSets);
    } catch (error) {
      console.error('Error fetching items:', error.message);
      res.status(500).json({ error: 'Error getting items from DB' });
    }
});

router.post('/api/items/deleteQuestionSetBaught', authenticate, async (req, res) => {
  const { questionSetId } = req.body;

  try {
    const [result] = await conn.execute(
        "UPDATE questionSets SET visibility = 'deleted' WHERE questionSetId = ?",
        [questionSetId]
    );
    
    if (result.affectedRows === 0) {
    return res.status(404).send('Question set not found');
    }

    res.send('Question set deleted successfully');
  } catch (error) {
    res.status(500).send('Error deleting question set: ' + error.message);
  }
});

router.post('/api/items/deleteQuestionFromPublic', authenticate, async (req, res) => {
  const { questionSetId } = req.body;

  try {
    const [result] = await conn.execute(
        "DELETE FROM publicSets WHERE publicSetId = ?",
        [questionSetId]
    );
    
    if (result.affectedRows === 0) {
    return res.status(404).send('Question set not found');
    }

    res.send('Question set deleted successfully');
  } catch (error) {
    res.status(500).send('Error deleting question set: ' + error.message);
  }
});

router.post('/api/items/restorePurcheases', authenticate, async (req, res) => {
  const userId = req.user.userId;
    try{
        const [rows] = await conn.execute(`UPDATE questionSets SET visibility = 'visible' WHERE visibility = 'deleted' AND userId = ?`, [userId]);
        return res.status(200).send('Purcheases restored sucessfully');
    }catch(e){
        console.error(e);
        return res.status(500).send("Purcheases could not be restored");  
    }
  
});

router.post('/api/items/getPublicSet', authenticate, async (req, res) => {
  const userId = req.user.userId;
  const { publicSetId, title } = req.body;
    try{
      const [publicSets] = await conn.execute("SELECT publicSetId FROM questionSets WHERE userId = ? AND publicSetId = ?", [userId, publicSetId])
      const [privateSet] = await conn.execute("SELECT publicSetId FROM publicSets WHERE ownerId = ? AND publicSetId = ?", [userId, publicSetId])
      console.log('publicSets', publicSets,publicSets.length)
      console.log('privateSet', privateSet,privateSet.length)
      if(publicSets.length || privateSet.length){
        res.status(201).send("Question set alrady in user library")
        return;
      }
    }catch(e){
      res.status(500).send('Failed checking for duplicates')
    }
    try{
        const [insertion] = await conn.execute("INSERT INTO questionSets (userId, title, public, publicSetId, visibility) VALUES (?, ?, 1, ?, 'visible')", [userId, title, publicSetId]);
        let intertedId = insertion.insertId;

        await conn.execute(
          `INSERT INTO questions (questionSetId, questionText, answerText)
          SELECT ?, pq.questionText, pq.answerText
          FROM publicSetsQuestions pq
          WHERE pq.publicSetId = ?`,
          [intertedId, publicSetId]
        );
        return res.status(200).send('Question sets migrated succesfully');
    }catch(e){
        return res.status(500).send("Error adding the new questionSet");
    }
});

router.post('/api/items/uploadPublicSet', authenticate, async (req, res) => {
  const userId = req.user.userId;
  const { questionSetId, price, subject, difficulty, ownerStripeId } = req.body;

  // Use the same connection for the whole transaction (works with pool or single conn)
  const db = conn.getConnection ? await conn.getConnection() : conn;

  try {
    // 0) Read title and item count (safer COUNT(*) instead of SELECT *)
    const [[titleRow]] = await db.execute(
      "SELECT title FROM questionSets WHERE questionSetId = ?",
      [questionSetId]
    );
    if (!titleRow) {
      return res.status(404).send("Original question set not found");
    }
    const title = titleRow.title;

    const [[cntRow]] = await db.execute(
      "SELECT COUNT(*) AS cnt FROM questions WHERE questionSetId = ?",
      [questionSetId]
    );
    const itemNumber = cntRow.cnt || 0;

    // 1) Start txn
    await db.beginTransaction();

    // 2) Insert parent public set
    const [ins] = await db.execute(
      `INSERT INTO publicSets
       (ownerId, title, price, subject, difficulty, itemNumber, originalSetId, stripeMerchantId)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, title, price, subject, difficulty, itemNumber, questionSetId, ownerStripeId]
    );
    const publicSetId = ins.insertId;

    // 3) Copy all questions from original → publicSetsQuestions with FK = publicSetId
    // TODO: adjust the target column list to match your table (e.g., add/remove explanation/options/etc.)
    await db.execute(
      `INSERT INTO publicSetsQuestions
         (publicSetId, questionText, answerText)
       SELECT
         ?, q.questionText, q.answerText
       FROM questions q
       WHERE q.questionSetId = ?`,
      [publicSetId, questionSetId]
    );

    // 4) Commit
    await db.commit();

    return res.status(200).json({
      message: "Question set published successfully",
      publicSetId,
      itemNumber
    });
  } catch (e) {
    try { await db.rollback(); } catch {}
    console.error(e);
    return res.status(500).send(`Error publishing question set: ${e.message || e}`);
  } finally {
    if (db.release) db.release();
  }
});


router.get('/api/items/getPublicSets', authenticate, async (req, res) => {
  try{
    const [rows] = await conn.execute(`
      SELECT 
        ps.*,
        ROUND(AVG(r.reviewRating), 1) AS avgRating,
        COUNT(r.reviewRating) AS reviewCount
      FROM publicSets ps
      LEFT JOIN reviews r
        ON ps.publicSetId = r.publicSetId
      GROUP BY ps.publicSetId;
    `);
    
    return res.status(200).send({questionSets: rows});
  }catch(error){
    console.error(error);
    return res.status(500).send("Error getting questionSets");
  }
})

router.get('/api/items/getPublicSetPreview', authenticate, async (req, res) => {
  try{
    const setId = req.query.setId;
    const [rows] = await conn.execute("SELECT * FROM publicSetsQuestions WHERE publicSetId = ? LIMIT 10", [setId]);
    return res.status(200).send({questions: rows});
  }catch(error){
    console.error(error);
    return res.status(500).send("Error getting questionSets");
  }
})

router.post('/api/items/addKnowledge', authenticate, async (req, res) => {
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

router.get('/api/items/public', authenticate, async (req, res) => {
    const userId  = req.user.userId;
  
    try {
      // Get all question sets for this user
      const [questionSets] = await conn.execute(`SELECT * FROM questionSets WHERE userId = ? AND public = TRUE AND visibility = 'visible'`,
        [userId]
      );
  
      res.status(200).json(questionSets);
    } catch (error) {
      console.error('Error fetching items:', error.message);
      res.status(500).json({ error: 'Error getting items from DB' });
    }
});

router.get('/api/items/checkUserReview', authenticate, async (req, res) =>{
    const userId = req.user.userId;
    const publicSetId = req.query.publicSetId;
    if (!publicSetId){
      return;
    }
    try{
      const [review] = await conn.execute('SELECT * FROM reviews WHERE userId = ? AND publicSetId = ?',[userId, publicSetId]);
      if(review.length !=0){
        console.log('User already rated this questionSet')
        res.status(200).json({userSentReview : true})
      }else{
        res.status(200).json({userSentReview : false})
      }
    }catch(error){
      console.log(error)
      res.status(500).json({error: 'Error extracting user data'});
    }
  })

router.post('/api/items/sendReview', authenticate, async (req, res) =>{
    const userId = req.user.userId;
    const publicSetId = req.body.publicSetId;
    const rating = req.body.rating;
    try{
      const [review] = await conn.execute('SELECT * FROM reviews WHERE userId = ? AND publicSetId = ?',[userId, publicSetId]);
      if(review.length !=0){
        console.log('User already rated this questionSet')
        res.status(201).send('User already rated this question set');
        return;
      }
    }catch(error){
      console.log(error)
      res.status(500).json({error: 'Error extracting user data'});
      return;
    }
    try{
      await conn.execute('INSERT INTO reviews (userId, publicSetId, reviewRating) VALUES (?, ?, ?)',[userId, publicSetId, rating]);
      return res.status(200).send('Review added succesfully');
    }catch(error){
      console.log(error)
      res.status(500).json({error : 'Error adding the review'});
    }
})

module.exports = router;