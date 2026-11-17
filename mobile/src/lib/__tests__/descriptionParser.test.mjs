import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeJobDescriptionText,
  parseInlineSpans,
  parseJobDescription,
} from "../descriptionParser.ts";

function blockText(block) {
  if (block.type === "heading") return block.text;
  return block.spans.map((s) => s.text).join("");
}

test("returns empty results for blank and empty inputs", () => {
  assert.equal(normalizeJobDescriptionText(""), "");
  assert.equal(normalizeJobDescriptionText("   \r\n  \n\t\n  "), "");
  assert.deepEqual(parseInlineSpans(""), []);
  assert.deepEqual(parseJobDescription(""), []);
  assert.deepEqual(parseJobDescription(" \n  \n   \t\r\n "), []);
});

test("normalizeJobDescriptionText normalizes newlines, escapes, entities, and whitespace", () => {
  const raw =
    "S\\&P Global \\- Analyst \\(London\\)\r\n" +
    "Range\\: 1\\.5 \\+ 2 \\* 3 \\/ 4 \\[hybrid\\] \\_test\\_ \\#1  \r" +
    "\u00a0 \n  \n\n\n" +
    "Teams &amp; Partners &lt;Data&gt; &quot;Core&quot; &#39;26&nbsp;Team   \n" +
    "  indented continuation line   ";

  const expected =
    "S&P Global - Analyst (London)\n" +
    "Range: 1.5 + 2 * 3 / 4 [hybrid] _test_ #1\n\n" +
    "Teams & Partners <Data> \"Core\" '26 Team\n" +
    "  indented continuation line";

  assert.equal(normalizeJobDescriptionText(raw), expected);
});

test("parseInlineSpans parses bold, italic, links, and strips unmatched **", () => {
  assert.deepEqual(
    parseInlineSpans(
      "**Real ownership:** __Core SQL__, *fast* pacing, and [our docs](https://example.com/a_(b))."
    ),
    [
      { text: "Real ownership:", bold: true },
      { text: " " },
      { text: "Core SQL", bold: true },
      { text: ", " },
      { text: "fast", italic: true },
      { text: " pacing, and " },
      { text: "our docs", linkUrl: "https://example.com/a_(b)" },
      { text: "." },
    ]
  );

  // Quadruple and triple asterisks from nested HTML tags in JobSpy
  assert.deepEqual(parseInlineSpans("****Job Description:****"), [
    { text: "Job Description:", bold: true },
  ]);
  assert.deepEqual(parseInlineSpans("***Hybrid working***"), [
    { text: "Hybrid working", bold: true, italic: true },
  ]);

  // Nested bold + italic and bold link labels
  assert.deepEqual(parseInlineSpans("**bold *and italic* end**"), [
    { text: "bold ", bold: true },
    { text: "and italic", bold: true, italic: true },
    { text: " end", bold: true },
  ]);
  assert.deepEqual(parseInlineSpans("[**Apply Now**](https://jobs.example.com)"), [
    { text: "Apply Now", bold: true, linkUrl: "https://jobs.example.com" },
  ]);

  // Unmatched / truncated ** must never leak raw ** markers
  const truncated = parseInlineSpans("Strong experience with **SQL and Python");
  assert.deepEqual(truncated, [{ text: "Strong experience with SQL and Python" }]);
  assert.equal(truncated.some((s) => s.text.includes("**")), false);

  // Literal asterisks in footnotes or math are preserved untouched
  assert.deepEqual(parseInlineSpans("flexible hours* or hybrid working*."), [
    { text: "flexible hours* or hybrid working*." },
  ]);
  assert.deepEqual(parseInlineSpans("5 * 3 = 15 and *.csv files"), [
    { text: "5 * 3 = 15 and *.csv files" },
  ]);
});

test("parseJobDescription handles ATX headings, Setext underlines, horizontal rules, and bold headings", () => {
  const raw = [
    "# Principal Data Analyst",
    "## Role Overview",
    "### **Reference number**",
    "476714",
    "#### **What you'll do**",
    "---",
    "***",
    "___",
    "Details",
    "-----------",
    "**About The Job**",
    "**Key Responsibilities** :",
    "****Job Description:****",
    "Build scalable analytics pipelines.",
  ].join("\n");

  const blocks = parseJobDescription(raw);
  assert.deepEqual(
    blocks.map((b) => [b.type, blockText(b)]),
    [
      ["heading", "Principal Data Analyst"],
      ["heading", "Role Overview"],
      ["heading", "Reference number"],
      ["paragraph", "476714"],
      ["heading", "What you'll do"],
      ["heading", "Details"],
      ["heading", "About The Job"],
      ["heading", "Key Responsibilities:"],
      ["heading", "Job Description:"],
      ["paragraph", "Build scalable analytics pipelines."],
    ]
  );
});

