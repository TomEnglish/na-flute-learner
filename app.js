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
        
        this.lessons = [];
        this.init();
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

    generateLessonsForKey(key) {
        const scale = this.getFluteScale(key);
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
            fingeringLabel: document.getElementById('fingeringLabel')
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
            return;
        }
        
        this.elements.fluteKeySelect.style.borderColor = '';
        this.elements.startBtn.textContent = 'Starting...';
        this.elements.startBtn.disabled = true;

        this.lessons = this.generateLessonsForKey(this.fluteKey);
        console.log(`🎵 Generated lessons for ${this.fluteKey} flute:`, this.lessons);

        if (!this.audioContext) {
            const success = await this.initAudio();
            if (!success) return;
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
                // Create a one-time touch/click handler to resume
                const resumeHandler = async () => {
                    if (this.audioContext.state === 'suspended') {
                        await this.audioContext.resume();
                        console.log('🎤 AudioContext resumed via user gesture');
                    }
                    document.removeEventListener('touchstart', resumeHandler);
                    document.removeEventListener('click', resumeHandler);
                };
                document.addEventListener('touchstart', resumeHandler, { once: true });
                document.addEventListener('click', resumeHandler, { once: true });
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
                alert('Microphone access denied. Please allow microphone access.');
                return false;
            }
        } catch (err) {
            console.error('Failed to initialize audio:', err);
            alert('Failed to access microphone.');
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
        
        console.log('📝 Generating lessons for scale:', scaleNotes);

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

    loadLesson(index) {
        const lesson = this.lessons[index];
        if (!lesson) {
            this.currentLesson = 0;
            this.loadLesson(0);
            return;
        }

        this.currentNoteIndex = 0;
        this.noteAccuracies = [];
        this.lessonStartTime = Date.now();
        
        this.elements.lessonTitle.textContent = lesson.title;
        this.elements.targetNote.textContent = lesson.notes[0];
        
        if (index === 0 && this.elements.fingerDiagramContainer) {
            this.elements.fingerDiagramContainer.style.display = 'flex';
        }
        
        this.updateFingerDiagram(0);
        
        this.elements.noteSequence.innerHTML = lesson.notes.map((note, i) => {
            let className = 'note-box';
            if (i === 0) className += ' current';
            else className += ' upcoming';
            return `<div class="note-box ${className}" data-index="${i}">${note}</div>`;
        }).join('');

        this.elements.nextLessonBtn.style.display = 'none';
        this.elements.resetBtn.style.display = 'inline-block';
    }
    
    updateFingerDiagram(noteIndex) {
        if (!this.elements.fingerDiagram) return;
        
        const fingering = this.fingerings[noteIndex];
        const holes = this.elements.fingerDiagram.querySelectorAll('.hole');
        
        holes.forEach((hole, i) => {
            if (fingering[i] === 1) {
                hole.classList.remove('open');
                hole.textContent = '●';
            } else {
                hole.classList.add('open');
                hole.textContent = '○';
            }
        });
        
        if (this.elements.fingeringLabel) {
            this.elements.fingeringLabel.textContent = this.fingeringLabels[noteIndex];
        }
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
            } else {
                this.updateLessonMode(pitch);
            }

            requestAnimationFrame(detect);
        };

        detect();
    }

    updateLessonMode(pitch) {
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
            
            const holdTime = Date.now() - this.holdStartTime;
            const progress = Math.min(100, (holdTime / this.holdRequired) * 100);
            
            this.elements.holdBar.style.width = `${progress}%`;
            this.elements.targetNote.style.textShadow = `0 0 ${20 + progress/2}px rgba(255, 215, 0, ${0.3 + progress/200})`;
            
            if (progress >= 100) {
                this.elements.holdText.textContent = '✓ Good!';
                this.elements.holdText.style.color = '#4CAF50';
            }

            if (holdTime >= this.holdRequired) {
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
            this.updateFingerDiagram(this.currentNoteIndex);
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
        const avgAccuracy = this.noteAccuracies.length > 0
            ? Math.round(this.noteAccuracies.reduce((a, b) => a + b, 0) / this.noteAccuracies.length)
            : 0;

        this.elements.statAccuracy.textContent = `${avgAccuracy}%`;
        this.elements.statTime.textContent = `${elapsed}s`;
        this.elements.completionModal.style.display = 'flex';
        
        this.elements.nextLessonBtn.style.display = 'inline-block';
        this.elements.resetBtn.style.display = 'none';
        this.saveProgress();
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
        
        if (mode === 'lesson') {
            this.elements.appMain.style.display = 'block';
            this.elements.tunerMode.style.display = 'none';
            this.elements.lessonModeBtn.classList.add('active');
            this.elements.tunerModeBtn.classList.remove('active');
        } else {
            this.elements.appMain.style.display = 'none';
            this.elements.tunerMode.style.display = 'block';
            this.elements.lessonModeBtn.classList.remove('active');
            this.elements.tunerModeBtn.classList.add('active');
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
