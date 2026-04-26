// app.js

// ==========================================
// 1. 설정 (Settings) & Helpers
// ==========================================
const ADMIN_PASSWORD = "1234";
const SHEET_API_URL = "https://sheetdb.io/api/v1/8o6e5w7imfh0m";
const IMGBB_API_KEY = "117dfb947bc9e0045774b193d1eef7b6";

// 최적화를 위한 캐시 설정
const DEFAULT_PROFILE_IMAGE = "https://i.ibb.co/0yVCptYj/2026-04-26-2-49-24.png";
const RANKING_CACHE_KEY = 'ranking_data';
const RANKING_CACHE_TIME = 5 * 60 * 1000; // 5분
const SYNC_INTERVAL = 10 * 60 * 1000; // 10분 (동기화 주기)

function navigateTo(url) {
  window.location.href = url;
}

// Global UI State
let currentUser = {
  phone: localStorage.getItem('userPhone') || '010',
  name: localStorage.getItem('userName') || '러너',
  profileImage: localStorage.getItem('userProfileImage') || '',
  count: parseInt(localStorage.getItem('attendanceCount') || '0'),
  dist: parseFloat(localStorage.getItem('totalDistance') || '0').toFixed(1),
  avgPace: localStorage.getItem('averagePace') || "0'00\""
};

// 페이지 체크 (API 호출 차단용)
const isAuthPage = window.location.pathname.includes('index.html') || 
                   window.location.pathname.includes('signup.html') ||
                   window.location.pathname.endsWith('/'); 

// ==========================================
// 2. DB Controller
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
    } catch (e) { console.error("DB 저장 실패", e); }
  }
}

async function dbRecordRun(distance, timeStr, paceStr) {
  const runDate = new Date().toLocaleString();
  const runInfo = { distance: distance.toFixed(2), time: timeStr, pace: paceStr, date: runDate };
  localStorage.setItem('recentRun', JSON.stringify(runInfo));
  
  if (SHEET_API_URL) {
    const phone = localStorage.getItem('userPhone') || 'unknown';
    try {
      await fetch(SHEET_API_URL + "?sheet=Runs", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: [{ phone: phone, distance: distance.toFixed(2), time: timeStr, pace: paceStr, date: runDate }] })
      });
      await dbSyncTotalDistance();
    } catch (e) { console.error("달리기 DB 저장 실패", e); }
  }
}

async function dbSyncTotalDistance(force = false) {
  const phone = localStorage.getItem('userPhone');
  if (!phone || !SHEET_API_URL) return;

  // 동기화 주기 체크 (강제 동기화가 아니면 건너뜀)
  const lastSync = localStorage.getItem('lastSyncTime');
  if (!force && lastSync && (Date.now() - parseInt(lastSync) < SYNC_INTERVAL)) {
    console.log("동기화 건너뜀 (최근 완료됨)");
    updateDisplayNumbers(true);
    return;
  }

  try {
    const res = await fetch(`${SHEET_API_URL}/search?phone=${phone}&sheet=Runs`);
    const data = await res.json();
    if (data && Array.isArray(data)) {
      let totalDist = 0; let totalSeconds = 0;
      data.forEach(run => {
        totalDist += parseFloat(run.distance || 0);
        const parts = (run.time || "00:00").split(':');
        if (parts.length === 2) totalSeconds += (parseInt(parts[0])*60) + parseInt(parts[1]);
      });
      localStorage.setItem('totalDistance', totalDist.toFixed(2));
      localStorage.setItem('lastSyncTime', Date.now().toString());

      // 서버(Users 시트)에 합계 거리 업데이트 (백그라운드)
      if (SHEET_API_URL) {
        fetch(`${SHEET_API_URL}/phone/${phone}?sheet=Users`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: { totalDistance: totalDist.toFixed(2) } })
        }).catch(e => console.error("거리 서버 업데이트 실패", e));
      }

      if (totalDist > 0) {
        const avg = totalSeconds / totalDist;
        localStorage.setItem('averagePace', `${Math.floor(avg/60)}'${Math.floor(avg%60).toString().padStart(2,'0')}"`);
      }
      if (data.length > 0) {
        const last = data[data.length - 1];
        localStorage.setItem('recentRun', JSON.stringify({ distance: last.distance, time: last.time, pace: last.pace, date: last.date }));
      }
      updateDisplayNumbers(true);
    }
  } catch (e) { console.error("동기화 실패", e); }
}

