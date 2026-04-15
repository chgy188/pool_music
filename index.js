const canvas = document.getElementById('canvas');

// Mobile device detection and performance configuration (must be declared first)
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
                 (window.matchMedia && window.matchMedia('(max-width: 768px)').matches);

// Create loading screen element
const loadingScreen = document.createElement('div');
loadingScreen.id = 'loading-screen';
loadingScreen.style.cssText = `
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  z-index: 9999;
  transition: opacity 0.5s ease;
`;

const loadingIcon = document.createElement('div');
loadingIcon.innerHTML = '🌊';
loadingIcon.style.cssText = `
  font-size: 72px;
  margin-bottom: 30px;
  animation: wave 2s ease-in-out infinite;
`;

const loadingTitle = document.createElement('div');
loadingTitle.textContent = '正在加载资源...';
loadingTitle.style.cssText = `
  color: white;
  font-size: 24px;
  font-weight: bold;
  margin-bottom: 20px;
  text-shadow: 0 2px 4px rgba(0,0,0,0.3);
`;

const progressBarContainer = document.createElement('div');
progressBarContainer.style.cssText = `
  width: 300px;
  height: 6px;
  background: rgba(255,255,255,0.3);
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: 15px;
`;

const progressBar = document.createElement('div');
progressBar.id = 'loading-progress-bar';
progressBar.style.cssText = `
  width: 0%;
  height: 100%;
  background: white;
  border-radius: 3px;
  transition: width 0.3s ease;
  box-shadow: 0 0 10px rgba(255,255,255,0.5);
`;

const loadingProgress = document.createElement('div');
loadingProgress.id = 'loading-progress-text';
loadingProgress.textContent = '准备中...';
loadingProgress.style.cssText = `
  color: rgba(255,255,255,0.9);
  font-size: 14px;
  margin-bottom: 10px;
`;

const loadingTip = document.createElement('div');
loadingTip.textContent = isMobile ? '提示：移动网络下加载可能较慢，请耐心等待' : '首次加载需要下载纹理资源，请稍候';
loadingTip.style.cssText = `
  color: rgba(255,255,255,0.7);
  font-size: 12px;
  max-width: 80%;
  text-align: center;
  line-height: 1.5;
`;

// Add wave animation
const style = document.createElement('style');
style.textContent = `
  @keyframes wave {
    0%, 100% { transform: translateY(0) rotate(0deg); }
    25% { transform: translateY(-10px) rotate(-5deg); }
    75% { transform: translateY(-10px) rotate(5deg); }
  }
`;

loadingScreen.appendChild(loadingIcon);
loadingScreen.appendChild(loadingTitle);
loadingScreen.appendChild(progressBarContainer);
progressBarContainer.appendChild(progressBar);
loadingScreen.appendChild(loadingProgress);
loadingScreen.appendChild(loadingTip);
document.body.insertBefore(loadingScreen, canvas);
document.head.appendChild(style);

// Performance configuration for mobile devices
const mobileConfig = {
  // Reduce simulation quality on mobile
  simulationSize: isMobile ? 128 : 256,
  // Reduce caustics texture size on mobile
  causticsSize: isMobile ? 512 : 1024,
  // Reduce water geometry segments on mobile
  waterSegments: isMobile ? 100 : 200,
  // Disable some features on mobile
  enableShadows: !isMobile,
  // Adjust touch sensitivity
  touchThreshold: isMobile ? 8 : 5,
  // Adjust drop frequency on mobile
  dropInterval: isMobile ? 80 : 50,
  // Adjust auto-hide delay on mobile
  panelAutoHideDelay: isMobile ? 4000 : 3000
};

console.log(`📱 Device: ${isMobile ? 'Mobile' : 'Desktop'}`);
console.log(`⚙️  Performance Config:`, mobileConfig);

// Set canvas to fullscreen
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const width = canvas.width;
const height = canvas.height;

// Calculate pool dimensions based on aspect ratio (clamped)
const rawAspect = width / height;
const clampedAspect = Math.max(0.6, Math.min(1.8, rawAspect));
const poolWidth = 2 * clampedAspect;
const poolDepth = 2;

// Colors
const black = new THREE.Color('black');
const white = new THREE.Color('white');

// Music Player Variables
let audio = null;
let isPlaying = false;
let musicFileName = '';
let mouseMoveTimeout = null;
const MUSIC_PANEL_AUTO_HIDE_DELAY = mobileConfig.panelAutoHideDelay; // Auto-adjust for mobile

// Auto-play music list variables
let musicList = [];
let currentMusicIndex = 0;
let autoPlayEnabled = false;

// Audio Analysis Variables
let audioContext = null;
let analyser = null;
let source = null;
let dataArray = null;
let lastBassEnergy = 0;
let BEAT_THRESHOLD = 0.15;  // Beat detection threshold (adjustable via UI)
let lastMusicDropTime = 0;
const MIN_MUSIC_DROP_INTERVAL = 250; // Minimum interval between music drops (ms, increased to reduce sensitivity)

// Bass energy statistics for auto-adjusting slider range
let bassEnergyStats = {
  min: null,       // Will be set to first detected value
  max: null,       // Will be set to first detected value
  initialized: false
};
const BASS_STATS_WINDOW = 300; // Number of frames to track (~5 seconds at 60fps)

// Mouse interaction tracking for trail effect
let lastMouseDropTime = 0;
const MOUSE_TRAIL_INTERVAL = 50; // Minimum interval between mouse trail drops (ms)

// Water Simulation and Renderer (declared globally for music rhythm access)
let waterSimulation = null;
let renderer = null;

// Music Effect Intensity
let musicEffectIntensity = 0.7; // Default intensity (0.0 - 1.0)

// Music Panel Elements
const musicPanel = document.getElementById('music-panel');
const importBtn = document.getElementById('import-btn');
const playPauseBtn = document.getElementById('play-pause-btn');
const fullscreenBtn = document.getElementById('fullscreen-btn');
const musicFileInput = document.getElementById('music-file');
const musicInfo = document.getElementById('music-info');
const intensitySlider = document.getElementById('intensity-slider');
const intensityValue = document.getElementById('intensity-value');
const thresholdSlider = document.getElementById('threshold-slider');
const thresholdValue = document.getElementById('threshold-value');

// Show music panel
function showMusicPanel() {
  musicPanel.classList.add('visible');
  
  // Clear existing timeout
  if (mouseMoveTimeout) {
    clearTimeout(mouseMoveTimeout);
  }
  
  // Set timeout to hide panel
  mouseMoveTimeout = setTimeout(() => {
    hideMusicPanel();
  }, MUSIC_PANEL_AUTO_HIDE_DELAY);
}

// Hide music panel
function hideMusicPanel() {
  musicPanel.classList.remove('visible');
}

