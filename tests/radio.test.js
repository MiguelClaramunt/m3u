const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
const script = fs.readFileSync(path.resolve(__dirname, '../script.js'), 'utf8');
const stations = fs.readFileSync(path.resolve(__dirname, '../stations.js'), 'utf8');

describe('Radio Player', () => {
    let audioMock;

    beforeEach(() => {
        document.documentElement.innerHTML = html.toString();
        
        // Mock audio element
        audioMock = document.getElementById('audioPlayer');
        audioMock.paused = true;
        audioMock.play = jest.fn().mockImplementation(() => {
            audioMock.paused = false;
            // Trigger 'playing' event
            const event = new Event('playing');
            audioMock.dispatchEvent(event);
            return Promise.resolve();
        });
        audioMock.pause = jest.fn().mockImplementation(() => {
            audioMock.paused = true;
        });
        audioMock.load = jest.fn().mockImplementation(() => {
            audioMock.paused = true;
        });

        // Mock localStorage
        const localStorageMock = (function() {
            let store = {};
            return {
                getItem: jest.fn((key) => store[key] || null),
                setItem: jest.fn((key, value) => { store[key] = value.toString(); }),
                removeItem: jest.fn((key) => { delete store[key]; }),
                clear: jest.fn(() => { store = {}; })
            };
        })();
        Object.defineProperty(window, 'localStorage', { value: localStorageMock });

        // Mock fetch
        global.fetch = jest.fn(() =>
            Promise.resolve({
                json: () => Promise.resolve({ results: [] }),
                text: () => Promise.resolve('')
            })
        );

        // Define global variables expected by script.js
        const stationsCode = stations.replace('const DEFAULT_STATIONS', 'window.DEFAULT_STATIONS');
        eval(stationsCode);
        
        // Now eval script.js, but we need to make sure it doesn't try to use variables it doesn't have
        // We'll wrap it in a function that has access to window
        const scriptCode = script;
        eval(scriptCode);
    });

    test('Initial state: starts muted and shows PLAY', () => {
        const playBtn = document.getElementById('playBtn');
        const audio = document.getElementById('audioPlayer');
        expect(audio.muted).toBe(true);
        expect(playBtn.innerText).toBe('PLAY');
    });

    test('Pressing PLAY button unmutes and starts playing', () => {
        const playBtn = document.getElementById('playBtn');
        const audio = document.getElementById('audioPlayer');
        const status = document.getElementById('status');

        // Initial check
        expect(audio.muted).toBe(true);

        // Click PLAY
        playBtn.click();

        expect(audio.muted).toBe(false);
        expect(playBtn.innerText).toBe('PAUSE');
        // Since we mocked play(), it should be called
        expect(audio.play).toHaveBeenCalled();
    });

    test('Pressing STOP button mutes and shows MUTED status', () => {
        const playBtn = document.getElementById('playBtn');
        const stopBtn = document.getElementById('stopBtn');
        const audio = document.getElementById('audioPlayer');
        const status = document.getElementById('status');

        // Unmute first
        playBtn.click();
        expect(audio.muted).toBe(false);

        // Click STOP
        stopBtn.click();

        expect(audio.muted).toBe(true);
        expect(playBtn.innerText).toBe('PLAY');
        expect(status.innerText).toBe('MUTED');
        expect(status.className).toContain('halted');
    });

    test('Pressing PLAY after STOP unmutes and shows LIVE status', () => {
        const playBtn = document.getElementById('playBtn');
        const stopBtn = document.getElementById('stopBtn');
        const audio = document.getElementById('audioPlayer');
        const status = document.getElementById('status');

        // Unmute, then STOP
        playBtn.click();
        stopBtn.click();
        expect(status.innerText).toBe('MUTED');

        // Press PLAY (unmute)
        playBtn.click();

        expect(audio.muted).toBe(false);
        expect(playBtn.innerText).toBe('PAUSE');
        expect(status.innerText).toBe('LIVE');
        expect(status.className).toContain('active');
    });

    test('Prev/Next buttons call audio.load() and audio.play()', () => {
        const nextBtn = document.getElementById('nextBtn');
        const audio = document.getElementById('audioPlayer');

        nextBtn.click();

        expect(audio.load).toHaveBeenCalled();
        expect(audio.play).toHaveBeenCalled();
    });

    test('Volume slider updates audio volume', () => {
        const volumeSlider = document.getElementById('volumeSlider');
        const audio = document.getElementById('audioPlayer');

        volumeSlider.value = '0.5';
        volumeSlider.dispatchEvent(new Event('input'));

        expect(audio.volume).toBe(0.5);
    });

    test('Add custom stream manually', async () => {
        const streamInput = document.getElementById('streamInput');
        const addBtn = document.getElementById('addBtn');
        const status = document.getElementById('status');

        streamInput.value = 'http://test.stream/radio.mp3';
        addBtn.click();

        expect(status.innerText).toBe('STREAM ADDED');
        expect(window.localStorage.setItem).toHaveBeenCalledWith('customStations', expect.stringContaining('http://test.stream/radio.mp3'));
    });
});
