/**
 * 山科歴史アーカイブ - メインスクリプト
 */

const SHEET_ID = '1JNOhsD4k1GzEVnUqS2ftN8ytw2GbraXjEFysoxwVl_A';
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv`;

let map, layerControl;
let archiveData = [];
let layers = {};
let activeOverlays = []; 
let userMarker, userCircle;

// 歴史地図データの定義
const eras = [
    { name: "1884年", url: "./地籍図tile/{z}/{x}/{y}.png", nativeZoom: 18 },
    { name: "1897年", url: "https://ktgis.net/kjmapw/kjtilemap/keihansin/2man/{z}/{x}/{-y}.png", nativeZoom: 16 },
    { name: "1922年（2）", url: "./taisho1922/{z}/{x}/{y}.jpg", nativeZoom: 18 },
    { name: "1922年", url: "https://ktgis.net/kjmapw/kjtilemap/keihansin/00/{z}/{x}/{-y}.png", nativeZoom: 16 },
    { name: "1930年", url: "https://ktgis.net/kjmapw/kjtilemap/keihansin/01/{z}/{x}/{-y}.png", nativeZoom: 16 },  
    { name: "1946年", url: "https://cyberjapandata.gsi.go.jp/xyz/ort_USA10/{z}/{x}/{y}.png", nativeZoom: 17 },
    { name: "1961年", url: "https://cyberjapandata.gsi.go.jp/xyz/ort_old10/{z}/{x}/{y}.png", nativeZoom: 17 },
    { name: "1964年", url: "https://ktgis.net/kjmapw/kjtilemap/keihansin/03x/{z}/{x}/{-y}.png", nativeZoom: 16 },
    { name: "1968年", url: "https://ktgis.net/kjmapw/kjtilemap/keihansin/04/{z}/{x}/{-y}.png", nativeZoom: 16 },
    { name: "1974年", url: "https://cyberjapandata.gsi.go.jp/xyz/gazo1/{z}/{x}/{y}.jpg", nativeZoom: 17 },
    { name: "1975年", url: "https://ktgis.net/kjmapw/kjtilemap/keihansin/05/{z}/{x}/{-y}.png", nativeZoom: 16 },
    { name: "1985年", url: "https://ktgis.net/kjmapw/kjtilemap/keihansin/06/{z}/{x}/{-y}.png", nativeZoom: 16 },
    { name: "1993年", url: "https://ktgis.net/kjmapw/kjtilemap/keihansin/07/{z}/{x}/{-y}.png", nativeZoom: 16},
    { name: "2007年", url: "https://cyberjapandata.gsi.go.jp/xyz/ort/{z}/{x}/{y}.jpg", nativeZoom: 18},
];

/**
 * マップの初期化
 */
function initMap() {
    map = L.map('map', { 
        zoomControl: false, 
        maxZoom: 22,
        zoomSnap: 0,
        zoomDelta: 0.5,
        wheelPxPerZoomLevel: 120,
        wheelDebounceTime: 40,
        zoomAnimation: true,
        fadeAnimation: true,
        inertia: true,
        inertiaDeceleration: 3000
    }).setView([34.992, 135.813], 15);

    L.control.zoom({ position: 'bottomleft' }).addTo(map);

    // 位置情報イベント
    map.on('locationfound', onLocationFound);
    map.on('locationerror', onLocationError);

    // 標準の地理院タイル背景
    L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png', {
        attribution: "地理院タイル",
        minZoom: 2,
        maxNativeZoom: 18,
        maxZoom: 22,
        updateWhenZooming: true
    }).addTo(map);

    // 各時代の古地図タイルを登録
    eras.forEach(era => {
        layers[era.name] = L.tileLayer(era.url, {
            maxNativeZoom: era.nativeZoom || 16, 
            maxZoom: 22,
            updateWhenZooming: true
        });
    });

    layerControl = L.control.layers(null, layers, { collapsed: true, position: 'topright' }).addTo(map);
    
    // レイヤー切り替えと不透明度同期
    map.on('overlayadd', (e) => {
        activeOverlays = activeOverlays.filter(l => l !== e.layer);
        activeOverlays.push(e.layer);
        if (activeOverlays.length > 2) {
            const oldest = activeOverlays.shift();
            map.removeLayer(oldest);
        }
        activeOverlays.forEach(l => l.bringToFront());
        updateOpacityUI();
    });
    
    map.on('overlayremove', (e) => {
        activeOverlays = activeOverlays.filter(l => l !== e.layer);
        updateOpacityUI();
    });

    // レイヤーメニュー内に詳細ボタンを追加
    map.on('overlayadd overlayremove', () => {
        setTimeout(() => {
            const labels = document.querySelectorAll('.leaflet-control-layers-overlays label div span');
            labels.forEach(span => {
                if (!span.parentElement.querySelector('.mini-info-btn')) {
                    const btn = document.createElement('button');
                    btn.innerHTML = '詳細';
                    btn.className = 'sub-nav-btn mini-info-btn';
                    btn.style = 'padding:2px 8px; font-size:0.65rem; margin-left:10px; cursor:pointer; vertical-align:middle; border-radius:4px;';
                    btn.onclick = (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        showPage('map-db');
                    };
                    span.after(btn);
                }
            });
        }, 10);
    });

    // 時代スライダーの初期化
    const slider = document.getElementById('era-slider');
    slider.max = eras.length - 1;
    slider.value = 0; 

    slider.oninput = function() {
        updateEraUI(this.value);
    };
    
    updateEraUI(slider.value);
   
    document.getElementById('opacity-slider').oninput = function() {
        if (activeOverlays.length > 0) {
            const target = activeOverlays[activeOverlays.length - 1];
            target.setOpacity(this.value);
        }
    };

    add3DMarkers();
    startLocationTracking();
}

/**
 * 不透明度調整UIの更新
 */
function updateOpacityUI() {
    const display = document.getElementById('opacity-target');
    const slider = document.getElementById('opacity-slider');
    
    if (activeOverlays.length > 0) {
        const latest = activeOverlays[activeOverlays.length - 1];
        const name = Object.keys(layers).find(key => layers[key] === latest);
        display.innerText = `調整：${name}`;
        slider.value = latest.options.opacity !== undefined ? latest.options.opacity : 1.0;
    } else {
        display.innerText = "調整：未選択";
    }
}

/**
 * 時代スライダーUIの更新
 */
function updateEraUI(index) {
    const era = eras[index];
    const eraLabel = document.getElementById('era-label');
    
    eraLabel.innerHTML = `${era.name} <button id="map-info-btn" class="sub-nav-btn" style="padding:2px 8px; margin-left:10px; font-size:0.7rem; cursor:pointer;">詳細</button>`;
    
    document.getElementById('map-info-btn').onclick = () => showPage('map-db');
    
    activeOverlays.forEach(l => map.removeLayer(l));
    const nextLayer = layers[era.name];
    if (nextLayer) {
        nextLayer.addTo(map).bringToFront();
        activeOverlays = [nextLayer];
    }
    updateOpacityUI();
}

/**
 * 3Dモデルマーカーの配置
 */
function add3DMarkers() {
    const models = [
        { name: "妙見寺開渠", file: "妙見寺開渠.glb", coords: [34.977573, 135.827704] },
        { name: "両御坊道道標", file: "両御坊道道標.glb", coords: [34.985075, 135.823981] },
        { name: "旧井戸跡地", file: "旧井戸跡地.glb", coords: [34.983122, 135.814421] }
    ];
    
    const icon3d = L.divIcon({
        html: '<div class="marker-3d"><i class="fa-solid fa-cube"></i></div>',
        className: 'custom-div-icon', 
        iconSize: [30, 30],
        iconAnchor: [15, 15]
    });

    // CSS for 3D marker
    const style = document.createElement('style');
    style.innerHTML = `
        .marker-3d {
            background: #e67e22;
            color: white;
            width: 30px;
            height: 30px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 16px;
            box-shadow: 0 0 10px rgba(230, 126, 34, 0.5);
            border: 2px solid white;
        }
    `;
    document.head.appendChild(style);

    models.forEach(m => {
        L.marker(m.coords, { icon: icon3d }).addTo(map).bindPopup(`
            <div class="popup-3d" onclick="L.DomEvent.stopPropagation(event)">
                <b class="popup-title">${m.name}</b>
                <model-viewer src="./${encodeURIComponent(m.file)}" auto-rotate camera-controls class="popup-viewer"></model-viewer>
                <button class="map-focus-btn" style="margin-top:10px; padding:8px;" onclick="L.DomEvent.stopPropagation(event); open3DFullScreen('./${encodeURIComponent(m.file)}', '${m.name}')">全画面で見る</button>
            </div>
        `, { maxWidth: 250 });
    });
}

// Popup 3D styling
const popupStyle = document.createElement('style');
popupStyle.innerHTML = `
    .popup-3d { text-align: center; width: 220px; padding: 5px; }
    .popup-title { font-size: 1.1rem; color: var(--primary-color); display: block; margin-bottom: 10px; }
    .popup-viewer { width: 100%; height: 160px; background: #f0f0f0; border-radius: 8px; }
`;
document.head.appendChild(popupStyle);

/**
 * 位置情報追跡
 */
let watchId = null;
let isLocating = false;

function startLocationTracking() {
    if (!("geolocation" in navigator)) return;
    if (watchId) navigator.geolocation.clearWatch(watchId);
    
    watchId = navigator.geolocation.watchPosition((position) => {
        const latlng = [position.coords.latitude, position.coords.longitude];
        const accuracy = position.coords.accuracy;
        updateUserLocationMarker(latlng, accuracy);
    }, (err) => {
        console.warn("位置の監視に失敗:", err);
    }, {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 10000
    });
}

function requestLocation() {
    if (!("geolocation" in navigator)) {
        showNotification("位置情報機能を利用できません。");
        return;
    }
    if (isLocating) return;

    const btn = document.querySelector('.location-btn i');
    if (btn) btn.className = "fa-solid fa-spinner fa-spin"; 
    isLocating = true;

    if (userMarker) {
        map.flyTo(userMarker.getLatLng(), 17, { animate: true, duration: 1.5 });
        setTimeout(() => {
            if (btn) btn.className = "fa-solid fa-location-crosshairs";
            isLocating = false;
        }, 1500);
    } else {
        map.locate({ setView: true, maxZoom: 17, enableHighAccuracy: true });
    }
}

function onLocationFound(e) {
    updateUserLocationMarker(e.latlng, e.accuracy);
    const btn = document.querySelector('.location-btn i');
    if (btn) btn.className = "fa-solid fa-location-crosshairs";
    isLocating = false;
}

function onLocationError(e) {
    console.warn("位置取得エラー:", e.message);
    const btn = document.querySelector('.location-btn i');
    if (btn) btn.className = "fa-solid fa-location-crosshairs";
    isLocating = false;
    showNotification("現在地の取得に失敗しました。");
}

function updateUserLocationMarker(latlng, accuracy) {
    if (userMarker) {
        userMarker.setLatLng(latlng);
        userCircle.setLatLng(latlng).setRadius(accuracy / 2);
    } else {
        userCircle = L.circle(latlng, { 
            radius: accuracy / 2, 
            color: '#4285F4', 
            fillColor: '#4285F4', 
            fillOpacity: 0.15, 
            weight: 1 
        }).addTo(map);

        userMarker = L.circleMarker(latlng, { 
            radius: 8, 
            color: '#fff', 
            fillColor: '#4285F4', 
            fillOpacity: 1, 
            weight: 3,
            zIndexOffset: 1000 
        }).addTo(map);
    }
}

/**
 * 古写真データの読み込み
 */
async function loadPhotoData() {
    try {
        const response = await fetch(CSV_URL);
        const csvText = await response.text();
        const rows = csvText.split(/\r?\n/).slice(1);
        archiveData = rows.filter(row => row.trim() !== "").map((row, index) => {
            const cols = row.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(c => c.replace(/^"(.*)"$/, '$1'));
            
            const rawUrl = cols[2] || "";
            let directImg = "";
            const fileIdMatch = rawUrl.match(/[-\w]{25,}/);
            
            if (fileIdMatch) {
                directImg = `https://lh3.googleusercontent.com/d/${fileIdMatch[0]}=s800`;
            } else {
                directImg = rawUrl;
            }

            let rawTitle = (cols[4] || "名称未設定").replace(/"/g, "");
            rawTitle = rawTitle.replace(/\.(jpg|jpeg|png|gif|bmp)$/i, ""); 

            let lat = 0, lng = 0;
            if (cols[6]) {
                const coords = cols[6].split(/[\s,]+/);
                lat = parseFloat(coords[0]);
                lng = parseFloat(coords[1]);
            }

            return {
                id: index,
                title: rawTitle,
                img: directImg,
                desc: cols[5] || "",
                lat: lat,
                lng: lng,
                era: cols[7] || "",
                year: cols[8] || "",
                explanation: cols[9] || "",
                author: cols[10] || "",
                source: cols[11] || "",
                storage: cols[12] || "",
                rights: cols[13] || "不明",
                reprint: cols[14] || "不明",    
                direction: cols[15] || "不明"   
            };
        });
        addPhotoMarkers(archiveData);
    } catch (e) {
        console.error("スプレッドシートの読み込みに失敗しました:", e);
        showNotification("データの読み込みに失敗しました。");
    }
}

