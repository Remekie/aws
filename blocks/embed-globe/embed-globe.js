/**
 * Embed Globe Block
 *
 * DA Table format — 3 columns per data row:
 * | Continent Name | Region 1 {lat,lng}\nRegion 2 {lat,lng}\n... | Edge Loc 1\nEdge Loc 2 |
 *
 * Coordinates are embedded in each region name using {lat,lng} syntax.
 * They are stripped from the display name. Missing coords fall back to
 * the continent center defined in CONTINENT_COORDS.
 *
 * Renders a Three.js 3D interactive globe + side panel with continent tabs,
 * region list (clickable → globe navigates), and edge locations accordion.
 */

// ---------------------------------------------------------------------------
// Data parsing
// ---------------------------------------------------------------------------

function parseCellLines(cell) {
  if (!cell) return [];
  return cell.innerHTML
    .split(/<br\s*\/?>/gi)
    .map((s) => s.replace(/<[^>]+>/g, '').trim())
    .filter(Boolean);
}

const COORD_PATTERN = /\{([^}]+)\}\s*$/;

function parseRegion(raw) {
  const match = raw.match(COORD_PATTERN);
  if (match) {
    const parts = match[1].split(',').map((s) => parseFloat(s.trim()));
    return {
      name: raw.replace(COORD_PATTERN, '').trim(),
      lat: Number.isFinite(parts[0]) ? parts[0] : null,
      lng: Number.isFinite(parts[1]) ? parts[1] : null,
    };
  }
  return { name: raw, lat: null, lng: null };
}

function parseBlockData(block) {
  const rows = [...block.querySelectorAll(':scope > div')].filter(
    (r) => r.querySelectorAll(':scope > div').length >= 2,
  );
  return rows.map((row) => {
    const cells = row.querySelectorAll(':scope > div');
    return {
      name: cells[0]?.textContent.trim() || '',
      regions: parseCellLines(cells[1]).map(parseRegion),
      edgeLocations: parseCellLines(cells[2]),
    };
  }).filter((c) => c.name);
}

// ---------------------------------------------------------------------------
// Fallback continent centers (used when a region has no authored coordinates)
// ---------------------------------------------------------------------------
const CONTINENT_COORDS = {
  'North America': { lat: 48, lng: -100 },
  'South America': { lat: -15, lng: -58 },
  Europe: { lat: 52, lng: 15 },
  'Middle East': { lat: 26, lng: 44 },
  Africa: { lat: 2, lng: 22 },
  'Asia Pacific': { lat: 28, lng: 108 },
  'Australia and New Zealand': { lat: -27, lng: 134 },
};

function fallbackCoords(index, total) {
  return { lat: 20, lng: (index / total) * 360 - 180 };
}

function latLngToVec3(lat, lng, r) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  return {
    x: -r * Math.sin(phi) * Math.cos(theta),
    y: r * Math.cos(phi),
    z: r * Math.sin(phi) * Math.sin(theta),
  };
}

// ---------------------------------------------------------------------------
// Three.js globe
// ---------------------------------------------------------------------------

async function loadThree() {
  if (window.__THREE__) return window.__THREE__;
  const mod = await import('https://cdn.jsdelivr.net/npm/three@0.175.0/build/three.module.js');
  window.__THREE__ = mod;
  return mod;
}

