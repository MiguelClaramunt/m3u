let STATIONS = JSON.parse(localStorage.getItem('customStations')) || [...DEFAULT_STATIONS];

DEFAULT_STATIONS.forEach(def => {
    const existing = STATIONS.find(s => s.url === def.url);
    if (existing) {
        existing.logo = def.logo;
        existing.name = def.name;
        existing.channel = def.channel;
    } else {
        STATIONS.push({...def});
    }
});

const audio = document.getElementById('audioPlayer');
const playBtn = document.getElementById('playBtn');
const stopBtn = document.getElementById('stopBtn');
const retryBtn = document.getElementById('retryBtn');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const addBtn = document.getElementById('addBtn');
const streamInput = document.getElementById('streamInput');
const volumeSlider = document.getElementById('volumeSlider');
const status = document.getElementById('status');
const stationName = document.getElementById('stationName');
const stationLogo = document.getElementById('stationLogo');

let currentIndex = parseInt(localStorage.getItem('currentStationIndex')) || 0;
let savedVolume = parseFloat(localStorage.getItem('volume')) || 1.0;
let metadataInterval;

function setStatus(text, type) {
    status.innerText = text.toUpperCase();
    status.className = ''; // Reset
    if (type) status.classList.add(type);
}

function init() {
    audio.muted = true;
    loadStation(currentIndex);
    audio.volume = savedVolume;
    volumeSlider.value = savedVolume;
    
    fetchMetadata();
    metadataInterval = setInterval(fetchMetadata, 30000);

    stationLogo.onerror = () => {
        const station = STATIONS[currentIndex];
        if (station && station.artwork && station.logo && stationLogo.src !== station.logo) {
            stationLogo.src = station.logo;
            stationLogo.classList.add('is-icon');
        } else {
            stationLogo.classList.add('hidden');
        }
    };

    // Start playing immediately (muted)
    play();
    updatePlayButtonUI();
}

async function fetchMetadata() {
    try {
        const response = await fetch('https://www.nts.live/api/v2/live', { cache: 'no-cache' });
        const data = await response.json();
        
        STATIONS.forEach((station, index) => {
            if (station.channel) {
                const channelData = data.results.find(r => r.channel_name === station.channel);
                if (channelData && channelData.now) {
                    station.currentShow = channelData.now.show.title;
                    station.artwork = channelData.now.show.large_portrait_path || channelData.now.show.image_path;
                    
                    if (index === currentIndex) {
                        updateDisplay(station);
                    }
                }
            }
        });
    } catch (error) {
        console.error('Metadata fetch failed:', error);
    }
}

function updateDisplay(station) {
    stationName.innerText = (station.currentShow || station.name).toUpperCase();
    
    const imgUrl = station.artwork || station.logo;
    if (imgUrl) {
        stationLogo.src = imgUrl;
        stationLogo.classList.remove('hidden');
        if (!station.artwork && station.logo) {
            stationLogo.classList.add('is-icon');
        } else {
            stationLogo.classList.remove('is-icon');
        }
    } else {
        stationLogo.classList.add('hidden');
    }
}

function loadStation(index) {
    if (index >= STATIONS.length) index = 0;
    const station = STATIONS[index];
    audio.src = station.url;
    updateDisplay(station);
    
    setStatus("STANDBY", "standby");
    updatePlayButtonUI();
    localStorage.setItem('currentStationIndex', index);
}

function parseM3U(content) {
    const lines = content.split('\n');
    const newStations = [];
    let currentStation = {};

    for (let line of lines) {
        line = line.trim();
        if (line.startsWith('#EXTINF')) {
            const logoMatch = line.match(/tvg-logo="([^"]+)"/);
            const nameMatch = line.match(/,(.+)$/);
            
            if (logoMatch) currentStation.logo = logoMatch[1];
            if (nameMatch) currentStation.name = nameMatch[1].trim();
        } else if (line.startsWith('http')) {
            currentStation.url = line;
            if (!currentStation.name) currentStation.name = "Unknown Stream";
            newStations.push(currentStation);
            currentStation = {};
        }
    }
    return newStations;
}

addBtn.addEventListener('click', async () => {
    const val = streamInput.value.trim();
    if (!val) return;

    if (val.startsWith('http') && (val.endsWith('.m3u') || val.endsWith('.m3u8'))) {
        setStatus("FETCHING M3U...", "buffering");
        try {
            const res = await fetch(val);
            const text = await res.text();
            const parsed = parseM3U(text);
            if (parsed.length > 0) {
                STATIONS = [...STATIONS, ...parsed];
                saveStations();
                setStatus(`ADDED ${parsed.length} STREAMS`, "active");
            }
        } catch (e) {
            setStatus("LOAD FAILED", "error");
        }
    } else if (val.startsWith('http')) {
        STATIONS.push({ name: "Added Stream", url: val });
        saveStations();
        setStatus("STREAM ADDED", "active");
    } else {
        const parsed = parseM3U(val);
        if (parsed.length > 0) {
            STATIONS = [...STATIONS, ...parsed];
            saveStations();
            setStatus(`ADDED ${parsed.length} STREAMS`, "active");
        }
    }
    streamInput.value = "";
});

function saveStations() {
    localStorage.setItem('customStations', JSON.stringify(STATIONS));
}

function play() {
    // We don't call audio.load() here to avoid resetting the stream buffer
    // The 'waiting' event listener will handle the BUFFERING status automatically
    audio.play().catch((err) => { 
        console.error("Playback failed:", err);
        setStatus("CLICK PLAY TO START", "standby"); 
    });
}

function updatePlayButtonUI() {
    playBtn.innerText = audio.muted ? "PLAY" : "PAUSE";
}

playBtn.addEventListener('click', () => {
    if (audio.paused) {
        audio.muted = false;
        play();
    } else {
        audio.muted = !audio.muted;
        // If unmuting, ensure we are actually playing (in case of stalls)
        if (!audio.muted) {
            if (audio.paused) {
                play();
            } else {
                setStatus("LIVE", "active");
            }
        } else {
            setStatus("MUTED", "halted");
        }
    }
    updatePlayButtonUI();
});

stopBtn.addEventListener('click', () => {
    audio.muted = true;
    updatePlayButtonUI();
    setStatus("MUTED", "halted");
});

retryBtn.addEventListener('click', () => {
    loadStation(currentIndex);
    audio.load(); // Explicitly load on retry/manual change
    play();
});

prevBtn.addEventListener('click', () => {
    currentIndex = (currentIndex - 1 + STATIONS.length) % STATIONS.length;
    loadStation(currentIndex);
    audio.load();
    play();
});

nextBtn.addEventListener('click', () => {
    currentIndex = (currentIndex + 1) % STATIONS.length;
    loadStation(currentIndex);
    audio.load();
    play();
});

audio.addEventListener('playing', () => {
    setStatus("LIVE", "active");
    updatePlayButtonUI();
});

audio.addEventListener('waiting', () => {
    setStatus("BUFFERING...", "buffering");
});

audio.addEventListener('error', () => {
    setStatus("SIGNAL LOSS", "error");
    playBtn.innerText = "RETRY";
});

volumeSlider.addEventListener('input', (e) => {
    const vol = e.target.value;
    audio.volume = vol;
    localStorage.setItem('volume', vol);
});

init();
