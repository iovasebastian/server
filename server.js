const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const app = express();
const ObjectId = require('mongoose').Types.ObjectId;
require('dotenv').config();

app.use(cors({
  origin: '*',
  credentials: true,
}));
app.use(express.json({limit: '1mb'}));

mongoose.connect(process.env.MONGODB_URI || "mongodb+srv://iovasebastian8:Sebica2003@project.y36dsll.mongodb.net/Quizlet", { 
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => {
    console.log('MongoDB connected successfully');
  })
  .catch((error) => {
    console.error('Error connecting to MongoDB:', error);
  });

const QuestionSetSchema = new mongoose.Schema({
  questions: [String],
  answers: [String]
});

const allSetsSchema = new mongoose.Schema({
  title: String,
  allQuestionSets: [QuestionSetSchema]
});

const ItemSchema = new mongoose.Schema({
  username: String,
  password: String,
  role: String,
  questionSets: [allSetsSchema]
});

const Item = mongoose.model('Item', ItemSchema, 'test');
const QuestionSets = mongoose.model('QuestionSets', QuestionSetSchema, 'test');

app.get('/api/items/getUser', async (req, res) => {
  try {
    const users = await Item.find();
    res.status(200).json(users);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to get users from db' });
  }
});

app.get('/api/items', async (req, res) => {
  try {
    const { username } = req.query;
    const userItems = await Item.find({ username });
    const questions = userItems.map(item => item.questionSets).flat();
    res.status(200).json(questions);
    console.log(questions);
  } catch (error) {
    res.status(500).json({ error: 'Error getting items from db' });
  }
});

app.post('/api/items/deleteQuestionSet', async (req, res) => {
  const { _id } = req.body;

  try {
    const questionSetId = new ObjectId(_id);

    const result = await Item.updateOne(
      { 'questionSets._id': questionSetId },
      { $pull: { questionSets: { _id: questionSetId } } }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).send('Question set not found');
    }

    res.send('Question set deleted successfully');
  } catch (error) {
    console.log(error);
    res.status(500).send('Error deleting question set: ' + error.message);
  }
});

app.post('/api/items/question-set', async (req, res) => {
  const { username, title } = req.body;

  try {
    const user = await Item.findOne({ username: username });
    if (!user) {
      return res.status(404).send('User not found');
    }

    user.questionSets.push({ title: title, allQuestionSets: [] });
    await user.save();

    res.status(200).send('Empty question set added successfully');
  } catch (error) {
    res.status(500).send('An error occurred');
  }
});

app.post('/api/items/saveForUser', async (req, res) => {
  const { inputData, questionSetTitle, user } = req.body;

  if (!user) {
    return res.status(404).send('User not found.');
  }

  try {
    // Găsește utilizatorul
    const userItem = await Item.findOne({ username: user.username });

    if (!userItem) {
      return res.status(404).send('User item not found.');
    }

    // Găsește indexul setului de întrebări
    const questionSetIndex = userItem.questionSets.findIndex(qs => qs.title === questionSetTitle);

    // Verifică dacă setul de întrebări există
    if (questionSetIndex === -1) {
      return res.status(404).send('Question set not found.');
    }

    // Convertim `_id`-urile la `ObjectId`
    const updatedInputData = inputData.map(item => ({
      ...item,
      _id: ObjectId.isValid(item._id) ? new ObjectId(item._id) : new ObjectId()
    }));

    // Actualizează allQuestionSets pentru titlul specificat
    userItem.questionSets[questionSetIndex].allQuestionSets = updatedInputData;

    await userItem.save();

    res.status(200).send('Data has been saved');
  } catch (error) {
    console.error('Error saving data:', error);
    res.status(500).send('Error saving data');
  }
});

app.post('/api/items/signin', async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await Item.findOne({ username });

    if (!user || user.password !== password) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    res.status(200).json({ user });
  } catch (error) {
    console.error('Error during sign-in:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post('/api/items/saveEdit', async (req, res) => {
  const { _id, item, questionSetId, allQuestionId, state } = req.body;

  try {
    const mainDocId = new ObjectId(_id);
    const questionSetObjectId = new ObjectId(questionSetId);
    const allQuestionSetObjectId = new ObjectId(allQuestionId);

    let result;
    if (!state) {
      result = await Item.updateOne(
        { "_id": mainDocId },
        { $set: { "questionSets.$[qs].allQuestionSets.$[aqs].questions": item } },
        {
          arrayFilters: [
            { "qs._id": questionSetObjectId },
            { "aqs._id": allQuestionSetObjectId }
          ]
        }
      );
    } else {
      result = await Item.updateOne(
        { "_id": mainDocId },
        { $set: { "questionSets.$[qs].allQuestionSets.$[aqs].answers": item } },
        {
          arrayFilters: [
            { "qs._id": questionSetObjectId },
            { "aqs._id": allQuestionSetObjectId }
          ]
        }
      );
    }

    res.status(200).send({ message: 'all good' });
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: 'An error occurred during the database operation', error: error.message });
  }
});

app.delete('/api/items/admin/:id', async (req, res) => {
  try {
    const deletedUser = await Item.findByIdAndDelete(req.params.id);
    if (!deletedUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(deletedUser);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post('/api/items/signup', async (req, res) => {
  const { username, password } = req.body;
  try {
    const addUser = await Item.create({
      username: username,
      password: password,
      role: "user",
      questionSets: []
    });
    res.status(200).json({ username });
  } catch (error) {
    console.error('Error during sign-up:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

const PORT = process.env.PORT || 3000; // Use the provided port or default to 3000
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
