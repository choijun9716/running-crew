// app.js

// ==========================================
// 1. 설정 (Settings)
// ==========================================
const ADMIN_PASSWORD = "1234"; // 관리자 출석 비밀번호
// 구글 스프레드시트 API (SheetDB 등) 연결 주소
const SHEET_API_URL = "https://sheetdb.io/api/v1/vhuuqnesv1okv"; 

// Navigation helper
function navigateTo(url) {
  window.location.href = url;
}

// ==========================================
// DB Controller (가짜 DB 혹은 실제 DB 통신)
// ==========================================
async function dbSaveUser(phone, name) {
  localStorage.setItem('userPhone', phone);
  localStorage.setItem('userName', name);
  localStorage.setItem('isLoggedIn', 'true');
  
  if (SHEET_API_URL) {
    try {
      await fetch(SHEET_API_URL + "?sheet=Users", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { phone: phone, name: name, joinDate: new Date().toISOString() } })
      });
    } catch (e) {
      console.error("DB 저장 실패", e);
    }
  }
}

async function dbRecordRun(distance, timeStr, paceStr) {
  let prevDist = parseFloat(localStorage.getItem('totalDistance') || '0');
  localStorage.setItem('totalDistance', (prevDist + distance).toFixed(2));

  if (SHEET_API_URL) {
    const phone = localStorage.getItem('userPhone') || 'unknown';
    try {
      await fetch(SHEET_API_URL + "?sheet=Runs", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { phone: phone, distance: distance.toFixed(2), time: timeStr, pace: paceStr, date: new Date().toISOString() } })
      });
    } catch (e) {
      console.error("달리기 DB 저장 실패", e);
    }
  }
}

async function dbCheckAttendance() {
  let count = parseInt(localStorage.getItem('attendanceCount') || '0');
  count += 1;
  localStorage.setItem('attendanceCount', count.toString());

  if (SHEET_API_URL) {
    const phone = localStorage.getItem('userPhone') || 'unknown';
    // SheetDB Update 로직 (폰 번호 기준으로 출석횟수 덮어쓰기)
    try {
      await fetch(`${SHEET_API_URL}/phone/${phone}?sheet=Users`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { attendanceCount: count } })
      });
    } catch (e) {
      console.error("출석 DB 업데이트 실패", e);
    }
  }
}

// ==========================================
// 2. Signup & Login Logic
// ==========================================
const phoneInput = document.getElementById('phone-input');
const loginBtn = document.getElementById('login-btn');
const signupPhone = document.getElementById('signup-phone');
const signupName = document.getElementById('signup-name');
const signupBtn = document.getElementById('signup-btn');

if (phoneInput && loginBtn) {
  phoneInput.addEventListener('input', (e) => {
    if (e.target.value.length >= 10) {
      loginBtn.style.opacity = '1';
      loginBtn.style.pointerEvents = 'auto';
    } else {
      loginBtn.style.opacity = '0.5';
      loginBtn.style.pointerEvents = 'none';
    }
  });

  loginBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    if (phoneInput.value.length >= 10) {
      const phoneVal = phoneInput.value;
      const errorEl = document.getElementById('login-error');
      
      if (SHEET_API_URL) {
        // 실제 DB 조회
        loginBtn.innerText = "정보 확인 중...";
        try {
          const res = await fetch(`${SHEET_API_URL}/search?phone=${phoneVal}&sheet=Users`);
          const data = await res.json();
          
          if (data && data.length > 0) {
            // 회원가입된 유저 발견!
            const user = data[0];
            localStorage.setItem('userPhone', user.phone);
            localStorage.setItem('userName', user.name);
            localStorage.setItem('attendanceCount', user.attendanceCount || '0');
            localStorage.setItem('isLoggedIn', 'true');
            navigateTo('dashboard.html');
          } else {
            if(errorEl) errorEl.innerText = "가입되지 않은 번호입니다. 크루 회원가입을 먼저 진행해주세요.";
            loginBtn.innerText = "로그인 / 시작하기";
          }
        } catch (err) {
          console.error(err);
          if(errorEl) errorEl.innerText = "서버 통신 에러가 발생했습니다.";
          loginBtn.innerText = "로그인 / 시작하기";
        }
      } else {
        // API 설정 전 로컬 테스트용
        localStorage.setItem('userPhone', phoneVal);
        localStorage.setItem('isLoggedIn', 'true');
        navigateTo('dashboard.html');
      }
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

  signupBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    signupBtn.innerText = "가입 처리 중...";
    await dbSaveUser(signupPhone.value, signupName.value);
    alert('크루 회원가입이 완료되었습니다!');
    navigateTo('dashboard.html');
  });
}

