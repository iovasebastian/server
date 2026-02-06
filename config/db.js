const mysql = require('mysql2/promise');
require('dotenv').config()

const conn = mysql.createPool({
    host: process.env.SQL_HOST, //change SQL_HOST_LOCAL to SQL_HOST 
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
    database: process.env.SQL_DATABASE,
    port: process.env.DB_PORT
});

module.exports = conn;