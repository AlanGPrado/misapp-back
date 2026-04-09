import express from "express";

const app = express();

app.get("/", (req, res) => {
    res.send("OK");
});

const PORT = process.env.PORT || 3000;

console.log("🔥 Starting server...");

app.listen(PORT, () => {
    console.log("✅ Server running on", PORT);
});