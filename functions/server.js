// server.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const serverless = require('serverless-http')
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors({ origin: '*' }));

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});
app.use('*',cors());
app.use(express.json());

// Connect to MongoDB Atlas

// Connect to MongoDB using the loaded connection string
mongoose.connect('mongodb+srv://iovasebastian8:Sebica2003@project.y36dsll.mongodb.net/?retryWrites=true&w=majority', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const ItemSchema = new mongoose.Schema({
  question: String,
  answer: String,
});
const Item = mongoose.model('Item', ItemSchema);

app.post('/items', async (req, res) => {
  try {
    const newItem = new Item(req.body);
    await newItem.save();
    res.status(201).json(newItem);
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});
router.get('/test',(req,res) =>{
  res.json({
    'hello':'hi'
  })
});

app.get('/items', async (req, res) => {
    try {
      const allItems = await Item.find();
      res.status(200).json(allItems);
    } catch (error) {
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

app.delete('/items', async (req, res) => {
    try {
      await Item.deleteMany({});
      res.status(200).json({ message: 'All entries deleted successfully.' });
    } catch (error) {
      console.error('Error deleting entries:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });


app.use('/.netlify/functions/server', router);
module.exports.handler = serverless(app);