// ==========================================
// 3. Dashbaord & Profile Logic
// ==========================================
function updateDisplayNumbers() {
  const count = parseInt(localStorage.getItem('attendanceCount') || '0');
  const dist = parseFloat(localStorage.getItem('totalDistance') || '0').toFixed(1);
  const name = localStorage.getItem('userName') || '러너';
  const phone = localStorage.getItem('userPhone') || '010';

  // Dashboard
  const dashboardName = document.getElementById('dashboard-name');
  const progressValue = document.getElementById('progress-value');
  const progressBar = document.getElementById('progress-bar');
  const rewardText = document.getElementById('reward-text');
  
  if (dashboardName) {
    dashboardName.innerText = `반가워요, ${name}님! 👋`;
  }

  if (progressValue && progressBar) {
    progressValue.innerText = count.toString();
    progressBar.style.width = `${Math.min((count / 5) * 100, 100)}%`;
    if (count >= 5) {
      if(rewardText) rewardText.innerHTML = "축하합니다! <strong>러닝 티셔츠🎁</strong> 달성!";
    }
  }

  // Profile Update
  const profileName = document.getElementById('profile-name');
  const profilePhone = document.getElementById('profile-phone');
  const profileDist = document.getElementById('profile-dist');
  const profileCount = document.getElementById('profile-count');
  
  if (profileName) profileName.innerText = name;
  if (profilePhone) profilePhone.innerText = phone;
  if (profileDist) profileDist.innerText = dist;
  if (profileCount) profileCount.innerText = count.toString();
}

// Call on every page load
updateDisplayNumbers();

// ==========================================
// 4. Attendance (Password Checking) Logic
// ==========================================
const attendPwInput = document.getElementById('attendance-password');
const scanBtn = document.getElementById('scan-btn'); // Now "출석 확인" btn
const retryBtn = document.getElementById('retry-btn');
const frameIdle = document.getElementById('frame-idle');
const frameScanning = document.getElementById('frame-scanning');
const frameSuccess = document.getElementById('frame-success');
const attendError = document.getElementById('attendance-error');

if (attendPwInput && scanBtn) {
  attendPwInput.addEventListener('input', (e) => {
    if (e.target.value.length >= 4) {
      scanBtn.style.opacity = '1';
      scanBtn.style.pointerEvents = 'auto';
    } else {
      scanBtn.style.opacity = '0.5';
      scanBtn.style.pointerEvents = 'none';
      if(attendError) attendError.innerText = "";
    }
  });

  scanBtn.addEventListener('click', async () => {
    if (attendPwInput.value !== ADMIN_PASSWORD) {
      attendError.innerText = "비밀번호가 일치하지 않습니다.";
      return;
    }
    
    // UI Change
    scanBtn.classList.add('hidden');
    frameIdle.classList.add('hidden');
    frameScanning.classList.remove('hidden');

    // DB Update Delay Simulation
    await dbCheckAttendance();
    
    setTimeout(() => {
      frameScanning.classList.add('hidden');
      frameSuccess.classList.remove('hidden');
      retryBtn.classList.remove('hidden');
    }, 1000);
  });
}