test("parseJobDescription merges wrapped/indented bullet continuations and supports varied markers", () => {
  const raw = [
    "**You'll have:**",
    "* **Real ownership:**",
    "  You're the team's dedicated data person working closely with",
    "  Product and Engineering.",
    "- Write and optimise",
    " **SQL**",
    " against a",
    " **Snowflake**",
    " cloud data warehouse",
    "• Lead A/B experimentation",
    "◦ Present insights to leadership",
    "– Collaborate across teams",
    "+ Maintain dbt models",
    "1. **First 30 days:**",
    "   Audit existing warehouse tables.",
    "2) **First 90 days:**",
    "   Ship executive KPI dashboards.",
  ].join("\n");

  const blocks = parseJobDescription(raw);
  assert.equal(blocks[0].type, "heading");
  assert.equal(blocks[0].text, "You'll have:");

  assert.equal(blocks[1].type, "bullet");
  assert.equal(blocks[1].marker, "•");
  assert.deepEqual(blocks[1].spans, [
    { text: "Real ownership:", bold: true },
    {
      text: " You're the team's dedicated data person working closely with Product and Engineering.",
    },
  ]);

  assert.equal(blocks[2].type, "bullet");
  assert.equal(blocks[2].marker, "•");
  assert.deepEqual(blocks[2].spans, [
    { text: "Write and optimise " },
    { text: "SQL", bold: true },
    { text: " against a " },
    { text: "Snowflake", bold: true },
    { text: " cloud data warehouse" },
  ]);

  assert.equal(blocks[3].type, "bullet");
  assert.equal(blockText(blocks[3]), "Lead A/B experimentation");
  assert.equal(blocks[4].type, "bullet");
  assert.equal(blockText(blocks[4]), "Present insights to leadership");
  assert.equal(blocks[5].type, "bullet");
  assert.equal(blockText(blocks[5]), "Collaborate across teams");
  assert.equal(blocks[6].type, "bullet");
  assert.equal(blockText(blocks[6]), "Maintain dbt models");

  assert.equal(blocks[7].type, "bullet");
  assert.equal(blocks[7].marker, "1.");
  assert.deepEqual(blocks[7].spans, [
    { text: "First 30 days:", bold: true },
    { text: " Audit existing warehouse tables." },
  ]);

  assert.equal(blocks[8].type, "bullet");
  assert.equal(blocks[8].marker, "2)");
  assert.deepEqual(blocks[8].spans, [
    { text: "First 90 days:", bold: true },
    { text: " Ship executive KPI dashboards." },
  ]);
});

test("parseJobDescription detects standalone section labels without misclassifying wrapped prose or Key: Value lines", () => {
  const raw = [
    "Location",
    "",
    "London",
    "",
    "Job summary",
    "",
    "We are seeking a candidate who brings the following",
    "skills and experience:",
    "",
    "Company: Live Nation",
    "",
    "Band: E / HEO",
    "",
    "2026. Our analytics transformation starts here.",
    "",
    "Your impact",
    "",
    "Here, you will compress",
    "years of growth",
    "into 2-3 years.",
    "",
    "Responsibilities include:",
    "* Design trusted data models",
    "",
    "Key responsibilities include:",
    "* Build executive reporting",
    "",
    "Qualifications:",
    "* 3+ years of SQL and Python",
  ].join("\n");

  const blocks = parseJobDescription(raw);

  assert.deepEqual(
    blocks.map((b) => [b.type, blockText(b)]),
    [
      ["heading", "Location"],
      ["paragraph", "London"],
      ["heading", "Job summary"],
      [
        "paragraph",
        "We are seeking a candidate who brings the following skills and experience:",
      ],
      ["paragraph", "Company: Live Nation"],
      ["paragraph", "Band: E / HEO"],
      ["paragraph", "2026. Our analytics transformation starts here."],
      ["heading", "Your impact"],
      ["paragraph", "Here, you will compress years of growth into 2-3 years."],
      ["heading", "Responsibilities include:"],
      ["bullet", "Design trusted data models"],
      ["heading", "Key responsibilities include:"],
      ["bullet", "Build executive reporting"],
      ["heading", "Qualifications:"],
      ["bullet", "3+ years of SQL and Python"],
    ]
  );
});

test("parseJobDescription handles realistic LinkedIn and Indeed JobSpy markdown payloads cleanly", () => {
  const linkedinPayload = `**About The Job**\r\n\r\n  \r\n\r\n At **S\\&P Global**, we transform financial data &amp; insights into action\\.\n\n  \n\n**We Work Best When**\n\n  \n\n* **Real ownership:** \n  You're the team's dedicated data person owning dbt \\& Snowflake end\\-to\\-end.\n* **High\\-trust execution:**\n  Partner directly with Finance, Product, and Engineering.\n\n\n**What You'll Need:**\n\n1. Strong **SQL** &amp; **Python** experience\n2. Familiarity with [dbt Core](https://docs.getdbt.com)\n\n---\n\nApply today`;

  const blocks = parseJobDescription(linkedinPayload);
  assert.deepEqual(
    blocks.map((b) => [b.type, blockText(b)]),
    [
      ["heading", "About The Job"],
      [
        "paragraph",
        "At S&P Global, we transform financial data & insights into action.",
      ],
      ["heading", "We Work Best When"],
      [
        "bullet",
        "Real ownership: You're the team's dedicated data person owning dbt & Snowflake end-to-end.",
      ],
      [
        "bullet",
        "High-trust execution: Partner directly with Finance, Product, and Engineering.",
      ],
      ["heading", "What You'll Need:"],
      ["bullet", "Strong SQL & Python experience"],
      ["bullet", "Familiarity with dbt Core"],
      ["paragraph", "Apply today"],
    ]
  );

  // Ensure no raw ** markers remain anywhere in parsed output
  for (const block of blocks) {
    assert.equal(blockText(block).includes("**"), false);
  }
});

test("parseJobDescription handles bold heading immediately following a sentence-ending bullet", () => {
  const raw = [
    "* Deliver reliable analytics dashboards.",
    "**What We Offer:**",
    "* Competitive salary & benefits",
  ].join("\n");

  const blocks = parseJobDescription(raw);
  assert.deepEqual(
    blocks.map((b) => [b.type, blockText(b)]),
    [
      ["bullet", "Deliver reliable analytics dashboards."],
      ["heading", "What We Offer:"],
      ["bullet", "Competitive salary & benefits"],
    ]
  );
});
