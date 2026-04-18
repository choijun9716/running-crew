// app.js

// Navigation helper
function navigateTo(url) {
  window.location.href = url;
}

// 1. Signup & Login Logic
const phoneInput = document.getElementById('phone-input');
const loginBtn = document.getElementById('login-btn');
const signupPhone = document.getElementById('signup-phone');
const signupName = document.getElementById('signup-name');
const signupBtn = document.getElementById('signup-btn');

if (phoneInput && loginBtn) {
  phoneInput.addEventListener('input', (e) => {
    const val = e.target.value;
    if (val.length >= 10) {
      loginBtn.style.opacity = '1';
      loginBtn.style.pointerEvents = 'auto';
    } else {
      loginBtn.style.opacity = '0.5';
      loginBtn.style.pointerEvents = 'none';
    }
  });

  loginBtn.addEventListener('click', (e) => {
    e.preventDefault();
    if (phoneInput.value.length >= 10) {
      localStorage.setItem('isLoggedIn', 'true');
      navigateTo('dashboard.html');
    }
  });
}

if (signupBtn && signupPhone && signupName) {
  const checkSignupForm = () => {
    if (signupPhone.value.length >= 10 && signupName.value.length > 0) {
      signupBtn.style.opacity = '1';
      signupBtn.style.pointerEvents = 'auto';
    } else {
      signupBtn.style.opacity = '0.5';
      signupBtn.style.pointerEvents = 'none';
    }
  };
  signupPhone.addEventListener('input', checkSignupForm);
  signupName.addEventListener('input', checkSignupForm);

  signupBtn.addEventListener('click', (e) => {
    e.preventDefault();
    localStorage.setItem('userName', signupName.value);
    localStorage.setItem('isLoggedIn', 'true');
    alert('회원가입이 완료되었습니다!');
    navigateTo('dashboard.html');
  });
}

// 2. Attendance Logic
const scanBtn = document.getElementById('scan-btn');
const retryBtn = document.getElementById('retry-btn');
const frameIdle = document.getElementById('frame-idle');
const frameScanning = document.getElementById('frame-scanning');
const frameSuccess = document.getElementById('frame-success');

if (scanBtn && frameIdle) {
  scanBtn.addEventListener('click', () => {
    scanBtn.classList.add('hidden');
    frameIdle.classList.add('hidden');
    frameScanning.classList.remove('hidden');

    setTimeout(() => {
      frameScanning.classList.add('hidden');
      frameSuccess.classList.remove('hidden');
      retryBtn.classList.remove('hidden');
      
      let count = parseInt(localStorage.getItem('attendanceCount') || '4');
      if (count < 5) {
        localStorage.setItem('attendanceCount', (count + 1).toString());
      }
    }, 1500);
  });

  retryBtn.addEventListener('click', () => {
    frameSuccess.classList.add('hidden');
    retryBtn.classList.add('hidden');
    frameIdle.classList.remove('hidden');
    scanBtn.classList.remove('hidden');
  });
}

// 3. Dashbaord Logic
const progressValue = document.getElementById('progress-value');
const progressBar = document.getElementById('progress-bar');
if (progressValue && progressBar) {
  let count = parseInt(localStorage.getItem('attendanceCount') || '4');
  progressValue.innerText = count.toString();
  progressBar.style.width = `${(count / 5) * 100}%`;
  
  if (count >= 5) {
    document.getElementById('reward-text').innerHTML = "축하합니다! <strong>러닝 티셔츠🎁</strong> 달성!";
  }
}

// 4. Run Tracker Logic (with Leaflet Map & GPS)
const startRunBtn = document.getElementById('start-run-btn');
const distanceDisplay = document.getElementById('distance-display');
const timeDisplay = document.getElementById('time-display');
const paceDisplay = document.getElementById('pace-display');
const mapContainer = document.getElementById('map');
const mapOverlay = document.getElementById('map-overlay');

// Haversine formula to calculate distance between two lat/lon points in km
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of the earth in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2)
    ; 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  const d = R * c; 
  return d;
}

if (startRunBtn && mapContainer) {
  let isRunning = false;
  let timerInterval;
  let watchId = null;
  
  let timeSeconds = 0;
  let totalDistanceKm = 0;
  let lastPosition = null;

  // Initialize Map
  const map = L.map('map').setView([37.5665, 126.9780], 15); // Default to Seoul
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://carto.com/">CARTO</a>'
  }).addTo(map);

  let pathLine = L.polyline([], {color: '#caff04', weight: 4}).addTo(map);
  let currentMarker = null;

  // Try to get initial position
  if ("geolocation" in navigator) {
    navigator.geolocation.getCurrentPosition((position) => {
      if(mapOverlay) mapOverlay.style.display = 'none';
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      map.setView([lat, lng], 16);
      currentMarker = L.circleMarker([lat, lng], {
        radius: 8,
        fillColor: "#caff04",
        color: "#fff",
        weight: 2,
        opacity: 1,
        fillOpacity: 1
      }).addTo(map);
    }, () => {
      if(mapOverlay) mapOverlay.innerHTML = '<span style="color:red; font-size: 14px;">GPS 권한이 필요합니다.</span>';
    });
  } else {
    if(mapOverlay) mapOverlay.innerHTML = '<span style="color:red; font-size: 14px;">GPS를 지원하지 않는 브라우저입니다.</span>';
  }

  function startGPSWatch() {
    if ("geolocation" in navigator) {
      watchId = navigator.geolocation.watchPosition((position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const currentPos = [lat, lng];

        // Update Map Marker & Path
        if (currentMarker) {
          currentMarker.setLatLng(currentPos);
        }
        pathLine.addLatLng(currentPos);
        map.panTo(currentPos);

        // Calculate distance if it's not the first point
        if (lastPosition) {
          const dist = calculateDistance(lastPosition[0], lastPosition[1], lat, lng);
          totalDistanceKm += dist;
          distanceDisplay.innerText = totalDistanceKm.toFixed(2);
        }
        lastPosition = currentPos;

      }, (error) => {
        console.error("GPS Error:", error);
      }, {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 5000
      });
    }
  }

  function updateTimer() {
    timeSeconds++;
    const m = Math.floor(timeSeconds / 60).toString().padStart(2, '0');
    const s = (timeSeconds % 60).toString().padStart(2, '0');
    timeDisplay.innerText = `${m}:${s}`;
    
    // Update Pace
    if (totalDistanceKm > 0.01) { // Only show pace after 10 meters to avoid wild numbers
      const minutes = Math.floor((timeSeconds / 60) / totalDistanceKm);
      const seconds = Math.floor((((timeSeconds / 60) / totalDistanceKm) - minutes) * 60);
      paceDisplay.innerText = `${minutes}'${seconds.toString().padStart(2, '0')}"`;
    }
  }

  startRunBtn.addEventListener('click', () => {
    isRunning = !isRunning;
    if (isRunning) {
      startRunBtn.innerText = '일시정지';
      startRunBtn.style.backgroundColor = 'var(--error)';
      startRunBtn.style.color = '#fff';
      startRunBtn.style.boxShadow = '0 0 30px rgba(255, 74, 74, 0.4)';
      distanceDisplay.style.color = 'var(--primary)';
      
      startGPSWatch();
      timerInterval = setInterval(updateTimer, 1000);
    } else {
      startRunBtn.innerText = '시작';
      startRunBtn.style.backgroundColor = 'var(--primary)';
      startRunBtn.style.color = '#000';
      startRunBtn.style.boxShadow = '0 0 30px rgba(202, 255, 4, 0.4)';
      
      clearInterval(timerInterval);
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
      }
    }
  });
}
