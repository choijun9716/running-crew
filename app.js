// app.js

// ==========================================
// 1. 설정 (Settings)
// ==========================================
const ADMIN_PASSWORD = "1234"; // 관리자 출석 비밀번호
const SHEET_API_URL = "https://sheetdb.io/api/v1/vhuuqnesv1okv"; // 구글 스프레드시트 API

// Navigation helper
function navigateTo(url) {
  window.location.href = url;
}

// ==========================================
// DB Controller
// ==========================================
async function dbSaveUser(phone, name) {
  localStorage.setItem('userPhone', phone);
  localStorage.setItem('userName', name);
  localStorage.setItem('attendanceCount', '0');
  localStorage.setItem('totalDistance', '0');
  localStorage.setItem('isLoggedIn', 'true');
  
  if (SHEET_API_URL) {
    try {
      await fetch(SHEET_API_URL + "?sheet=Users", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: [{ phone: phone, name: name, attendanceCount: 0, joinDate: new Date().toISOString() }] })
      });
    } catch (e) {
      console.error("DB 저장 실패", e);
    }
  }
}

async function dbRecordRun(distance, timeStr, paceStr) {
  const runDate = new Date().toLocaleString();
  const runInfo = {
    distance: distance.toFixed(2),
    time: timeStr,
    pace: paceStr,
    date: runDate
  };
  localStorage.setItem('recentRun', JSON.stringify(runInfo));
  
  // UI Update if on run page
  const captureBtn = document.getElementById('capture-insta-btn');
  const captureDate = document.getElementById('capture-date');
  if (captureBtn) captureBtn.classList.remove('hidden');
  if (captureDate) captureDate.innerText = runDate;

  if (SHEET_API_URL) {
    const phone = localStorage.getItem('userPhone') || 'unknown';
    try {
      await fetch(SHEET_API_URL + "?sheet=Runs", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: [{ phone: phone, distance: distance.toFixed(2), time: timeStr, pace: paceStr, date: runDate }] })
      });
      // After saving, sync total distance from server
      await dbSyncTotalDistance();
    } catch (e) {
      console.error("달리기 DB 저장 실패", e);
    }
  }
}

async function dbSyncTotalDistance() {
  const phone = localStorage.getItem('userPhone');
  if (!phone || !SHEET_API_URL) return;

  try {
    const res = await fetch(`${SHEET_API_URL}/search?phone=${phone}&sheet=Runs`);
    const data = await res.json();
    if (data && Array.isArray(data)) {
      // 1. Total Distance Sync
      const total = data.reduce((acc, curr) => acc + parseFloat(curr.distance || 0), 0);
      localStorage.setItem('totalDistance', total.toFixed(2));
      
      // 2. Recent Run Sync (Show last record if it exists)
      if (data.length > 0) {
        const lastRun = data[data.length - 1]; // Assume last row is newest
        localStorage.setItem('recentRun', JSON.stringify({
          distance: lastRun.distance,
          time: lastRun.time,
          pace: lastRun.pace,
          date: lastRun.date
        }));
      }
      
      updateDisplayNumbers(true); // Recursively update UI (skip sync call)
    }
  } catch (e) {
    console.error("거리 동기화 실패", e);
  }
}

async function dbCheckAttendance() {
  let count = parseInt(localStorage.getItem('attendanceCount') || '0');
  count += 1;
  localStorage.setItem('attendanceCount', count.toString());

  if (SHEET_API_URL) {
    const phone = localStorage.getItem('userPhone') || 'unknown';
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
    const phoneVal = phoneInput.value;
    const errorEl = document.getElementById('login-error');
    
    loginBtn.innerText = "정보 확인 중...";
    try {
      const res = await fetch(`${SHEET_API_URL}/search?phone=${phoneVal}&sheet=Users`);
      const data = await res.json();
      
      if (data && data.length > 0) {
        const user = data[0];
        localStorage.setItem('userPhone', user.phone);
        localStorage.setItem('userName', user.name);
        localStorage.setItem('attendanceCount', user.attendanceCount || '0');
        localStorage.setItem('isLoggedIn', 'true');
        
        // Initial distance sync on login
        await dbSyncTotalDistance();
        
        navigateTo('dashboard.html');
      } else {
        if(errorEl) errorEl.innerText = "가입되지 않은 번호입니다. 가입을 먼저 진행해주세요.";
        loginBtn.innerText = "로그인 / 시작하기";
      }
    } catch (err) {
      if(errorEl) errorEl.innerText = "서버 통신 에러가 발생했습니다.";
      loginBtn.innerText = "로그인 / 시작하기";
    }
  });
}

