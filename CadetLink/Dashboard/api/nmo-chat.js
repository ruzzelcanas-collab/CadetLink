import fs from "fs";
import path from "path";

const MAX_REQUEST_BYTES = 16 * 1024;
const MAX_MESSAGES = 12;
const MAX_MESSAGE_LENGTH = 1200;
const MAX_RECORDS = 30;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5.6-terra";

function getPdfContent() {

  if (process.env.SHARED_PDF_URL) {
    return [
      {
        type: "input_file",
        file_url: process.env.SHARED_PDF_URL,
        detail: "low"
      },
      { type: "input_text", text: "Reference document: CMI 8th Ed. Use this reference for CMI and NMO inquiries." }
    ];
  }

  try {
    const pdfPath = path.join(process.cwd(), "Dashboard", "api", "cmi.pdf");
    if (fs.existsSync(pdfPath)) {
      const pdfBuffer = fs.readFileSync(pdfPath);
      if (pdfBuffer.length < 10 * 1024 * 1024) {
        return [
          {
            type: "input_file",
            filename: "cmi.pdf",
            file_data: `data:application/pdf;base64,${pdfBuffer.toString("base64")}`,
            detail: "low"
          },
          { type: "input_text", text: "Reference document: CMI 8th Ed. Use this reference for CMI and NMO inquiries." }
        ];
      }
    }
  } catch (err) {
    console.error("Could not load local PDF file:", err.message);
  }

  return [];
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({
      error: "The NMO assistant is not configured yet. Contact the site administrator."
    });
  }

  try {
    const body = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return res.status(400).json({ error: "The chat request has an invalid message or record format." });
    }
    if (Buffer.byteLength(JSON.stringify(body), "utf8") > MAX_REQUEST_BYTES) {
      return res.status(413).json({ error: "The chat request is too large." });
    }

    const messages = validateMessages(body?.messages);
    const records = validateRecords(body?.records);

    if (!messages || !records) {
      return res.status(400).json({ error: "The chat request has an invalid message or record format." });
    }

    const context = records.length > 0
      ? `Visible NMO record summaries (no names or images): ${records.map(describeRecord).join("; ")}.`
      : "No NMO record summaries are currently available.";

    const systemInstruction = [
      "You are CadetLink's NMO section assistant.",
      "Answer clearly and stay focused on NMO records, CMI guidelines, and the NMO section.",
      "Use the attached CMI 8th Edition reference document, when available, and supplied record summaries to answer user questions accurately.",
      "Do not invent CadetLink rules, official procedures, deadlines, or reasons for an NMO status.",
      "State when the provided information is insufficient.",
      "For official decisions, disputes, or procedural guidance not shown in the app, direct the user to CLC or Admin.",
      context
    ].join(" ");

    const pdfContent = getPdfContent();
    const firstUserMessage = messages.findIndex(({ role }) => role === "user");
    const input = messages.map(({ role, text }, index) => {
      if (role === "user" && index === firstUserMessage && pdfContent.length > 0) {
        return {
          role: "user",
          content: [...pdfContent, { type: "input_text", text }]
        };
      }
      return { role: role === "model" ? "assistant" : "user", content: text };
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    let upstreamResponse;
    try {
      upstreamResponse = await fetch(
        "https://api.openai.com/v1/responses",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
          },
          signal: controller.signal,
          body: JSON.stringify({
            model: OPENAI_MODEL,
            instructions: systemInstruction,
            input,
            max_output_tokens: 700,
            reasoning: { effort: "low" }
          })
        }
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!upstreamResponse.ok) {
      const errText = await upstreamResponse.text();
      console.error("OpenAI API Error:", upstreamResponse.status, errText);
      return res.status(502).json({ error: "The NMO assistant is temporarily unavailable." });
    }

    const result = await upstreamResponse.json();
    const reply = (result?.output || [])
      .flatMap(item => item.content || [])
      .filter(item => item.type === "output_text")
      .map(item => item.text || "")
      .join("")
      .trim();

    if (!reply) {
      return res.status(502).json({ error: "The NMO assistant could not produce a response." });
    }

    return res.status(200).json({ reply });

  } catch (error) {
    if (error.name === "AbortError") {
      return res.status(504).json({ error: "The NMO assistant took too long to respond." });
    }
    console.error("Server error:", error);
    return res.status(500).json({ error: "Internal server error." });
  }
}

function validateMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) return null;
  const normalized = [];
  for (const message of messages) {
    if (!message || !["user", "model"].includes(message.role) || typeof message.text !== "string" || message.text.trim().length === 0 || message.text.length > MAX_MESSAGE_LENGTH) return null;
    if (normalized.length === 0 && message.role !== "user") return null;
    if (normalized.length > 0 && normalized[normalized.length - 1].role === message.role) return null;
    normalized.push({ role: message.role, text: message.text.trim() });
  }
  return normalized;
}

function validateRecords(records) {
  if (!Array.isArray(records) || records.length > MAX_RECORDS) return null;
  const normalized = [];
  for (const record of records) {
    if (!record || !["pending", "approved", "voided"].includes(record.status)) return null;
    const sentAt = record.sentAt == null ? null : normalizeDate(record.sentAt);
    const approvedAt = record.approvedAt == null ? null : normalizeDate(record.approvedAt);
    if ((record.sentAt != null && !sentAt) || (record.approvedAt != null && !approvedAt)) return null;
    normalized.push({ status: record.status, sentAt, approvedAt });
  }
  return normalized;
}

function normalizeDate(value) {
  if (typeof value !== "string" || value.length > 40) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function describeRecord(record) {
  const submitted = record.sentAt ? new Date(record.sentAt).toLocaleDateString("en", { timeZone: "UTC" }) : "submission date unavailable";
  const approved = record.approvedAt ? `, approved ${new Date(record.approvedAt).toLocaleDateString("en", { timeZone: "UTC" })}` : "";
  return `${record.status}, submitted ${submitted}${approved}`;
}