async function buildGlobe(container, continents, onSelect) {
  const THREE = await loadThree();
  const W = container.clientWidth || 480;
  const H = container.clientHeight || 480;
  const R = 1.75;

  const DEFAULT_Z = 3.8;
  const REGION_Z = 2.8;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, W / H, 0.1, 100);
  camera.position.z = DEFAULT_Z;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(W, H);
  renderer.setClearColor(0x000000, 0);
  container.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0xffffff, 1.8));
  const sun = new THREE.DirectionalLight(0xffffff, 0.4);
  sun.position.set(5, 3, 4);
  scene.add(sun);

  const geo = new THREE.SphereGeometry(R, 72, 72);
  const loader = new THREE.TextureLoader();
  const mat = new THREE.MeshPhongMaterial({ color: 0xd8eeff, shininess: 6 });
  const globe = new THREE.Mesh(geo, mat);
  scene.add(globe);

  loader.load(
    'https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-day.jpg',
    (tex) => { mat.map = tex; mat.needsUpdate = true; },
  );

  const atmosMat = new THREE.MeshPhongMaterial({
    color: 0x99ccff, transparent: true, opacity: 0.05, side: THREE.FrontSide,
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(R * 1.025, 72, 72), atmosMat));

  // Build a flat list of all regions with resolved coordinates
  const allRegions = [];
  continents.forEach((c, ci) => {
    const fallback = CONTINENT_COORDS[c.name] || fallbackCoords(ci, continents.length);
    c.regions.forEach((reg) => {
      allRegions.push({
        name: reg.name,
        continentIdx: ci,
        lat: reg.lat ?? fallback.lat,
        lng: reg.lng ?? fallback.lng,
      });
    });
  });

  // Pin markers — sphere head + tapered cone tail, oriented radially
  const PIN_HEAD_R = 0.028;
  const PIN_TAIL_H = 0.10;
  const PIN_TAIL_R = 0.010;
  const PIN_HEAD_Y = PIN_TAIL_H;
  const COLOR_HEAD = 0x22c55e;   // green
  const COLOR_TAIL = 0x111111;   // black
  const COLOR_ACTIVE = 0xa000b8; // purple (selected head)

  const markerGroup = new THREE.Group();
  scene.add(markerGroup);

  const headGeo = new THREE.SphereGeometry(PIN_HEAD_R, 12, 12);
  const tailGeo = new THREE.ConeGeometry(PIN_TAIL_R, PIN_TAIL_H, 8);
  const ringGeo = new THREE.RingGeometry(PIN_HEAD_R + 0.014, PIN_HEAD_R + 0.038, 32);

  const pinGroups = [];
  const pinHeads = []; // raycasting targets
  const pinMats = [];  // one material per pin for colour updates
  const rings = [];

  allRegions.forEach((reg, ri) => {
    const pos = latLngToVec3(reg.lat, reg.lng, R + 0.005);
    const v = new THREE.Vector3(pos.x, pos.y, pos.z);

    const pin = new THREE.Group();
    pin.position.copy(v);
    // Orient pin so local Y+ points radially outward from globe centre
    pin.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.clone().normalize());

    const headMat = new THREE.MeshPhongMaterial({ color: COLOR_HEAD, shininess: 60 });
    const tailMat = new THREE.MeshPhongMaterial({ color: COLOR_TAIL, shininess: 10 });
    pinMats.push(headMat);

    // Sphere head at top of pin
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = PIN_HEAD_Y;
    head.userData.regionIdx = ri;
    pin.add(head);
    pinHeads.push(head);

    // Cone tail — flip so tip points down (toward globe surface at y=0)
    const tail = new THREE.Mesh(tailGeo, tailMat);
    tail.rotation.z = Math.PI;
    tail.position.y = PIN_TAIL_H / 2;
    pin.add(tail);

    // Pulse ring around head (hidden until active)
    const rMat = new THREE.MeshBasicMaterial({
      color: COLOR_ACTIVE, transparent: true, opacity: 0, side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(ringGeo, rMat);
    ring.position.y = PIN_HEAD_Y;
    ring.rotation.x = Math.PI / 2;
    pin.add(ring);
    rings.push(ring);

    markerGroup.add(pin);
    pinGroups.push(pin);
  });

  // Raycaster
  const ray = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  renderer.domElement.addEventListener('click', (e) => {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    ray.setFromCamera(mouse, camera);
    const hits = ray.intersectObjects(pinHeads);
    if (hits.length) {
      const reg = allRegions[hits[0].object.userData.regionIdx];
      onSelect({ regionName: reg.name, continentIdx: reg.continentIdx });
    }
  });

  // Drag orbit
  let drag = false;
  let px = 0; let py = 0;
  let rx = 0; let ry = 0;
  let trx = 0; let try_ = 0; let trz = DEFAULT_Z;
  let autoSpin = true;
  let currentActiveIdx = -1;

  renderer.domElement.addEventListener('mousedown', (e) => {
    drag = true; autoSpin = false; px = e.clientX; py = e.clientY;
  });
  window.addEventListener('mouseup', () => { drag = false; });
  window.addEventListener('mousemove', (e) => {
    if (!drag) return;
    try_ += (e.clientX - px) * 0.005;
    trx += (e.clientY - py) * 0.005;
    trx = Math.max(-1.1, Math.min(1.1, trx));
    px = e.clientX; py = e.clientY;
  });
  renderer.domElement.addEventListener('touchstart', (e) => {
    drag = true; autoSpin = false;
    px = e.touches[0].clientX; py = e.touches[0].clientY;
  }, { passive: true });
  window.addEventListener('touchend', () => { drag = false; });
  window.addEventListener('touchmove', (e) => {
    if (!drag) return;
    try_ += (e.touches[0].clientX - px) * 0.005;
    trx += (e.touches[0].clientY - py) * 0.005;
    trx = Math.max(-1.1, Math.min(1.1, trx));
    px = e.touches[0].clientX; py = e.touches[0].clientY;
  }, { passive: true });

  new ResizeObserver(() => {
    const w = container.clientWidth; const h = container.clientHeight;
    camera.aspect = w / h; camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }).observe(container);

  let t = 0;

  function setActiveRegion(regionName) {
    autoSpin = false;
    trz = REGION_Z;
    currentActiveIdx = allRegions.findIndex((r) => r.name === regionName);
    pinMats.forEach((mat, i) => {
      mat.color.setHex(i === currentActiveIdx ? COLOR_ACTIVE : COLOR_HEAD);
    });
    pinGroups.forEach((pg, i) => {
      pg.scale.setScalar(i === currentActiveIdx ? 1.35 : 1);
    });
    if (currentActiveIdx >= 0) {
      const reg = allRegions[currentActiveIdx];
      try_ = -(Math.PI / 2 + reg.lng * (Math.PI / 180));
      trx = reg.lat * (Math.PI / 180);
    }
  }

  function setActiveContinent(ci) {
    autoSpin = false;
    trz = DEFAULT_Z;
    currentActiveIdx = -1;
    pinMats.forEach((mat) => { mat.color.setHex(COLOR_HEAD); });
    pinGroups.forEach((pg) => { pg.scale.setScalar(1); });
    const co = CONTINENT_COORDS[continents[ci].name] || fallbackCoords(ci, continents.length);
    try_ = -(Math.PI / 2 + co.lng * (Math.PI / 180));
    trx = co.lat * (Math.PI / 180);
  }

  (function animate() {
    requestAnimationFrame(animate);
    t += 0.016;
    if (autoSpin) try_ += 0.0018;
    rx += (trx - rx) * 0.06;
    ry += (try_ - ry) * 0.06;
    camera.position.z += (trz - camera.position.z) * 0.06;
    globe.rotation.x = rx; globe.rotation.y = ry;
    markerGroup.rotation.x = rx; markerGroup.rotation.y = ry;

    rings.forEach((ring, i) => {
      if (i === currentActiveIdx) {
        const pulse = (Math.sin(t * 2.2) + 1) / 2;
        ring.scale.setScalar(1 + pulse * 0.5);
        ring.material.opacity = 0.6 - pulse * 0.5;
      } else {
        ring.scale.setScalar(1);
        ring.material.opacity = 0;
      }
    });
    renderer.render(scene, camera);
  }());

  const MIN_ZOOM_Z = 2.5;
  const MAX_ZOOM_Z = 6.5;
  const ZOOM_STEP = 0.4;
  function zoom(dir) {
    trz = Math.max(MIN_ZOOM_Z, Math.min(MAX_ZOOM_Z, trz + dir * ZOOM_STEP));
  }

  return { setActiveRegion, setActiveContinent, zoom };
}