/**
 * データベースのフィルタリング
 */
function filterDB() {
    const q = document.getElementById('db-search').value.toLowerCase().trim();
    const era = document.getElementById('era-filter').value;
    const list = document.getElementById('photo-list');
    
    if (q === "" && era === "") {
        list.innerHTML = `<div class="empty-state">検索ワードを入力するか、年代を選択してください</div>`;
        return;
    }
    
    const filtered = archiveData.filter(p => {
        const matchTitle = p.title.toLowerCase().includes(q);
        const matchEra = (!era || p.era.includes(era));
        return matchTitle && matchEra;
    });
    
    renderPhotos(filtered.slice(0, 100));
}

// Empty state styling
const emptyStyle = document.createElement('style');
emptyStyle.innerHTML = `
    .empty-state { grid-column: 1/-1; padding: 60px 20px; text-align: center; color: var(--text-muted); font-size: 1.1rem; }
`;
document.head.appendChild(emptyStyle);

/**
 * 写真リストのレンダリング
 */
function renderPhotos(data) {
    const list = document.getElementById('photo-list');
    if (data.length === 0) {
        list.innerHTML = `<div class="empty-state">該当する古写真が見つかりません。</div>`;
        return;
    }
    list.innerHTML = data.map(p => `
        <div class="photo-card" onclick="openDetail(${p.id})">
            <img src="${p.img}" loading="lazy" onerror="this.src='https://placehold.co/400x300/4e342e/ffffff?text=No+Image'">
            <p>${p.title}</p>
        </div>
    `).join('');
}