// Show mobile hint on first touch
let mobileHintShown = false;
function showMobileHint() {
  if (!mobileHintShown && isMobile) {
    const mobileHint = document.getElementById('mobile-hint');
    if (mobileHint) {
      mobileHint.style.display = 'block';
      mobileHintShown = true;
      
      // Hide after animation completes
      setTimeout(() => {
        mobileHint.style.display = 'none';
      }, 3000);
    }
  }
}

// Handle mouse movement for auto-hide
document.addEventListener('mousemove', () => {
  showMusicPanel();
});

// Keep panel visible when hovering over it
musicPanel.addEventListener('mouseenter', () => {
  if (mouseMoveTimeout) {
    clearTimeout(mouseMoveTimeout);
  }
});

musicPanel.addEventListener('mouseleave', () => {
  hideMusicPanel();
});

// Mobile: Show panel on tap anywhere
let lastTapTime = 0;
document.addEventListener('touchstart', (event) => {
  // Show mobile hint on first touch
  showMobileHint();
  
  // Don't trigger if touching the panel itself (handled separately)
  if (!musicPanel.contains(event.target)) {
    const currentTime = Date.now();
    const tapInterval = currentTime - lastTapTime;
    
    // Show panel on tap
    showMusicPanel();
    lastTapTime = currentTime;
    
    // Auto-hide after 3 seconds on mobile
    setTimeout(() => {
      hideMusicPanel();
    }, 3000);
  }
}, { passive: true });

// Keep panel visible when touching it
musicPanel.addEventListener('touchstart', (event) => {
  event.stopPropagation();
  showMusicPanel();
}, { passive: true });

musicPanel.addEventListener('touchend', () => {
  // Auto-hide after interaction ends
  setTimeout(() => {
    hideMusicPanel();
  }, 2000);
});

// Music effect intensity slider
intensitySlider.addEventListener('input', (e) => {
  const value = parseInt(e.target.value);
  musicEffectIntensity = value / 100; // Convert to 0.0 - 1.0
  intensityValue.textContent = `${value}%`;
  
  console.log(`🎚️ Music effect intensity: ${value}% (${musicEffectIntensity.toFixed(2)})`);
});

// Beat detection threshold slider
thresholdSlider.addEventListener('input', (e) => {
  const value = parseInt(e.target.value);
  BEAT_THRESHOLD = value / 100; // Convert to 0.01 - 1.00
  thresholdValue.textContent = BEAT_THRESHOLD.toFixed(2);
  
  console.log(`🎯 Beat detection threshold: ${BEAT_THRESHOLD.toFixed(2)} (${value}%)`);
  console.log(`   - Lower values = more sensitive (more ripples)`);
  console.log(`   - Higher values = less sensitive (fewer ripples)`);
});

// Auto-adjust slider range based on detected bass energy
function updateSliderRange() {
  // Check if we have valid statistics
  if (!bassEnergyStats.initialized || bassEnergyStats.min === null || bassEnergyStats.max === null) {
    return;
  }
  
  const minBass = bassEnergyStats.min;
  const maxBass = bassEnergyStats.max;
  const avgBass = (minBass + maxBass) / 2;
  
  // Calculate new slider range
  const newMin = Math.max(1, Math.floor(minBass * 100));
  const newMax = Math.min(100, Math.ceil(maxBass * 100));
  const newAvg = Math.floor(avgBass * 100);
  
  // Get current slider properties
  const currentMin = parseInt(thresholdSlider.min);
  const currentMax = parseInt(thresholdSlider.max);
  const currentValue = parseInt(thresholdSlider.value);
  
  // Update slider range
  thresholdSlider.min = newMin.toString();
  thresholdSlider.max = newMax.toString();
  
  // Adjust current threshold value if it's outside the new range
  let shouldUpdateValue = false;
  let newValue = currentValue;
  
  if (currentValue < newMin || currentValue > newMax) {
    // Current value is out of range, set to average
    newValue = newAvg;
    shouldUpdateValue = true;
  }
  
  if (shouldUpdateValue) {
    thresholdSlider.value = newValue.toString();
    BEAT_THRESHOLD = newValue / 100;
    thresholdValue.textContent = BEAT_THRESHOLD.toFixed(2);
  }
  
  // Optimized console output
  console.log(`🎯 Range: [${newMin}%- ${newMax}%] | Threshold: ${BEAT_THRESHOLD.toFixed(2)}${shouldUpdateValue ? ' (updated)' : ''}`);
}

// Reset bass energy statistics
function resetBassStats() {
  bassEnergyStats = {
    min: null,
    max: null,
    initialized: false
  };
}

// Import music file
importBtn.addEventListener('click', () => {
  musicFileInput.click();
});

musicFileInput.addEventListener('change', (event) => {
  const file = event.target.files[0];
  if (file) {
    // Stop current audio and clean up listeners
    if (audio) {
      // Remove auto-play listeners
      audio.removeEventListener('ended', onManualImportEnded);
      audio.removeEventListener('error', onManualImportError);
      
      audio.pause();
      audio.src = '';
      audio.load();
      audio = null;
    }
    
    // Disable auto-play for manual import
    autoPlayEnabled = false;
    
    // Create new audio element
    const audioURL = URL.createObjectURL(file);
    audio = new Audio(audioURL);
    
    // Update UI
    musicFileName = file.name;
    musicInfo.textContent = `🎵 ${musicFileName}`;
    isPlaying = false;
    updatePlayPauseButton();
    
    // Auto play first, then initialize audio analysis
    audio.play().then(() => {
      isPlaying = true;
      updatePlayPauseButton();
      
      // Reset bass energy statistics for new track
      resetBassStats();
      console.log('📊 Bass energy statistics reset for imported track');
      
      // Initialize or reinitialize audio analysis AFTER audio starts playing
      // This ensures the new audio source is properly connected
      initAudioAnalysis();
      
      console.log('✅ Manual music import - Audio analysis ready');
    }).catch(err => {
      console.error('Auto-play failed:', err);
      musicInfo.textContent = `⚠️ 点击播放`;
    });
    
    // Handle audio events with named functions
    audio.addEventListener('ended', onManualImportEnded);
    audio.addEventListener('error', onManualImportError);
  }
});

// Manual import ended handler
function onManualImportEnded() {
  isPlaying = false;
  updatePlayPauseButton();
  musicInfo.textContent = `✅ 播放完成`;
  lastBassEnergy = 0;
}

// Manual import error handler
function onManualImportError() {
  musicInfo.textContent = `❌ 加载失败`;
  isPlaying = false;
  updatePlayPauseButton();
}

// Play/Pause toggle
playPauseBtn.addEventListener('click', () => {
  if (!audio) {
    musicInfo.textContent = `⚠️ 请先导入音乐`;
    return;
  }
  
  // Resume audio context if needed (browser autoplay policy)
  if (audioContext && audioContext.state === 'suspended') {
    audioContext.resume();
  }
  
  if (isPlaying) {
    audio.pause();
    isPlaying = false;
    lastBassEnergy = 0; // Reset beat detection
  } else {
    audio.play().catch(err => {
      console.error('Play failed:', err);
      musicInfo.textContent = `❌ 播放失败`;
    });
    isPlaying = true;
  }
  
  updatePlayPauseButton();
});

