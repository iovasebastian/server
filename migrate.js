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
    allQuestionSets: [QuestionSetSchema]
})

const ItemSchema = new mongoose.Schema({
    username: String,
    password: String,
    role: String,
    questionSets: [allSetsSchema]
});
const OldQuestions = new mongoose.Schema({
    questions:[String],
    answers:[String]
});
const OldSchema = new mongoose.Schema({
    username: String,
    password: String,
    role: String,
    questionSets: [OldQuestions]
});


const Item = mongoose.model('Item', ItemSchema, 'test');
const Old = mongoose.model('OldItem', OldSchema, 'items');
Old.findOne({ username: 'alexandra' })
  .then(userDoc => {
    
    // Transform the old userDoc to fit the new schema
   const newUser = new Item({
      username: userDoc.username, // Assuming username remains the same
      password: userDoc.password, // Assuming password remains the same
      role: userDoc.role,        // Assuming role remains the same
      questionSets:[{
        title:"Drept 1",
        allQuestionSets:userDoc.questionSets
      }]
    });


    // Save the new user document
    console.log(newUser.questionSets);
    return newUser.save(); // Return the promise so we can chain
  })
  .then(savedUser => {
    console.log('New user created successfully:');
  })
  .catch(err => {
    console.error('Error during migration:', err);
  });
  