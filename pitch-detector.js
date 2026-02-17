/**
 * Enhanced Pitch Detector for Native American Flute
 * Supports AudioWorklet (better performance) with fallback to main thread
 * Includes iOS Safari specific handling and pitch smoothing
 */

class PitchDetector {
    constructor(audioContext) {
        this.audioContext = audioContext;
        this.analyser = null;
        this.dataArray = null;
        this.isActive = false;
        this.debugCounter = 0;
        
        // AudioWorklet support
        this.workletNode = null;
        this.useWorklet = false;
        
        // NA Flute typically ranges from C4 to D6
        this.minFreq = 250;  // ~B3
        this.maxFreq = 1200; // ~D6
        
        // A4 = 440 Hz reference
        this.A4 = 440;
        
        // Note names for display
        this.noteStrings = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        
        // Pitch smoothing
        this.lastFrequency = 0;
        this.smoothingFactor = 0.3;
        this.frequencyHistory = [];
        this.historyMaxSize = 5;
        
        // Confidence tracking
        this.lastConfidence = 0;
        
        // Callback for worklet messages
        this.onPitchCallback = null;
    }

    async init() {
        try {
            // iOS Safari requires user interaction to start AudioContext
            if (this.audioContext.state === 'suspended') {
                console.log('AudioContext suspended, will resume on user interaction');
            }
            
            // iOS Safari specific constraints
            const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
                          (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
            
            const constraints = {
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false,
                    sampleRate: 44100,
                    channelCount: 1
                }
            };
            
            // iOS specific: request specific sample rate if supported
            if (isIOS) {
                console.log('🍎 iOS device detected - using iOS-specific audio config');
                constraints.audio.sampleRate = { ideal: 44100 };
                constraints.audio.latencyHint = 'interactive';
            }
            
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            
            // Try to use AudioWorklet for better performance
            const workletSuccess = await this.initWorklet(stream);
            
            if (!workletSuccess) {
                // Fallback to main thread processing
                console.log('📍 Using main thread audio processing (fallback)');
                this.initMainThread(stream);
            }
            
            // Resume AudioContext if suspended (iOS Safari)
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
                console.log('AudioContext resumed');
            }
            
            // Verify actual sample rate
            console.log(`🎤 Sample rate: ${this.audioContext.sampleRate} Hz`);
            
            return true;
        } catch (err) {
            console.error('Microphone access denied:', err);
            return false;
        }
    }
    
    async initWorklet(stream) {
        try {
            // Register the worklet processor
            await this.audioContext.audioWorklet.addModule('pitch-worklet-processor.js');
            
            // Create MediaStreamSource
            const source = this.audioContext.createMediaStreamSource(stream);
            
            // Create AudioWorkletNode
            this.workletNode = new AudioWorkletNode(this.audioContext, 'pitch-processor');
            
            // Handle messages from the worklet
            this.workletNode.port.onmessage = (event) => {
                if (event.data.type === 'pitch') {
                    this.lastFrequency = event.data.frequency;
                    this.lastConfidence = 1;
                    
                    if (this.onPitchCallback) {
                        this.onPitchCallback({
                            frequency: event.data.frequency,
                            note: event.data.note,
                            octave: event.data.octave,
                            fullNote: event.data.fullNote,
                            cents: event.data.cents,
                            midiNote: event.data.midiNote,
                            confidence: 1,
                            rawFrequency: event.data.rawFrequency
                        });
                    }
                }
            };
            
            // Connect the nodes
            source.connect(this.workletNode);
            // Worklet doesn't need to connect to destination for analysis
            
            this.useWorklet = true;
            console.log('✅ AudioWorklet initialized successfully');
            return true;
            
        } catch (err) {
            console.warn('⚠️ AudioWorklet initialization failed, using fallback:', err.message);
            return false;
        }
    }
    
    initMainThread(stream) {
        const source = this.audioContext.createMediaStreamSource(stream);
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 4096;
        this.analyser.smoothingTimeConstant = 0.5; // Reduced for faster response
        
        source.connect(this.analyser);
        this.dataArray = new Float32Array(this.analyser.fftSize);
        this.useWorklet = false;
    }

    /**
     * Autocorrelation-based pitch detection (main thread version)
     */
    autoCorrelate(buffer, sampleRate) {
        const SIZE = buffer.length;
        const MAX_SAMPLES = Math.floor(SIZE / 2);
        let bestOffset = -1;
        let bestCorrelation = 0;
        let rms = 0;
        let foundGoodCorrelation = false;
        const correlations = new Array(MAX_SAMPLES);

        // Calculate RMS to detect if there's actual signal
        for (let i = 0; i < SIZE; i++) {
            const val = buffer[i];
            rms += val * val;
        }
        rms = Math.sqrt(rms / SIZE);

        // Debug: log RMS occasionally
        this.debugCounter++;
        if (this.debugCounter % 60 === 0) {
            console.log(`🎤 Audio RMS: ${rms.toFixed(4)} ${rms > 0.008 ? '✓' : '(too quiet)'}`);
        }

        // Not enough signal - adjusted threshold for flute (raised to filter background noise)
        if (rms < 0.02) return -1;

        let lastCorrelation = 1;
        for (let offset = 0; offset < MAX_SAMPLES; offset++) {
            let correlation = 0;

            for (let i = 0; i < MAX_SAMPLES; i++) {
                correlation += Math.abs((buffer[i]) - (buffer[i + offset]));
            }
            correlation = 1 - (correlation / MAX_SAMPLES);
            correlations[offset] = correlation;

            if ((correlation > 0.9) && (correlation > lastCorrelation)) {
                foundGoodCorrelation = true;
                if (correlation > bestCorrelation) {
                    bestCorrelation = correlation;
                    bestOffset = offset;
                }
            } else if (foundGoodCorrelation) {
                const shift = (correlations[bestOffset + 1] - correlations[bestOffset - 1]) / correlations[bestOffset];
                return sampleRate / (bestOffset + (8 * shift));
            }
            lastCorrelation = correlation;
        }

        if (bestCorrelation > 0.01) {
            return sampleRate / bestOffset;
        }
        return -1;
    }
    
    /**
     * Apply smoothing to frequency readings
     */
    smoothFrequency(frequency) {
        // Add to history
        this.frequencyHistory.push(frequency);
        
        // Keep history bounded
        if (this.frequencyHistory.length > this.historyMaxSize) {
            this.frequencyHistory.shift();
        }
        
        // Median filter for stability
        const sorted = [...this.frequencyHistory].sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)];
        
        // Exponential smoothing
        if (this.lastFrequency > 0) {
            const smoothed = this.lastFrequency + (median - this.lastFrequency) * this.smoothingFactor;
            this.lastFrequency = smoothed;
            return smoothed;
        }
        
        this.lastFrequency = median;
        return median;
    }

    /**
     * Get current pitch (for main thread mode)
     * Returns { frequency, note, octave, cents, confidence } or null if no pitch detected
     */
    getPitch() {
        // If using worklet, pitch is delivered via callback
        if (this.useWorklet) {
            return null; // Worklet handles this via onPitchCallback
        }

        if (!this.analyser) return null;

        this.analyser.getFloatTimeDomainData(this.dataArray);
        
        const rawFrequency = this.autoCorrelate(this.dataArray, this.audioContext.sampleRate);
        
        if (rawFrequency === -1 || rawFrequency < this.minFreq || rawFrequency > this.maxFreq) {
            this.lastFrequency = 0;
            this.frequencyHistory = [];
            this.lastConfidence = 0;
            return null;
        }
        
        // Apply smoothing
        const smoothedFreq = this.smoothFrequency(rawFrequency);
        
        // Calculate confidence based on stability
        const variance = this.frequencyHistory.length > 1 
            ? Math.abs(this.frequencyHistory[this.frequencyHistory.length - 1] - this.frequencyHistory[0]) / this.frequencyHistory[0]
            : 0;
        this.lastConfidence = Math.max(0, 1 - variance * 5);

        return {
            ...this.frequencyToNote(smoothedFreq),
            confidence: this.lastConfidence,
            rawFrequency: rawFrequency
        };
    }

    /**
     * Convert frequency to note information
     */
    frequencyToNote(frequency) {
        // Calculate semitones from A4
        const semitones = 12 * Math.log2(frequency / this.A4);
        
        // Round to nearest semitone
        const noteNum = Math.round(semitones) + 69; // MIDI note number (A4 = 69)
        const noteName = this.noteStrings[noteNum % 12];
        const octave = Math.floor(noteNum / 12) - 1;
        
        // Calculate cents off from perfect pitch
        const cents = Math.round((semitones - Math.round(semitones)) * 100);
        
        return {
            frequency: Math.round(frequency * 10) / 10,
            note: noteName,
            octave: octave,
            fullNote: `${noteName}${octave}`,
            cents: cents,
            midiNote: noteNum
        };
    }

    /**
     * Check if detected pitch matches target note
     * Returns accuracy percentage and match status
     */
    checkNoteMatch(detected, targetNote, tolerance = 50) {
        if (!detected) {
            return { match: false, accuracy: 0 };
        }

        // Match note name (including sharps) - ignoring octave
        const isMatch = detected.note === targetNote;

        // Calculate accuracy based on cents deviation
        // 0 cents = 100%, 50 cents = 0%
        const centsOff = Math.abs(detected.cents);
        const accuracy = Math.max(0, 100 - (centsOff * 2));

        return {
            match: isMatch && centsOff <= tolerance,
            accuracy: accuracy,
            cents: detected.cents
        };
    }

    /**
     * Get note frequency from name (e.g., "G4" -> 392.0)
     */
    noteToFrequency(noteName) {
        const note = noteName.slice(0, -1);
        const octave = parseInt(noteName.slice(-1));
        
        const noteIndex = this.noteStrings.indexOf(note);
        if (noteIndex === -1) return null;
        
        const semitones = (octave - 4) * 12 + (noteIndex - 9);
        return this.A4 * Math.pow(2, semitones / 12);
    }
    
    /**
     * Set callback for AudioWorklet pitch events
     */
    setOnPitch(callback) {
        this.onPitchCallback = callback;
    }
    
    /**
     * Check if using AudioWorklet
     */
    isUsingWorklet() {
        return this.useWorklet;
    }
}

// Export for use in app
window.PitchDetector = PitchDetector;
