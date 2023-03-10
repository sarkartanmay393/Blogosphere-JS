import express from 'express';
import { db, connectDB } from "./database.js";
import admin from "firebase-admin";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';
import "dotenv/config";

const PORT = process.env.PORT || 8080;
const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Integreting firebase admin with this backend server
const credentials = JSON.parse(fs.readFileSync("firebase-secrets.json"));
admin.initializeApp({
    credential: admin.credential.cert(credentials)
});

// Middlewares
app.use(express.json());
app.use(express.static(path.join(__dirname, "../build")));

app.use(async (req, res, next) => {
    const { authtoken } = req.headers;
    if (authtoken) {
        try {
            let temp = await admin.auth().verifyIdToken(authtoken);
            console.log(`Verify auth: ${temp}`);
            req.user = temp;
        } catch (e) {
            return res.sendStatus(400);
        }
    }

    req.user = req.user || {};

    next();
});

// Get request for all url other than '/api'
app.get(/^(?!\/api).+/, (req, res) => {
    console.log(req.url);
    res.sendFile(path.join(__dirname, "../build/index.html"));
})

// Get request for getting article info
app.get("/api/articles/:name", async (req, res) => {
    const { name } = req.params;
    const { uid } = req.user;

    const article = await db.collection("articles").findOne({ name });

    if (article) {
        const upvotedIds = article.upvotedIds || [];
        article.canUpvote = uid && !upvotedIds.includes(uid);
        res.json(article);
    } else {
        res.status(404).send("No matching article found!");
    }
});

// middleware for below request functions
app.use((req, res, next) => {
    if (req.user) {
        next();
    } else {
        res.sendStatus(401);
    }
});

// Put request for incrementing votes by one
app.put("/api/articles/:name/upvote", async (req, res) => {
    const { name } = req.params;
    const { uid } = req.user;

    const article = await db.collection("articles").findOne({ name });

    if (article) {
        const upvotedIds = article.upvotedIds || [];
        const canUpvote = uid && !upvotedIds.includes(uid);

        // console.log("canUpvote: " + canUpvote);
        // console.log(`UID: ${uid}`)

        if (canUpvote) {
            await db.collection("articles").updateOne({ name }, {
                $inc: { upvotes: 1 },
                $push: { upvotedIds: uid }
            });
        }

        const updatedArticle = await db.collection("articles").findOne({ name });
        res.json(updatedArticle);
    } else {
        res.status(404).send("No matching article found!");
    }
});

// Post request for adding comments in database
app.post("/api/articles/:name/comments", async (req, res) => {
    const { name } = req.params;
    const { email, comment } = req.body;

    await db.collection("articles").updateOne({ name }, {
        $push: { comments: { username: email, comment: comment } }
    });

    const updatedArticle = await db.collection("articles").findOne({ name });
    if (updatedArticle) {
        res.json(updatedArticle);
    } else {
        res.status(404).send("No matching article found!");
    }
});


// Main entrypoint to our server
// This express server starts listening here by connecting to db first
connectDB(() => {
    console.log("Database connection is established.")
    app.listen(PORT, () => {
        console.log("Server is running on port " + PORT);
    });
});