const signupPhone = document.getElementById('signup-phone');
const signupName = document.getElementById('signup-name');
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
    alert('반갑습니다! 회원가입이 완료되었습니다.');
    navigateTo('dashboard.html');
  });
}

// ==========================================
// 3. Dashboard, Profile & Share
// ==========================================
let isSyncing = false;
async function updateDisplayNumbers(skipSync = false) {
  if (!skipSync && !isSyncing) {
    isSyncing = true;
    await dbSyncTotalDistance();
    isSyncing = false;
  }

  const count = parseInt(localStorage.getItem('attendanceCount') || '0');
  const dist = parseFloat(localStorage.getItem('totalDistance') || '0').toFixed(1);
  const name = localStorage.getItem('userName') || '러너';
  const phone = localStorage.getItem('userPhone') || '010';

  // UI Elements
  const dashboardName = document.getElementById('dashboard-name');
  const progressValue = document.getElementById('progress-value');
  const profileName = document.getElementById('profile-name');
  const profilePhone = document.getElementById('profile-phone');
  const profileDist = document.getElementById('profile-dist');
  const profileCount = document.getElementById('profile-count');
  const attCountDisplay = document.getElementById('attendance-count-display');
  const attProgressBar = document.getElementById('attendance-progress-bar');

  if (dashboardName) dashboardName.innerText = `반가워요, ${name}님! 👋`;
  if (progressValue) progressValue.innerText = count.toString();
  if (profileName) profileName.innerText = name;
  if (profilePhone) profilePhone.innerText = phone;
  if (profileDist) profileDist.innerText = dist;
  if (profileCount) profileCount.innerText = count.toString();
  if (attCountDisplay) attCountDisplay.innerText = count.toString();
  if (attProgressBar) attProgressBar.style.width = `${Math.min((count / 25) * 100, 100)}%`;

  // Reward statuses
  const rewards = [
    { id: 'reward-10', target: 10 },
    { id: 'reward-20', target: 20 },
    { id: 'reward-25', target: 25 }
  ];
  rewards.forEach(r => {
    const el = document.getElementById(r.id);
    if (el) {
      if (count >= r.target) {
        const status = el.querySelector('.reward-status');
        if (status) {
          status.innerText = "획득 완료!";
          status.style.color = "var(--primary)";
        }
      }
    }
  });

  // Recent Run Card
  const recentRunCard = document.getElementById('recent-run-card');
  const recentRunStr = localStorage.getItem('recentRun');
  if (recentRunCard && recentRunStr) {
    const run = JSON.parse(recentRunStr);
    recentRunCard.innerHTML = `
      <div>
        <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 4px;">${run.date.split(',')[0]}</div>
        <div style="font-size: 18px; font-weight: 700; margin-bottom: 2px;">최근 러닝 완료 🏃‍♂️</div>
        <div style="font-size: 13px; color: var(--text-muted);">${run.distance}km • ${run.time} • ${run.pace}/km</div>
      </div>
      <div style="width: 40px; height: 40px; border-radius: 50%; background-color: var(--primary); display: flex; justify-content: center; align-items: center; color: #000;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>
      </div>
    `;
  } else if (recentRunCard) {
    recentRunCard.innerHTML = `
      <div>
        <div style="font-size: 18px; font-weight: 700; margin-bottom: 2px;">러닝을 시작해보아요! 🏃‍♂️</div>
        <div style="font-size: 13px; color: var(--text-muted);">러닝 탭에서 첫 발걸음을 떼보세요.</div>
      </div>
      <div style="width: 40px; height: 40px; border-radius: 50%; background-color: rgba(255,255,255,0.05); display: flex; justify-content: center; align-items: center;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
      </div>
    `;
  }

  // "Show More" Modal Logic
  const showMoreBtn = document.getElementById('show-all-runs');
  const modal = document.getElementById('full-runs-modal');
  const closeBtn = document.getElementById('close-runs-btn');
  const listCont = document.getElementById('full-runs-list');

  if (showMoreBtn && modal) {
    showMoreBtn.onclick = async () => {
      modal.classList.remove('hidden');
      listCont.innerHTML = '<div style="text-align: center; color: var(--text-muted); margin-top: 40px;">데이터 로딩 중...</div>';
      try {
        const res = await fetch(`${SHEET_API_URL}/search?phone=${phone}&sheet=Runs`);
        const runs = await res.json();
        listCont.innerHTML = '';
        if (runs && runs.length > 0) {
          runs.reverse().forEach(run => {
            const card = document.createElement('div');
            card.className = 'glass-panel';
            card.style.padding = '16px';
            card.innerHTML = `
              <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 4px;">${run.date.split(',')[0]}</div>
              <div style="font-size: 16px; font-weight: 700; margin-bottom: 2px;">러닝 기록</div>
              <div style="font-size: 13px; color: var(--text-muted);">${run.distance}km • ${run.time} • ${run.pace}/km</div>
            `;
            listCont.appendChild(card);
          });
        } else {
          listCont.innerHTML = '<div style="text-align: center; color: var(--text-muted); margin-top: 40px;">아직 러닝 기록이 없어요.<br>지금 바로 첫 러닝을 시작해볼까요?</div>';
        }
      } catch (e) {
        listCont.innerHTML = '<div style="text-align: center; color: var(--error); margin-top: 40px;">기록을 가져오지 못했습니다.</div>';
      }
    };
    if (closeBtn) closeBtn.onclick = () => modal.classList.add('hidden');
  }

  // Edit Name Logic
  const editNameBtn = document.getElementById('edit-name-btn');
  const editNameModal = document.getElementById('edit-name-modal');
  const cancelEditBtn = document.getElementById('cancel-edit-btn');
  const saveNameBtn = document.getElementById('save-name-btn');
  const newNameInput = document.getElementById('new-name-input');

  if (editNameBtn && editNameModal) {
    editNameBtn.onclick = async () => {
      // Fetch latest name from SheetDB before editing to ensure sync
      const phone = localStorage.getItem('userPhone');
      if (phone && SHEET_API_URL) {
        try {
          const res = await fetch(`${SHEET_API_URL}/search?phone=${phone}&sheet=Users`);
          const data = await res.json();
          if (data && data.length > 0) {
            localStorage.setItem('userName', data[0].name);
          }
        } catch (e) {
          console.warn("최신 데이터 동기화 실패", e);
        }
      }
      
      newNameInput.value = localStorage.getItem('userName') || '';
      editNameModal.classList.remove('hidden');
    };
    
    cancelEditBtn.onclick = () => editNameModal.classList.add('hidden');
    
    saveNameBtn.onclick = async () => {
      const newName = newNameInput.value.trim();
      if (!newName) return alert("이름을 입력해주세요.");
      
      saveNameBtn.innerText = "저장 중...";
      saveNameBtn.disabled = true;
      
      const phone = localStorage.getItem('userPhone');
      
      try {
        if (SHEET_API_URL && phone) {
          const patchRes = await fetch(`${SHEET_API_URL}/phone/${phone}?sheet=Users`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: { name: newName } })
          });
          
          if (!patchRes.ok) throw new Error("Update failed");
        }
        
        localStorage.setItem('userName', newName);
        alert("이름이 수정되었습니다!");
        editNameModal.classList.add('hidden');
        updateDisplayNumbers(); // UI 업데이트
      } catch (e) {
        console.error(e);
        alert("이름 수정 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
      } finally {
        saveNameBtn.innerText = "저장";
        saveNameBtn.disabled = false;
      }
    };
  }
}