/**
 * マップへの写真マーカー追加
 */
function addPhotoMarkers(data) {
    const iconCam = L.divIcon({
        html: '<div class="marker-photo"><i class="fa-solid fa-camera"></i></div>',
        className: 'custom-div-icon', 
        iconSize: [28, 28],
        iconAnchor: [14, 14]
    });

    // CSS for photo marker
    const camStyle = document.createElement('style');
    camStyle.innerHTML = `
        .marker-photo {
            background: var(--primary-color);
            color: white;
            width: 28px;
            height: 28px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 14px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            border: 2px solid white;
            transition: var(--transition);
        }
        .marker-photo:hover { transform: scale(1.2); background: var(--accent-color); }
    `;
    document.head.appendChild(camStyle);

    data.forEach(p => {
        if (!isNaN(p.lat) && p.lat !== 0) {
            L.marker([p.lat, p.lng], { icon: iconCam }).addTo(map).bindPopup(`
                <div class="popup-photo" onclick="L.DomEvent.stopPropagation(event)">
                    <b class="popup-title">${p.title}</b>
                    <div class="popup-img-container">
                        <img src="${p.img}" onerror="this.src='https://placehold.co/200x150/4e342e/ffffff?text=Loading+Error'">
                    </div>
                    <div class="popup-meta">${p.year ? p.year + '年' : p.era}</div>
                    <button class="map-focus-btn" style="width:100%; padding:8px;" onclick="L.DomEvent.stopPropagation(event); openDetail(${p.id})">詳細を表示</button>
                </div>
            `, { maxWidth: 220 });
        }
    });
}

