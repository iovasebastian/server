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

mongoose.connect(process.env.MONGO_URI, { 
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

const ItemSchema = new mongoose.Schema({
  username: String,
  password: String,
  role: String,
  questionSets: [QuestionSetSchema]
});
const Item = mongoose.model('Item', ItemSchema);

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

app.post('/api/items/saveForUser', async (req, res) => {
  const { items } = req.body;

  try {
    console.log('Received items:', items);

    const user = items[0].username;
    console.log('Username:', user);
    console.log(items[0].questionSets);

    // Check if the user exists
    const existingUser = await Item.findOne({ username: user });

    if (existingUser) {
      // Update the existing user with the new questionSets
      await Item.updateOne({ username: user }, { $set: { questionSets: items[0].questionSets } });

      console.log('Items updated for the user.');
      res.status(201).json({ message: 'Items saved for the user.' });
    } else {
      // If the user doesn't exist, create a new one with the provided questionSets
      await Item.create({ username: user, questionSets: items[0].questionSets });

      console.log('New user created with items.');
      res.status(201).json({ message: 'New user created with items.' });
    }

  } catch (error) {
    console.error('Error in saveForUser:', error);
    res.status(500).json({ error: 'Error saving items for the user.' });
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

