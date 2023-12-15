// server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());

// Connect to MongoDB Atlas
const fs = require('fs');

// Read the connection string from the file
const connectionString = fs.readFileSync('./connection.json', 'utf8');

// Parse the connection string as JSON
const connectionData = JSON.parse(connectionString);

// Connect to MongoDB using the loaded connection string
mongoose.connect(connectionData.host, {
  useNewUrlParser: connectionData.useNewUrlParser,
  useUnifiedTopology: connectionData.useUnifiedTopology
})
  .then(() => {
    console.log('MongoDB connected successfully');
  })
  .catch((error) => {
    console.error('Error connecting to MongoDB:', error);
  });


  const ItemSchema = new mongoose.Schema({
    question: String,
    answer: String,
  });
const Item = mongoose.model('Item', ItemSchema);

app.post('/api/items', async (req, res) => {
  try {
    const newItem = new Item(req.body);
    await newItem.save();
    res.status(201).json(newItem);
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/api/items', async (req, res) => {
    try {
      const allItems = await Item.find();
      res.status(200).json(allItems);
    } catch (error) {
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

app.delete('/api/items', async (req, res) => {
    try {
      await Item.deleteMany({});
      res.status(200).json({ message: 'All entries deleted successfully.' });
    } catch (error) {
      console.error('Error deleting entries:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
