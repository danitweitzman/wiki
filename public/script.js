console.log("Script starting to load...");

try {
  const STORY_KEY = "wikiEvolvingStory";
  const LAST_EDIT_KEY = "lastWikiEditTimestamp";
  const USED_WORDS_KEY = "usedWikiWords";
  let isFetching = false; // Add lock to prevent concurrent fetches
  console.log("STORY_KEY initialized");

  // Common words from Wikipedia you might want to skip
  const bannedWords = [
    "edit",
    "added",
    "redirect",
    "page",
    "category",
    "citation",
    "update",
    "wikidata",
    "fixed",
    "article",
    "reference",
    "references",
    "release",
    "spam",
    "class",
    "usage",
    "property",
    "monarchy",
    "duplicate",
    "uploader",
    "template",
    "user",
    "request",
    "reporting",
    "navigation",
    "discussed",
    "removed",
    "changed",
    "moved",
    "created",
    "deleted",
    "modified",
    "as",
    "when",
    "the",
    "and",
    "in",
    "of",
    "to",
    "for",
    "with",
    "by",
    "at",
    "from",
    // Add any others you see often
  ];

  // Add patterns to detect and remove
  const invalidPatterns = [
    /User\d+/i, // Matches User followed by numbers
    /\[\[.*?\]\]/g, // Matches [[wiki links]]
    /\{\{.*?\}\}/g, // Matches {{templates}}
    /https?:\/\/\S+/g, // Matches URLs
    /\d{2,}/g, // Matches numbers with 2 or more digits
    /\b[A-Z]{2,}\b/g, // Matches uppercase acronyms
    /\b(talk|user|file|category|template):/gi, // Matches namespace prefixes
  ];

  // If you want a small dictionary check, define or import a known word list.
  // For example, if you had an array of words called `englishWords`:
  // const englishWords = [ "the", "of", "and", "to", ...]; // a large array
  // Then you can enable the check in `isNonsenseWord`.

  // Optional: "Reset Story" button
  const resetButton = document.getElementById("reset-button");
  if (resetButton) {
    resetButton.addEventListener("click", () => {
      resetStory();
    });
  }

  // Info button functionality
  const infoButton = document.getElementById("info-button");
  const infoText = document.getElementById("info-text");

  if (infoButton && infoText) {
    infoButton.addEventListener("click", () => {
      infoText.classList.toggle("visible");
    });

    // Close info text when clicking outside
    document.addEventListener("click", (event) => {
      if (
        !infoButton.contains(event.target) && !infoText.contains(event.target)
      ) {
        infoText.classList.remove("visible");
      }
    });
  }

  /**
   * Gets a contextual word from the server using GPT
   */
  async function getContextualWord(storySoFar, editText, editInfo) {
    try {
      console.log("Getting contextual word for:", { storySoFar, editText });
      const response = await fetch("/get-word", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storySoFar,
          editText,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Network response was not ok: ${errorText}`);
      }

      const data = await response.json();
      console.log("Received word from server:", data);
      return {
        text: data.selectedWord,
        source: editInfo,
      };
    } catch (error) {
      console.error("Error getting contextual word:", error);
      return null;
    }
  }

  /**
   * Main function: fetch recent Wikipedia edits
   */
  async function fetchWikiEdits() {
    if (isFetching) {
      console.log("Already fetching, skipping...");
      return;
    }
    isFetching = true;

    try {
      console.log("Fetching Wikipedia edits...");
      const response = await fetch(
        "https://en.wikipedia.org/w/api.php?action=query&list=recentchanges&rcprop=title|comment|timestamp|user|rcid&format=json&origin=*",
      );
      const data = await response.json();
      console.log("Received Wikipedia data:", data);

      if (!data.query || !data.query.recentchanges) {
        throw new Error("No edits found");
      }

      const lastProcessedTimestamp = localStorage.getItem(LAST_EDIT_KEY);
      const lastProcessedRcid = localStorage.getItem("lastWikiEditRcid");

      const newEdits = data.query.recentchanges.filter((edit) => {
        if (!lastProcessedTimestamp) return true;
        const isNewer = edit.timestamp > lastProcessedTimestamp;
        const isNewEdit = edit.rcid !== lastProcessedRcid;
        return isNewer && isNewEdit;
      });

      if (newEdits.length === 0) {
        console.log("No new edits to process");
        return;
      }

      let newPhrases = [];

      for (const edit of newEdits) {
        const rawText = edit.comment || edit.title;

        // Format timestamp
        const date = new Date(edit.timestamp);
        const formattedDate = `${
          (date.getMonth() + 1).toString().padStart(2, "0")
        }.${date.getDate().toString().padStart(2, "0")}.${
          date.getFullYear().toString().slice(2)
        } ${date.getHours().toString().padStart(2, "0")}:${
          date.getMinutes().toString().padStart(2, "0")
        }`;

        const editInfo = {
          user: edit.user,
          timestamp: formattedDate,
          comment: rawText,
        };

        const phrase = await getContextualWord(
          localStorage.getItem(STORY_KEY) || "",
          rawText,
          editInfo,
        );

        if (phrase) {
          newPhrases.push(phrase);
        }
      }

      if (newPhrases.length > 0) {
        const existingPhrases = (localStorage.getItem(STORY_KEY) || "").split(
          "\n",
        ).filter((p) => p);
        const totalExistingWords = existingPhrases.reduce((sum, phrase) => {
          try {
            return sum + JSON.parse(phrase).text.split(" ").length;
          } catch {
            return sum;
          }
        }, 0);

        setTimeout(() => {
          updateStory(newPhrases, totalExistingWords);
          localStorage.setItem(LAST_EDIT_KEY, newEdits[0].timestamp);
          localStorage.setItem("lastWikiEditRcid", newEdits[0].rcid);
        }, totalExistingWords * 1000 + 1000);
      }
    } catch (error) {
      console.error("Error fetching Wikipedia edits:", error);
      document.getElementById("story").innerHTML =
        `<p>Error loading story: ${error.message}</p>`;
    } finally {
      isFetching = false;
    }
  }

  /**
   * Extracts ONE random word from the edit text.
   * - only letters
   * - skip banned words
   * - skip nonsense via isNonsenseWord
   */
  function extractWordRandom(text) {
    if (!text) return "";
    let words = text
      .split(/\s+/)
      .map((w) => w.replace(/[^a-zA-Z]/g, "")) // keep only letters
      .filter((w) => w.length > 0);

    // filter out banned words
    words = words.filter(
      (w) => !bannedWords.includes(w.toLowerCase()),
    );

    // skip nonsense
    words = words.filter((w) => !isNonsenseWord(w));

    if (words.length === 0) return "";

    // pick a random word
    return words[Math.floor(Math.random() * words.length)];
  }

  /**
   * Heuristic to skip "nonsensical" words:
   *  1) length > 20 => skip
   *  2) no vowels => skip
   *  3) has 4+ consecutive consonants => skip
   *  4) regex for wiki-ish fragments => skip
   *  5) (optional) not in dictionary => skip
   */
  function isNonsenseWord(word) {
    // 1) too long
    if (word.length > 20) return true;

    // 2) no vowels
    if (!/[aeiou]/i.test(word)) return true;

    // 3) check for 4+ consecutive consonants
    if (/[bcdfghjklmnpqrstvwxyz]{4,}/i.test(word)) {
      return true;
    }

    // 4) wiki/jargon fragments
    // Add or remove anything else you see
    const nonsenseRegex =
      /(wiki|template|bot|tishreen|albanian|filenoah|draftwme|mosamp|amp|cs)/i;
    if (nonsenseRegex.test(word)) return true;

    // 5) optional dictionary check (requires you define englishWords array)
    // if (!englishWords.includes(word.toLowerCase())) {
    //   return true;
    // }

    return false;
  }

  /**
   * Clean a phrase by removing invalid patterns and normalizing text
   */
  function cleanPhrase(phrase) {
    if (!phrase) return "";

    // Convert to lowercase for consistent processing
    let cleaned = phrase.toLowerCase();

    // Remove invalid patterns
    invalidPatterns.forEach((pattern) => {
      cleaned = cleaned.replace(pattern, "");
    });

    // Remove extra spaces and trim
    cleaned = cleaned.replace(/\s+/g, " ").trim();

    // Remove phrases that are too short after cleaning
    if (cleaned.split(" ").length < 3) return "";

    return cleaned;
  }

  /**
   * Save new words, display them in poem format.
   */
  function updateStory(newPhrases, startWordIndex) {
    let storedPhrases = localStorage.getItem(STORY_KEY) || "";
    let allPhrases = storedPhrases
      ? storedPhrases.split("\n").filter((p) => p && p.trim().length > 0).map(
        (p) => {
          try {
            return JSON.parse(p);
          } catch {
            return null;
          }
        },
      ).filter((p) => p)
      : [];

    // Clean and filter new phrases
    newPhrases = newPhrases
      .filter((phrase) =>
        phrase &&
        phrase.text &&
        phrase.text.trim().length > 0 &&
        phrase.text.split(" ").length >= 3 &&
        !phrase.text.toLowerCase().startsWith("edit") &&
        !phrase.text.toLowerCase().startsWith("as") &&
        !phrase.text.toLowerCase().startsWith("when") &&
        !phrase.text.toLowerCase().includes("discussed") &&
        phrase.text.split(" ").filter((word) =>
            !bannedWords.includes(word.toLowerCase())
          ).length >= 2
      );

    // Remove duplicate phrases
    newPhrases = [...new Set(newPhrases.map((p) => JSON.stringify(p)))].map(
      (p) => JSON.parse(p)
    );

    // Add new phrases
    allPhrases = allPhrases.concat(newPhrases);

    // store them back
    localStorage.setItem(
      STORY_KEY,
      allPhrases.map((p) => JSON.stringify(p)).join("\n"),
    );

    // Display only the new phrases
    displayNewPhrases(newPhrases, startWordIndex);
  }

  /**
   * Reset the story and start fresh
   */
  function resetStory() {
    console.log("Resetting story...");
    localStorage.removeItem(STORY_KEY);
    localStorage.removeItem(LAST_EDIT_KEY);
    localStorage.removeItem("lastWikiEditRcid");
    localStorage.removeItem(USED_WORDS_KEY);

    // Clear the story element immediately
    const storyElement = document.getElementById("story");
    if (storyElement) {
      storyElement.innerText = "";
    }

    // Start fresh fetch
    fetchWikiEdits();
  }

  /**
   * Display new phrases with source information
   */
  function displayNewPhrases(newPhrases, startWordIndex) {
    const storyElement = document.getElementById("story");
    if (!storyElement) return;

    if (startWordIndex === 0) {
      storyElement.innerText = "";
    }

    newPhrases.forEach((phrase, phraseIndex) => {
      if (!phrase || !phrase.text || phrase.text.trim().length === 0) return;

      const phraseContainer = document.createElement("div");
      phraseContainer.className = "phrase-container";
      storyElement.appendChild(phraseContainer);

      setTimeout(() => {
        const phraseContent = document.createElement("span");
        phraseContent.className = "phrase";
        phraseContent.textContent = phrase.text.charAt(0).toUpperCase() +
          phrase.text.slice(1);

        // Add source data attributes
        phraseContent.dataset.user = phrase.source.user;
        phraseContent.dataset.timestamp = phrase.source.timestamp;
        phraseContent.dataset.comment = phrase.source.comment;

        phraseContainer.appendChild(phraseContent);

        const punctuation = document.createElement("span");
        punctuation.className = "punctuation";
        punctuation.textContent = ", ";
        phraseContainer.appendChild(punctuation);
        phraseContainer.appendChild(document.createElement("br"));
      }, startWordIndex * 1000 + phraseIndex * 2000);
    });
  }

  /**
   * Display the story as a poem, one phrase per line.
   */
  function displayStoryAsPoem(phrases) {
    const storyElement = document.getElementById("story");
    if (!storyElement) return;

    // Clear existing content without showing "Loading..."
    storyElement.innerText = "";

    // Filter and clean phrases
    phrases = phrases.filter((phrase) =>
      phrase &&
      phrase.trim().length > 0 &&
      phrase.split(" ").length >= 3
    );

    // Only proceed if we have phrases to display
    if (phrases.length === 0) return;

    // Display all phrases sequentially
    phrases.forEach((phrase, index) => {
      const phraseContainer = document.createElement("div");
      phraseContainer.className = "phrase-container";
      storyElement.appendChild(phraseContainer);

      setTimeout(() => {
        const phraseContent = document.createElement("span");
        phraseContent.className = "phrase";
        phraseContent.textContent = phrase.charAt(0).toUpperCase() +
          phrase.slice(1);
        phraseContainer.appendChild(phraseContent);

        const punctuation = document.createElement("span");
        punctuation.className = "punctuation";
        punctuation.textContent = ", ";
        phraseContainer.appendChild(punctuation);
        phraseContainer.appendChild(document.createElement("br"));
      }, index * 2000);
    });
  }

  /**
   * On load, parse localStorage and display poem.
   */
  function displayStoryOnLoad() {
    let storedPhrases = localStorage.getItem(STORY_KEY) || "";
    let allPhrases = storedPhrases ? storedPhrases.split("\n") : [];

    if (allPhrases.length > 0) {
      displayStoryAsPoem(allPhrases);
    } else {
      document.getElementById("story").innerText = "Loading...";
    }
  }

  // INIT
  displayStoryOnLoad();
  console.log("Displaying story on load");
  fetchWikiEdits();
  console.log("Fetching wiki edits");
  // Check for new edits every 30 seconds
  setInterval(fetchWikiEdits, 30000);
  console.log("Set up interval for fetching edits");
} catch (error) {
  console.error("Error during script initialization:", error);
  document.getElementById("story").innerHTML =
    `<p>Error initializing story: ${error.message}</p>`;
}
