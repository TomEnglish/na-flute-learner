/**
 * AudioWorklet Processor for Pitch Detection
 * Runs in a separate thread for better performance
 * Uses autocorrelation algorithm optimized for flute frequency range
 */

class PitchProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        
        // Buffer for analysis
        this.bufferSize = 4096;
        this.buffer = new Float32Array(this.bufferSize);
        this.bufferIndex = 0;
        
        // NA Flute frequency range
        this.minFreq = 250;  // ~B3
        this.maxFreq = 1200; // ~D6
        
        // A4 = 440 Hz reference
        this.A4 = 440;
        this.noteStrings = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        
        // Smoothing
        this.lastFrequency = 0;
        this.smoothingFactor = 0.3;
        
        // Debug counter
        this.frameCount = 0;
    }
    
    process(inputs, outputs, parameters) {
        const input = inputs[0];
        
        if (!input || !input.length || !input[0]) {
            return true;
        }
        
        // Copy input to buffer
        const channelData = input[0];
        for (let i = 0; i < channelData.length; i++) {
            if (this.bufferIndex < this.bufferSize) {
                this.buffer[this.bufferIndex++] = channelData[i];
            }
        }
        
        // When buffer is full, detect pitch
        if (this.bufferIndex >= this.bufferSize) {
            this.frameCount++;
            
            const frequency = this.autoCorrelate(this.buffer, sampleRate);
            
            if (frequency > 0 && frequency >= this.minFreq && frequency <= this.maxFreq) {
                // Apply smoothing
                if (this.lastFrequency > 0) {
                    const smoothed = this.lastFrequency + (frequency - this.lastFrequency) * this.smoothingFactor;
                    this.lastFrequency = smoothed;
                } else {
                    this.lastFrequency = frequency;
                }
                
                const noteInfo = this.frequencyToNote(this.lastFrequency);
                this.port.postMessage({
                    type: 'pitch',
                    ...noteInfo,
                    rawFrequency: frequency
                });
            } else {
                // No valid pitch detected
                this.lastFrequency = 0;
                if (this.frameCount % 30 === 0) {
                    this.port.postMessage({ type: 'silence' });
                }
            }
            
            // Reset buffer (overlap-add for smoother detection)
            this.buffer.copyWithin(0, this.bufferSize / 2);
            this.bufferIndex = this.bufferSize / 2;
        }
        
        return true;
    }
    
    autoCorrelate(buffer, sampleRate) {
        const SIZE = buffer.length;
        const MAX_SAMPLES = Math.floor(SIZE / 2);
        let bestOffset = -1;
        let bestCorrelation = 0;
        let rms = 0;
        let foundGoodCorrelation = false;
        const correlations = new Array(MAX_SAMPLES);
        
        // Calculate RMS
        for (let i = 0; i < SIZE; i++) {
            const val = buffer[i];
            rms += val * val;
        }
        rms = Math.sqrt(rms / SIZE);
        
        // Not enough signal - adjusted threshold for flute
        if (rms < 0.008) return -1;
        
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
    
    frequencyToNote(frequency) {
        const semitones = 12 * Math.log2(frequency / this.A4);
        const noteNum = Math.round(semitones) + 69;
        const noteName = this.noteStrings[noteNum % 12];
        const octave = Math.floor(noteNum / 12) - 1;
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
}

registerProcessor('pitch-processor', PitchProcessor);
