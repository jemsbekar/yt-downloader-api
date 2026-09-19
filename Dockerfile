FROM node:18-slim

RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

RUN pip3 install --no-cache-dir --break-system-packages yt-dlp

WORKDIR /app

COPY package.json ./

RUN npm install --production

COPY server.js ./

ENV YTDLP_PATH=/usr/local/bin/yt-dlp

EXPOSE 3000

CMD ["node", "server.js"]