const photoPopupStyle = document.createElement('style');
photoPopupStyle.innerHTML = `
    .popup-photo { text-align: center; }
    .popup-img-container { margin: 10px 0; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
    .popup-img-container img { width: 100%; height: auto; display: block; }
    .popup-meta { font-size: 0.85rem; color: var(--text-muted); margin-bottom: 10px; }
`;
document.head.appendChild(photoPopupStyle);

/**
 * 詳細モーダルを開く
 */
function openDetail(id) {
    const p = archiveData.find(x => x.id === id);
    if(!p) return;
    
    const modal = document.getElementById('detail-modal');
    const body = document.getElementById('modal-body');
    
    body.innerHTML = `
        <div class="modal-body-container">
            <div class="modal-image-section">
                <img src="${p.img}" 
                     onclick="openFullScreenImage('${p.img}')" 
                     onerror="this.src='https://placehold.co/800x600/4e342e/ffffff?text=No+Image'">
            </div>
            
            <div class="modal-info-section">
                <h2>${p.title}</h2>
                
                <div class="meta-info-list">
                    <div class="meta-item"><span class="meta-label">説明</span><span class="meta-value">${p.explanation || '（説明なし）'}</span></div>
                    <div class="meta-item"><span class="meta-label">字地名</span><span class="meta-value">${p.desc || '－'}</span></div>
                    <div class="meta-item"><span class="meta-label">年代</span><span class="meta-value">${p.era || '－'}</span></div>
                    <div class="meta-item"><span class="meta-label">撮影年</span><span class="meta-value">${p.year ? p.year + '年' : '不明'}</span></div>
                    <div class="meta-item"><span class="meta-label">撮影者</span><span class="meta-value">${p.author || '不明'}</span></div>
                    <div class="meta-item"><span class="meta-label">出典</span><span class="meta-value">${p.source || '－'}</span></div>
                    <div class="meta-item"><span class="meta-label">所蔵</span><span class="meta-value">${p.storage || '－'}</span></div>
                    <div class="meta-item"><span class="meta-label">権利状態</span><span class="meta-value">${p.rights || '－'}</span></div>
                    <div class="meta-item"><span class="meta-label">転載</span><span class="meta-value">${p.reprint || '－'}</span></div>
                    <div class="meta-item"><span class="meta-label">撮影方角</span><span class="meta-value">${p.direction || '－'}</span></div>
                </div>
                
                <button class="map-focus-btn" onclick="focusOnMap([${p.lat}, ${p.lng}])">
                    <i class="fa-solid fa-location-dot"></i> 地図で場所を確認
                </button>
            </div>
        </div>
    `;
    modal.style.display = 'flex';
}