async function dbCheckAttendance() {
  let count = parseInt(localStorage.getItem('attendanceCount') || '0') + 1;
  localStorage.setItem('attendanceCount', count.toString());
  if (SHEET_API_URL) {
    const phone = localStorage.getItem('userPhone') || 'unknown';
    try {
      await fetch(`${SHEET_API_URL}/phone/${phone}?sheet=Users`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { attendanceCount: count } })
      });
    } catch (e) { console.error(e); }
  }
}

// ==========================================
// 3. UI Logic & Sync
// ==========================================
async function uploadProfileImage(file) {
  if (!file || !IMGBB_API_KEY) return;

  const overlay = document.getElementById('image-loading-overlay');
  if (overlay) overlay.classList.remove('hidden');

  try {
    // 1. ImgBB API로 이미지 업로드 (FormData 활용)
    const formData = new FormData();
    formData.append("image", file);

    const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
      method: "POST",
      body: formData
    });

    const data = await response.json();
    
    if (data.success) {
      const imageUrl = data.data.url;
      
      // 로컬 저장 즉시 반영
      localStorage.setItem('userProfileImage', imageUrl);
      currentUser.profileImage = imageUrl;

      // 시트 업데이트 (기다리지 않고 백그라운드에서 처리)
      if (SHEET_API_URL) {
        fetch(`${SHEET_API_URL}/phone/${currentUser.phone}?sheet=Users`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: { profileImage: imageUrl } })
        }).catch(e => console.error("시트 업데이트 실패", e));
      }

      updateDisplayNumbers(true);
      alert("프로필 이미지가 변경되었습니다! ✨");
    } else {
      console.error("ImgBB 에러:", data);
      alert("이미지 업로드에 실패했습니다. (ImgBB 오류)");
    }
  } catch (e) {
    console.error("업로드 과정 중 예외 발생:", e);
    alert("이미지 업로드 중 오류가 발생했습니다. 로컬 서버(Live Server 등)를 사용 중인지 확인해 주세요.");
  } finally {
    if (overlay) overlay.classList.add('hidden');
  }
}