// Fullscreen toggle
fullscreenBtn.addEventListener('click', () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(err => {
      console.error(`全屏启用失败: ${err.message}`);
      musicInfo.textContent = `⚠️ 全屏启用失败`;
    });
    fullscreenBtn.textContent = `⛶ 退出全屏`;
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    }
    fullscreenBtn.textContent = `⛶ 全屏`;
  }
});

// Listen for fullscreen change events
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement) {
    fullscreenBtn.textContent = `⛶ 全屏`;
  } else {
    fullscreenBtn.textContent = `⛶ 退出全屏`;
  }
});

// Update play/pause button text
function updatePlayPauseButton() {
  playPauseBtn.textContent = isPlaying ? '⏸ 暂停' : '▶ 播放';
}

// Auto-load and play music from server
function loadMusicListAndPlay() {
  console.log('🎵 Loading predefined music file...');
  
  // Directly use the hardcoded music file
  const musicFile = {
    name: '冰雪美丽的你.mp3',
    url: './冰雪美丽的你.mp3',
    type: 'audio/wav'
  };
  
  musicList = [musicFile];
  autoPlayEnabled = true;
  currentMusicIndex = 0;
  
  console.log(`✅ Music file loaded: ${musicFile.name}`);
  console.log('🎵 Starting auto-play...\n');
  
  playMusicAtIndex(0);
}

// Play music at specific index
function playMusicAtIndex(index) {
  if (!musicList || musicList.length === 0) {
    console.warn('⚠️ Music list is empty');
    return;
  }
  
  // Ensure index is within bounds (loop back to start if needed)
  currentMusicIndex = index % musicList.length;
  const musicFile = musicList[currentMusicIndex];
  
  console.log(`\n🎶 Loading: ${musicFile.name} (${currentMusicIndex + 1}/${musicList.length})`);
  
  // Clean up previous audio completely
  if (audio) {
    // Remove all event listeners before cleaning up
    audio.removeEventListener('canplaythrough', onCanPlayThrough);
    audio.removeEventListener('ended', onAudioEnded);
    audio.removeEventListener('error', onAudioError);
    audio.removeEventListener('timeupdate', onTimeUpdate);
    
    audio.pause();
    audio.src = '';
    audio.load();
    
    if (source) {
      try {
        source.disconnect();
      } catch (e) {
        // Ignore disconnect errors
      }
      source = null;
    }
  }
  
  // Create new audio element
  audio = new Audio(musicFile.url);
  audio.loop = false; // We'll handle looping manually
  musicFileName = musicFile.name;
  
  // Reconnect audio analysis to the new audio element
  if (analyser && audioContext) {
    try {
      // Disconnect old source if exists
      if (source) {
        source.disconnect();
        source = null;
      }
      
      // Create new source for the new audio element
      source = audioContext.createMediaElementSource(audio);
      source.connect(analyser);
      analyser.connect(audioContext.destination);
      console.log('✅ Audio analysis reconnected to new track');
    } catch (err) {
      console.error('Failed to reconnect audio analysis:', err);
    }
  }
  
  // Set up event listeners using named functions for proper cleanup
  audio.addEventListener('canplaythrough', onCanPlayThrough);
  audio.addEventListener('ended', onAudioEnded);
  audio.addEventListener('error', onAudioError);
  
  // Monitor playback progress
  lastTimeUpdate = 0;
  audio.addEventListener('timeupdate', onTimeUpdate);
}

// Named event handler functions for proper cleanup
function onCanPlayThrough() {
  if (!audio) return;
  
  console.log(`✅ Ready to play: ${musicFileName}`);
  musicInfo.textContent = `🎵 ${musicFileName}`;
  
  // Reset bass energy statistics for new track
  resetBassStats();
  console.log('📊 Bass energy statistics reset for new track');
  
  // Initialize audio analysis if not already done
  if (!analyser) {
    initAudioAnalysis();
  }
  
  // Start playing
  audio.play()
    .then(() => {
      isPlaying = true;
      updatePlayPauseButton();
      console.log(`▶️  Playing: ${musicFileName}\n`);
    })
    .catch(err => {
      console.error(`❌ Failed to play ${musicFileName}:`, err);
      // Try next song
      setTimeout(() => playNextMusic(), 1000);
    });
}

function onAudioEnded() {
  if (!audio) return;
  
  console.log(`✅ Finished: ${musicFileName}`);
  console.log(`   Duration: ${audio.duration}s, Current time: ${audio.currentTime}s`);
  isPlaying = false;
  lastBassEnergy = 0;
  
  // Play next song after a short delay
  setTimeout(() => playNextMusic(), 500);
}

function onAudioError(e) {
  if (!audio) return;
  
  console.error(`❌ Error loading ${musicFileName}:`, e);
  // Try next song
  setTimeout(() => playNextMusic(), 1000);
}

let lastTimeUpdate = 0;
function onTimeUpdate() {
  if (!audio) return;
  
  const now = Date.now();
  if (now - lastTimeUpdate > 5000) { // Log every 5 seconds
    const progress = audio.duration ? ((audio.currentTime / audio.duration) * 100).toFixed(1) : 'unknown';
    console.log(`📊 Playback: ${audio.currentTime.toFixed(1)}s / ${audio.duration?.toFixed(1) || 'unknown'}s (${progress}%)`);
    lastTimeUpdate = now;
  }
}

// Play next music in the list
function playNextMusic() {
  if (!autoPlayEnabled || musicList.length === 0) {
    return;
  }
  
  const nextIndex = (currentMusicIndex + 1) % musicList.length;
  
  if (nextIndex === 0) {
    console.log('\n🔄 Looping back to first song...\n');
  }
  
  playMusicAtIndex(nextIndex);
}

// Load music list when page is fully loaded
window.addEventListener('load', () => {
  // Wait a bit for water simulation to initialize
  setTimeout(() => {
    loadMusicListAndPlay();
  }, 2000);
});

// Initialize Web Audio API for analysis
function initAudioAnalysis() {
  if (!audio) {
    console.warn('⚠️ Audio element not ready yet');
    return;
  }
  
  try {
    // Create audio context if it doesn't exist
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    
    // Resume audio context if suspended
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }
    
    // Disconnect old source if it exists
    if (source) {
      try {
        source.disconnect();
      } catch (e) {
        // Ignore disconnect errors
      }
      source = null;
    }
    
    // Create new analyser and source
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.8;
    
    source = audioContext.createMediaElementSource(audio);
    source.connect(analyser);
    analyser.connect(audioContext.destination);
    
    const bufferLength = analyser.frequencyBinCount;
    dataArray = new Uint8Array(bufferLength);
    
    console.log('✅ Audio analysis initialized/updated');
    console.log('   - Context state:', audioContext.state);
    console.log('   - Analyser fftSize:', analyser.fftSize);
    console.log('   - Buffer length:', bufferLength);
    console.log('   - Source connected to:', audio.src ? 'Custom audio' : 'Auto-play audio');
  } catch (err) {
    console.error('Failed to initialize audio analysis:', err);
  }
}

