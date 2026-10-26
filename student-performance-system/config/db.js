
const mysql = require("mysql2/promise");
const path = require("path");

require("dotenv").config({
  path: path.join(__dirname, "..", ".env")
});

const db = mysql.createPool({
  host: process.env.DB_HOST || "127.0.0.1",
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || "StudentPerformance",
  charset: "utf8mb4",
  waitForConnections: true,
  connectionLimit: 10
});

module.exports = db;
