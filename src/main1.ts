import { Application, Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { createExitSignal, staticServer } from "./shared/server.ts";
import { ask, say } from "./shared/cli.ts";
import { promptGPT } from "./shared/openai.ts";

const app = new Application();
const router = new Router();

const bannedTerms = [
  "category",
  "update",
  "stub",
  "template",
  "wikidata",
  "redirect",
  "added",
  "article",
  "page",
  "edit",
  "talk",
  "user",
  "forum",
  "wp",
  "wiki",
  "archived",
  "standalone",
  "offtopic",
  "undetected",
  "file",
  "discussion",
  "discussions",
  "content",
];

// Helper: Clean the edit text by removing banned terms and non-English patterns
function cleanEditText(text: string): string {
  // Remove wiki-specific patterns
  text = text.replace(/\[\[.*?\]\]/g, ""); // Remove [[wiki links]]
  text = text.replace(/\{\{.*?\}\}/g, ""); // Remove {{templates}}
  text = text.replace(/https?:\/\/\S+/g, ""); // Remove URLs
  text = text.replace(/\b[A-Z]{2,}\b/g, ""); // Remove uppercase acronyms
  text = text.replace(/[^\w\s-]/g, " "); // Remove special characters except hyphens
  text = text.replace(/\d+/g, ""); // Remove numbers
  text = text.replace(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g, ""); // Remove proper names

  // Split into words, filter out banned terms and non-English patterns
  const words = text
    .split(/\s+/)
    .filter((word) => {
      word = word.toLowerCase();
      if (bannedTerms.includes(word)) return false;
      if (word.length > 15) return false; // Too long to be a real word
      if (word.length < 3) return false; // Too short to be meaningful
      if (!/[aeiou]/i.test(word)) return false; // No vowels
      if (/[^a-z-]/i.test(word)) return false; // Non-letter characters except hyphens
      if (/^[A-Z]/.test(word)) return false; // Skip words that start with capital (likely names)
      return true;
    });

  // Only return unique words
  return [...new Set(words)].join(" ");
}

// Helper: Get only the last N words of the story for context
function getStorySnippet(story: string, count = 10): string {
  return story.trim().split(" ").slice(-count).join(" ");
}

// Helper: Randomly pick a structure (could be expanded)
function getSentenceStructure() {
  // Add more structures if you want variety
  return ["noun", "verb", "connector", "noun"]; // e.g. "eagle landed on moon"
}

// Generate prompt for structured phrase
function buildPrompt(storySnippet: string, edit: string, structure: string[]) {
  const cleanedEdit = cleanEditText(edit);
  const availableWords = cleanedEdit.split(" ").filter((w) => w.length > 0);

  if (availableWords.length === 0) {
    return ""; // Return empty if no valid words found
  }

  return `
You are writing a continuous story, one phrase at a time. Each phrase should be a short, meaningful clause that connects with the previous one.

The story so far: "${storySnippet}"
Available words to use (MUST use exactly one): ${availableWords.join(", ")}

IMPORTANT RULES:
1. Each phrase MUST be EXACTLY 4-6 words long
2. MUST use EXACTLY ONE word from the provided "Available words" list above
3. Use ONLY simple, common English words for the rest of the phrase
4. Each phrase must make logical sense
5. Connect naturally with the previous phrase
6. Use connecting words (and, but, while, as) when needed

Respond with ONLY the phrase, no labels or punctuation.

Examples:
Story so far: "The dragon slept quietly"
Available words: armor, weapons
→ while armor gathered ancient dust

Story so far: "She opened the book"
Available words: compartments, furniture
→ finding compartments behind old walls

Story so far: "The explorer found artifacts"
Available words: temples, rituals
→ inside temples of sacred light
`;
}

// Error handling
app.use(async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    console.error("Server error:", err);
    ctx.response.status = 500;
    ctx.response.body = { error: err.message };
  }
});

router.post("/get-word", async (context) => {
  try {
    console.log("Received /get-word request");
    const body = await context.request.body({ type: "json" }).value;
    const { storySoFar, editText } = body;

    const cleanedEdit = cleanEditText(editText || "");
    const storySnippet = getStorySnippet(storySoFar);
    const prompt = buildPrompt(storySnippet, cleanedEdit, []);

    console.log("Sending prompt to GPT:\n", prompt);

    const gptResponse = await promptGPT(prompt, {
      max_tokens: 50,
      temperature: 0.7,
      response_format: { type: "text" },
    });

    const phrase = gptResponse
      .trim()
      .replace(/[^\w\s]/g, "") // remove punctuation
      .toLowerCase();

    console.log("Generated phrase:", phrase);

    context.response.body = {
      selectedWord: phrase, // Send the entire phrase instead of just the last word
    };
  } catch (error) {
    console.error("Error selecting word:", error);
    context.response.status = 500;
    context.response.body = {
      error: `Failed to select a word: ${error.message}`,
    };
  }
});

app.use(router.routes());
app.use(router.allowedMethods());
app.use(staticServer);

console.log("\nListening on http://localhost:8000");
await app.listen({ port: 8000, signal: createExitSignal() });
