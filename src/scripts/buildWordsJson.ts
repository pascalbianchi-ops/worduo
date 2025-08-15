// scripts/buildWordsJson.ts
import { writeFileSync } from "fs";
import { sampleFrenchWords } from "../src/utils/wordsSampler";

const list = sampleFrenchWords({ count: 5000, minLen: 6, seed: 42, allowHyphen: true });
writeFileSync("public/words_6plus.json", JSON.stringify(list, null, 0), "utf8");
console.log(`Generated ${list.length} words -> public/words_6plus.json`);