function closeModal() { 
    document.getElementById('detail-modal').style.display = 'none'; 
}

/**
 * 3D全画面表示
 */
function open3DFullScreen(url, title) {
    const modal = document.getElementById('3d-modal');
    const body = document.getElementById('3d-modal-body');
    
    body.innerHTML = `
        <div style="width:100%; height:100%; position:relative;">
            <div style="position:absolute; top:30px; left:30px; color:#fff; z-index:100; text-shadow:0 2px 10px rgba(0,0,0,0.5);">
                <h2 style="margin:0; font-size:1.8rem;">${title}</h2>
                <span style="background:var(--accent-color); color:var(--primary-color); padding:4px 12px; border-radius:20px; font-size:0.8rem; font-weight:700; margin-top:10px; display:inline-block;">3D ARCHIVE</span>
            </div>
            
            <model-viewer id="mv-logic" src="${url}" auto-rotate camera-controls style="width:100%; height:100%; background:radial-gradient(#333, #111); display:block;">
            </model-viewer>
            
            <div style="position:absolute; bottom:40px; left:30px; background:rgba(255,255,255,0.1); backdrop-filter:blur(10px); border:1px solid rgba(255,255,255,0.2); padding:15px 25px; border-radius:15px; z-index:100;">
                <label style="font-size:0.9rem; color:#fff; cursor:pointer; display:flex; align-items:center; gap:10px;">
                    <input type="checkbox" onchange="toggleTexture(this.checked)" style="width:18px; height:18px;"> 
                    <span>テクスチャOFF（形状確認モード）</span>
                </label>
            </div>
        </div>
    `;
    modal.style.display = 'flex';
}

