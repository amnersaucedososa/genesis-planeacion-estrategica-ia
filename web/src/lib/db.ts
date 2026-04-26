import mysql from "mysql2/promise";

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || "localhost",
  port: Number(process.env.MYSQL_PORT) || 3306,
  user: process.env.MYSQL_USER || "root",
  password: process.env.MYSQL_PASSWORD || "",
  database: process.env.MYSQL_DATABASE || "assessment_db",
  charset: "utf8mb4",
  waitForConnections: true,
  connectionLimit: 10,
});

export default pool;