// Analyze audio frequency data
function analyzeAudio() {
  if (!analyser || !dataArray) {
    console.warn('⚠️ Analyser or dataArray not ready');
    return { bass: 0, mid: 0, treble: 0 };
  }
  
  analyser.getByteFrequencyData(dataArray);
  
  // Calculate energy in different frequency bands
  const bass = getAverageFrequency(dataArray, 0, 10);      // Low frequencies (bass/drums)
  const mid = getAverageFrequency(dataArray, 10, 50);      // Mid frequencies (vocals/melody)
  const treble = getAverageFrequency(dataArray, 50, 100);  // High frequencies (cymbals/details)
  
  return { bass, mid, treble };
}

// Get average frequency value in a range
function getAverageFrequency(array, start, end) {
  let sum = 0;
  for (let i = start; i < end && i < array.length; i++) {
    sum += array[i];
  }
  return sum / (end - start) / 255; // Normalize to [0, 1]
}

// Detect beat based on bass energy level
function detectBeat(currentBassEnergy) {
  lastBassEnergy = currentBassEnergy;
  
  // Simple threshold: if bass energy exceeds the threshold, it's a beat
  const beatDetected = currentBassEnergy > BEAT_THRESHOLD;
  
  return beatDetected;
}

// Add water drop at random position
function addRandomDrop(intensity = 0.5) {
  // Check if waterSimulation and renderer are available (now checking for null)
  if (!waterSimulation || !renderer) {
    return;
  }
  
  // Apply music effect intensity multiplier
  const adjustedIntensity = intensity * musicEffectIntensity;
  
  const x = Math.random() * 2 - 1;  // Range [-1, 1]
  const z = Math.random() * 2 - 1;  // Range [-1, 1]
  const radius = 0.02 + adjustedIntensity * 0.03;     // 0.02-0.05 based on intensity
  const strength = 0.03 + adjustedIntensity * 0.05;   // 0.03-0.08 based on intensity
  
  waterSimulation.addDrop(renderer, x, z, radius, strength);
}

// Add trail drops (similar to mouse drag effect)
function addTrailDrops(intensity = 0.5) {
  // Check if waterSimulation and renderer are available
  if (!waterSimulation || !renderer) {
    return;
  }

  // Apply music effect intensity multiplier
  const adjustedIntensity = intensity * musicEffectIntensity;

  // Generate a random starting position
  const startX = Math.random() * 2 - 1;  // Range [-1, 1]
  const startZ = Math.random() * 2 - 1;  // Range [-1, 1]

  // Generate a random direction
  const angle = Math.random() * Math.PI * 2;
  const dx = Math.cos(angle) * 0.05;
  const dz = Math.sin(angle) * 0.05;

  // Create trail of drops
  const trailLength = Math.floor(5 + adjustedIntensity * 7); // 5-12 drops based on intensity
  for (let i = 0; i < trailLength; i++) {
    setTimeout(() => {
      const x = startX + dx * i;
      const z = startZ + dz * i;
      const radius = 0.02 + adjustedIntensity * 0.03;
      const strength = 0.03 + adjustedIntensity * 0.05;
      waterSimulation.addDrop(renderer, x, z, radius, strength);
    }, i * 30); // 30ms interval between drops
  }
}

// Add multiple drops based on music intensity
function addMusicDrops(intensity) {
  // Check if waterSimulation is available (now checking for null)
  if (!waterSimulation) {
    return;
  }
  
  const now = Date.now();
  
  // Throttle drop creation (increased interval to reduce frequency)
  if (now - lastMusicDropTime < MIN_MUSIC_DROP_INTERVAL) {
    return;
  }
  
  // Apply music effect intensity to drop count
  const adjustedIntensity = intensity * musicEffectIntensity;
  const dropCount = Math.floor(adjustedIntensity * 2) + 1;
  
  // 30% chance to create trail effect (similar to mouse drag)
  if (Math.random() < 0.3) {
    addTrailDrops(adjustedIntensity);
  } else {
    for (let i = 0; i < dropCount; i++) {
      setTimeout(() => {
        addRandomDrop(adjustedIntensity); // Use adjusted intensity
      }, i * mobileConfig.dropInterval); // Use configured drop interval
    }
  }
  
  lastMusicDropTime = now;
}

// Process music rhythm and create water effects
let frameCounter = 0;
let lastDebugLogTime = 0;
let initializationWarningShown = false;

function processMusicRhythm() {
  // Check if everything is ready
  if (!isPlaying || !analyser) {
    return;
  }
  
  // If intensity is 0, disable all music effects
  if (musicEffectIntensity <= 0) {
    return;
  }
  
  // Check if water simulation is ready (now checking for null instead of undefined)
  if (!waterSimulation || !renderer) {
    // Show warning only once
    if (!initializationWarningShown) {
      console.warn('⚠️ Water simulation not ready yet. Please wait for the page to fully load before importing music.');
      console.log('   Tip: Wait until you see the water surface, then import music.');
      console.log('   Debug: waterSimulation =', waterSimulation, ', renderer =', renderer);
      initializationWarningShown = true;
      
      // Reset warning flag after 5 seconds
      setTimeout(() => {
        initializationWarningShown = false;
      }, 5000);
    }
    return;
  }
  
  const { bass, mid, treble } = analyzeAudio();
  
  // Update bass energy statistics (track min/max continuously)
  if (bass > 0) {
    if (!bassEnergyStats.initialized) {
      // Initialize with first detected value
      bassEnergyStats.min = bass;
      bassEnergyStats.max = bass;
      bassEnergyStats.initialized = true;
    } else {
      // Continuously update min/max
      bassEnergyStats.min = Math.min(bassEnergyStats.min, bass);
      bassEnergyStats.max = Math.max(bassEnergyStats.max, bass);
    }
  }
  
  // Debug: Log audio levels every 60 frames (~1 second at 60fps)
  frameCounter++;
  const now = Date.now();
  
  if (frameCounter % 60 === 0) {
    console.log(`🎵 Bass: ${bass.toFixed(3)} | Range: [${bassEnergyStats.min?.toFixed(3) || 'N/A'} - ${bassEnergyStats.max?.toFixed(3) || 'N/A'}]`);
    
    // Auto-adjust slider range every 5 seconds (300 frames)
    if (frameCounter % 300 === 0 && bassEnergyStats.initialized) {
      updateSliderRange();
    }
  }
  
  // Bass triggers main drops (beats)
  const canDetect = detectBeat(bass);
  if (canDetect) {
    console.log(`💥 Beat detected! Bass: ${bass.toFixed(3)}, Delta: ${(bass - lastBassEnergy).toFixed(3)}, Threshold: ${BEAT_THRESHOLD}`);
    addMusicDrops(bass);
  }
  
  // Log beat detection status every 2 seconds
  if (now - lastDebugLogTime > 2000) {
    console.log(`📊 Beat Detection Status - Last Bass: ${lastBassEnergy.toFixed(3)}, Current: ${bass.toFixed(3)}, Can Detect: ${canDetect}`);
    lastDebugLogTime = now;
  }
  
  // Disabled: Mid and High frequencies no longer trigger water effects
  // Only Bass (kick drum) drives the water ripples for cleaner rhythm visualization
  /*
  // Mid frequencies trigger occasional ripples (reduced probability)
  const midThreshold = BEAT_THRESHOLD * 2.5;
  if (mid > midThreshold && Math.random() > 0.92) {
    addRandomDrop(mid * 0.4 * musicEffectIntensity);
  }
  
  // High frequencies add subtle details (reduced probability and intensity)
  const trebleThreshold = BEAT_THRESHOLD * 3;
  if (treble > trebleThreshold && Math.random() > 0.96) {
    addRandomDrop(treble * 0.25 * musicEffectIntensity);
  }
  */
}

