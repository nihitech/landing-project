require("dotenv").config();

const express = require("express");

const cors = require("cors");
const app = express();
app.use(express.json());
app.use(cors({
    origin: "*"
}));

// 🔹 Routes
const leadRoutes = require("./routes/leads");
app.use("/api", leadRoutes);

// 🔹 Test route
app.get("/", (req, res) => {
    res.send("API Running");
});

// 🔹 Start server
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});