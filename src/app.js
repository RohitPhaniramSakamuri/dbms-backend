import dotenv from "dotenv";
dotenv.config();

import express from "express";
import { pool } from "./db.js";
import usersRouter from "./routes/users.js";
import txnRouter from "./routes/transactions.js";
import reportsRouter from "./routes/reports.js";

const app = express();
app.use(express.json());

app.use("/users", usersRouter);
app.use("/transactions", txnRouter);
app.use("/reports", reportsRouter);

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`✅ Running on port ${PORT}`));