let isSyncing = false;
async function updateDisplayNumbers(skipSync = false) {
  // 인증 페이지에서는 API 실행 안 함
  if (isAuthPage) return;

  if (!skipSync && !isSyncing) {
    isSyncing = true;
    
    const phone = localStorage.getItem('userPhone');
    if (phone && SHEET_API_URL) {
      const now = Date.now();
      const lastSync = localStorage.getItem('lastSyncFullTime');
      
      // 10분마다 만 전체 동기화 실행
      if (!lastSync || (now - parseInt(lastSync) > SYNC_INTERVAL)) {
        console.log("전체 동기화 실행 중...");
        try {
          // 1. 달리기 기록 동기화
          const resRuns = await fetch(`${SHEET_API_URL}/search?phone=${phone}&sheet=Runs`);
          const dataRuns = await resRuns.json();
          if (dataRuns && Array.isArray(dataRuns)) {
            let totalDist = 0; let totalSeconds = 0;
            dataRuns.forEach(run => {
              totalDist += parseFloat(run.distance || 0);
              const parts = (run.time || "00:00").split(':');
              if (parts.length === 2) totalSeconds += (parseInt(parts[0])*60) + parseInt(parts[1]);
            });
            localStorage.setItem('totalDistance', totalDist.toFixed(2));
            if (totalDist > 0) {
              const avg = totalSeconds / totalDist;
              localStorage.setItem('averagePace', `${Math.floor(avg/60)}'${Math.floor(avg%60).toString().padStart(2,'0')}"`);
            }
          }

          // 2. 유저 정보 동기화
          const resUser = await fetch(`${SHEET_API_URL}/search?phone=${phone}&sheet=Users`);
          const dataUser = await resUser.json();
          if (dataUser && dataUser.length > 0) {
            localStorage.setItem('userProfileImage', dataUser[0].profileImage || '');
            localStorage.setItem('userName', dataUser[0].name);
            localStorage.setItem('attendanceCount', dataUser[0].attendanceCount || '0');
          }

          localStorage.setItem('lastSyncFullTime', now.toString());
        } catch (e) {
          console.error("동기화 실패", e);
        }
      }
    }
    
    // 랭킹 조회는 동기화 블록 안에서 한 번만 호출
    fetchAndRenderRanking();
    isSyncing = false;
  }

  currentUser.phone = localStorage.getItem('userPhone') || '010';
  currentUser.name = localStorage.getItem('userName') || '러너';
  currentUser.profileImage = localStorage.getItem('userProfileImage') || '';
  currentUser.count = parseInt(localStorage.getItem('attendanceCount') || '0');
  currentUser.dist = parseFloat(localStorage.getItem('totalDistance') || '0').toFixed(1);
  currentUser.avgPace = localStorage.getItem('averagePace') || "0'00\"";

  // 프로필 이미지 표시
  const profDisplay = document.getElementById('profile-img-display');
  const profDefault = document.getElementById('profile-default-icon');
  if (profDisplay) {
    profDisplay.src = currentUser.profileImage || DEFAULT_PROFILE_IMAGE;
    profDisplay.style.display = 'block';
    if (profDefault) profDefault.style.display = 'none';
  }

  const dashboardName = document.getElementById('dashboard-name');
  if (dashboardName) dashboardName.innerText = `반가워요, ${currentUser.name}님! 👋`;
  
  const progVal = document.getElementById('progress-value');
  if (progVal) progVal.innerText = currentUser.count.toString();

  const profName = document.getElementById('profile-name');
  if (profName) profName.innerText = currentUser.name;
  
  const profPhone = document.getElementById('profile-phone');
  if (profPhone) profPhone.innerText = currentUser.phone;

  const profDist = document.getElementById('profile-dist');
  if (profDist) profDist.innerText = currentUser.dist;

  const profCount = document.getElementById('profile-count');
  if (profCount) profCount.innerText = currentUser.count.toString();

  const attCount = document.getElementById('attendance-count-display');
  if (attCount) attCount.innerText = currentUser.count.toString();

  const attBar = document.getElementById('attendance-progress-bar');
  if (attBar) attBar.style.width = `${Math.min((currentUser.count / 25) * 100, 100)}%`;

  const statsCount = document.getElementById('stats-total-count');
  const statsDist = document.getElementById('stats-total-dist');
  const statsPace = document.getElementById('stats-avg-pace');
  if (statsCount) statsCount.innerText = currentUser.count.toString();
  if (statsDist) statsDist.innerText = currentUser.dist;
  if (statsPace) statsPace.innerText = currentUser.avgPace;

  // Reward statuses
  const rewards = [{ id: 'reward-10', target: 10 }, { id: 'reward-20', target: 20 }, { id: 'reward-25', target: 25 }];
  rewards.forEach(r => {
    const el = document.getElementById(r.id);
    if (el) {
      const status = el.querySelector('.reward-status');
      if (status) {
        if (currentUser.count >= r.target) {
          status.innerText = "획득 완료!";
          status.style.color = "var(--primary)";
        } else {
          status.innerText = "진행 중";
          status.style.color = "var(--text-muted)";
        }
      }
    }
  });

  // Recent Run Card
  const recentRunCard = document.getElementById('recent-run-card');
  const recentRunStr = localStorage.getItem('recentRun');
  if (recentRunCard) {
    if (recentRunStr) {
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
    } else {
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
  }

  fetchAndRenderRanking();

  // Slider Dots
  const slider = document.getElementById('dashboard-slider');
  const dots = document.querySelectorAll('.dot');
  if (slider && dots.length > 0) {
    const sync = () => {
      const idx = Math.round(slider.scrollLeft / slider.offsetWidth);
      dots.forEach((dot, i) => dot.classList.toggle('active', i === idx));
    };
    sync();
    slider.onscroll = sync;
  }
}

async function fetchAndRenderRanking() {
  const rankingList = document.getElementById('ranking-list');
  if (!rankingList || !SHEET_API_URL || isAuthPage) return;

  // 1. 캐시 확인 (1분으로 단축하여 실시간성 강화)
  const cached = localStorage.getItem(RANKING_CACHE_KEY);
  if (cached) {
    const { timestamp, data } = JSON.parse(cached);
    if (Date.now() - timestamp < 60000) { 
      renderRankingItems(data);
      return;
    }
  }

  try {
    console.log("실시간 랭킹 집계 중...");
    // 2. 유저 정보와 달리기 기록을 동시에 가져옴
    const [resUsers, resRuns] = await Promise.all([
      fetch(`${SHEET_API_URL}?sheet=Users`),
      fetch(`${SHEET_API_URL}?sheet=Runs`)
    ]);
    
    const users = await resUsers.json();
    const runs = await resRuns.json();

    if (Array.isArray(users) && Array.isArray(runs)) {
      // 3. 기록 합산 (핸드폰 번호 기준)
      const distanceMap = {};
      runs.forEach(run => {
        const phone = run.phone;
        const dist = parseFloat(run.distance || 0);
        distanceMap[phone] = (distanceMap[phone] || 0) + dist;
      });

      // 4. 유저 정보에 합산 거리 매핑
      const rankingData = users.map(u => ({
        ...u,
        totalDistance: (distanceMap[u.phone] || 0).toFixed(1),
        attendanceCount: u.attendanceCount || 0
      }));

      // 5. 캐시 저장 및 렌더링
      localStorage.setItem(RANKING_CACHE_KEY, JSON.stringify({
        timestamp: Date.now(),
        data: rankingData
      }));
      renderRankingItems(rankingData);
    }
  } catch (e) { console.error("랭킹 집계 실패", e); }
}

function renderRankingItems(users) {
  const rankingList = document.getElementById('ranking-list');
  if (!rankingList) return;
  
  // 1. 숫자 정렬 (totalDistance 기준 내림차순)
  const ranked = users
    .filter(u => u.name && u.phone) // 유효한 유저만
    .map(u => ({
      ...u,
      distNum: parseFloat(String(u.totalDistance || '0').replace(/[^0-9.]/g, '')) || 0,
      attNum: parseInt(u.attendanceCount || 0) || 0
    }))
    .sort((a, b) => b.distNum - a.distNum)
    .slice(0, 20); // 표시 인원을 20명으로 확대
    
  if (ranked.length > 0) {
    rankingList.innerHTML = ranked.map((u, i) => {
      const isTop3 = i < 3;
      const profilePic = `<img src="${u.profileImage || DEFAULT_PROFILE_IMAGE}" class="rank-avatar">`;

      return `
        <div class="ranking-item">
          <div style="display: flex; align-items: center; gap: 12px;">
            <div class="rank-badge ${i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : ''}">${i + 1}</div>
            <div class="rank-profile-wrapper">
              ${profilePic}
            </div>
            <div>
              <div style="font-size: 15px; font-weight: 700;">${u.name}</div>
              <div style="font-size: 11px; color: var(--text-muted);">${u.attNum}회 출석</div>
            </div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 16px; font-weight: 800; color: var(--primary);">${u.distNum.toFixed(1)}</div>
            <div style="font-size: 10px; color: var(--text-muted); font-weight: 500;">km</div>
          </div>
        </div>
      `;
    }).join('');
  }
}

// ==========================================
// 4. Auth, Interaction & Share
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  // Login
  const phoneIn = document.getElementById('phone-input');
  const loginBtn = document.getElementById('login-btn');
  if (phoneIn && loginBtn) {
    phoneIn.oninput = (e) => {
      loginBtn.style.opacity = e.target.value.length >= 10 ? '1' : '0.5';
      loginBtn.style.pointerEvents = e.target.value.length >= 10 ? 'auto' : 'none';
    };
    loginBtn.onclick = async () => {
      loginBtn.innerText = "확인 중...";
      try {
        const res = await fetch(`${SHEET_API_URL}/search?phone=${phoneIn.value}&sheet=Users`);
        const data = await res.json();
        if (data && data.length > 0) {
          localStorage.setItem('userPhone', data[0].phone);
          localStorage.setItem('userName', data[0].name);
          localStorage.setItem('isLoggedIn', 'true');
          navigateTo('dashboard.html');
        } else {
          alert("가입되지 않은 번호입니다.");
          loginBtn.innerText = "로그인 / 시작하기";
        }
      } catch (e) { alert("서버 오류"); loginBtn.innerText = "로그인 / 시작하기"; }
    };
  }

  // Signup
  const sBtn = document.getElementById('signup-btn');
  const sPhone = document.getElementById('signup-phone');
  const sName = document.getElementById('signup-name');
  if (sBtn && sPhone && sName) {
    const check = () => {
      sBtn.style.opacity = (sPhone.value.length >= 10 && sName.value.length > 0) ? '1' : '0.5';
      sBtn.style.pointerEvents = (sPhone.value.length >= 10 && sName.value.length > 0) ? 'auto' : 'none';
    };
    sPhone.oninput = check; sName.oninput = check;
    sBtn.onclick = async () => {
      sBtn.innerText = "가입 중...";
      await dbSaveUser(sPhone.value, sName.value);
      navigateTo('dashboard.html');
    };
  }

  // Edit Nickname
  const editBtn = document.getElementById('edit-name-btn');
  const editModal = document.getElementById('edit-name-modal');
  const saveBtn = document.getElementById('save-name-btn');
  const nameIn = document.getElementById('new-name-input');
  if (editBtn && editModal) {
    editBtn.onclick = () => { nameIn.value = currentUser.name; editModal.classList.remove('hidden'); };
    const cEdit = document.getElementById('cancel-edit-btn');
    if (cEdit) cEdit.onclick = () => editModal.classList.add('hidden');
    if (saveBtn) {
      saveBtn.onclick = async () => {
        if (!nameIn.value.trim()) return;
        saveBtn.disabled = true; saveBtn.innerText = "저장 중...";
        try {
          // 서버 업데이트 (백그라운드)
          fetch(`${SHEET_API_URL}/phone/${currentUser.phone}?sheet=Users`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: { name: nameIn.value.trim() } })
          }).catch(e => console.error("서버 반영 실패", e));

          // 로컬 데이터 즉시 업데이트
          localStorage.setItem('userName', nameIn.value.trim());
          currentUser.name = nameIn.value.trim();
          editModal.classList.add('hidden');
          updateDisplayNumbers(true); // skipSync=true 로 호출하여 추가 API 방지
        } catch (e) { alert("오류"); }
        saveBtn.disabled = false; saveBtn.innerText = "저장";
      };
    }
  }

  // Profile Image Upload Interaction
  const profContainer = document.getElementById('profile-image-container');
  const profInput = document.getElementById('profile-upload-input');
  if (profContainer && profInput) {
    profContainer.onclick = () => profInput.click();
    profInput.onchange = (e) => {
      const file = e.target.files[0];
      if (file) {
        if (file.size > 5 * 1024 * 1024) { // 5MB 제한
          alert("파일 크기가 너무 큽니다 (최대 5MB)");
          return;
        }
        uploadProfileImage(file);
      }
    };
  }

  // Show More Runs
  const mBtn = document.getElementById('show-all-runs');
  const mModal = document.getElementById('full-runs-modal');
  const mList = document.getElementById('full-runs-list');
  const cRuns = document.getElementById('close-runs-btn');
  if (mBtn && mModal) {
    mBtn.onclick = async () => {
      mModal.classList.remove('hidden');
      mList.innerHTML = '<div style="text-align:center;margin-top:40px;">로딩 중...</div>';
      try {
        const res = await fetch(`${SHEET_API_URL}/search?phone=${currentUser.phone}&sheet=Runs`);
        const data = await res.json();
        mList.innerHTML = data.reverse().map(r => `
          <div class="glass-panel" style="padding:16px;margin-bottom:10px;">
            <div style="font-size:12px;color:var(--text-muted);">${r.date.split(',')[0]}</div>
            <div style="font-size:16px;font-weight:700;">러닝 기록</div>
            <div style="font-size:13px;color:var(--text-muted);">${r.distance}km • ${r.time} • ${r.pace}/km</div>
          </div>
        `).join('') || '<div style="text-align:center;margin-top:40px;">기록이 없습니다.</div>';
      } catch(e) { mList.innerHTML = "오류"; }
    };
    if (cRuns) cRuns.onclick = () => mModal.classList.add('hidden');
  }

  // Share
  const iBtn = document.getElementById('capture-insta-btn');
  if (iBtn) {
    iBtn.onclick = async () => {
      const area = document.getElementById('capture-area');
      if (!area || typeof html2canvas === 'undefined') return;
      try {
        const canvas = await html2canvas(area, { backgroundColor: null, scale: 2, useCORS: true });
        canvas.toBlob(async (blob) => {
          try {
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
            alert("복사되었습니다! ✨");
          } catch (e) {
            const link = document.createElement('a'); link.download = `run_${Date.now()}.png`; link.href = canvas.toDataURL(); link.click();
          }
        });
      } catch (e) {}
    };
  }
});

