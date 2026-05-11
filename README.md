# Sorx's video database

A small home-network web app for browsing a video library, playing videos in the browser, and keeping watch progress per profile across devices.

## Library layout

The app supports a real library layout:

```text
media-root/
  One Piece/
    [654-699] Punk Hazard [En Sub][720p]/
      [One Pace][654-656] Punk Hazard 01 [720p][En Sub].mp4
      [One Pace][657-659] Punk Hazard 02 [720p][En Sub].mp4

    [700-800] Dressrosa [En Sub][720p]/
      [One Pace][700-701] Dressrosa 01 [720p][En Sub].mp4
      [One Pace][702-703] Dressrosa 02 [720p][En Sub].mp4

  Shrek/
    Shrek [1080p].mp4
```

Top-level folders are shown as library titles. If a title folder contains playable subfolders, those subfolders are shown as chapters. If a title folder contains video files directly and no playable chapter folders, it is shown as a movie/video title.

## Features

- One single browser list instead of separate Library / Chapters / Episodes columns.
  - Start on the home screen with **Continue Watching**.
  - Use the left Library dropdown menu to choose a title.
  - Click a title to expand its chapters, or its movie/video files if it has no chapters.
  - Click a chapter to expand its episodes in the same menu.
  - Use **Home** to return to the main menu.
- Library page with multiple titles, such as `One Piece`, `Shrek`, etc.
- Chapter folders are sorted by a leading range such as `[700-800]`.
- Chapter display names ignore trailing tags such as `[En Sub][720p]`.
- Episode file names ignore leading/trailing bracket tags and show the episode number when possible.
- Movie folders without chapter subfolders show the movie directly.
- Videos are playable in the browser.
- Profile picker on startup, with server-side profiles for separate viewers.
- Watch progress is saved on the server per profile.
- Resume is saved separately for every title.
  - Open `One Piece` and press **Resume** to continue the last One Piece episode.
  - Open `Shrek` and press **Resume** to continue Shrek.
  - The **Resume** button only appears on a selected title when that title has something to resume.
- Finished videos are marked.
- The resume chapter/video and currently playing video are highlighted.
- The home screen shows the current profile's continue-watching video preview with its name and saved time.
- The next episode auto-plays when an episode ends.
- Fullscreen video has square corners.

## Install

```powershell
npm install
```

## Configure

Copy:

```text
config.example.json
```

to:

```text
config.json
```

Example Windows config:

```json
{
  "mediaRoot": "E:/Videos",
  "port": 3000
}
```

If your titles are directly on the `E:` drive, this also works:

```json
{
  "mediaRoot": "E:/",
  "port": 3000
}
```

The app only shows top-level folders that contain playable videos directly or contain playable chapter folders, so system folders like `$RECYCLE.BIN` should not appear.

## Run

```powershell
npm start
```

Open on the server PC:

```text
http://localhost:3000
```

Open from another device on the same home network:

```text
http://YOUR_SERVER_IP:3000
```

## Updating from an older version

Keep these files/folders from your current install:

```text
config.json
data/progress.json
```

Copy these updated files over your existing install:

```text
server.js
public/index.html
public/app.js
public/styles.css
README.md
package.json
```

Then restart the app or service.

The new version keeps old global progress and migrates it into the default profile automatically. If you move your existing One Piece folders into a new `One Piece` folder, old progress may not match because the file paths changed.

## Browser playback note

The browser still needs to support the file format and codec. For best compatibility, use:

```text
.mp4 with H.264 video and AAC audio
.webm with VP9/Opus or AV1/Opus
```

MKV files may not play on every phone or browser.
