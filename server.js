const express = require("express");
const { Readability } = require("@mozilla/readability");
const { JSDOM } = require("jsdom");
const path = require("path");

const app = express();
const PORT = 3000;

app.use(express.json());
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

    // Preserve paragraph/section breaks as a special marker, normalize other whitespace
    const text = article.textContent
      .replace(/\r\n/g, "\n")
      .replace(/[ \t]*\n[ \t]*/g, "\n")  // strip tabs/spaces around newlines
      .replace(/\n{2,}/g, " \u00b6 ")    // 2+ newlines = paragraph break → pilcrow marker
      .replace(/\n/g, " ")               // single newlines → space
      .replace(/ {2,}/g, " ")
      .trim();

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

app.listen(PORT, () => {
  console.log(`Speed Reader running at http://localhost:${PORT}`);
});