// Manual test function - run this in console to verify audio analysis
window.testAudioAnalysis = function() {
  console.log('=== 🧪 Manual Audio Analysis Test ===');
  
  if (!audio) {
    console.error('❌ No audio element');
    return;
  }
  
  console.log('1. Audio Status:');
  console.log('   - Paused:', audio.paused);
  console.log('   - Current Time:', audio.currentTime);
  console.log('   - Duration:', audio.duration);
  console.log('   - Volume:', audio.volume);
  
  if (!analyser || !dataArray) {
    console.error('❌ Analyser or dataArray not initialized');
    return;
  }
  
  console.log('\n2. Analyser Status:');
  console.log('   - Analyser exists:', !!analyser);
  console.log('   - DataArray length:', dataArray.length);
  
  // Get current frequency data
  analyser.getByteFrequencyData(dataArray);
  
  console.log('\n3. Frequency Data:');
  const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
  console.log('   - Average level:', (avg / 255).toFixed(3));
  console.log('   - Max value:', Math.max(...dataArray));
  console.log('   - Min value:', Math.min(...dataArray));
  console.log('   - First 20 values:', Array.from(dataArray.slice(0, 20)));
  
  // Calculate bands
  const bass = getAverageFrequency(dataArray, 0, 10);
  const mid = getAverageFrequency(dataArray, 10, 50);
  const treble = getAverageFrequency(dataArray, 50, 100);
  
  console.log('\n4. Frequency Bands:');
  console.log('   - Bass (0-10):', bass.toFixed(3));
  console.log('   - Mid (10-50):', mid.toFixed(3));
  console.log('   - Treble (50-100):', treble.toFixed(3));
  
  if (avg === 0) {
    console.error('\n❌ PROBLEM: All frequency values are 0!');
    console.error('Possible causes:');
    console.error('  1. Audio is not actually playing');
    console.error('  2. Analyser is not connected to audio source');
    console.error('  3. Audio volume is 0');
    console.error('\nTry:');
    console.error('  - Pause and play the audio again');
    console.error('  - Check system volume');
    console.error('  - Try a different audio file');
  } else {
    console.log('\n✅ Audio analysis is working correctly!');
    console.log('If you still don\'t see water drops, check:');
    console.log('  - BEAT_THRESHOLD might be too high (current:', BEAT_THRESHOLD, ')');
    console.log('  - Try lowering it: BEAT_THRESHOLD = 0.05');
  }
  
  console.log('\n=== Test Complete ===');
};

console.log('💡 Tip: Run window.testAudioAnalysis() in console to debug');

function loadFile(filename) {
  return new Promise((resolve, reject) => {
    const loader = new THREE.FileLoader();

    loader.load(filename, (data) => {
      resolve(data);
    });
  });
}

