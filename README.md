# 🎵 NA Flute Learner

A Progressive Web App for learning Native American flute with real-time pitch feedback.

## Features

- **Real-time pitch detection** - Listens to your flute and detects notes instantly
- **AudioWorklet support** - Uses a separate thread for better performance (with fallback)
- **Visual feedback** - Needle tuner shows if you're sharp or flat
- **Progressive lessons** - From single notes to full scales, dynamically generated
- **6 Scale types** - Pentatonic Minor, Pentatonic Major, Blues, Natural Minor, Dorian, Mixolydian
- **Multi-flute support** - Works with any key (G, Bb, D, A, F#, etc.)
- **5-hole and 6-hole flutes** - Toggle for 5-hole flutes with tied hole 3
- **Nakai TAB fingering** - Vertical fingering diagram in NAF community standard format
- **Cross-fingering support** - Extended fingerings for non-pentatonic notes
- **Drone tone** - Root note drone for pitch reference while practicing
- **Reference tones** - Tap to hear any target note before playing
- **Metronome** - Adjustable BPM (30-200) for tempo practice
- **Adjustable hold time** - Set note hold duration from 0.3s to 2.0s
- **Song library** - 12 built-in melodies across beginner/intermediate/advanced levels
- **Play-along mode** - Songs use the lesson system with pitch detection feedback
- **Accuracy tracking** - See how well you're hitting each note
- **Assessment mode** - Detect your flute's exact scale
- **Pitch smoothing** - Stable readings with temporal filtering
- **Offline capable** - Works without internet after first load
- **iPhone installable** - Add to home screen like a native app
- **iOS Safari optimized** - Special handling for iOS audio quirks

## Installation

### As a PWA (Recommended for mobile)

#### iOS (iPhone/iPad)
1. Open the app in Safari
2. Tap the Share button (square with arrow)
3. Scroll down and tap "Add to Home Screen"
4. Name it "NA Flute" and tap "Add"
5. Launch from home screen like a native app!

#### Android
1. Open the app in Chrome
2. Tap the menu (three dots)
3. Tap "Add to Home Screen" or "Install App"
4. Launch from home screen!

### Local Development

```bash
# Clone the repository
git clone <repo-url>
cd flute-app

# Serve locally (any static server works)
python3 -m http.server 8000
# Or
npx serve .

# Open http://localhost:8000
```

### Deploy to Production

The app can be deployed to any static hosting service:

#### GitHub Pages (Free)
```bash
# Push to main branch
git push origin main

# Enable GitHub Pages in repo settings:
# Settings > Pages > Source: Deploy from branch > main
```

#### Netlify (Free)
```bash
# Option 1: Drag and drop
# Just drag the flute-app folder to netlify.com/drop

# Option 2: CLI
npx netlify deploy --prod --dir=.
```

#### Vercel (Free)
```bash
npx vercel --prod
```

#### Cloudflare Pages (Free)
1. Connect your GitHub repo
2. Set build output directory to `/`
3. Deploy!

## Supported Flutes

The app auto-detects or lets you select any key:

| Key | Fundamental | Scale Notes |
|-----|-------------|-------------|
| G | G4 (392 Hz) | G, A, B, C, D, E |
| Bb | A#4 (466 Hz) | A#, C#, D#, E, G#, A |
| D | D4 (294 Hz) | D, E, F#, G, A, B |
| A | A4 (440 Hz) | A, B, C#, D, E, F# |
| F# | F#4 (370 Hz) | F#, G#, A#, B, C#, D# |
| F | F4 (349 Hz) | F, G, A, A#, C, D |
| E | E4 (330 Hz) | E, F#, G#, A, B, C# |
| C | C4 (262 Hz) | C, D, E, F, G, A |

## Usage

### First Time Setup

1. Click "Assess My Flute" to detect your flute's notes automatically
   - Or select your flute key from the dropdown if you know it
2. Grant microphone permission when prompted
3. Start learning!

### Assessment Mode (Recommended)

1. Cover all holes and play the root note
2. The app detects the note and moves to the next
3. Repeat for all 6 finger positions
4. The app learns your flute's exact scale
5. Lessons are generated based on your detected scale

### Lesson Flow

1. Target note displayed with finger diagram
2. Play the note on your flute
3. Hold steady until progress bar fills
4. Advance to next note
5. Complete lesson and track accuracy

### Tuner Mode

- Free-form tuning
- See what note you're playing in real-time
- Use to find your flute's key (cover all holes)

## Tech Stack

- **Vanilla JavaScript** - No framework dependencies
- **Web Audio API** - Real-time audio processing
- **AudioWorklet** - Background thread for pitch detection (better performance)
- **Autocorrelation algorithm** - Accurate fundamental frequency detection
- **Pitch smoothing** - Median filter + exponential smoothing for stable readings
- **Service Worker** - Offline capability
- **PWA Manifest** - Installable on mobile devices

## Browser Support

| Browser | Support | Notes |
|---------|---------|-------|
| Safari (iOS) | ✅ Full | Optimized for iOS Safari audio quirks |
| Chrome (Android) | ✅ Full | Best performance with AudioWorklet |
| Safari Desktop | ✅ Full | |
| Chrome Desktop | ✅ Full | |
| Firefox | ✅ Full | |
| Edge | ✅ Full | |

## Troubleshooting

### "No pitch detected"
- Ensure microphone permission is granted
- Play closer to microphone
- Reduce background noise
- Try refreshing the page
- On iOS, make sure you're using Safari (not Chrome/Firefox)

### iOS Safari Issues
- **AudioContext suspended**: Tap the screen to activate audio
- **No microphone**: Go to Settings > Safari > Microphone and allow access
- **PWA not installing**: Use Safari's Share > Add to Home Screen
- **Audio cutting out**: Close other apps that might use audio

### Wrong Note Detection
- Use Assessment Mode to calibrate
- Ensure you're playing the correct fingering
- Check if your flute matches selected key
- Play at a consistent volume

### Performance Issues
- Close other browser tabs
- On mobile, close other apps
- Ensure you're not in Low Power Mode

## Development

### File Structure

```
flute-app/
├── index.html              # Main HTML
├── styles.css              # Styles
├── app.js                  # Application logic
├── pitch-detector.js       # Pitch detection (main thread + AudioWorklet support)
├── pitch-worklet-processor.js  # AudioWorklet processor (background thread)
├── manifest.json           # PWA manifest
├── sw.js                   # Service worker
├── icons/                  # App icons (PNG)
│   ├── icon.svg           # Source SVG
│   └── icon-*.png         # Generated PNGs
├── generate-icons.js      # Icon generator script
└── README.md              # This file
```

### Adding New Lessons

Edit `app.js` and modify the `generateLessonsFromScale()` function:

```javascript
generateLessonsFromScale(scale) {
    const scaleNotes = scale.map(n => n.replace(/[0-9]/g, ''));
    
    return [
        {
            title: "Custom Lesson",
            notes: [scaleNotes[0], scaleNotes[1], ...],
            description: "Your description"
        },
        // ... more lessons
    ];
}
```

### Regenerating Icons

```bash
# Generate placeholder icons
node generate-icons.js

# For production icons, use:
# - https://realfavicongenerator.net/
# - https://www.pwabuilder.com/imageGenerator
# - Or convert icons/icon.svg to PNG with proper tools
```

## Technical Details

### Pitch Detection Algorithm

The app uses autocorrelation-based pitch detection:

1. **Audio Capture**: getUserMedia with disabled echo cancellation/noise suppression
2. **Buffer Analysis**: 4096-sample buffer for good low-frequency resolution
3. **Autocorrelation**: Find the fundamental period
4. **Parabolic Interpolation**: Sub-sample accuracy
5. **Smoothing**: Median filter + exponential smoothing
6. **Note Mapping**: Convert frequency to note name + cents deviation

### AudioWorklet Mode

When supported, the app uses AudioWorklet for better performance:

- Pitch detection runs in a separate thread
- No blocking of the main UI thread
- Smoother animations and better responsiveness
- Automatic fallback to main thread if not supported

### iOS Safari Audio Handling

Special handling for iOS Safari quirks:

- User gesture required to start AudioContext
- Touch/click handlers to resume suspended contexts
- Specific audio constraints for iOS
- Reduced latency hint

## Roadmap

- [ ] Play-along audio (reference tones)
- [ ] Song library (traditional melodies)
- [ ] Breath detection
- [ ] Vibrato analysis
- [ ] Custom lesson builder
- [ ] Recording & playback
- [ ] Multi-player mode
- [ ] ml5.js CREPE model for better accuracy
- [ ] Sheet music display

## License

MIT License - Free for personal and commercial use.

## Credits

Built for Elliott's flute practice journey 🎻

---

**Version**: 0.1.0 (MVP)
**Last Updated**: February 2026
