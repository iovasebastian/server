// server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const app = express();
require('dotenv').config();

app.use(cors({
  origin: '*',
  credentials: true,
}));
app.use(express.json());

mongoose.connect("mongodb+srv://iovasebastian8:Sebica2003@project.y36dsll.mongodb.net/Quizlet", { 
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
  allQuestionSets : [QuestionSetSchema]
})

const ItemSchema = new mongoose.Schema({
  username: String,
  password: String,
  role: String,
  questionSets: [allSetsSchema]
});
const Item = mongoose.model('Item', ItemSchema, 'test');

app.get('/api/items/getUser', async (req,res) => {
  try{
    const users = await Item.find();
    res.status(200).json(users);
    console.log(users);
  }catch(error){
    console.error(error);
    res.status(500).json({error: 'Failed to get users from db'});
  }
})
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
  const { username, title } = req.body; // Assuming you send the title of the question set to be deleted

  try {
    const user = await Item.findOne({ username: username });
    if (user) {
      user.questionSets = user.questionSets.filter(qs => qs.title !== title);
      await user.save();
      res.status(200).send('Question set deleted successfully');
    } else {
      res.status(404).send('User not found');
    }
  } catch (error) {
    res.status(500).send('Error deleting question set');
  }
});
app.post('/api/items/question-set', async (req, res) => {
  const { username, title } = req.body;

  try {
    const user = await Item.findOne({ username: username });
    if (!user) {
      return res.status(404).send('User not found');
    }

    // Add the empty question set
    user.questionSets.push({ title: title, allQuestionSets: [] });
    await user.save();

    res.status(200).send('Empty question set added successfully');
  } catch (error) {
    res.status(500).send('An error occurred');
  }
});
app.post('/api/items/saveForUser', async (req, res) => {
  const { inputData, questionSetTitle,user } = req.body;
   // Make sure the user is already set in the request, e.g., from a middleware

  if (!user) {
    return res.status(404).send('User not found.');
  }

  try {
    // Find the user document
    const userItem = await Item.findOne({ username: user.username });

    if (!userItem) {
      return res.status(404).send('User item not found.');
    }

    // Update the allQuestionSets for the specified title
    const questionSetIndex = userItem.questionSets.findIndex(qs => qs.title === questionSetTitle);
    userItem.questionSets[questionSetIndex].allQuestionSets = inputData;


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

    // Sign-in successful, return user information or token
    res.status(200).json({ user });
  } catch (error) {
    console.error('Error during sign-in:', error);
    res.status(500).json({ error: 'Internal Server Error' });
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
      username:username,
      password:password,
      role:"user",
      questionSets:[]
    })
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