// ==========================================
// 5. Attendance (QR Camera)
// ==========================================
const video = document.getElementById('qr-video');
if (video && typeof jsQR !== 'undefined') {
  let scanning = false;
  const canvasEl = document.getElementById('qr-canvas');
  const ctx = canvasEl.getContext('2d');

  function tick() {
    if (!scanning) return;
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      canvasEl.height = video.videoHeight; canvasEl.width = video.videoWidth;
      ctx.drawImage(video, 0, 0, canvasEl.width, canvasEl.height);
      const imgData = ctx.getImageData(0, 0, canvasEl.width, canvasEl.height);
      const code = jsQR(imgData.data, imgData.width, imgData.height, { inversionAttempts: "dontInvert" });
      if (code) {
        scanning = false;
        if (video.srcObject) video.srcObject.getTracks().forEach(t => t.stop());
        handleSuccess(code.data);
        return;
      }
    }
    requestAnimationFrame(tick);
  }

  async function handleSuccess(text) {
    let master = localStorage.getItem('CREW_MASTER_QR');
    if (!master) { localStorage.setItem('CREW_MASTER_QR', text); alert("공식 QR로 등록!"); }
    else if (text !== master) { alert("잘못된 QR"); navigateTo('attendance.html'); return; }

    const today = new Date().toDateString();
    if (localStorage.getItem('lastScanDate') === today) { alert("오늘은 이미 출석하셨습니다."); navigateTo('dashboard.html'); return; }

    localStorage.setItem('lastScanDate', today);
    const sCont = document.getElementById('scan-container');
    const sSucc = document.getElementById('scan-success-msg');
    if (sCont) sCont.classList.add('hidden');
    if (sSucc) sSucc.classList.remove('hidden');
    await dbCheckAttendance();
    updateDisplayNumbers();
  }

  navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }).then(s => {
    scanning = true; video.srcObject = s; video.play(); requestAnimationFrame(tick);
  });
}

