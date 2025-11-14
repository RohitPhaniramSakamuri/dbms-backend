const dotenv = require("dotenv");
dotenv.config();

const express = require("express");
const cors = require("cors");
const usersRouter = require("./routes/users.js");
const txnRouter = require("./routes/transactions.js");
const reportsRouter = require("./routes/reports.js");
const ridesRouter = require("./routes/rides.js");
const systemRouter = require("./routes/system.js");
const myRidesRouter = require("./routes/my-rides.js");
const messagesRouter = require("./routes/messages.js");

const app = express();
app.use(cors());
app.use(express.json());

app.use("/users", usersRouter);
app.use("/transactions", txnRouter);
app.use("/reports", reportsRouter);
app.use("/rides", ridesRouter);
app.use("/system", systemRouter);
app.use("/my-rides", myRidesRouter);
app.use("/messages", messagesRouter);

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`✅ Running on port ${PORT}`));
