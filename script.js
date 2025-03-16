const STORY_KEY = "wikiEvolvingStory"; 

const resetButton = document.getElementById("reset-button");
if (resetButton) {
  resetButton.addEventListener("click", () => {
    localStorage.removeItem(STORY_KEY); 
    document.getElementById("story").innerText = "Starting fresh..."; 
    fetchWikiEdits(); 
  });
}

async function fetchWikiEdits() {
  try {
    const response = await fetch(
      "https://en.wikipedia.org/w/api.php?action=query&list=recentchanges&rcprop=title|comment&format=json&origin=*"
    );
    const data = await response.json();

    if (!data.query || !data.query.recentchanges) throw new Error("No edits found");

    let words = data.query.recentchanges
      .map(edit => extractWord(edit.comment || edit.title))
      .filter(Boolean) 
      .map(word => word.toLowerCase()); 

    console.log("Extracted Words:", words); 

    updateStory(words);
  } catch (error) {
    console.error("Error fetching Wikipedia edits:", error);
    document.getElementById("story").innerHTML = `<p>Error loading story.</p>`;
  }
}

function extractWord(text) {
  if (!text) return "";

  let words = text
    .split(" ")
    .filter(word => word.length > 3 && /^[a-zA-Z]+$/.test(word)); 

  return words.length ? words[Math.floor(Math.random() * words.length)] : "";
}

function updateStory(words) {
  let story = localStorage.getItem(STORY_KEY) || ""; 
  let newWords = words.slice(0, 10); 
  story += " " + newWords.join(" "); 
  localStorage.setItem(STORY_KEY, story.trim()); 

  document.getElementById("story").innerText = story; 
}

function displayStoryOnLoad() {
  const savedStory = localStorage.getItem(STORY_KEY);
  if (savedStory) {
    document.getElementById("story").innerText = savedStory;
  }
}

displayStoryOnLoad();
fetchWikiEdits(); 
setInterval(fetchWikiEdits, 30000); 