// ==========================================
// 6. Run Tracker (Leaflet & GPS)
// ==========================================
function calcDist(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
}

const startRunBtn = document.getElementById('start-run-btn');
const stopRunBtn = document.getElementById('stop-run-btn');
if (startRunBtn && document.getElementById('map')) {
  let isRunning = false, dist = 0, lastPos = null, watchId = null, timer = null;
  let startTime = 0, elapsedMsBeforePause = 0, wakeLock = null;
  const map = L.map('map').setView([37.5665, 126.9780], 15);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png').addTo(map);
  const path = L.polyline([], {color: '#FF793E', weight: 5}).addTo(map);
  let marker = null;

  navigator.geolocation.getCurrentPosition(p => {
    const pos = [p.coords.latitude, p.coords.longitude];
    map.setView(pos, 16);
    marker = L.circleMarker(pos, { radius: 8, fillColor: "#FF793E", color: "#fff", weight: 2, fillOpacity: 1 }).addTo(map);
    const mOverlay = document.getElementById('map-overlay');
    if (mOverlay) mOverlay.style.display = 'none';
  });

  startRunBtn.onclick = async () => {
    if (!isRunning && elapsedMsBeforePause === 0) {
      if (!confirm("⚠️ 러닝 시작 주의사항\n\n1. 새로고침 시 기록이 사라질 수 있습니다.\n2. GPS 실제 거리와 오차가 있을 수 있습니다.\n\n시작하시겠습니까?")) return;
    }
    isRunning = !isRunning;
    if (isRunning) {
      startTime = Date.now();
      if ('wakeLock' in navigator) try { wakeLock = await navigator.wakeLock.request('screen'); } catch(e){}
      const metCont = document.getElementById('metrics-container');
      if (metCont) metCont.classList.remove('hidden');
      if (stopRunBtn) stopRunBtn.classList.add('hidden');
      startRunBtn.innerText = '일시정지';
      startRunBtn.style.backgroundColor = 'rgba(255,255,255,0.1)'; startRunBtn.style.color = '#fff';

      watchId = navigator.geolocation.watchPosition(p => {
        const pos = [p.coords.latitude, p.coords.longitude];
        if (marker) marker.setLatLng(pos);
        path.addLatLng(pos); map.panTo(pos);
        if (lastPos) dist += calcDist(lastPos[0], lastPos[1], pos[0], pos[1]);
        const dDisp = document.getElementById('distance-display');
        if (dDisp) dDisp.innerText = dist.toFixed(2);
        lastPos = pos;
      }, null, { enableHighAccuracy: true });

      timer = setInterval(() => {
        const totalMs = elapsedMsBeforePause + (Date.now() - startTime);
        const totalSec = Math.floor(totalMs / 1000);
        const tDisp = document.getElementById('time-display');
        const pDisp = document.getElementById('pace-display');
        if (tDisp) tDisp.innerText = `${Math.floor(totalSec / 60).toString().padStart(2, '0')}:${(totalSec % 60).toString().padStart(2, '0')}`;
        if (dist > 0.01 && pDisp) {
          const p = (totalSec / 60) / dist;
          pDisp.innerText = `${Math.floor(p)}'${Math.floor((p-Math.floor(p))*60).toString().padStart(2, '0')}"`;
        }
      }, 1000);
      document.getElementById('lock-screen-btn')?.classList.remove('hidden');
    } else {
      elapsedMsBeforePause += (Date.now() - startTime);
      clearInterval(timer); navigator.geolocation.clearWatch(watchId);
      if (wakeLock) { wakeLock.release().then(() => wakeLock = null); }
      startRunBtn.innerText = '재개하기';
      startRunBtn.style.backgroundColor = 'var(--primary)'; startRunBtn.style.color = '#000';
      if (stopRunBtn) stopRunBtn.classList.remove('hidden');
    }
  };

  if (stopRunBtn) {
    stopRunBtn.onclick = async () => {
      isRunning = false; clearInterval(timer); navigator.geolocation.clearWatch(watchId);
      const tDisp = document.getElementById('time-display');
      const pDisp = document.getElementById('pace-display');
      const dDisp = document.getElementById('distance-display');
      await dbRecordRun(dist, tDisp?.innerText || '00:00', pDisp?.innerText || "0'00\"");
      alert('완료!');
      startRunBtn.innerText = '러닝 시작'; startRunBtn.style.backgroundColor = 'var(--primary)';
      stopRunBtn.classList.add('hidden');
      dist = 0; startTime = 0; elapsedMsBeforePause = 0; lastPos = null;
      if (dDisp) dDisp.innerText = '0.00';
      if (tDisp) tDisp.innerText = '00:00';
      if (pDisp) pDisp.innerText = "0'00\"";
      document.getElementById('lock-screen-btn')?.classList.add('hidden');
    };
  }

  // Nav Guard & Touch Lock Setup
  const nLinks = document.querySelectorAll('.nav-link');
  nLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      if (isRunning) { e.preventDefault(); alert("러닝 중에는 이동할 수 없습니다. 일시정지 후 이동해주세요."); }
    });
  });

  const lBtn = document.getElementById('lock-screen-btn');
  const lOverlay = document.getElementById('touch-lock-overlay');
  const uHoldBtn = document.getElementById('unlock-hold-btn');
  const uProg = document.getElementById('unlock-progress');
  if (lBtn && lOverlay && uHoldBtn) {
    lBtn.onclick = () => lOverlay.classList.remove('hidden');
    let hTimer = null;
    const startHold = (e) => {
      e.preventDefault();
      uProg.style.height = '100%'; uProg.style.transition = 'height 1500ms linear';
      hTimer = setTimeout(() => { lOverlay.classList.add('hidden'); resetHold(); }, 1500);
    };
    const resetHold = () => { clearTimeout(hTimer); uProg.style.transition = 'none'; uProg.style.height = '0%'; };
    uHoldBtn.addEventListener('mousedown', startHold);
    uHoldBtn.addEventListener('touchstart', startHold);
    window.addEventListener('mouseup', resetHold);
    window.addEventListener('touchend', resetHold);
  }
}

updateDisplayNumbers();