// Share Logic (Insta Share)
const instaBtn = document.getElementById('capture-insta-btn');
if (instaBtn) {
  instaBtn.addEventListener('click', async () => {
    const area = document.getElementById('capture-area');
    if (!area || typeof html2canvas === 'undefined') return;

    try {
      const canvas = await html2canvas(area, {
        backgroundColor: null,
        scale: 2,
        useCORS: true
      });
      
      canvas.toBlob(async (blob) => {
        if (!blob) return alert("이미지 생성에 실패했습니다.");
        
        try {
          // Try to copy to clipboard
          const data = [new ClipboardItem({ 'image/png': blob })];
          await navigator.clipboard.write(data);
          alert("러닝 기록이 클립보드에 복사되었습니다! 인스타그램 스토리에 바로 '붙여넣기' 해보세요. ✨");
        } catch (err) {
          // Fallback to Download if clipboard fails
          console.warn("Clipboard failed, falling back to download", err);
          const dataUrl = canvas.toDataURL('image/png');
          const link = document.createElement('a');
          link.download = `full_running_${Date.now()}.png`;
          link.href = dataUrl;
          link.click();
          alert("이미지가 저장되었습니다! 갤러리에서 확인 후 공유해 보세요.");
        }
      }, 'image/png');

    } catch (e) {
      console.error(e);
      alert("이미지 처리 중 오류가 발생했습니다.");
    }
  });
}

