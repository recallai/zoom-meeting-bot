# Use the official Playwright base image from Microsoft.
# This image comes with Node.js and all necessary browser dependencies pre-installed.
FROM mcr.microsoft.com/playwright:v1.54.1-jammy 

# Set the working directory inside the container.
WORKDIR /app

# Copy package.json and package-lock.json first to leverage Docker's layer caching.
# This way, npm install is only re-run if dependencies change.
COPY package*.json ./

# Install the project's dependencies.
RUN npm install

# Copy the rest of the application source code into the container.
COPY . .

# We need a directory for the transcripts to be written to inside the container.
RUN mkdir -p /app/transcripts

# ENTRYPOINT defines the main executable. Arguments from `docker run` will be
# appended to this command.
ENTRYPOINT ["node", "src/bot/zoom_bot.js"] 