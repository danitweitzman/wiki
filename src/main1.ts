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
];

// Helper: Clean the edit text by removing banned terms
function cleanEditText(text: string): string {
  return text
    .split(" ")
    .filter((word) => !bannedTerms.includes(word.toLowerCase()))
    .join(" ");
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
  return `
You are writing a continuous story, one phrase at a time. Each phrase should be a complete, meaningful sentence or clause that connects with the previous one.

The story so far: "${storySnippet}"
Wikipedia inspiration: "${edit}"

Create a complete phrase that:
1. Makes logical sense in the context of the story
2. Uses words from the Wikipedia edit when possible
3. Is grammatically correct
4. Connects naturally with the previous phrase
5. Includes connecting words (and, but, while, as, because, etc.) when needed
6. Forms a complete thought

Respond with ONLY the phrase, no labels or punctuation.

Example:
Story so far: "The dragon slept quietly in the ancient castle"
Edit: "Added content about medieval weapons"
→ while ancient swords hung on the walls

Story so far: "She opened the book to find a hidden message"
Edit: "Updated article about secret compartments"
→ as mysterious symbols glowed in the darkness

Story so far: "The explorer discovered mysterious artifacts"
Edit: "Added information about ancient temples"
→ because the temple held many secrets
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
