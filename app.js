/**
 * NA Flute Learner - Main Application
 * Enhanced for iOS Safari with AudioWorklet support
 */

class FluteLearner {
    constructor() {
        this.audioContext = null;
        this.pitchDetector = null;
        this.currentLesson = 0;
        this.currentNoteIndex = 0;
        this.noteStartTime = null;
        this.noteAccuracies = [];
        this.lessonStartTime = null;
        this.isActive = false;
        this.mode = 'lesson'; // 'lesson' or 'tuner'
        this.debugCounter = 0;
        this.holdStartTime = null;
        this.holdRequired = 800;
        this.fluteKey = null;
        this.isListening = false;
        this.customScale = null;
        this.assessmentStep = 0;
        this.assessmentNotes = [];
        this.assessPhase = 'ready';
        this.assessDetectedNotes = [];
        this.assessTimer = null;
        
        // Profile management
        this.profiles = this.loadProfiles();
        this.activeFlute = null;
        
        // iOS detection
        this.isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
                     (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        
        // Current pitch (for AudioWorklet mode)
        this.currentPitch = null;
        
        // Note names for mapping
        this.noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        this.enharmonicMap = {
            'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#'
        };
        
        // Finger diagrams for 6-hole flute (2 rows of 3)
        this.fingerings = {
            0: [1,1,1,1,1,1],
            1: [1,1,1,1,1,0],
            2: [1,1,1,1,0,0],
            3: [1,1,1,0,0,0],
            4: [1,0,1,0,0,0],
            5: [0,0,1,0,0,0],
        };
        
        this.fingeringLabels = [
            'All holes covered (root)',
            'Lift bottom 1 hole (6)',
            'Lift bottom 2 holes (5,6)',
            'Lift bottom 3 holes (4,5,6)',
            'Lift bottom 3 + middle top (2,4,5,6)',
            'Lift top 2 + bottom 3 (only 3 closed)'
        ];

        // Scale types for NAF practice
        this.scaleTypes = {
            'pentatonic_minor': { name: 'Pentatonic Minor', intervals: [0, 3, 5, 7, 10, 12] },
            'pentatonic_major': { name: 'Pentatonic Major', intervals: [0, 2, 4, 7, 9, 12] },
            'blues':            { name: 'Blues', intervals: [0, 3, 5, 6, 7, 10, 12] },
            'natural_minor':    { name: 'Natural Minor', intervals: [0, 2, 3, 5, 7, 8, 10, 12] },
            'dorian':           { name: 'Dorian', intervals: [0, 2, 3, 5, 7, 9, 10, 12] },
            'mixolydian':       { name: 'Mixolydian', intervals: [0, 2, 4, 5, 7, 9, 10, 12] }
        };
        this.selectedScaleType = 'pentatonic_minor';

        // Fingerings by semitone offset from root (6-hole NAF)
        this.fingeringsBySemitone = {
            0:  { fingering: [1,1,1,1,1,1], label: 'All holes covered (root)', cross: false },
            2:  { fingering: [1,1,1,1,0,1], label: 'Cross-fingering (major 2nd)', cross: true },
            3:  { fingering: [1,1,1,1,1,0], label: 'Lift bottom hole (minor 3rd)', cross: false },
            4:  { fingering: [1,1,1,0,1,1], label: 'Cross-fingering (major 3rd)', cross: true },
            5:  { fingering: [1,1,1,1,0,0], label: 'Lift bottom 2 holes (4th)', cross: false },
            6:  { fingering: [1,1,0,1,0,0], label: 'Cross-fingering (tritone)', cross: true },
            7:  { fingering: [1,1,1,0,0,0], label: 'Lift bottom 3 holes (5th)', cross: false },
            8:  { fingering: [1,1,0,0,0,0], label: 'Cross-fingering (minor 6th)', cross: true },
            9:  { fingering: [1,0,0,0,0,0], label: 'Cross-fingering (major 6th)', cross: true },
            10: { fingering: [1,0,1,0,0,0], label: 'Lift hole 2 + bottom 3 (minor 7th)', cross: false },
            11: { fingering: [0,1,1,0,0,0], label: 'Cross-fingering (major 7th)', cross: true },
            12: { fingering: [0,0,1,0,0,0], label: 'Top 2 + bottom 3 open (octave)', cross: false }
        };

        // 5-hole mode (hides hole 3)
        this.fiveHoleMode = false;

        // Drone & reference tone
        this.droneOscillator = null;
        this.droneGain = null;
        this.droneActive = false;
        this.refToneOscillator = null;
        this.refToneGain = null;

        // Metronome
        this.metronomeInterval = null;
        this.metronomeBpm = 60;
        this.metronomeActive = false;

        // Song mode
        this.currentSong = null;

        // Lesson difficulty / gating
        this.lessonAccuracies = [];  // per-note averages for the whole lesson
        this.lessonCountdown = false;
        this.minNoteAccuracy = 60;   // minimum avg accuracy to accept a note
        this.minLessonAccuracy = 70; // minimum avg to advance to next lesson

        this.lessons = [];
        this.init();
    }
    
    // ===== PROFILE MANAGEMENT =====
    
    loadProfiles() {
        try {
            const stored = localStorage.getItem('naflute_profiles');
            return stored ? JSON.parse(stored) : { flutes: [], activeFluteId: null };
        } catch (e) {
            console.error('Failed to load profiles:', e);
            return { flutes: [], activeFluteId: null };
        }
    }
    
    saveProfiles() {
        try {
            localStorage.setItem('naflute_profiles', JSON.stringify(this.profiles));
        } catch (e) {
            console.error('Failed to save profiles:', e);
        }
    }
    
    saveFlute(name, key, scale) {
        const id = Date.now().toString();
        const flute = {
            id,
            name,
            key,
            scale,
            createdAt: new Date().toISOString()
        };
        this.profiles.flutes.push(flute);
        this.profiles.activeFluteId = id;
        this.saveProfiles();
        return flute;
    }
    
    deleteFlute(id) {
        this.profiles.flutes = this.profiles.flutes.filter(f => f.id !== id);
        if (this.profiles.activeFluteId === id) {
            this.profiles.activeFluteId = this.profiles.flutes[0]?.id || null;
        }
        this.saveProfiles();
    }
    
    setActiveFlute(id) {
        this.profiles.activeFluteId = id;
        this.saveProfiles();
        const flute = this.profiles.flutes.find(f => f.id === id);
        if (flute) {
            this.fluteKey = flute.key;
            this.customScale = flute.scale;
        }
    }
    
    getActiveFlute() {
        if (!this.profiles.activeFluteId) return null;
        return this.profiles.flutes.find(f => f.id === this.profiles.activeFluteId);
    }
    
    getFluteScale(key) {
        const fluteScales = {
            'G':  ['G4', 'A4', 'B4', 'C5', 'D5', 'E5'],
            'F#': ['F#4', 'G#4', 'A#4', 'B4', 'C#5', 'D#5'],
            'F':  ['F4', 'G4', 'A4', 'A#4', 'C5', 'D5'],
            'E':  ['E4', 'F#4', 'G#4', 'A4', 'B4', 'C#5'],
            'D':  ['D4', 'E4', 'F#4', 'G4', 'A4', 'B4'],
            'C#': ['C#4', 'D#4', 'F4', 'F#4', 'G#4', 'A#4'],
            'C':  ['C4', 'D4', 'E4', 'F4', 'G4', 'A4'],
            'A':  ['A4', 'B4', 'C#5', 'D5', 'E5', 'F#5'],
            'Bb': ['A#4', 'C#5', 'D#5', 'E5', 'G#5', 'A5'],
            'A#': ['A#4', 'C#5', 'D#5', 'E5', 'G#5', 'A5'],
            'D#': ['D#4', 'F4', 'G4', 'G#4', 'A#4', 'C5'],
            'Ab': ['G#4', 'A#4', 'C5', 'C#5', 'D#5', 'F5']
        };
        
        const normalizedKey = this.enharmonicMap[key] || key;
        return fluteScales[normalizedKey] || fluteScales['G'];
    }

    getScaleNotes(key, scaleType) {
        const type = this.scaleTypes[scaleType];
        if (!type) return this.getFluteScale(key);

        const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const normalizedKey = this.enharmonicMap[key] || key;
        const rootIndex = noteNames.indexOf(normalizedKey);
        if (rootIndex === -1) return this.getFluteScale(key);

        const baseOctave = rootIndex >= 9 ? 4 : 4; // A, A#, B start at 4
        return type.intervals.map(semitones => {
            const noteIndex = (rootIndex + semitones) % 12;
            const octaveOffset = Math.floor((rootIndex + semitones) / 12);
            return `${noteNames[noteIndex]}${baseOctave + octaveOffset}`;
        });
    }

    generateLessonsForKey(key) {
        const scale = this.getScaleNotes(key, this.selectedScaleType);
        if (!scale) return [];
        
        const scaleNotes = scale.map(n => n.replace(/[0-9]/g, ''));
        
        return [
            { title: "Lesson 1: Root Note", notes: [scaleNotes[0]], description: `Play ${scale[0]} - the root note (all holes covered)` },
            { title: "Lesson 2: Two Notes", notes: [scaleNotes[0], scaleNotes[1]], description: `Play ${scale[0]}, then ${scale[1]}` },
            { title: "Lesson 3: Three Notes", notes: [scaleNotes[0], scaleNotes[1], scaleNotes[2]], description: "Root, second, third note" },
            { title: "Lesson 4: First Four Notes", notes: [scaleNotes[0], scaleNotes[1], scaleNotes[2], scaleNotes[3]], description: "Play up the first four notes" },
            { title: "Lesson 5: Five Note Scale", notes: [scaleNotes[0], scaleNotes[1], scaleNotes[2], scaleNotes[3], scaleNotes[4]], description: "Play up the scale" },
            { title: "Lesson 6: Scale Down", notes: [scaleNotes[4], scaleNotes[3], scaleNotes[2], scaleNotes[1], scaleNotes[0]], description: "Play down the scale" },
            { title: "Lesson 7: Simple Melody", notes: [scaleNotes[0], scaleNotes[1], scaleNotes[2], scaleNotes[1], scaleNotes[0]], description: "Up and back down" },
            { title: "Lesson 8: Full Range", notes: [scaleNotes[0], scaleNotes[1], scaleNotes[2], scaleNotes[3], scaleNotes[4], scaleNotes[3], scaleNotes[2], scaleNotes[1], scaleNotes[0]], description: "Up and down the full range" }
        ];
    }

    async init() {
        this.elements = {
            permissionScreen: document.getElementById('permissionScreen'),
            appMain: document.getElementById('appMain'),
            startBtn: document.getElementById('startBtn'),
            resetBtn: document.getElementById('resetBtn'),
            nextLessonBtn: document.getElementById('nextLessonBtn'),
            lessonTitle: document.getElementById('lessonTitle'),
            noteSequence: document.getElementById('noteSequence'),
            targetNote: document.getElementById('targetNote'),
            currentNote: document.getElementById('currentNote'),
            frequency: document.getElementById('frequency'),
            needle: document.getElementById('needle'),
            centsDisplay: document.getElementById('centsDisplay'),
            accuracyMeter: document.getElementById('accuracyMeter'),
            accuracyValue: document.getElementById('accuracyValue'),
            completionModal: document.getElementById('completionModal'),
            statAccuracy: document.getElementById('statAccuracy'),
            statTime: document.getElementById('statTime'),
            continueBtn: document.getElementById('continueBtn'),
            tunerMode: document.getElementById('tunerMode'),
            modeToggle: document.getElementById('modeToggle'),
            lessonModeBtn: document.getElementById('lessonModeBtn'),
            tunerModeBtn: document.getElementById('tunerModeBtn'),
            tunerNote: document.getElementById('tunerNote'),
            tunerFrequency: document.getElementById('tunerFrequency'),
            tunerNeedle: document.getElementById('tunerNeedle'),
            tunerCents: document.getElementById('tunerCents'),
            holdIndicator: document.getElementById('holdIndicator'),
            holdBar: document.getElementById('holdBar'),
            holdText: document.getElementById('holdText'),
            fluteKeySelect: document.getElementById('fluteKeySelect'),
            assessFluteBtn: document.getElementById('assessFluteBtn'),
            assessmentMode: document.getElementById('assessmentMode'),
            assessDetectedNote: document.getElementById('assessDetectedNote'),
            assessDetectedFreq: document.getElementById('assessDetectedFreq'),
            assessHint: document.getElementById('assessHint'),
            assessCaptureBtn: document.getElementById('assessCaptureBtn'),
            assessSkipBtn: document.getElementById('assessSkipBtn'),
            assessBackBtn: document.getElementById('assessBackBtn'),
            assessDoneBtn: document.getElementById('assessDoneBtn'),
            capturedNotes: document.getElementById('capturedNotes'),
            fingerDiagram: document.getElementById('fingerDiagram'),
            fingerDiagramContainer: document.getElementById('fingerDiagramContainer'),
            fingeringLabel: document.getElementById('fingeringLabel'),
            scaleTypeSelect: document.getElementById('scaleTypeSelect'),
            fiveHoleToggle: document.getElementById('fiveHoleToggle'),
            scaleLabel: document.getElementById('scaleLabel'),
            songLibrary: document.getElementById('songLibrary'),
            songModeBtn: document.getElementById('songModeBtn'),
            droneBtn: document.getElementById('droneBtn'),
            refToneBtn: document.getElementById('refToneBtn'),
            metronomeBtn: document.getElementById('metronomeBtn'),
            bpmDisplay: document.getElementById('bpmDisplay'),
            bpmDown: document.getElementById('bpmDown'),
            bpmUp: document.getElementById('bpmUp'),
            holdTimeSlider: document.getElementById('holdTimeSlider'),
            holdTimeDisplay: document.getElementById('holdTimeDisplay'),
            practiceTools: document.getElementById('practiceTools')
        };

        // Event listeners (with iOS touch support)
        if (this.elements.startBtn) {
            this.elements.startBtn.addEventListener('click', () => this.start());
            this.elements.startBtn.addEventListener('touchend', (e) => { e.preventDefault(); this.start(); });
        }
        if (this.elements.assessFluteBtn) {
            this.elements.assessFluteBtn.addEventListener('click', () => this.startAssessment());
            this.elements.assessFluteBtn.addEventListener('touchend', (e) => { e.preventDefault(); this.startAssessment(); });
        }
        if (this.elements.backToSetupBtn) {
            this.elements.backToSetupBtn.addEventListener('click', () => this.backToSetup());
        }
        if (this.elements.resetBtn) {
            this.elements.resetBtn.addEventListener('click', () => this.resetLesson());
        }
        if (this.elements.nextLessonBtn) {
            this.elements.nextLessonBtn.addEventListener('click', () => this.nextLesson());
        }
        if (this.elements.continueBtn) {
            this.elements.continueBtn.addEventListener('click', () => this.closeCompletionModal());
        }
        if (this.elements.lessonModeBtn) {
            this.elements.lessonModeBtn.addEventListener('click', () => this.setMode('lesson'));
        }
        if (this.elements.tunerModeBtn) {
            this.elements.tunerModeBtn.addEventListener('click', () => this.setMode('tuner'));
        }
        if (this.elements.songModeBtn) {
            this.elements.songModeBtn.addEventListener('click', () => this.setMode('songs'));
        }
        
        // 5-hole toggle
        if (this.elements.fiveHoleToggle) {
            this.elements.fiveHoleToggle.addEventListener('change', (e) => {
                this.fiveHoleMode = e.target.checked;
            });
        }

        // Drone toggle
        if (this.elements.droneBtn) {
            this.elements.droneBtn.addEventListener('click', () => this.toggleDrone());
        }

        // Reference tone (play target note)
        if (this.elements.refToneBtn) {
            this.elements.refToneBtn.addEventListener('click', () => {
                const lesson = this.lessons[this.currentLesson];
                if (lesson) this.playReferenceTone(lesson.notes[this.currentNoteIndex]);
            });
        }

        // Metronome
        if (this.elements.metronomeBtn) {
            this.elements.metronomeBtn.addEventListener('click', () => this.toggleMetronome());
        }
        if (this.elements.bpmDown) {
            this.elements.bpmDown.addEventListener('click', () => this.setMetronomeBpm(this.metronomeBpm - 5));
        }
        if (this.elements.bpmUp) {
            this.elements.bpmUp.addEventListener('click', () => this.setMetronomeBpm(this.metronomeBpm + 5));
        }

        // Hold time slider
        if (this.elements.holdTimeSlider) {
            this.elements.holdTimeSlider.addEventListener('input', (e) => {
                this.setHoldTime(parseInt(e.target.value));
            });
        }

        // Assessment buttons
        if (this.elements.assessCaptureBtn) {
            this.elements.assessCaptureBtn.addEventListener('click', () => this.onConfirmClick());
        }
        if (this.elements.assessSkipBtn) {
            this.elements.assessSkipBtn.addEventListener('click', () => this.onSkipClick());
        }
        if (this.elements.assessBackBtn) {
            this.elements.assessBackBtn.addEventListener('click', () => this.backToSetup());
        }
        if (this.elements.assessDoneBtn) {
            this.elements.assessDoneBtn.addEventListener('click', () => this.finishAssessment());
        }

        this.loadProgress();
        this.updateFluteSelector();
    }
    
    updateFluteSelector() {
        // Check if there's a saved flutes section, if not create it
        let savedSection = document.getElementById('savedFlutesSection');
        if (!savedSection && this.profiles.flutes.length > 0) {
            // Create the saved flutes section
            savedSection = document.createElement('div');
            savedSection.id = 'savedFlutesSection';
            savedSection.className = 'setup-section';
            savedSection.innerHTML = `
                <h3>Your Flutes</h3>
                <div class="saved-flutes-list" id="savedFlutesList"></div>
            `;
            
            // Insert after the first setup-section
            const firstSection = this.elements.permissionScreen.querySelector('.setup-section');
            if (firstSection) {
                firstSection.parentNode.insertBefore(savedSection, firstSection.nextSibling);
            }
        }
        
        if (savedSection) {
            const listEl = document.getElementById('savedFlutesList');
            if (listEl) {
                listEl.innerHTML = this.profiles.flutes.map(flute => `
                    <div class="saved-flute-item" data-id="${flute.id}">
                        <span class="flute-name">${flute.name}</span>
                        <span class="flute-key">${flute.key}</span>
                        <button class="flute-play-btn" data-id="${flute.id}">▶ Play</button>
                        <button class="flute-delete-btn" data-id="${flute.id}">🗑</button>
                    </div>
                `).join('');
                
                // Add event listeners (both click and touch for iOS compatibility)
                listEl.querySelectorAll('.flute-play-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.preventDefault();
                        const id = e.target.dataset.id;
                        this.loadSavedFlute(id);
                    });
                    btn.addEventListener('touchend', (e) => {
                        e.preventDefault();
                        const id = e.target.dataset.id;
                        this.loadSavedFlute(id);
                    });
                });
                
                listEl.querySelectorAll('.flute-delete-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.preventDefault();
                        const id = e.target.dataset.id;
                        if (confirm('Delete this flute?')) {
                            this.deleteFlute(id);
                            this.updateFluteSelector();
                        }
                    });
                    btn.addEventListener('touchend', (e) => {
                        e.preventDefault();
                        const id = e.target.dataset.id;
                        if (confirm('Delete this flute?')) {
                            this.deleteFlute(id);
                            this.updateFluteSelector();
                        }
                    });
                });
            }
            
            savedSection.style.display = this.profiles.flutes.length > 0 ? 'block' : 'none';
        }
    }
    
    async loadSavedFlute(id) {
        const flute = this.profiles.flutes.find(f => f.id === id);
        if (!flute) return;
        
        this.setActiveFlute(id);
        this.activeFlute = flute;
        this.fluteKey = flute.key;
        this.customScale = flute.scale;
        
        // Initialize audio if needed
        if (!this.audioContext) {
            const success = await this.initAudio();
            if (!success) return;
        }
        
        this.lessons = this.generateLessonsFromScale(flute.scale);
        
        this.elements.permissionScreen.style.display = 'none';
        this.elements.appMain.style.display = 'block';
        this.elements.modeToggle.style.display = 'flex';
        this.isActive = true;
        this.mode = 'lesson';
        this.loadLesson(this.currentLesson);
        
        if (!this.isListening) {
            this.startListening();
        }
    }

    async start() {
        this.fluteKey = this.elements.fluteKeySelect.value;
        if (!this.fluteKey) {
            this.elements.fluteKeySelect.style.borderColor = '#f44336';
            this.elements.fluteKeySelect.focus();
            alert('Please select a flute key first');
            return;
        }

        // Read scale type selection
        if (this.elements.scaleTypeSelect) {
            this.selectedScaleType = this.elements.scaleTypeSelect.value || 'pentatonic_minor';
        }

        this.elements.fluteKeySelect.style.borderColor = '';
        this.elements.startBtn.textContent = 'Starting...';
        this.elements.startBtn.disabled = true;

        try {
            this.lessons = this.generateLessonsForKey(this.fluteKey);
            console.log(`🎵 Generated lessons for ${this.fluteKey} flute:`, this.lessons);

            if (!this.audioContext) {
                this.elements.startBtn.textContent = 'Requesting mic...';
                const success = await this.initAudio();
                if (!success) {
                    this.elements.startBtn.textContent = 'Start Lessons →';
                    this.elements.startBtn.disabled = false;
                    alert('Could not access microphone. Check Safari settings.');
                    return;
                }
            }

            this.elements.permissionScreen.style.display = 'none';
            this.elements.appMain.style.display = 'block';
            this.elements.modeToggle.style.display = 'flex';
            this.isActive = true;
            this.mode = 'lesson';
            this.loadLesson(this.currentLesson);
            
            if (!this.isListening) {
                this.startListening();
            }
        } catch (err) {
            console.error('Start error:', err);
            this.elements.startBtn.textContent = 'Start Lessons →';
            this.elements.startBtn.disabled = false;
            alert('Error: ' + err.message);
        }
    }

    async initAudio() {
        try {
            // iOS Safari AudioContext setup
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            this.audioContext = new AudioContextClass({
                latencyHint: 'interactive',
                sampleRate: 44100
            });
            
            console.log(`🎤 AudioContext created, state: ${this.audioContext.state}`);
            
            // iOS requires user gesture to resume
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
                console.log('🎤 AudioContext resumed');
            }

            this.pitchDetector = new PitchDetector(this.audioContext);
            
            // Set callback for AudioWorklet mode
            this.pitchDetector.setOnPitch((pitch) => {
                this.currentPitch = pitch;
            });
            
            const success = await this.pitchDetector.init();
            
            if (success) {
                console.log('🎤 Microphone initialized successfully');
                console.log(`🎤 Using AudioWorklet: ${this.pitchDetector.isUsingWorklet()}`);
                return true;
            } else {
                console.error('🎤 pitchDetector.init() returned false');
                return false;
            }
        } catch (err) {
            console.error('Failed to initialize audio:', err);
            alert('Microphone error: ' + err.message);
            return false;
        }
    }

    backToSetup() {
        if (this.assessTimer) {
            clearTimeout(this.assessTimer);
            this.assessTimer = null;
        }
        this.elements.tunerMode.style.display = 'none';
        this.elements.assessmentMode.style.display = 'none';
        this.elements.permissionScreen.style.display = 'flex';
    }

    // ===== ASSESSMENT MODE =====

    async startAssessment() {
        console.log('🎯 startAssessment called');
        this.elements.assessFluteBtn.textContent = 'Starting...';
        this.elements.assessFluteBtn.disabled = true;

        try {
            if (!this.audioContext) {
                console.log('🎤 Initializing audio...');
                const success = await this.initAudio();
                if (!success) {
                    this.elements.assessFluteBtn.textContent = '🎯 Assess My Flute (Recommended)';
                    this.elements.assessFluteBtn.disabled = false;
                    alert('Could not access microphone. Please allow microphone permission.');
                    return;
                }
            }

            console.log('✅ Audio ready');
            this.elements.permissionScreen.style.display = 'none';
            this.elements.assessmentMode.style.display = 'block';
            this.isActive = true;
            this.mode = 'assessment';
            this.assessmentStep = 0;
            this.assessmentNotes = [];
            this.assessPhase = 'ready';
            
            this.updateCapturedNotes();
            
            if (!this.isListening) {
                console.log('🎧 Starting listening loop...');
                this.startListening();
            }
            
            setTimeout(() => this.beginNoteCapture(), 500);
        } catch (err) {
            console.error('Assessment error:', err);
            this.elements.assessFluteBtn.textContent = '🎯 Assess My Flute (Recommended)';
            this.elements.assessFluteBtn.disabled = false;
            alert('Error starting assessment: ' + err.message);
        }
    }

    beginNoteCapture() {
        console.log(`📍 beginNoteCapture for step ${this.assessmentStep}`);
        
        if (this.assessmentStep >= 6) {
            this.showAssessmentComplete();
            return;
        }
        
        const hints = [
            'Cover all holes',
            'Lift the bottom hole',
            'Lift the bottom two holes',
            'Lift the bottom three holes',
            'Lift the bottom four holes',
            'Open all holes (octave)'
        ];
        
        const hint = hints[this.assessmentStep];
        this.assessPhase = 'countdown';
        this.assessDetectedNotes = [];
        
        this.elements.assessHint.textContent = `${hint} - Starting in 3...`;
        this.elements.assessCaptureBtn.textContent = 'Waiting...';
        this.elements.assessCaptureBtn.disabled = true;
        
        let countdown = 3;
        this.assessTimer = setInterval(() => {
            countdown--;
            if (countdown > 0) {
                this.elements.assessHint.textContent = `${hint} - Starting in ${countdown}...`;
            } else {
                clearInterval(this.assessTimer);
                this.beginListening(hint);
            }
        }, 1000);
    }

    beginListening(hint) {
        console.log('🎧 beginListening - NOW PLAY!');
        this.assessPhase = 'listening';
        this.elements.assessHint.textContent = `🎧 PLAY NOW! (${hint})`;
        this.elements.assessCaptureBtn.textContent = '🎧 Listening (5 seconds)...';
        
        this.assessTimer = setTimeout(() => {
            this.finishListening();
        }, 5000);
    }

    finishListening() {
        console.log(`⏰ finishListening - detected ${this.assessDetectedNotes.length} samples`);
        this.assessPhase = 'confirm';
        
        if (this.assessDetectedNotes.length === 0) {
            this.elements.assessHint.textContent = '❌ No note detected. Click Retry or Skip.';
            this.elements.assessCaptureBtn.textContent = '↺ Retry';
            this.elements.assessCaptureBtn.disabled = false;
            this.elements.assessSkipBtn.textContent = 'Skip Note';
            return;
        }

        const noteCounts = {};
        this.assessDetectedNotes.forEach(n => {
            noteCounts[n.note] = (noteCounts[n.note] || 0) + 1;
        });
        
        console.log('📊 Note counts:', noteCounts);
        
        const mostCommon = Object.entries(noteCounts).sort((a, b) => b[1] - a[1])[0];
        const avgFreq = this.assessDetectedNotes
            .filter(n => n.note === mostCommon[0])
            .reduce((sum, n) => sum + n.frequency, 0) / mostCommon[1];

        this.assessPendingNote = {
            note: mostCommon[0],
            frequency: Math.round(avgFreq * 10) / 10
        };

        console.log(`🎵 Detected: ${this.assessPendingNote.note} @ ${this.assessPendingNote.frequency}Hz`);
        
        this.elements.assessHint.textContent = `Detected: ${this.assessPendingNote.note} (${this.assessPendingNote.frequency} Hz)`;
        this.elements.assessCaptureBtn.textContent = '✓ Yes, Next Note';
        this.elements.assessCaptureBtn.disabled = false;
        this.elements.assessSkipBtn.textContent = '↺ Retry';
    }

    onConfirmClick() {
        console.log(`🖱️ onConfirmClick - phase: ${this.assessPhase}`);
        
        if (this.assessPhase === 'confirm') {
            if (this.assessPendingNote) {
                console.log(`💾 Saving note: ${this.assessPendingNote.note}`);
                this.assessmentNotes.push(this.assessPendingNote);
                this.assessPendingNote = null;
            }
            
            this.assessmentStep++;
            this.updateCapturedNotes();
            
            if (this.assessmentStep >= 6) {
                this.showAssessmentComplete();
            } else {
                this.beginNoteCapture();
            }
        } else if (this.assessPhase === 'countdown' || this.assessPhase === 'listening') {
            console.log('⚠️ Button should be disabled');
        } else {
            this.beginNoteCapture();
        }
    }

    onSkipClick() {
        console.log(`🖱️ onSkipClick - phase: ${this.assessPhase}`);
        
        if (this.assessPhase === 'confirm') {
            this.beginNoteCapture();
        } else {
            this.assessmentNotes.push({ note: '—', frequency: 0, skipped: true });
            this.assessmentStep++;
            this.updateCapturedNotes();
            
            if (this.assessmentStep >= 6) {
                this.showAssessmentComplete();
            } else {
                this.beginNoteCapture();
            }
        }
    }

    showAssessmentComplete() {
        console.log('🎉 Assessment complete!');
        this.assessPhase = 'done';
        this.elements.assessHint.textContent = '🎉 Assessment complete! Click "Save & Start Learning" to continue.';
        this.elements.assessCaptureBtn.style.display = 'none';
        this.elements.assessSkipBtn.style.display = 'none';
        this.elements.assessDoneBtn.style.display = 'inline-block';
    }

    updateCapturedNotes() {
        console.log(`📋 updateCapturedNotes: ${this.assessmentNotes.length} notes`);
        
        if (this.assessmentNotes.length === 0) {
            this.elements.capturedNotes.innerHTML = '<span style="color: var(--text-secondary);">No notes captured yet</span>';
            return;
        }

        this.elements.capturedNotes.innerHTML = this.assessmentNotes.map((note, i) => `
            <div class="captured-note-box">
                <div class="note-name">${note.note}</div>
                <div class="note-hz">${note.frequency > 0 ? note.frequency + ' Hz' : 'skipped'}</div>
            </div>
        `).join('');
        
        if (this.assessmentNotes.length >= 5) {
            this.elements.assessDoneBtn.style.display = 'inline-block';
        }
    }

    finishAssessment() {
        const capturedScale = this.assessmentNotes.filter(n => !n.skipped).map(n => n.note);

        console.log('🎵 Captured flute scale:', capturedScale);

        if (capturedScale.length < 5) {
            alert('Need at least 5 notes to continue. Please try the assessment again.');
            return;
        }

        // Prompt for flute name
        const defaultName = `My ${capturedScale[0].replace(/[0-9]/g, '')} Flute`;
        const fluteName = prompt('Name this flute:', defaultName) || defaultName;

        // Detect key from root note
        const rootNote = capturedScale[0].replace(/[0-9]/g, '');
        
        // Save the flute
        const savedFlute = this.saveFlute(fluteName, rootNote, capturedScale);
        this.activeFlute = savedFlute;
        this.customScale = capturedScale;

        this.lessons = this.generateLessonsFromScale(capturedScale);

        this.elements.assessmentMode.style.display = 'none';
        this.elements.appMain.style.display = 'block';
        this.elements.modeToggle.style.display = 'flex';
        this.mode = 'lesson';
        this.loadLesson(this.currentLesson);
        
        // Update the UI to show saved flutes
        this.updateFluteSelector();
    }

    generateLessonsFromScale(scale) {
        const scaleNotes = scale.map(n => n.replace(/[0-9]/g, ''));
        const len = scaleNotes.length;

        console.log('📝 Generating lessons for scale:', scaleNotes);

        const lessons = [
            { title: 'Lesson 1: Root Note', notes: [scaleNotes[0]], description: 'Play the root note' }
        ];

        // Build-up lessons: add one note at a time (up to 6 build-up lessons)
        const maxBuildUp = Math.min(len, 6);
        for (let i = 2; i <= maxBuildUp; i++) {
            lessons.push({
                title: `Lesson ${lessons.length + 1}: ${i} Notes Up`,
                notes: scaleNotes.slice(0, i),
                description: `Play the first ${i} notes ascending`
            });
        }

        // Full scale up (if we didn't already cover all notes)
        if (len > maxBuildUp) {
            lessons.push({
                title: `Lesson ${lessons.length + 1}: Full Scale Up`,
                notes: [...scaleNotes],
                description: 'Play the entire scale ascending'
            });
        }

        // Scale down
        lessons.push({
            title: `Lesson ${lessons.length + 1}: Scale Down`,
            notes: [...scaleNotes].reverse(),
            description: 'Play the scale descending'
        });

        // Simple melody
        lessons.push({
            title: `Lesson ${lessons.length + 1}: Simple Melody`,
            notes: [scaleNotes[0], scaleNotes[1], scaleNotes[2], scaleNotes[1], scaleNotes[0]],
            description: 'Up and back down'
        });

        // Full range up and down
        lessons.push({
            title: `Lesson ${lessons.length + 1}: Full Range`,
            notes: [...scaleNotes, ...scaleNotes.slice(0, -1).reverse()],
            description: 'Up and down the full scale'
        });

        return lessons;
    }

    loadLesson(index) {
        const lesson = this.lessons[index];
        if (!lesson) {
            this.currentLesson = 0;
            this.loadLesson(0);
            return;
        }

        this.currentNoteIndex = 0;
        this.noteAccuracies = [];
        this.lessonAccuracies = [];
        this.lessonCountdown = true;

        this.elements.lessonTitle.textContent = lesson.title;
        this.elements.targetNote.textContent = '...';

        // Always show finger diagram
        if (this.elements.fingerDiagramContainer) {
            this.elements.fingerDiagramContainer.style.display = 'flex';
        }

        this.updateFingerDiagram(lesson.notes[0]);

        // Show scale type label
        if (this.elements.scaleLabel) {
            const scaleType = this.scaleTypes[this.selectedScaleType];
            const keyName = this.fluteKey || '';
            this.elements.scaleLabel.textContent = keyName && scaleType ? `${keyName} ${scaleType.name}` : '';
        }

        this.elements.noteSequence.innerHTML = lesson.notes.map((note, i) => {
            let className = 'note-box';
            if (i === 0) className += ' current';
            else className += ' upcoming';
            return `<div class="note-box ${className}" data-index="${i}">${note}</div>`;
        }).join('');

        this.elements.nextLessonBtn.style.display = 'none';
        this.elements.resetBtn.style.display = 'inline-block';

        // Countdown before first note
        this.runLessonCountdown(lesson);
    }

    runLessonCountdown(lesson) {
        this.lessonCountdown = true;
        let count = 3;

        const countdownEl = document.getElementById('lessonCountdown');
        if (countdownEl) {
            countdownEl.style.display = 'flex';
            countdownEl.textContent = count;
        }

        const tick = setInterval(() => {
            count--;
            if (count > 0) {
                if (countdownEl) countdownEl.textContent = count;
            } else {
                clearInterval(tick);
                if (countdownEl) countdownEl.style.display = 'none';
                this.lessonCountdown = false;
                this.lessonStartTime = Date.now();
                this.elements.targetNote.textContent = lesson.notes[0];
            }
        }, 1000);
    }

    updateFingerDiagram(noteName) {
        if (!this.elements.fingerDiagram) return;

        const allNoteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const rootKey = this.enharmonicMap[this.fluteKey] || this.fluteKey;
        const cleanNote = this.enharmonicMap[noteName] || noteName;
        const rootIdx = allNoteNames.indexOf(rootKey);
        const noteIdx = allNoteNames.indexOf(cleanNote);

        if (rootIdx === -1 || noteIdx === -1) return;

        const semitones = (noteIdx - rootIdx + 12) % 12;
        const fingeringData = this.fingeringsBySemitone[semitones];
        if (!fingeringData) return;

        const holes = this.elements.fingerDiagram.querySelectorAll('.hole');
        holes.forEach((hole, i) => {
            // In 5-hole mode, hole 3 (index 2) is tied off
            if (this.fiveHoleMode && i === 2) {
                hole.classList.add('tied');
                hole.classList.remove('open', 'cross');
                hole.textContent = '—';
                return;
            }
            hole.classList.remove('tied', 'cross');
            if (fingeringData.fingering[i] === 1) {
                hole.classList.remove('open');
                hole.textContent = '●';
            } else {
                hole.classList.add('open');
                hole.textContent = '○';
            }
        });

        if (this.elements.fingeringLabel) {
            this.elements.fingeringLabel.textContent = fingeringData.label;
            if (fingeringData.cross) {
                this.elements.fingeringLabel.classList.add('cross-fingering');
            } else {
                this.elements.fingeringLabel.classList.remove('cross-fingering');
            }
        }
    }

    // ===== DRONE & REFERENCE TONES =====

    toggleDrone() {
        if (!this.audioContext) return;

        if (this.droneActive) {
            this.stopDrone();
        } else {
            this.startDrone();
        }
    }

    startDrone() {
        if (!this.audioContext || !this.fluteKey) return;

        const rootFreq = this.pitchDetector.noteToFrequency(
            (this.enharmonicMap[this.fluteKey] || this.fluteKey) + '4'
        );
        if (!rootFreq) return;

        this.droneOscillator = this.audioContext.createOscillator();
        this.droneGain = this.audioContext.createGainNode();
        this.droneOscillator.type = 'sine';
        this.droneOscillator.frequency.setValueAtTime(rootFreq, this.audioContext.currentTime);
        this.droneGain.gain.setValueAtTime(0, this.audioContext.currentTime);
        this.droneGain.gain.linearRampToValueAtTime(0.15, this.audioContext.currentTime + 0.5);

        this.droneOscillator.connect(this.droneGain);
        this.droneGain.connect(this.audioContext.destination);
        this.droneOscillator.start();
        this.droneActive = true;

        if (this.elements.droneBtn) {
            this.elements.droneBtn.textContent = 'Drone ON';
            this.elements.droneBtn.classList.add('active');
        }
    }

    stopDrone() {
        if (this.droneGain) {
            this.droneGain.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + 0.3);
        }
        setTimeout(() => {
            if (this.droneOscillator) {
                try { this.droneOscillator.stop(); } catch (e) {}
                this.droneOscillator = null;
            }
            this.droneGain = null;
        }, 400);
        this.droneActive = false;

        if (this.elements.droneBtn) {
            this.elements.droneBtn.textContent = 'Drone OFF';
            this.elements.droneBtn.classList.remove('active');
        }
    }

    playReferenceTone(noteName) {
        if (!this.audioContext) return;

        // Stop previous reference tone
        if (this.refToneOscillator) {
            try { this.refToneOscillator.stop(); } catch (e) {}
        }

        const freq = this.pitchDetector.noteToFrequency(
            noteName + (noteName.match(/\d/) ? '' : '4')
        );
        if (!freq) return;

        this.refToneOscillator = this.audioContext.createOscillator();
        this.refToneGain = this.audioContext.createGainNode();
        this.refToneOscillator.type = 'sine';
        this.refToneOscillator.frequency.setValueAtTime(freq, this.audioContext.currentTime);
        this.refToneGain.gain.setValueAtTime(0.2, this.audioContext.currentTime);
        this.refToneGain.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + 1.5);

        this.refToneOscillator.connect(this.refToneGain);
        this.refToneGain.connect(this.audioContext.destination);
        this.refToneOscillator.start();
        this.refToneOscillator.stop(this.audioContext.currentTime + 1.5);
    }

    // ===== METRONOME =====

    toggleMetronome() {
        if (this.metronomeActive) {
            this.stopMetronome();
        } else {
            this.startMetronome();
        }
    }

    startMetronome() {
        if (!this.audioContext) return;

        this.metronomeActive = true;
        this.playMetronomeTick();

        const intervalMs = 60000 / this.metronomeBpm;
        this.metronomeInterval = setInterval(() => {
            this.playMetronomeTick();
        }, intervalMs);

        if (this.elements.metronomeBtn) {
            this.elements.metronomeBtn.classList.add('active');
        }
    }

    stopMetronome() {
        this.metronomeActive = false;
        if (this.metronomeInterval) {
            clearInterval(this.metronomeInterval);
            this.metronomeInterval = null;
        }
        if (this.elements.metronomeBtn) {
            this.elements.metronomeBtn.classList.remove('active');
        }
    }

    playMetronomeTick() {
        if (!this.audioContext) return;
        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGainNode();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, this.audioContext.currentTime);
        gain.gain.setValueAtTime(0.3, this.audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.08);
        osc.connect(gain);
        gain.connect(this.audioContext.destination);
        osc.start();
        osc.stop(this.audioContext.currentTime + 0.08);
    }

    setMetronomeBpm(bpm) {
        this.metronomeBpm = Math.max(30, Math.min(200, bpm));
        if (this.elements.bpmDisplay) {
            this.elements.bpmDisplay.textContent = `${this.metronomeBpm} BPM`;
        }
        // Restart if active to apply new tempo
        if (this.metronomeActive) {
            this.stopMetronome();
            this.startMetronome();
        }
    }

    setHoldTime(ms) {
        this.holdRequired = Math.max(300, Math.min(2000, ms));
        if (this.elements.holdTimeDisplay) {
            this.elements.holdTimeDisplay.textContent = `${(this.holdRequired / 1000).toFixed(1)}s`;
        }
    }

    // ===== SONG LIBRARY =====

    getSongLibrary() {
        // Songs use scale degree numbers (1-based index into pentatonic minor)
        // 1=root, 2=minor 3rd, 3=4th, 4=5th, 5=minor 7th, 6=octave
        // durations: 1=quarter, 2=half, 4=whole (multiplier for hold time)
        return [
            {
                id: 'first_steps',
                title: 'First Steps',
                difficulty: 'beginner',
                description: 'Simple ascending and descending pattern',
                degrees:    [1,2,3,2,1, 1,2,3,4,3,2,1],
                durations:  [2,2,2,2,4, 1,1,1,1,1,1,4]
            },
            {
                id: 'morning_song',
                title: 'Morning Song',
                difficulty: 'beginner',
                description: 'Gentle call using three notes',
                degrees:    [1,1,2,1, 2,3,2,1, 1,2,3,2,1,1],
                durations:  [2,1,1,4, 1,1,1,4, 1,1,2,1,1,4]
            },
            {
                id: 'wind_call',
                title: 'Wind Call',
                difficulty: 'beginner',
                description: 'A simple breathy melody',
                degrees:    [1,3,2,1, 1,3,4,3, 2,1,1],
                durations:  [2,1,1,4, 2,1,1,4, 1,1,4]
            },
            {
                id: 'river_walk',
                title: 'River Walk',
                difficulty: 'intermediate',
                description: 'Flowing melody across the full scale',
                degrees:    [1,2,3,4,5, 4,3,2,1, 2,3,4,3, 2,1],
                durations:  [1,1,1,1,2, 1,1,1,4, 1,1,2,1, 1,4]
            },
            {
                id: 'canyon_echo',
                title: 'Canyon Echo',
                difficulty: 'intermediate',
                description: 'Call and response with leaps',
                degrees:    [1,3,5, 5,3,1, 2,4,5, 4,2,1],
                durations:  [1,1,4, 1,1,4, 1,1,4, 1,1,4]
            },
            {
                id: 'moonrise',
                title: 'Moonrise',
                difficulty: 'intermediate',
                description: 'Ascending melody with gentle descent',
                degrees:    [1,2,3,4,5,6, 5,4,3,2, 3,4,3,2,1],
                durations:  [1,1,1,1,1,4, 1,1,1,4, 1,1,1,1,4]
            },
            {
                id: 'hawk_flight',
                title: 'Hawk Flight',
                difficulty: 'intermediate',
                description: 'Soaring melody with wide intervals',
                degrees:    [1,4,5,4,1, 2,5,4,3, 1,3,5,6,5,3,1],
                durations:  [1,1,2,1,4, 1,2,1,4, 1,1,1,2,1,1,4]
            },
            {
                id: 'cedar_song',
                title: 'Cedar Song',
                difficulty: 'intermediate',
                description: 'Traditional-style pentatonic melody',
                degrees:    [3,2,1,2,3, 4,3,2,1, 3,4,5,4,3,2,1],
                durations:  [1,1,2,1,2, 1,1,1,4, 1,1,2,1,1,1,4]
            },
            {
                id: 'stars_above',
                title: 'Stars Above',
                difficulty: 'advanced',
                description: 'Extended melody with full range',
                degrees:    [1,2,3,4,5,6, 5,4,3,2,1, 2,4,6,5,3,1, 1,3,5,6,5,4,3,2,1],
                durations:  [1,1,1,1,1,4, 1,1,1,1,4, 1,1,2,1,1,4, 1,1,1,2,1,1,1,1,4]
            },
            {
                id: 'thunder_dance',
                title: 'Thunder Dance',
                difficulty: 'advanced',
                description: 'Rhythmic pattern with repeated notes',
                degrees:    [1,1,3,3,1,1, 4,4,5,4,3, 1,1,3,5,5,3,1, 2,4,5,6,5,4,3,2,1],
                durations:  [1,1,1,1,1,2, 1,1,2,1,4, 1,1,1,1,1,1,4, 1,1,1,2,1,1,1,1,4]
            },
            {
                id: 'water_prayer',
                title: 'Water Prayer',
                difficulty: 'advanced',
                description: 'Meditative flowing melody',
                degrees:    [1,2,1,3,2, 3,4,3,5,4, 5,6,5,4,3, 4,3,2,1,2,1],
                durations:  [2,1,2,1,4, 2,1,2,1,4, 2,1,2,1,4, 1,1,1,2,1,4]
            },
            {
                id: 'eagle_spirit',
                title: 'Eagle Spirit',
                difficulty: 'advanced',
                description: 'Full range with dramatic leaps',
                degrees:    [1,5,6,5,1, 3,5,4,3,2, 1,4,5,6,5,4,3, 5,3,1,2,1],
                durations:  [1,1,2,1,4, 1,2,1,1,4, 1,1,1,2,1,1,4, 1,1,2,1,4]
            }
        ];
    }

    songDegreesToNotes(degrees) {
        // Convert scale degree numbers to actual note names for the current flute
        const scale = this.getScaleNotes(this.fluteKey, 'pentatonic_minor');
        const scaleNotes = scale.map(n => n.replace(/[0-9]/g, ''));
        return degrees.map(d => scaleNotes[Math.min(d - 1, scaleNotes.length - 1)]);
    }

    showSongLibrary() {
        if (this.elements.songLibrary) {
            this.elements.songLibrary.style.display = 'block';
        }
        this.renderSongList();
    }

    renderSongList() {
        const container = document.getElementById('songList');
        if (!container) return;

        const songs = this.getSongLibrary();
        const difficultyOrder = { beginner: 0, intermediate: 1, advanced: 2 };
        const sorted = songs.sort((a, b) => difficultyOrder[a.difficulty] - difficultyOrder[b.difficulty]);

        container.innerHTML = sorted.map(song => `
            <div class="song-card" data-id="${song.id}">
                <div class="song-info">
                    <span class="song-title">${song.title}</span>
                    <span class="song-difficulty ${song.difficulty}">${song.difficulty}</span>
                </div>
                <p class="song-desc">${song.description}</p>
                <div class="song-preview">${song.degrees.length} notes</div>
                <button class="tool-btn song-play-btn" data-id="${song.id}">Play</button>
            </div>
        `).join('');

        container.querySelectorAll('.song-play-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.startSong(e.target.dataset.id);
            });
        });
    }

    async startSong(songId) {
        const songs = this.getSongLibrary();
        const song = songs.find(s => s.id === songId);
        if (!song) return;

        // Ensure audio is initialized
        if (!this.audioContext) {
            const success = await this.initAudio();
            if (!success) {
                alert('Could not access microphone.');
                return;
            }
        }

        this.mode = 'song_play';
        this.isActive = true;
        this.currentSong = song;
        const noteNames = this.songDegreesToNotes(song.degrees);

        // Use the lesson system to play through the song
        // Durations are multipliers of the base hold time
        this.lessons = [{
            title: song.title,
            notes: noteNames,
            durations: song.durations || null,
            description: song.description
        }];
        this.currentLesson = 0;

        // Switch to main lesson view
        if (this.elements.songLibrary) this.elements.songLibrary.style.display = 'none';
        this.elements.appMain.style.display = 'block';
        this.elements.modeToggle.style.display = 'flex';
        this.loadLesson(0);

        if (!this.isListening) {
            this.startListening();
        }
    }

    backToSongList() {
        this.mode = 'songs';
        this.elements.appMain.style.display = 'none';
        if (this.elements.songLibrary) this.elements.songLibrary.style.display = 'block';
        this.renderSongList();
    }

    startListening() {
        this.isListening = true;
        
        const detect = () => {
            if (!this.isActive) {
                this.isListening = false;
                return;
            }

            // Get pitch - either from callback (AudioWorklet) or polling (main thread)
            let pitch = this.currentPitch;
            
            // If not using worklet, poll for pitch
            if (!this.pitchDetector.isUsingWorklet()) {
                pitch = this.pitchDetector.getPitch();
            }
            
            if (this.mode === 'tuner') {
                this.updateTunerMode(pitch);
            } else if (this.mode === 'assessment') {
                this.updateAssessmentPitch(pitch);
            } else if (this.mode === 'lesson' || this.mode === 'song_play') {
                this.updateLessonMode(pitch);
            }

            requestAnimationFrame(detect);
        };

        detect();
    }

    updateLessonMode(pitch) {
        // Block during countdown
        if (this.lessonCountdown) return;

        this.debugCounter++;
        if (this.debugCounter % 60 === 0) {
            console.log('🔊 Pitch check:', pitch ? `${pitch.fullNote} @ ${pitch.frequency}Hz` : 'no pitch');
        }

        if (!pitch) {
            this.elements.currentNote.textContent = '—';
            this.elements.frequency.textContent = '— Hz';
            this.elements.needle.style.left = '50%';
            this.elements.needle.className = 'needle';
            this.elements.centsDisplay.textContent = '0¢';
            this.elements.centsDisplay.className = 'cents-display';
            this.holdStartTime = null;
            this.elements.holdIndicator.classList.remove('active');
            this.elements.holdText.classList.remove('active');
            return;
        }

        this.elements.currentNote.textContent = pitch.fullNote;
        this.elements.frequency.textContent = `${pitch.frequency} Hz`;
        
        const needlePosition = 50 + (pitch.cents / 50) * 40;
        this.elements.needle.style.left = `${Math.max(10, Math.min(90, needlePosition))}%`;
        
        const absCents = Math.abs(pitch.cents);
        if (absCents <= 10) {
            this.elements.needle.className = 'needle in-tune';
            this.elements.centsDisplay.className = 'cents-display in-tune';
        } else {
            this.elements.needle.className = pitch.cents > 0 ? 'needle sharp' : 'needle flat';
            this.elements.centsDisplay.className = 'cents-display';
        }
        
        this.elements.centsDisplay.textContent = `${pitch.cents > 0 ? '+' : ''}${pitch.cents}¢`;

        const lesson = this.lessons[this.currentLesson];
        const targetNote = lesson.notes[this.currentNoteIndex];
        const targetMatch = this.pitchDetector.checkNoteMatch(pitch, targetNote);
        
        if (targetMatch.match) {
            if (!this.holdStartTime) {
                this.holdStartTime = Date.now();
                this.noteAccuracies = [targetMatch.accuracy];
                this.elements.holdIndicator.classList.add('active');
                this.elements.holdText.classList.add('active');
            } else {
                this.noteAccuracies.push(targetMatch.accuracy);
            }
            
            this.updateAccuracyMeter();

            // Check if accuracy is too low during hold — reject if so
            const currentAvg = this.noteAccuracies.reduce((a, b) => a + b, 0) / this.noteAccuracies.length;
            if (this.noteAccuracies.length > 5 && currentAvg < this.minNoteAccuracy) {
                // Reset hold — note wasn't accurate enough
                this.holdStartTime = null;
                this.noteAccuracies = [];
                this.elements.targetNote.style.textShadow = '';
                this.elements.holdIndicator.classList.remove('active');
                this.elements.holdText.classList.remove('active');
                this.elements.holdText.textContent = 'Hold the note...';
                this.elements.holdText.style.color = '';
                this.elements.holdBar.style.width = '0%';
                return;
            }

            // Calculate hold time needed (use per-note duration if song has it)
            const lesson = this.lessons[this.currentLesson];
            let requiredHold = this.holdRequired;
            if (lesson.durations && lesson.durations[this.currentNoteIndex]) {
                requiredHold = this.holdRequired * lesson.durations[this.currentNoteIndex];
            }

            const holdTime = Date.now() - this.holdStartTime;
            const progress = Math.min(100, (holdTime / requiredHold) * 100);

            this.elements.holdBar.style.width = `${progress}%`;
            this.elements.targetNote.style.textShadow = `0 0 ${20 + progress/2}px rgba(255, 215, 0, ${0.3 + progress/200})`;

            if (progress >= 100) {
                this.elements.holdText.textContent = '✓ Good!';
                this.elements.holdText.style.color = '#4CAF50';
            }

            if (holdTime >= requiredHold) {
                this.advanceNote();
            }
        } else {
            if (this.holdStartTime) {
                this.holdStartTime = null;
                this.elements.targetNote.style.textShadow = '';
                this.elements.holdIndicator.classList.remove('active');
                this.elements.holdText.classList.remove('active');
                this.elements.holdText.textContent = 'Hold the note...';
                this.elements.holdText.style.color = '';
                this.elements.holdBar.style.width = '0%';
            }
        }
    }

    updateTunerMode(pitch) {
        if (!pitch) {
            this.elements.tunerNote.textContent = '—';
            this.elements.tunerFrequency.textContent = '— Hz';
            this.elements.tunerNeedle.style.left = '50%';
            this.elements.tunerCents.textContent = '0¢';
            return;
        }

        this.elements.tunerNote.textContent = pitch.fullNote;
        this.elements.tunerFrequency.textContent = `${pitch.frequency} Hz`;
        
        const needlePosition = 50 + (pitch.cents / 50) * 40;
        this.elements.tunerNeedle.style.left = `${Math.max(10, Math.min(90, needlePosition))}%`;
        this.elements.tunerCents.textContent = `${pitch.cents > 0 ? '+' : ''}${pitch.cents}¢`;
    }

    updateAssessmentPitch(pitch) {
        if (this.assessPhase === 'listening' && pitch) {
            this.assessDetectedNotes.push({
                note: pitch.fullNote,
                frequency: pitch.frequency,
                cents: pitch.cents
            });
        }
        
        if (pitch) {
            this.elements.assessDetectedNote.textContent = pitch.fullNote;
            this.elements.assessDetectedFreq.textContent = `${pitch.frequency} Hz`;
        } else {
            this.elements.assessDetectedNote.textContent = '—';
            this.elements.assessDetectedFreq.textContent = '— Hz';
        }
    }

    advanceNote() {
        const lesson = this.lessons[this.currentLesson];
        const noteBoxes = this.elements.noteSequence.querySelectorAll('.note-box');

        // Record this note's accuracy for the lesson total
        if (this.noteAccuracies.length > 0) {
            const noteAvg = this.noteAccuracies.reduce((a, b) => a + b, 0) / this.noteAccuracies.length;
            this.lessonAccuracies.push(noteAvg);
        }

        noteBoxes[this.currentNoteIndex].classList.remove('current');
        noteBoxes[this.currentNoteIndex].classList.add('completed');

        this.holdStartTime = null;
        this.elements.targetNote.style.textShadow = '';
        this.elements.holdIndicator.classList.remove('active');
        this.elements.holdText.classList.remove('active');
        this.elements.holdText.textContent = 'Hold the note...';
        this.elements.holdText.style.color = '';
        this.elements.holdBar.style.width = '0%';
        
        this.currentNoteIndex++;
        
        if (this.currentNoteIndex >= lesson.notes.length) {
            this.showCompletion();
        } else {
            noteBoxes[this.currentNoteIndex].classList.remove('upcoming');
            noteBoxes[this.currentNoteIndex].classList.add('current');
            this.elements.targetNote.textContent = lesson.notes[this.currentNoteIndex];
            this.updateFingerDiagram(lesson.notes[this.currentNoteIndex]);
        }
    }

    updateAccuracyMeter() {
        if (this.noteAccuracies.length === 0) return;
        
        const avg = this.noteAccuracies.reduce((a, b) => a + b, 0) / this.noteAccuracies.length;
        this.elements.accuracyMeter.style.width = `${avg}%`;
        this.elements.accuracyValue.textContent = `${Math.round(avg)}%`;
    }

    showCompletion() {
        const elapsed = Math.round((Date.now() - this.lessonStartTime) / 1000);
        const avgAccuracy = this.lessonAccuracies.length > 0
            ? Math.round(this.lessonAccuracies.reduce((a, b) => a + b, 0) / this.lessonAccuracies.length)
            : 0;

        this.elements.statAccuracy.textContent = `${avgAccuracy}%`;
        this.elements.statTime.textContent = `${elapsed}s`;
        this.elements.completionModal.style.display = 'flex';

        const passed = avgAccuracy >= this.minLessonAccuracy;

        // Update modal message
        const modalTitle = this.elements.completionModal.querySelector('h2');
        if (modalTitle) {
            modalTitle.textContent = passed ? 'Lesson Complete!' : 'Try Again!';
        }

        this.saveProgress();

        // Auto-advance or auto-restart after 3 seconds
        setTimeout(() => {
            this.elements.completionModal.style.display = 'none';
            if (passed) {
                this.currentLesson++;
                this.loadLesson(this.currentLesson);
                this.elements.accuracyMeter.style.width = '0%';
                this.elements.accuracyValue.textContent = '0%';
                this.saveProgress();
            } else {
                this.resetLesson();
            }
        }, 3000);
    }

    closeCompletionModal() {
        this.elements.completionModal.style.display = 'none';
    }

    resetLesson() {
        this.holdStartTime = null;
        this.elements.targetNote.style.textShadow = '';
        this.elements.holdIndicator.classList.remove('active');
        this.elements.holdText.classList.remove('active');
        this.elements.holdText.textContent = 'Hold the note...';
        this.elements.holdText.style.color = '';
        this.elements.holdBar.style.width = '0%';
        this.loadLesson(this.currentLesson);
        this.elements.accuracyMeter.style.width = '0%';
        this.elements.accuracyValue.textContent = '0%';
    }

    nextLesson() {
        this.currentLesson++;
        this.loadLesson(this.currentLesson);
        this.elements.accuracyMeter.style.width = '0%';
        this.elements.accuracyValue.textContent = '0%';
        this.saveProgress();
    }

    setMode(mode) {
        this.mode = mode;

        // Hide all views
        this.elements.appMain.style.display = 'none';
        this.elements.tunerMode.style.display = 'none';
        if (this.elements.songLibrary) this.elements.songLibrary.style.display = 'none';

        // Deactivate all tabs
        if (this.elements.lessonModeBtn) this.elements.lessonModeBtn.classList.remove('active');
        if (this.elements.tunerModeBtn) this.elements.tunerModeBtn.classList.remove('active');
        if (this.elements.songModeBtn) this.elements.songModeBtn.classList.remove('active');

        if (mode === 'lesson') {
            this.elements.appMain.style.display = 'block';
            this.elements.lessonModeBtn.classList.add('active');
            // Restore scale lessons if coming from song mode
            if (this.currentSong) {
                this.currentSong = null;
                this.lessons = this.generateLessonsForKey(this.fluteKey);
                this.loadLesson(this.currentLesson);
            }
        } else if (mode === 'tuner') {
            this.elements.tunerMode.style.display = 'block';
            this.elements.tunerModeBtn.classList.add('active');
        } else if (mode === 'songs') {
            this.showSongLibrary();
        }
    }

    saveProgress() {
        const data = {
            currentLesson: this.currentLesson,
            fluteKey: this.fluteKey,
            timestamp: Date.now()
        };
        localStorage.setItem('fluteLearnerProgress', JSON.stringify(data));
    }

    loadProgress() {
        const saved = localStorage.getItem('fluteLearnerProgress');
        if (saved) {
            const data = JSON.parse(saved);
            this.currentLesson = data.currentLesson || 0;
            if (data.fluteKey) {
                this.elements.fluteKeySelect.value = data.fluteKey;
            }
        }

        const savedScale = localStorage.getItem('fluteCustomScale');
        if (savedScale) {
            const scale = JSON.parse(savedScale);
            this.customScale = scale;
            this.lessons = this.generateLessonsFromScale(scale);
            console.log('🎵 Loaded custom scale from storage:', scale);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    try {
        console.log('🚀 Initializing Flute Learner...');
        window.app = new FluteLearner();
        console.log('✅ Flute Learner initialized');
        
        // Visual indicator that JS is working
        const header = document.querySelector('header h1');
        if (header) {
            header.style.borderBottom = '2px solid #4CAF50';
        }
    } catch (err) {
        console.error('Failed to initialize:', err);
        alert('App failed to load: ' + err.message);
    }
});

// Global error handler
window.onerror = function(msg, url, lineNo, columnNo, error) {
    console.error('Global error:', msg, url, lineNo);
    alert('Error: ' + msg);
    return false;
};
