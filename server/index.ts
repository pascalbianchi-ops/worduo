// server/index.ts
import express from "express";
import cors from "cors";
import { sampleFrenchWords } from "../src/utils/wordsSampler.js";

const app = express();
app.use(cors());

app.get("/api/words", (req, res) => {
    const count = Math.min(parseInt(String(req.query.count || "5000"), 10) || 5000, 20000);
    const minLen = parseInt(String(req.query.minLen || "6"), 10) || 6;
    const seed = req.query.seed ? parseInt(String(req.query.seed), 10) : undefined;
    const allowHyphen = req.query.allowHyphen !== "false";

    const data = sampleFrenchWords({ count, minLen, seed, allowHyphen });
    res.set("Cache-Control", "no-store");        // ← pour éviter le cache
    res.json({ count: data.length, words: data });
});

const PORT = process.env.PORT || 8787;
app.listen(PORT, () => console.log(`Words API on :${PORT}`));