// ==========================================
// 4. Attendance (QR Camera)
// ==========================================
const video = document.getElementById('qr-video');
if (video && typeof jsQR !== 'undefined') {
  let scanning = false;
  const canvasElement = document.getElementById('qr-canvas');
  const canvas = canvasElement.getContext('2d');

  function tick() {
    if (!scanning) return;
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      canvasElement.height = video.videoHeight;
      canvasElement.width = video.videoWidth;
      canvas.drawImage(video, 0, 0, canvasElement.width, canvasElement.height);
      const imageData = canvas.getImageData(0, 0, canvasElement.width, canvasElement.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "dontInvert" });
      if (code) {
        scanning = false;
        if (video.srcObject) video.srcObject.getTracks().forEach(t => t.stop());
        handleScanSuccess(code.data);
        return;
      }
    }
    requestAnimationFrame(tick);
  }

  async function handleScanSuccess(text) {
    let master = localStorage.getItem('CREW_MASTER_QR');
    if (!master) {
      localStorage.setItem('CREW_MASTER_QR', text);
      alert("공식 출석 QR로 등록되었습니다!");
    } else if (text !== master) {
      alert("지정된 QR코드가 아닙니다.");
      navigateTo('attendance.html'); // Retry
      return;
    }

    const today = new Date().toDateString();
    if (localStorage.getItem('lastScanDate') === today) {
      alert("오늘은 이미 출석하셨습니다.");
      navigateTo('dashboard.html');
      return;
    }

    localStorage.setItem('lastScanDate', today);
    document.getElementById('scan-container').classList.add('hidden');
    document.getElementById('scan-success-msg').classList.remove('hidden');
    await dbCheckAttendance();
    updateDisplayNumbers();
  }

  navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }).then(s => {
    scanning = true;
    video.srcObject = s;
    video.play();
    requestAnimationFrame(tick);
  });
}

// ==========================================
// 5. Run Tracker (Leaflet & GPS)
// ==========================================
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
}