function close3DModal() {
    document.getElementById('3d-modal').style.display = 'none';
    document.getElementById('3d-modal-body').innerHTML = '';
}

async function toggleTexture(isOff) {
    const mv = document.querySelector('#mv-logic');
    if (!mv) return;
    if (!mv.model) {
        mv.addEventListener('load', () => applyTextureToggle(mv, isOff), { once: true });
    } else {
        applyTextureToggle(mv, isOff);
    }
}

function applyTextureToggle(mv, isOff) {
    try {
        if (!mv.model || !mv.model.materials) return;
        mv.model.materials.forEach(material => {
            if (isOff) {
                if (!material.userData) {
                    material.userData = {
                        originalColorFactor: material.pbrMetallicRoughness.baseColorFactor ? [...material.pbrMetallicRoughness.baseColorFactor] : [1,1,1,1],
                        originalTexture: material.pbrMetallicRoughness.baseColorTexture ? material.pbrMetallicRoughness.baseColorTexture.texture : null
                    };
                }
                material.pbrMetallicRoughness.setBaseColorFactor([0.7, 0.7, 0.7, 1.0]);
                if (material.pbrMetallicRoughness.baseColorTexture) material.pbrMetallicRoughness.baseColorTexture.setTexture(null);
            } else {
                if (material.userData && material.userData.originalColorFactor) {
                    material.pbrMetallicRoughness.setBaseColorFactor(material.userData.originalColorFactor);
                    if (material.pbrMetallicRoughness.baseColorTexture && material.userData.originalTexture) {
                        material.pbrMetallicRoughness.baseColorTexture.setTexture(material.userData.originalTexture);
                    }
                }
            }
        });
    } catch (e) { console.error(e); }
}

/**
 * 全画面画像表示
 */
function openFullScreenImage(imgUrl) {
    const overlay = document.getElementById('full-screen-overlay');
    const fullImg = document.getElementById('full-screen-img');
    fullImg.src = imgUrl; 
    overlay.style.display = 'flex';
}

function closeFullScreenImage() {
    document.getElementById('full-screen-overlay').style.display = 'none';
}

/**
 * マップの特定座標へ移動
 */
function focusOnMap(coords) {
    closeModal();
    showPage('map');
    map.flyTo(coords, 18, { animate: true, duration: 1.5 });
}

/**
 * ページ切り替え
 */
function showPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    
    document.getElementById('page-' + pageId).classList.add('active');
    document.getElementById('btn-' + pageId).classList.add('active');
    
    document.getElementById('map-ui').style.display = (pageId === 'map') ? 'flex' : 'none';
    document.getElementById('db-ui').style.display = (pageId === 'db') ? 'flex' : 'none';
    
    if (pageId === 'map') {
        setTimeout(() => map.invalidateSize(), 300);
    }
}

/**
 * マップコントロールの切り替え
 */
function switchControl(mode) {
    const isSlider = (mode === 'slider');
    document.getElementById('slider-box').style.display = isSlider ? 'flex' : 'none';
    document.getElementById('m-btn-layers').classList.toggle('active', !isSlider);
    document.getElementById('m-btn-slider').classList.toggle('active', isSlider);
    
    const leafletControl = document.querySelector('.leaflet-control-layers');
    if (leafletControl) leafletControl.style.display = isSlider ? 'none' : 'block';
}

/**
 * 通知トーストの表示
 */
function showNotification(msg) {
    const toast = document.getElementById('notification-toast');
    if (!toast) return;
    toast.innerText = msg;
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 4000);
}

// 初期化
window.onload = () => {
    initMap();
    loadPhotoData();
};