// ---------------------------------------------------------------------------
// Side panel
// ---------------------------------------------------------------------------

function renderTabs(tabBarEl, continents, activeIdx, onSelect) {
  tabBarEl.innerHTML = '';
  continents.forEach((c, i) => {
    const btn = document.createElement('button');
    btn.className = 'eg-tab';
    btn.textContent = c.name;
    btn.setAttribute('aria-selected', i === activeIdx ? 'true' : 'false');
    btn.addEventListener('click', () => onSelect(i));
    tabBarEl.appendChild(btn);
  });
}

function accordion(label, count, bodyEl, open) {
  const wrap = document.createElement('div');
  wrap.className = 'eg-accordion';

  const btn = document.createElement('button');
  btn.className = 'eg-accordion-btn';
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  btn.innerHTML = `
    <span class="eg-accordion-label">
      <span>${label}</span><span class="eg-count">${count}</span>
    </span>
    <span class="eg-accordion-icon" aria-hidden="true"></span>`;

  const body = document.createElement('div');
  body.className = 'eg-accordion-body';
  body.style.maxHeight = open ? '600px' : '0';
  body.appendChild(bodyEl);

  btn.addEventListener('click', () => {
    const isOpen = btn.getAttribute('aria-expanded') === 'true';
    btn.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
    body.style.maxHeight = isOpen ? '0' : '600px';
  });

  wrap.append(btn, body);
  return wrap;
}