// ==========================================
// 5. Run Tracker Logic (with Leaflet Map & GPS)
// ==========================================
// Haversine formula to calculate distance between two lat/lon points in km
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; 
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2); 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  return R * c; 
}

const startRunBtn = document.getElementById('start-run-btn');
const distanceDisplay = document.getElementById('distance-display');
const timeDisplay = document.getElementById('time-display');
const paceDisplay = document.getElementById('pace-display');
const mapContainer = document.getElementById('map');
const mapOverlay = document.getElementById('map-overlay');

if (startRunBtn && mapContainer) {
  let isRunning = false;
  let timerInterval;
  let watchId = null;
  
  let timeSeconds = 0;
  let totalDistanceKm = 0;
  let lastPosition = null;

  const map = L.map('map').setView([37.5665, 126.9780], 15);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png').addTo(map);

  let pathLine = L.polyline([], {color: '#caff04', weight: 4}).addTo(map);
  let currentMarker = null;

  if ("geolocation" in navigator) {
    navigator.geolocation.getCurrentPosition((position) => {
      if(mapOverlay) mapOverlay.style.display = 'none';
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      map.setView([lat, lng], 16);
      currentMarker = L.circleMarker([lat, lng], { radius: 8, fillColor: "#caff04", color: "#fff", weight: 2, opacity: 1, fillOpacity: 1 }).addTo(map);
    }, () => {
      if(mapOverlay) mapOverlay.innerHTML = '<span style="color:red; font-size: 14px;">GPS 권한이 필요합니다.</span>';
    });
  }

  function startGPSWatch() {
    if ("geolocation" in navigator) {
      watchId = navigator.geolocation.watchPosition((position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const currentPos = [lat, lng];

        if (currentMarker) currentMarker.setLatLng(currentPos);
        pathLine.addLatLng(currentPos);
        map.panTo(currentPos);

        if (lastPosition) {
          const dist = calculateDistance(lastPosition[0], lastPosition[1], lat, lng);
          totalDistanceKm += dist;
          distanceDisplay.innerText = totalDistanceKm.toFixed(2);
        }
        lastPosition = currentPos;
      }, (e) => console.log(e), { enableHighAccuracy: true });
    }
  }

  startRunBtn.addEventListener('click', async () => {
    isRunning = !isRunning;
    if (isRunning) {
      startRunBtn.innerText = '일시정지';
      startRunBtn.style.backgroundColor = 'var(--error)';
      startRunBtn.style.color = '#fff';
      distanceDisplay.style.color = 'var(--primary)';
      
      startGPSWatch();
      timerInterval = setInterval(() => {
        timeSeconds++;
        const m = Math.floor(timeSeconds / 60).toString().padStart(2, '0');
        const s = (timeSeconds % 60).toString().padStart(2, '0');
        timeDisplay.innerText = `${m}:${s}`;
        
        if (totalDistanceKm > 0.01) {
          const minutes = Math.floor((timeSeconds / 60) / totalDistanceKm);
          const seconds = Math.floor((((timeSeconds / 60) / totalDistanceKm) - minutes) * 60);
          paceDisplay.innerText = `${minutes}'${seconds.toString().padStart(2, '0')}"`;
        }
      }, 1000);
    } else {
      startRunBtn.innerText = '저장 끝내기';
      startRunBtn.style.backgroundColor = 'var(--primary)';
      startRunBtn.style.color = '#000';
      clearInterval(timerInterval);
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      
      // DB에 달리기 결과 전송
      await dbRecordRun(totalDistanceKm, timeDisplay.innerText, paceDisplay.innerText);
      alert('러닝 기록이 서버에 저장되었습니다!');
      startRunBtn.innerText = '시작';
      timeSeconds = 0; totalDistanceKm = 0; lastPosition = null; distanceDisplay.innerText="0.00";
    }
  });
}
