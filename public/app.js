(() => {
  const urlForm = document.getElementById("url-form");
  const urlInput = document.getElementById("url-input");
  const loadBtn = document.getElementById("load-btn");
  const errorMsg = document.getElementById("error-msg");
  const readerSection = document.getElementById("reader-section");
  const articleTitle = document.getElementById("article-title");
  const wordBefore = document.getElementById("word-before");
  const wordFocus = document.getElementById("word-focus");
  const wordAfter = document.getElementById("word-after");
  const wordContainer = document.getElementById("word-container");
  const rsvpDisplay = document.getElementById("rsvp-display");
  const progressBar = document.getElementById("progress-bar");
  const progressFill = document.getElementById("progress-fill");
  const wpmDisplay = document.getElementById("wpm-display");
  const wordCounter = document.getElementById("word-counter");
  const loadingOverlay = document.getElementById("loading-overlay");

  let words = [];
  let currentIndex = 0;
  let wpm = 500;
  let intervalId = null;
  let isPlaying = false;

  // --- Bookmarklet support ---
  // If the page was served via the bookmarklet POST, article data is pre-injected
  if (window.__PRELOADED_ARTICLE__) {
    const data = window.__PRELOADED_ARTICLE__;
    delete window.__PRELOADED_ARTICLE__;
    initReader(data.title, data.text);
  }

  // --- URL Loading ---

  urlForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const url = urlInput.value.trim();
    if (!url) return;

    errorMsg.classList.add("hidden");
    loadBtn.disabled = true;
    loadingOverlay.classList.remove("hidden");

    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to extract article");
      }

      initReader(data.title, data.text);
    } catch (err) {
      errorMsg.textContent = err.message;
      errorMsg.classList.remove("hidden");
    } finally {
      loadBtn.disabled = false;
      loadingOverlay.classList.add("hidden");
    }
  });

  // --- Reader Init ---

  function initReader(title, text) {
    stop();

    words = text.split(/\s+/).filter((w) => w.length > 0);
    currentIndex = 0;

    articleTitle.textContent = title;
    readerSection.classList.remove("hidden");
    rsvpDisplay.classList.remove("playing");
    rsvpDisplay.classList.add("paused");

    updateDisplay();
    updateProgress();
    updateWpm();
  }

  // --- RSVP Core ---

  // Find the optimal recognition point (ORP) for a word.
  // This is roughly 1/3 into the word, biased toward the start,
  // which is where the eye naturally fixates.
  function getORP(word) {
    const len = word.length;
    if (len <= 1) return 0;
    if (len <= 3) return 1;
    if (len <= 5) return 1;
    if (len <= 9) return 2;
    return 3;
  }

  function updateDisplay() {
    if (words.length === 0) {
      wordBefore.textContent = "";
      wordFocus.textContent = "";
      wordAfter.textContent = "";
      return;
    }

    const word = words[currentIndex] || "";
    const orp = getORP(word);

    wordBefore.textContent = word.slice(0, orp);
    wordFocus.textContent = word[orp] || "";
    wordAfter.textContent = word.slice(orp + 1);

    // Position the container so the focus letter is at the horizontal center
    // We measure the "before" text width + half the focus letter width,
    // then offset the container so that point aligns with 50% of the display.
    requestAnimationFrame(() => {
      const displayCenter = rsvpDisplay.offsetWidth / 2;
      const beforeWidth = wordBefore.offsetWidth;
      const focusWidth = wordFocus.offsetWidth;
      const offset = displayCenter - beforeWidth - focusWidth / 2;
      wordContainer.style.left = `${offset}px`;
    });

    wordCounter.textContent = `${currentIndex + 1} / ${words.length}`;
  }

  function updateProgress() {
    const pct = words.length === 0 ? 0 : (currentIndex / (words.length - 1)) * 100;
    progressFill.style.width = `${pct}%`;
  }

  function updateWpm() {
    wpmDisplay.textContent = `${wpm} WPM`;
  }

  // Calculate delay for the current word.
  // Adds micro-pauses based on punctuation for natural reading rhythm.
  //   - Commas, em-dashes: +1x base delay
  //   - End-of-sentence (.!?): +2x base delay (but not single-letter abbreviations like "U.S.")
  //   - Paragraph/section break (¶ marker): +3x base delay
  function getDelay() {
    const baseDelay = 60000 / wpm;
    const word = words[currentIndex] || "";

    // Paragraph break marker
    if (word === "\u00b6") return baseDelay * 3;

    let multiplier = 1;

    // End-of-sentence punctuation, but not initials/abbreviations (single letter + period)
    if (/[!?]$/.test(word)) {
      multiplier += 2;
    } else if (/\.$/.test(word) && !/^\w\.$/.test(word)) {
      multiplier += 2;
    }
    // Commas and em-dashes
    else if (/[,;]\s*$/.test(word) || /\u2014/.test(word) || /--/.test(word)) {
      multiplier += 1;
    }

    return baseDelay * multiplier;
  }

  function advance() {
    currentIndex++;

    if (currentIndex >= words.length) {
      stop();
      currentIndex = words.length - 1;
      updateDisplay();
      updateProgress();
      return;
    }

    // Paragraph break marker: hold the display (don't show the ¶), then skip ahead
    if (words[currentIndex] === "\u00b6") {
      updateProgress();
      intervalId = setTimeout(advance, getDelay());
      return;
    }

    updateDisplay();
    updateProgress();

    // Schedule next word with variable delay
    clearTimeout(intervalId);
    intervalId = setTimeout(advance, getDelay());
  }

  function play() {
    if (words.length === 0) return;

    // If we finished, restart
    if (currentIndex >= words.length - 1) {
      currentIndex = 0;
      updateDisplay();
      updateProgress();
    }

    isPlaying = true;
    rsvpDisplay.classList.remove("paused");
    rsvpDisplay.classList.add("playing");

    intervalId = setTimeout(advance, getDelay());
  }

  function pause() {
    isPlaying = false;
    rsvpDisplay.classList.remove("playing");
    rsvpDisplay.classList.add("paused");
    clearTimeout(intervalId);
    intervalId = null;
  }

  function stop() {
    pause();
  }

  function togglePlayPause() {
    if (isPlaying) {
      pause();
    } else {
      play();
    }
  }

  // --- Progress Bar Scrubbing ---

  progressBar.addEventListener("click", (e) => {
    if (words.length === 0) return;
    const rect = progressBar.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    currentIndex = Math.round(pct * (words.length - 1));
    updateDisplay();
    updateProgress();
  });

  // --- UI Helpers ---

  const playPauseBtn = document.getElementById("play-pause-btn");

  function updatePlayPauseLabel() {
    playPauseBtn.textContent = isPlaying ? "Pause" : "Start";
  }

  function slower() {
    wpm = Math.max(50, wpm - 50);
    updateWpm();
    if (isPlaying) {
      clearTimeout(intervalId);
      intervalId = setTimeout(advance, getDelay());
    }
  }

  function faster() {
    wpm = Math.min(1500, wpm + 50);
    updateWpm();
    if (isPlaying) {
      clearTimeout(intervalId);
      intervalId = setTimeout(advance, getDelay());
    }
  }

  // --- Button Controls ---

  playPauseBtn.addEventListener("click", () => {
    togglePlayPause();
    updatePlayPauseLabel();
  });

  document.getElementById("slower-btn").addEventListener("click", slower);
  document.getElementById("faster-btn").addEventListener("click", faster);

  // --- Keyboard Controls ---

  document.addEventListener("keydown", (e) => {
    // Don't capture keys when typing in the URL input
    if (document.activeElement === urlInput) return;

    switch (e.code) {
      case "Space":
        e.preventDefault();
        togglePlayPause();
        updatePlayPauseLabel();
        break;

      case "KeyZ":
        slower();
        break;

      case "KeyX":
        faster();
        break;
    }
  });
})();