// Shader chunks
loadFile('shaders/utils.glsl').then((utils) => {
  THREE.ShaderChunk['utils'] = utils;

  // Create Renderer with Orthographic Camera for top-down view
  // Set frustumSize to match pool depth so pool fills the screen
  const aspect = width / height;
  const clampedAspect = Math.max(0.6, Math.min(1.8, aspect));
  const frustumSize = poolDepth; // Match pool depth to fill screen vertically
  const camera = new THREE.OrthographicCamera(
    -frustumSize * clampedAspect / 2,
    frustumSize * clampedAspect / 2,
    frustumSize / 2,
    -frustumSize / 2,
    0.01,
    100
  );
  camera.position.set(0, 5, 0);  // Top-down position
  camera.lookAt(0, 0, 0);         // Look at center

  // Assign to global variable instead of creating local const
  // Detect if mobile device for performance optimization
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
                   (window.matchMedia && window.matchMedia('(max-width: 768px)').matches);
  
  renderer = new THREE.WebGLRenderer({
    canvas: canvas, 
    antialias: !isMobile,  // Disable antialias on mobile for better performance
    alpha: true,
    powerPreference: 'high-performance'
  });
  renderer.setSize(width, height);
  renderer.autoClear = false;
  
  // Set pixel ratio for mobile devices (limit to avoid performance issues)
  const pixelRatio = Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2);
  renderer.setPixelRatio(pixelRatio);
  
  console.log(`📱 Device: ${isMobile ? 'Mobile' : 'Desktop'}, Pixel Ratio: ${pixelRatio.toFixed(1)}`);
  
  // Light direction
  const light = [0.7559289460184544, 0.7559289460184544, -0.3779644730092272];

  // Create mouse Controls
  const controls = new THREE.TrackballControls(
    camera,
    canvas
  );

  controls.screen.width = width;
  controls.screen.height = height;

  controls.rotateSpeed = 2.5;
  controls.zoomSpeed = 1.2;
  controls.panSpeed = 0.9;
  controls.dynamicDampingFactor = 0.9;

  // Ray caster
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  const targetgeometry = new THREE.PlaneGeometry(poolWidth, poolDepth);
  for (let vertex of targetgeometry.vertices) {
    vertex.z = - vertex.y;
    vertex.y = 0.;
  }
  const targetmesh = new THREE.Mesh(targetgeometry);

  // Loading progress tracking
  let loadedResources = 0;
  const totalResources = 12; // 6 cube maps + 1 tiles + 5 shader files
  
  function updateLoadingProgress(resourceName) {
    loadedResources++;
    const progress = Math.min(Math.round((loadedResources / totalResources) * 100), 100);
    
    // Update progress bar
    if (progressBar) {
      progressBar.style.width = `${progress}%`;
    }
    
    // Update progress text
    if (loadingProgress) {
      loadingProgress.textContent = `加载中... ${progress}% (${loadedResources}/${totalResources})`;
    }
    
    console.log(`📦 Loaded: ${resourceName} (${progress}%)`);
  }

  // Textures with progress tracking
  const cubetextureloader = new THREE.CubeTextureLoader();
  
  const textureCube = cubetextureloader.load(
    ['xpos.jpg', 'xneg.jpg', 'ypos.jpg', 'ypos.jpg', 'zpos.jpg', 'zneg.jpg'],
    undefined,
    undefined,
    (err) => {
      console.error('Failed to load cube texture:', err);
    }
  );
  
  // Track cube map loading (simulate as one resource for simplicity)
  setTimeout(() => updateLoadingProgress('Cube Maps'), 100);

  const textureloader = new THREE.TextureLoader();

  // Load different tile textures based on device type for better performance
  const tilesFileName = isMobile ? 'tiles.jpg' : 'tiles_pc.jpg';
  const tiles = textureloader.load(
    tilesFileName,
    () => updateLoadingProgress(tilesFileName),
    undefined,
    (err) => {
      console.error(`Failed to load ${tilesFileName}:`, err);
    }
  );

  class WaterSimulation {

    constructor() {
      this._camera = new THREE.OrthographicCamera(0, 1, 1, 0, 0, 2000);

      this._geometry = new THREE.PlaneBufferGeometry(2, 2);

      // Optimize simulation texture size for mobile devices
      const simulationSize = mobileConfig.simulationSize;
      console.log(`🌊 Simulation texture size: ${simulationSize}x${simulationSize}`);
      
      this._textureA = new THREE.WebGLRenderTarget(simulationSize, simulationSize, {type: THREE.FloatType});
      this._textureB = new THREE.WebGLRenderTarget(simulationSize, simulationSize, {type: THREE.FloatType});
      this.texture = this._textureA;

      const shadersPromises = [
        loadFile('shaders/simulation/vertex.glsl').then(s => { updateLoadingProgress('simulation/vertex.glsl'); return s; }),
        loadFile('shaders/simulation/drop_fragment.glsl').then(s => { updateLoadingProgress('simulation/drop_fragment.glsl'); return s; }),
        loadFile('shaders/simulation/normal_fragment.glsl').then(s => { updateLoadingProgress('simulation/normal_fragment.glsl'); return s; }),
        loadFile('shaders/simulation/update_fragment.glsl').then(s => { updateLoadingProgress('simulation/update_fragment.glsl'); return s; }),
      ];

      this.loaded = Promise.all(shadersPromises)
          .then(([vertexShader, dropFragmentShader, normalFragmentShader, updateFragmentShader]) => {
        const dropMaterial = new THREE.RawShaderMaterial({
          uniforms: {
              center: { value: [0, 0] },
              radius: { value: 0 },
              strength: { value: 0 },
              texture: { value: null },
          },
          vertexShader: vertexShader,
          fragmentShader: dropFragmentShader,
        });

        const normalMaterial = new THREE.RawShaderMaterial({
          uniforms: {
              delta: { value: [1 / 256, 1 / 256] },  // TODO: Remove this useless uniform and hardcode it in shaders?
              texture: { value: null },
          },
          vertexShader: vertexShader,
          fragmentShader: normalFragmentShader,
        });

        const updateMaterial = new THREE.RawShaderMaterial({
          uniforms: {
              delta: { value: [1 / 256, 1 / 256] },  // TODO: Remove this useless uniform and hardcode it in shaders?
              texture: { value: null },
          },
          vertexShader: vertexShader,
          fragmentShader: updateFragmentShader,
        });

        this._dropMesh = new THREE.Mesh(this._geometry, dropMaterial);
        this._normalMesh = new THREE.Mesh(this._geometry, normalMaterial);
        this._updateMesh = new THREE.Mesh(this._geometry, updateMaterial);
      });
    }

    // Add a drop of water at the (x, y) coordinate (in the range [-1, 1])
    addDrop(renderer, x, y, radius, strength) {
      this._dropMesh.material.uniforms['center'].value = [x, y];
      this._dropMesh.material.uniforms['radius'].value = radius;
      this._dropMesh.material.uniforms['strength'].value = strength;

      this._render(renderer, this._dropMesh);
    }

    stepSimulation(renderer) {
      this._render(renderer, this._updateMesh);
    }

    updateNormals(renderer) {
      this._render(renderer, this._normalMesh);
    }

    _render(renderer, mesh) {
      // Swap textures
      const oldTexture = this.texture;
      const newTexture = this.texture === this._textureA ? this._textureB : this._textureA;

      mesh.material.uniforms['texture'].value = oldTexture.texture;

      renderer.setRenderTarget(newTexture);
      
      // Clear the render target before rendering to avoid mixing with old content
      // Use black color with alpha=1 for stable clearing on mobile devices
      renderer.setClearColor(black, 1);
      renderer.clear();

      // TODO Camera is useless here, what should be done?
      renderer.render(mesh, this._camera);

      this.texture = newTexture;
    }

  }


  class Caustics {

    constructor(lightFrontGeometry) {
      this._camera = new THREE.OrthographicCamera(0, 1, 1, 0, 0, 2000);

      this._geometry = lightFrontGeometry;

      // Optimize caustics texture size for mobile devices
      const causticsSize = mobileConfig.causticsSize;
      this.texture = new THREE.WebGLRenderTarget(causticsSize, causticsSize, {type: THREE.UNSIGNED_BYTE});
      console.log(`✨ Caustics texture size: ${causticsSize}x${causticsSize}`);

      const shadersPromises = [
        loadFile('shaders/caustics/vertex.glsl').then(s => { updateLoadingProgress('caustics/vertex.glsl'); return s; }),
        loadFile('shaders/caustics/fragment.glsl').then(s => { updateLoadingProgress('caustics/fragment.glsl'); return s; })
      ];

      this.loaded = Promise.all(shadersPromises)
          .then(([vertexShader, fragmentShader]) => {
        const material = new THREE.RawShaderMaterial({
          uniforms: {
              light: { value: light },
              water: { value: null },
          },
          vertexShader: vertexShader,
          fragmentShader: fragmentShader,
        });

        this._causticMesh = new THREE.Mesh(this._geometry, material);
      });
    }

    update(renderer, waterTexture) {
      this._causticMesh.material.uniforms['water'].value = waterTexture;

      renderer.setRenderTarget(this.texture);
      // Use alpha=1 for consistent clearing behavior on mobile devices
      renderer.setClearColor(black, 1);
      renderer.clear();

      // TODO Camera is useless here, what should be done?
      renderer.render(this._causticMesh, this._camera);
    }

  }


  class Water {

    constructor(poolWidth, poolDepth) {
      // Optimize water geometry segments for mobile devices
      const segments = mobileConfig.waterSegments;
      this.geometry = new THREE.PlaneBufferGeometry(poolWidth, poolDepth, segments, segments);
      console.log(`💧 Water geometry segments: ${segments}x${segments}`);

      const shadersPromises = [
        loadFile('shaders/water/vertex.glsl').then(s => { updateLoadingProgress('water/vertex.glsl'); return s; }),
        loadFile('shaders/water/fragment.glsl').then(s => { updateLoadingProgress('water/fragment.glsl'); return s; })
      ];

      this.loaded = Promise.all(shadersPromises)
          .then(([vertexShader, fragmentShader]) => {
        this.material = new THREE.RawShaderMaterial({
          uniforms: {
              light: { value: light },
              tiles: { value: tiles },
              sky: { value: textureCube },
              water: { value: null },
              causticTex: { value: null },
              underwater: { value: false },
              poolHalfWidth: { value: poolWidth / 2 },
              poolHalfDepth: { value: poolDepth / 2 },
          },
          vertexShader: vertexShader,
          fragmentShader: fragmentShader,
        });

        this.mesh = new THREE.Mesh(this.geometry, this.material);
      });
    }

    draw(renderer, waterTexture, causticsTexture) {
      this.material.uniforms['water'].value = waterTexture;
      this.material.uniforms['causticTex'].value = causticsTexture;

      this.material.side = THREE.FrontSide;
      this.material.uniforms['underwater'].value = true;
      renderer.render(this.mesh, camera);

      this.material.side = THREE.BackSide;
      this.material.uniforms['underwater'].value = false;
      renderer.render(this.mesh, camera);
    }

  }


  class Pool {

    constructor(poolWidth, poolDepth) {
      this._geometry = new THREE.BufferGeometry();
      const halfW = poolWidth / 2;
      const halfD = poolDepth / 2;
      const vertices = new Float32Array([
        -halfW, -1, -halfD,
        -halfW, -1, halfD,
        -halfW, 1, -halfD,
        -halfW, 1, halfD,
        halfW, -1, -halfD,
        halfW, 1, -halfD,
        halfW, -1, halfD,
        halfW, 1, halfD,
        -halfW, -1, -halfD,
        halfW, -1, -halfD,
        -halfW, -1, halfD,
        halfW, -1, halfD,
        -halfW, 1, -halfD,
        -halfW, 1, halfD,
        halfW, 1, -halfD,
        halfW, 1, halfD,
        -halfW, -1, -halfD,
        -halfW, 1, -halfD,
        halfW, -1, -halfD,
        halfW, 1, -halfD,
        -halfW, -1, halfD,
        halfW, -1, halfD,
        -halfW, 1, halfD,
        halfW, 1, halfD
      ]);
      const indices = new Uint32Array([
        0, 1, 2,
        2, 1, 3,
        4, 5, 6,
        6, 5, 7,
        12, 13, 14,
        14, 13, 15,
        16, 17, 18,
        18, 17, 19,
        20, 21, 22,
        22, 21, 23
      ]);

      this._geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
      this._geometry.setIndex(new THREE.BufferAttribute(indices, 1));

      const shadersPromises = [
        loadFile('shaders/pool/vertex.glsl').then(s => { updateLoadingProgress('pool/vertex.glsl'); return s; }),
        loadFile('shaders/pool/fragment.glsl').then(s => { updateLoadingProgress('pool/fragment.glsl'); return s; })
      ];

      this.loaded = Promise.all(shadersPromises)
          .then(([vertexShader, fragmentShader]) => {
        this._material = new THREE.RawShaderMaterial({
          uniforms: {
              light: { value: light },
              tiles: { value: tiles },
              water: { value: null },
              causticTex: { value: null },
              poolHalfWidth: { value: halfW },
              poolHalfDepth: { value: halfD },
          },
          vertexShader: vertexShader,
          fragmentShader: fragmentShader,
        });
        this._material.side = THREE.FrontSide;

        this._mesh = new THREE.Mesh(this._geometry, this._material);
      });
    }

    draw(renderer, waterTexture, causticsTexture) {
      this._material.uniforms['water'].value = waterTexture;
      this._material.uniforms['causticTex'].value = causticsTexture;

      renderer.render(this._mesh, camera);
    }

  }


  class Debug {

    constructor() {
      this._camera = new THREE.OrthographicCamera(0, 1, 1, 0, 0, 1);
      this._geometry = new THREE.PlaneBufferGeometry();

      const shadersPromises = [
        loadFile('shaders/debug/vertex.glsl').then(s => { updateLoadingProgress('debug/vertex.glsl'); return s; }),
        loadFile('shaders/debug/fragment.glsl').then(s => { updateLoadingProgress('debug/fragment.glsl'); return s; })
      ];

      this.loaded = Promise.all(shadersPromises)
          .then(([vertexShader, fragmentShader]) => {
        this._material = new THREE.RawShaderMaterial({
          uniforms: {
              texture: { value: null },
          },
          vertexShader: vertexShader,
          fragmentShader: fragmentShader,
        });

        this._mesh = new THREE.Mesh(this._geometry, this._material);
      });
    }

    draw(renderer, texture) {
      this._material.uniforms['texture'].value = texture;

      renderer.setRenderTarget(null);
      renderer.render(this._mesh, this._camera);
    }

  }

  // Assign to global variable instead of creating local const
  waterSimulation = new WaterSimulation();
  const water = new Water(poolWidth, poolDepth);
  const caustics = new Caustics(water.geometry);
  const pool = new Pool(poolWidth, poolDepth);

  const debug = new Debug();


  // Main rendering loop
  function animate() {
    waterSimulation.stepSimulation(renderer);
    waterSimulation.updateNormals(renderer);

    const waterTexture = waterSimulation.texture.texture;

    caustics.update(renderer, waterTexture);

    const causticsTexture = caustics.texture.texture;

    // debug.draw(renderer, causticsTexture);

    // Process music rhythm and create water drops
    processMusicRhythm();

    renderer.setRenderTarget(null);
    renderer.setClearColor(white, 1);
    renderer.clear();

    water.draw(renderer, waterTexture, causticsTexture);
    pool.draw(renderer, waterTexture, causticsTexture);

    controls.update();

    window.requestAnimationFrame(animate);
  }

  let isMouseDown = false;

  function onMouseDown(event) {
    isMouseDown = true;
    addDropAtMouse(event);
  }

  function onMouseUp(event) {
    isMouseDown = false;
  }

  function onMouseMove(event) {
    // Create drops when mouse is pressed (dragging)
    if (isMouseDown) {
      addDropAtMouse(event);
    }
  }

  // Touch event handlers for mobile devices
  let touchStartTime = 0;
  let lastTouchPosition = null;

  function onTouchStart(event) {
    event.preventDefault();
    
    if (event.touches.length === 1) {
      const touch = event.touches[0];
      isMouseDown = true;
      touchStartTime = Date.now();
      lastTouchPosition = { x: touch.clientX, y: touch.clientY };
      
      // Show music panel on touch
      showMusicPanel();
      
      addDropAtTouch(touch);
    }
  }

  function onTouchEnd(event) {
    event.preventDefault();
    isMouseDown = false;
    lastTouchPosition = null;
    
    // Hide panel after a short delay if no further interaction
    setTimeout(() => {
      if (!isMouseDown) {
        hideMusicPanel();
      }
    }, 2000);
  }

  function onTouchMove(event) {
    event.preventDefault();
    
    if (event.touches.length === 1 && isMouseDown) {
      const touch = event.touches[0];
      
      // Only create drops if finger moved significantly (avoid accidental taps)
      if (lastTouchPosition) {
        const dx = touch.clientX - lastTouchPosition.x;
        const dy = touch.clientY - lastTouchPosition.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance > mobileConfig.touchThreshold) { // Use configured touch threshold
          addDropAtTouch(touch);
          lastTouchPosition = { x: touch.clientX, y: touch.clientY };
          
          // Keep panel visible while interacting
          showMusicPanel();
        }
      }
    }
  }

  function addDropAtTouch(touch) {
    const rect = canvas.getBoundingClientRect();

    mouse.x = (touch.clientX - rect.left) * 2 / width - 1;
    mouse.y = - (touch.clientY - rect.top) * 2 / height + 1;

    raycaster.setFromCamera(mouse, camera);

    const intersects = raycaster.intersectObject(targetmesh);

    for (let intersect of intersects) {
      waterSimulation.addDrop(renderer, intersect.point.x, intersect.point.z, 0.03, 0.04);
    }
  }

  function addDropAtMouse(event) {
    const rect = canvas.getBoundingClientRect();

    mouse.x = (event.clientX - rect.left) * 2 / width - 1;
    mouse.y = - (event.clientY - rect.top) * 2 / height + 1;

    raycaster.setFromCamera(mouse, camera);

    const intersects = raycaster.intersectObject(targetmesh);

    for (let intersect of intersects) {
      waterSimulation.addDrop(renderer, intersect.point.x, intersect.point.z, 0.03, 0.04);
    }
  }
  
  // Enable mouse trail effect (call this in console to enable)
  window.enableMouseTrail = function() {
    canvas.removeEventListener('mousemove', onMouseMove);
    
    const onMouseMoveWithTrail = (event) => {
      if (isMouseDown) {
        addDropAtMouse(event);
      } else {
        addMouseTrail(event);
      }
    };
    
    canvas.addEventListener('mousemove', onMouseMoveWithTrail);
    console.log('✅ Mouse trail effect enabled! Move your mouse over the water surface.');
  };

  // Add subtle water trail when mouse moves (optional feature)
  function addMouseTrail(event) {
    const now = Date.now();
    
    // Throttle trail creation to prevent excessive drops
    if (now - lastMouseDropTime < MOUSE_TRAIL_INTERVAL) {
      return;
    }
    
    const rect = canvas.getBoundingClientRect();
    mouse.x = (event.clientX - rect.left) * 2 / width - 1;
    mouse.y = - (event.clientY - rect.top) * 2 / height + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(targetmesh);

    for (let intersect of intersects) {
      // Create very subtle drops for mouse trail
      waterSimulation.addDrop(renderer, intersect.point.x, intersect.point.z, 0.015, 0.015);
    }
    
    lastMouseDropTime = now;
  }

  const loaded = [waterSimulation.loaded, caustics.loaded, water.loaded, pool.loaded, debug.loaded];

  Promise.all(loaded).then(() => {
    // Hide loading screen with fade out effect
    if (loadingScreen) {
      loadingProgress.textContent = '加载完成！';
      progressBar.style.width = '100%';
      
      setTimeout(() => {
        loadingScreen.style.opacity = '0';
        setTimeout(() => {
          loadingScreen.style.display = 'none';
          console.log('✅ All resources loaded, application ready!');
        }, 500);
      }, 300);
    }
    
    // Add mouse event listeners
    canvas.addEventListener('mousedown', { handleEvent: onMouseDown });
    canvas.addEventListener('mouseup', { handleEvent: onMouseUp });
    canvas.addEventListener('mousemove', { handleEvent: onMouseMove });
    canvas.addEventListener('mouseleave', { handleEvent: onMouseUp });

    // Add touch event listeners for mobile devices
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });

    // Handle window resize with debouncing
    let resizeTimeout;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        
        const newWidth = canvas.width;
        const newHeight = canvas.height;
        
        // Update renderer size
        renderer.setSize(newWidth, newHeight);
        
        // Calculate new pool dimensions with clamped aspect ratio
        const rawAspect = newWidth / newHeight;
        const clampedAspect = Math.max(0.6, Math.min(1.8, rawAspect));
        const newPoolWidth = 2 * clampedAspect;
        const newPoolDepth = 2;
        
        // Update orthographic camera to match pool size (fills screen)
        const frustumSize = newPoolDepth; // Match pool depth
        camera.left = -frustumSize * clampedAspect / 2;
        camera.right = frustumSize * clampedAspect / 2;
        camera.top = frustumSize / 2;
        camera.bottom = -frustumSize / 2;
        camera.updateProjectionMatrix();
        
        // Update controls
        controls.screen.width = newWidth;
        controls.screen.height = newHeight;
        
        // Rebuild targetmesh for raycasting
        targetmesh.geometry.dispose();
        const newTargetGeo = new THREE.PlaneGeometry(newPoolWidth, newPoolDepth);
        for (let vertex of newTargetGeo.vertices) {
          vertex.z = - vertex.y;
          vertex.y = 0.;
        }
        targetmesh.geometry = newTargetGeo;
        
        // Rebuild water geometry
        water.geometry.dispose();
        water.geometry = new THREE.PlaneBufferGeometry(newPoolWidth, newPoolDepth, 200, 200);
        water.mesh.geometry = water.geometry;
        
        // Rebuild pool geometry
        pool._geometry.dispose();
        const halfW = newPoolWidth / 2;
        const halfD = newPoolDepth / 2;
        const vertices = new Float32Array([
          -halfW, -1, -halfD, -halfW, -1, halfD, -halfW, 1, -halfD, -halfW, 1, halfD,
          halfW, -1, -halfD, halfW, 1, -halfD, halfW, -1, halfD, halfW, 1, halfD,
          -halfW, -1, -halfD, halfW, -1, -halfD, -halfW, -1, halfD, halfW, -1, halfD,
          -halfW, 1, -halfD, -halfW, 1, halfD, halfW, 1, -halfD, halfW, 1, halfD,
          -halfW, -1, -halfD, -halfW, 1, -halfD, halfW, -1, -halfD, halfW, 1, -halfD,
          -halfW, -1, halfD, halfW, -1, halfD, -halfW, 1, halfD, halfW, 1, halfD
        ]);
        pool._geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        
        // Update uniforms
        water.material.uniforms['poolHalfWidth'].value = halfW;
        water.material.uniforms['poolHalfDepth'].value = halfD;
        pool._material.uniforms['poolHalfWidth'].value = halfW;
        pool._material.uniforms['poolHalfDepth'].value = halfD;
      }, 200); // Debounce for 200ms
    });

    for (var i = 0; i < 3; i++) {
      waterSimulation.addDrop(
        renderer,
        Math.random() * 2 - 1, Math.random() * 2 - 1,
        0.03, (i & 1) ? 0.02 : -0.02
      );
    }

    animate();
  });

});