const startRunBtn = document.getElementById('start-run-btn');
const stopRunBtn = document.getElementById('stop-run-btn');
if (startRunBtn && document.getElementById('map')) {
  let isRunning = false, time = 0, dist = 0, lastPos = null, watchId = null, timer = null;
  const map = L.map('map').setView([37.5665, 126.9780], 15);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png').addTo(map);
  const path = L.polyline([], {color: '#FF793E', weight: 5}).addTo(map);
  let marker = null;

  navigator.geolocation.getCurrentPosition(p => {
    const pos = [p.coords.latitude, p.coords.longitude];
    map.setView(pos, 16);
    marker = L.circleMarker(pos, { radius: 8, fillColor: "#FF793E", color: "#fff", weight: 2, fillOpacity: 1 }).addTo(map);
    document.getElementById('map-overlay').style.display = 'none';
  });

  startRunBtn.onclick = () => {
    if (!isRunning && time === 0) {
      const confirmStart = confirm("⚠️ 러닝 시작 전 주의사항\n\n1. 앱 새로고침을 하면 현재 기록이 사라질 수 있습니다.\n2. GPS 기반 측정으로 실제 거리와 약간의 오차가 발생할 수 있습니다.\n\n러닝을 시작하시겠습니까?");
      if (!confirmStart) return;
    }

    isRunning = !isRunning;
    if (isRunning) {
      // Start or Resume
      const metricsCont = document.getElementById('metrics-container');
      if (metricsCont) metricsCont.classList.remove('hidden');
      if (stopRunBtn) stopRunBtn.classList.add('hidden');

      startRunBtn.innerText = '일시정지';
      startRunBtn.style.backgroundColor = 'rgba(255,255,255,0.1)';
      startRunBtn.style.color = '#fff';

      watchId = navigator.geolocation.watchPosition(p => {
        const pos = [p.coords.latitude, p.coords.longitude];
        if (marker) marker.setLatLng(pos);
        path.addLatLng(pos);
        map.panTo(pos);
        if (lastPos) dist += calculateDistance(lastPos[0], lastPos[1], pos[0], pos[1]);
        document.getElementById('distance-display').innerText = dist.toFixed(2);
        lastPos = pos;
      }, null, { enableHighAccuracy: true });

      timer = setInterval(() => {
        time++;
        const m = Math.floor(time/60).toString().padStart(2,'0'), s = (time%60).toString().padStart(2,'0');
        document.getElementById('time-display').innerText = `${m}:${s}`;
        if (dist > 0.01) {
          const paceMin = Math.floor((time/60)/dist), paceSec = Math.floor((((time/60)/dist)-paceMin)*60);
          document.getElementById('pace-display').innerText = `${paceMin}'${paceSec.toString().padStart(2,'0')}"`;
        }
      }, 1000);
    } else {
      // Pause
      clearInterval(timer);
      navigator.geolocation.clearWatch(watchId);
      startRunBtn.innerText = '재개하기';
      startRunBtn.style.backgroundColor = 'var(--primary)';
      startRunBtn.style.color = '#000';
      if (stopRunBtn) stopRunBtn.classList.remove('hidden');
    }
  };

  if (stopRunBtn) {
    stopRunBtn.onclick = async () => {
      isRunning = false;
      clearInterval(timer);
      navigator.geolocation.clearWatch(watchId);
      
      await dbRecordRun(dist, document.getElementById('time-display').innerText, document.getElementById('pace-display').innerText);
      
      alert('러닝이 완료되었습니다!');
      
      startRunBtn.innerText = '러닝 시작';
      startRunBtn.style.backgroundColor = 'var(--primary)';
      startRunBtn.style.color = '#000';
      stopRunBtn.classList.add('hidden');
      
      // Reset values for next run
      dist = 0; time = 0; lastPos = null;
      document.getElementById('distance-display').innerText = '0.00';
      document.getElementById('time-display').innerText = '00:00';
      document.getElementById('pace-display').innerText = "0'00\"";
    };
  }
}

updateDisplayNumbers();
