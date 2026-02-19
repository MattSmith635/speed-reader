const express = require("express");
const { Readability } = require("@mozilla/readability");
const { JSDOM } = require("jsdom");
const path = require("path");

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));
app.use(express.static(path.join(__dirname, "public")));

app.post("/api/extract", async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: "URL is required" });
  }

  try {
    new URL(url);
  } catch {
    return res.status(400).json({ error: "Invalid URL" });
  }

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    if (!response.ok) {
      return res
        .status(502)
        .json({ error: `Failed to fetch URL: ${response.status}` });
    }

    const html = await response.text();
    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    if (!article) {
      return res
        .status(422)
        .json({ error: "Could not extract readable content from this page" });
    }

    const text = normalizeText(article.textContent);
    res.json({
      title: article.title,
      text,
      wordCount: text.split(/\s+/).length,
    });
  } catch (err) {
    res
      .status(500)
      .json({ error: `Extraction failed: ${err.message}` });
  }
});

// Helper: normalize extracted text with paragraph markers
function normalizeText(raw) {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\n{2,}/g, " \u00b6 ")
    .replace(/\n/g, " ")
    .replace(/ {2,}/g, " ")
    .trim();
}

// Helper: extract article from raw HTML
function extractFromHTML(html, url) {
  const dom = new JSDOM(html, { url: url || "https://example.com" });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();
  if (!article) return null;

  const text = normalizeText(article.textContent);
  return {
    title: article.title,
    text,
    wordCount: text.split(/\s+/).length,
  };
}

// Bookmarklet form POST: receives HTML, serves the app with article pre-loaded
app.post("/bookmarklet", (req, res) => {
  const { html, url } = req.body;
  if (!html) {
    return res.redirect("/");
  }

  try {
    const article = extractFromHTML(html, url);
    if (!article) {
      return res.redirect("/?error=Could+not+extract+readable+content");
    }

    // Read the index.html and inject the article data before the closing </body>
    const fs = require("fs");
    const indexHtml = fs.readFileSync(
      path.join(__dirname, "public", "index.html"),
      "utf-8"
    );
    const injection = `<script>window.__PRELOADED_ARTICLE__ = ${JSON.stringify(article)};</script>`;
    const page = indexHtml.replace('<script src="app.js">', `${injection}\n<script src="app.js">`);
    res.send(page);
  } catch (err) {
    res.redirect("/?error=Extraction+failed");
  }
});

// JSON API for bookmarklet: receives raw HTML + URL, returns extracted text
app.post("/api/extract-html", (req, res) => {
  const { html, url } = req.body;
  if (!html) {
    return res.status(400).json({ error: "HTML content is required" });
  }

  try {
    const article = extractFromHTML(html, url);
    if (!article) {
      return res
        .status(422)
        .json({ error: "Could not extract readable content" });
    }
    res.json(article);
  } catch (err) {
    res.status(500).json({ error: `Extraction failed: ${err.message}` });
  }
});

app.listen(PORT, () => {
  console.log(`Speed Reader running at http://localhost:${PORT}`);
});
