const express = require("express");
const uuid = require("uuid");
const dotenv = require("dotenv");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { runZoomBot } = require("../bot/zoom_bot");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const DEBUG = process.env.DEBUG || false;

app.use(express.static(path.join(__dirname, "../public")));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Create transcripts directory if it doesn't exist
const transcriptsDir = path.join(__dirname, "..", "transcripts");
if (!fs.existsSync(transcriptsDir)) {
  fs.mkdirSync(transcriptsDir);
}

app.post("/api/invite_bot", (req, res) => {
  const { meetingUrl } = req.body;
  if (!meetingUrl) {
    return res.status(400).json({ error: "Missing meetingUrl query param" });
  }

  // Basic Zoom URL validation (https://zoom.us/..., https://*.zoom.com/... etc.)
  const zoomRegex = /zoom\.(us|com)\/(?:j|s|wc\/join)\/(\d+)/i;
  if (!zoomRegex.test(meetingUrl)) {
    return res.status(400).json({ error: "Invalid Zoom meeting URL" });
  }

  const botId = uuid.v4();

  if (DEBUG === "true") {
    runZoomBot(
      meetingUrl,
      path.join(transcriptsDir, `${botId}.jsonl`),
      (headless = false)
    );
  } else {
    // launch docker container if not in debug mode
    const botProcess = spawn("docker", [
      "run",
      "--rm",
      "--name",
      `zoom-bot-${botId}`,
      "-v", // mount the transcripts directory
      `${transcriptsDir}:/app/transcripts`,
      "zoom-bot",
      meetingUrl,
      botId,
    ]);

    botProcess.stdout.on("data", (data) => {
      console.log(`[bot:${botId}] stdout: ${data}`);
    });

    botProcess.stderr.on("data", (data) => {
      console.error(`[bot:${botId}] stderr: ${data}`);
    });

    botProcess.on("close", (code) => {
      console.log(`[bot:${botId}] process exited with code ${code}`);
    });
  }

  res.json({ status: "bot_invited", botId });
});

app.get("/api/transcript/:botId", (req, res) => {
  const { botId } = req.params;
  const transcriptPath = path.join(transcriptsDir, `${botId}.jsonl`);

  if (!fs.existsSync(transcriptPath)) {
    return res.json([]);
  }

  try {
    // process transcript before sending it to the frontend
    const fileContent = fs.readFileSync(transcriptPath, "utf-8");
    const lines = fileContent.trim().split("\n");
    const rawTranscript = lines.map((line) => JSON.parse(line));

    const processedTranscript = [];
    let lastSpeaker = null;
    let lastTimestamp = 0;

    for (const chunk of rawTranscript) {
      if (lastSpeaker === chunk.speaker && chunk.time - lastTimestamp < 2) {
        const lastEntry = processedTranscript[processedTranscript.length - 1];
        lastEntry.text += ` ${chunk.text}`;
        lastEntry.time = chunk.time; // Update timestamp to the latest
      } else {
        // Push a new entry
        processedTranscript.push({ ...chunk });
      }
      lastSpeaker = chunk.speaker;
      lastTimestamp = chunk.time;
    }

    res.json(processedTranscript);
  } catch (err) {
    console.error(`[api] error reading transcript for bot ${botId}:`, err);
    res.status(500).json({ error: "Failed to read transcript file" });
  }
});

app.listen(PORT, () => {
  console.log(`Express server listening on http://localhost:${PORT}`);
});
