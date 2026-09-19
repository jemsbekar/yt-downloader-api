const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'YouTube Downloader API is running',
    version: '1.0.0'
  });
});

app.get('/api/info', async (req, res) => {
  const videoUrl = req.query.url;
  if (!videoUrl) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  const ytdlp = process.env.YTDLP_PATH || 'yt-dlp';
  const cmd = `"${ytdlp}" --dump-json --no-warnings --no-playlist "${videoUrl}"`;

  exec(cmd, { maxBuffer: 50 * 1024 * 1024, timeout: 60000 }, (error, stdout, stderr) => {
    if (error) {
      return res.status(500).json({ 
        error: 'Failed to fetch video info', 
        details: stderr || error.message 
      });
    }
    try {
      const info = JSON.parse(stdout);
      res.json({
        title: info.title,
        thumbnail: info.thumbnail,
        duration: info.duration,
        uploader: info.uploader,
        formats: (info.formats || [])
          .filter(f => f.ext === 'mp4' || f.ext === 'm4a')
          .map(f => ({
            format_id: f.format_id,
            ext: f.ext,
            quality: f.format_note || f.resolution || 'unknown',
            filesize: f.filesize || f.filesize_approx || 0,
            has_video: f.vcodec !== 'none',
            has_audio: f.acodec !== 'none'
          }))
      });
    } catch (e) {
      res.status(500).json({ error: 'Parse error', details: e.message });
    }
  });
});

app.get('/api/download', async (req, res) => {
  const videoUrl = req.query.url;
  const format = req.query.format || 'best[ext=mp4]';
  const isAudio = req.query.audio === 'true';

  if (!videoUrl) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  const ytdlp = process.env.YTDLP_PATH || 'yt-dlp';
  const tmpDir = os.tmpdir();
  const timestamp = Date.now();
  const ext = isAudio ? 'mp3' : 'mp4';
  const outputTemplate = path.join(tmpDir, `video_${timestamp}.%(ext)s`);

  let cmd;
  if (isAudio) {
    cmd = `"${ytdlp}" -x --audio-format mp3 --audio-quality 0 -o "${outputTemplate}" --no-warnings --no-playlist "${videoUrl}"`;
  } else {
    cmd = `"${ytdlp}" -f "${format}" -o "${outputTemplate}" --no-warnings --no-playlist "${videoUrl}"`;
  }

  exec(cmd, { maxBuffer: 500 * 1024 * 1024, timeout: 300000 }, (error, stdout, stderr) => {
    if (error) {
      return res.status(500).json({ 
        error: 'Download failed', 
        details: stderr || error.message 
      });
    }

    const files = fs.readdirSync(tmpDir).filter(f => f.startsWith(`video_${timestamp}`));
    if (files.length === 0) {
      return res.status(500).json({ error: 'Output file not found' });
    }

    const outputFile = path.join(tmpDir, files[0]);
    const stat = fs.statSync(outputFile);
    const downloadName = `video_${timestamp}.${ext}`;

    res.setHeader('Content-Type', isAudio ? 'audio/mpeg' : 'video/mp4');
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);

    const stream = fs.createReadStream(outputFile);
    stream.pipe(res);

    stream.on('end', () => {
      fs.unlink(outputFile, () => {});
    });

    stream.on('error', (err) => {
      fs.unlink(outputFile, () => {});
      if (!res.headersSent) {
        res.status(500).json({ error: 'Stream error', details: err.message });
      }
    });
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