function renderContent(panelEl, c, selectedRegion, onRegionSelect) {
  const scrollTop = panelEl.scrollTop;
  panelEl.innerHTML = '';

  const hdr = document.createElement('div');
  hdr.className = 'eg-panel-hdr';
  hdr.innerHTML = `<span class="eg-badge">AWS Coverage Regions</span><h2 class="eg-panel-title">${c.name}</h2>`;
  panelEl.appendChild(hdr);

  const regList = document.createElement('div');
  const ul = document.createElement('ul');
  ul.className = 'eg-region-list';
  c.regions.forEach((reg) => {
    const li = document.createElement('li');
    const isSelected = reg.name === selectedRegion;
    if (isSelected) li.setAttribute('aria-current', 'true');
    li.innerHTML = `<span class="eg-dot eg-dot-on"></span><span>${reg.name}</span>`;
    li.addEventListener('click', () => onRegionSelect(reg.name));
    ul.appendChild(li);
  });
  const legend = document.createElement('div');
  legend.className = 'eg-legend';
  legend.innerHTML = `
    <span class="eg-legend-item"><span class="eg-dot eg-dot-on"></span>Available</span>
    <span class="eg-legend-item"><span class="eg-dot eg-dot-soon"></span>Coming soon</span>`;
  regList.append(ul, legend);
  panelEl.appendChild(accordion('Geographic Regions', c.regions.length, regList, true));

  const edgeWrap = document.createElement('div');
  const azCount = c.regions.length * 3;
  const summary = document.createElement('p');
  summary.className = 'eg-edge-summary';
  summary.textContent = `The AWS Cloud in ${c.name} has approximately ${azCount} Availability Zones within `
    + `${c.regions.length} Geographic Regions, with ${c.edgeLocations.length} Edge Network Locations.`;
  const grid = document.createElement('div');
  grid.className = 'eg-edge-grid';
  c.edgeLocations.forEach((loc) => {
    const d = document.createElement('div');
    d.textContent = loc;
    grid.appendChild(d);
  });
  edgeWrap.append(summary, grid);
  panelEl.appendChild(accordion('Edge Locations', c.edgeLocations.length, edgeWrap, false));

  requestAnimationFrame(() => { panelEl.scrollTop = scrollTop; });
}

// ---------------------------------------------------------------------------
// Block decorator
// ---------------------------------------------------------------------------

export default async function decorate(block) {
  const continents = parseBlockData(block);
  if (!continents.length) {
    block.textContent = 'No data. Add continent rows to the Globe table.';
    return;
  }

  block.innerHTML = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'eg-wrapper';

  const tabBar = document.createElement('div');
  tabBar.className = 'eg-tabs';

  const bodyRow = document.createElement('div');
  bodyRow.className = 'eg-body';

  const panelCol = document.createElement('div');
  panelCol.className = 'eg-panel-col';
  const panelContent = document.createElement('div');
  panelContent.className = 'eg-panel-content';
  panelCol.appendChild(panelContent);

  const globeCol = document.createElement('div');
  globeCol.className = 'eg-globe-col';
  const globeContainer = document.createElement('div');
  globeContainer.className = 'eg-globe-container';

  const hintBar = document.createElement('div');
  hintBar.className = 'eg-hint-bar';

  const zoomIn = document.createElement('button');
  zoomIn.className = 'eg-zoom-btn';
  zoomIn.setAttribute('aria-label', 'Zoom in');
  zoomIn.textContent = '+';
  zoomIn.addEventListener('click', () => globeCtrl?.zoom(-1));

  const hintText = document.createElement('span');
  hintText.className = 'eg-hint-text';
  hintText.textContent = 'Drag to rotate · Click region to explore';

  const zoomOut = document.createElement('button');
  zoomOut.className = 'eg-zoom-btn';
  zoomOut.setAttribute('aria-label', 'Zoom out');
  zoomOut.textContent = '−';
  zoomOut.addEventListener('click', () => globeCtrl?.zoom(1));

  hintBar.append(zoomIn, hintText, zoomOut);
  globeCol.append(globeContainer, hintBar);

  bodyRow.append(panelCol, globeCol);
  wrapper.append(tabBar, bodyRow);
  block.appendChild(wrapper);

  let activeIdx = 0;
  let activeRegion = null;
  let globeCtrl = null;

  function handleRegionSelect(regionName) {
    activeRegion = regionName;
    if (globeCtrl) globeCtrl.setActiveRegion(regionName);
    renderContent(panelContent, continents[activeIdx], regionName, handleRegionSelect);
  }

  function handleTabSelect(idx) {
    activeIdx = idx;
    activeRegion = null;
    if (globeCtrl) globeCtrl.setActiveContinent(idx);
    renderTabs(tabBar, continents, idx, handleTabSelect);
    renderContent(panelContent, continents[idx], null, handleRegionSelect);
  }

  function handleGlobeSelect({ regionName, continentIdx }) {
    if (continentIdx !== activeIdx) {
      activeIdx = continentIdx;
      renderTabs(tabBar, continents, activeIdx, handleTabSelect);
    }
    handleRegionSelect(regionName);
  }

  renderTabs(tabBar, continents, activeIdx, handleTabSelect);
  renderContent(panelContent, continents[activeIdx], activeRegion, handleRegionSelect);

  requestAnimationFrame(async () => {
    globeCtrl = await buildGlobe(globeContainer, continents, handleGlobeSelect);
    globeCtrl.setActiveContinent(0);
  });
}
