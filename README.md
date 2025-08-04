# Zoom Bot From Scratch

This repo is a demonstration of how to build a simple Zoom bot that joins and transcribes meetings in real time.

If you want to see a deeper dive into how I built this, check out this post on the Recall.ai blog: ...

## Demo
https://www.loom.com/share/ab898f02a5344fdbb89fdd4701bbaf10

## Hosted API
If you want to use a hosted API that allows you to access conversation data from meetings instead of building and hosting your own bot, check out [recall.ai](https://www.recall.ai?utm_source=github&utm_medium=sampleapp&utm_campaign=zoom-bot-from-scratch).

## Requirements

- [Docker](https://docs.docker.com/get-docker/) must be installed and running.
- [Node.js](https://nodejs.org/en)

## How to Run

### 1. Clone the repo

```bash
git clone https://github.com/recall-ai/zoom-bot-from-scratch.git
cd zoom-bot-from-scratch
```

### 2. Set up the environment variables

Copy the `.env.example` file to `.env`. By default, the bot will not be running in debug mode. You can set `DEBUG=true` in your `.env` file to enable debug mode, which will launch the bot in headed mode.

```bash
cp .env.example .env
```

### 3. Build the Bot's Docker Image

This command builds the container image for our Zoom bot, which includes the Chromium browser and all necessary dependencies.

```bash
docker build -t zoom-bot .
```

### 4. Install Dependencies and Start the Server

This will install the Node.js dependencies for the backend server and then start it.

```bash
npm install
npm run dev
```

The server will be running at `http://localhost:3000`.

### 5. Use the Web App

Open your web browser and navigate to `http://localhost:3000`.

Paste a Zoom meeting URL into the form and click "Invite Bot". You will see logs appear in your terminal as the backend server launches a new Docker container to run the bot for that meeting.

The live transcript will be saved to a `.jsonl` file inside the `src/transcripts` directory.
