/* ============================================================
   大富翁 · 3D 层（three.js）
   ---------------------------------------------------------
   做法：一个 WebGL 画布覆盖在 2D 棋盘上，正交相机俯视。
   所有几何体统一做剪切变换 y' = y + k·z，等价于斜视投影：
   地面（z=0）不会位移 → 和网页格子像素级对齐；
   建筑沿 z 长高 → 屏幕上呈现为立体的房子。
   只在状态变化或窗口尺寸变化时重绘，不跑常驻动画循环。
   ============================================================ */

window.MonoScene = (function () {
  const SHEAR = 0.62;
  let SHEAR_M = null;

  /* 懒创建：即使 three.js 没加载成功，本文件也不会在载入时抛错 */
  function shearMatrix() {
    if (!SHEAR_M) {
      SHEAR_M = new THREE.Matrix4();
      SHEAR_M.set(
        1, 0, 0, 0,
        0, 1, SHEAR, 0,
        0, 0, 1, 0,
        0, 0, 0, 1
      );
    }
    return SHEAR_M;
  }

  let renderer = null;
  let scene = null;
  let camera = null;
  let content = null;
  let canvasEl = null;
  let boardEl = null;
  let lastState = null;
  let dpr = 1;

  const COLORS = {
    houseBody: 0xf6f2e7,
    houseRoof: 0xcf5a4d,
    hotelBody: 0xf3e6c3,
    hotelRoof: 0xc9a227
  };

  function shearedGeom(geom) {
    geom.applyMatrix4(shearMatrix());
    return geom;
  }

  function initRenderer() {
    renderer = new THREE.WebGLRenderer({
      canvas: canvasEl,
      alpha: true,
      antialias: true
    });
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);

    scene = new THREE.Scene();

    const ambient = new THREE.AmbientLight(0xffffff, 0.78);
    scene.add(ambient);

    const dir = new THREE.DirectionalLight(0xffffff, 0.55);
    dir.position.set(-0.6, 1.1, 0.85);
    scene.add(dir);

    const fill = new THREE.DirectionalLight(0xffffff, 0.22);
    fill.position.set(0.7, -0.4, 0.5);
    scene.add(fill);

    content = new THREE.Group();
    scene.add(content);
  }

  function clearContent() {
    for (let i = content.children.length - 1; i >= 0; i--) {
      const obj = content.children[i];
      content.remove(obj);
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
    }
  }

  function tileRects() {
    const b = boardEl.getBoundingClientRect();
    const out = [];
    const tiles = boardEl.querySelectorAll('.tile');
    for (let i = 0; i < tiles.length; i++) {
      const el = tiles[i];
      const r = el.getBoundingClientRect();
      out.push({
        i: Number(el.dataset.i),
        cx: r.left + r.width / 2 - b.left,
        cy: r.top + r.height / 2 - b.top,
        w: r.width,
        h: r.height
      });
    }
    return { board: b, tiles: out };
  }

  /* 一栋房子：墙体 + 四坡屋顶 */
  function makeHouse(w, h, bodyColor, roofColor) {
    const group = new THREE.Group();

    const body = new THREE.Mesh(
      shearedGeom(new THREE.BoxGeometry(w, h, w)),
      new THREE.MeshLambertMaterial({ color: bodyColor })
    );
    body.position.y = h / 2;
    group.add(body);

    const roofH = h * 1.05;
    const roof = new THREE.Mesh(
      shearedGeom(new THREE.CylinderGeometry(0, w * 0.72, roofH, 4)),
      new THREE.MeshLambertMaterial({ color: roofColor })
    );
    roof.rotation.y = Math.PI / 4;
    roof.position.y = h + roofH / 2;
    group.add(roof);

    return group;
  }

  function makePawn(color, s) {
    const group = new THREE.Group();

    const base = new THREE.Mesh(
      shearedGeom(new THREE.CylinderGeometry(s * 0.52, s * 0.62, s * 0.28, 14)),
      new THREE.MeshLambertMaterial({ color: color })
    );
    base.position.y = s * 0.14;
    group.add(base);

    const stem = new THREE.Mesh(
      shearedGeom(new THREE.CylinderGeometry(s * 0.22, s * 0.34, s * 0.5, 12)),
      new THREE.MeshLambertMaterial({ color: color })
    );
    stem.position.y = s * 0.28 + s * 0.25;
    group.add(stem);

    const head = new THREE.Mesh(
      shearedGeom(new THREE.SphereGeometry(s * 0.3, 14, 10)),
      new THREE.MeshLambertMaterial({ color: color })
    );
    head.position.y = s * 0.28 + s * 0.5 + s * 0.2;
    group.add(head);

    return group;
  }

  function buildTileContent(state, rect, W, H) {
    const D = window.MonoData;
    const tile = D.TILES[rect.i];
    if (!tile) return;

    // 世界坐标：地面平面 z=0，与网页格子完全重合
    const wx = rect.cx - W / 2;
    const wy = H / 2 - rect.cy;

    const minSide = Math.min(rect.w, rect.h);

    // ---- 房子 / 旅馆 ----
    if (tile.type === 'prop') {
      const pr = state.props[rect.i];
      if (pr && pr.owner && pr.houses > 0) {
        const groupInfo = D.GROUPS[tile.group];
        const roofColor = pr.houses === 5 ? COLORS.hotelRoof : COLORS.houseRoof;
        const bodyColor = pr.houses === 5 ? COLORS.hotelBody : COLORS.houseBody;

        // 剪切方向统一朝屏幕上方。按剪切几何算：屏幕上向下的溢出量 = 0.62 * w / 2，
        // 底座取在中心下方 0.42 倍格宽处 → 房子不会探出格子
        const baseY = wy - minSide * 0.40;
        const baseX = wx;

        if (pr.houses === 5) {
          const w = minSide * 0.28;
          const h = minSide * 0.18;
          const hotel = makeHouse(w, h, bodyColor, roofColor);
          hotel.position.set(baseX, baseY, 0);
          content.add(hotel);
        } else {
          const n = pr.houses;
          const w = minSide * 0.13;
          const h = minSide * 0.16;
          const gap = w * 1.3;
          const startX = baseX - ((n - 1) * gap) / 2;
          for (let k = 0; k < n; k++) {
            const house = makeHouse(w, h, bodyColor, roofColor);
            house.position.set(startX + k * gap, baseY, 0);
            content.add(house);
          }
        }
      }
    }

    // ---- 玩家棋子 ----
    const here = state.players.filter((p) => !p.bankrupt && p.pos === rect.i);
    if (here.length) {
      const s = minSide * 0.22;
      // 棋子立在格子最下沿，站在房子前面（z 略高，保证遮挡顺序正确）
      const slots = [
        { x: -0.17, y: -0.45, z: 0.04 },
        { x: 0.17, y: -0.45, z: 0.04 },
        { x: -0.34, y: -0.45, z: 0.04 },
        { x: 0.34, y: -0.45, z: 0.04 }
      ];
      here.forEach((p, idx) => {
        const slot = slots[idx % slots.length];
        const pawn = makePawn(new THREE.Color(p.color).getHex(), s);
        pawn.position.set(
          wx + minSide * slot.x,
          wy + minSide * slot.y,
          slot.z
        );
        content.add(pawn);
      });
    }
  }

  function update(state) {
    if (!window.THREE || !renderer || !state) return;
    lastState = state;

    const W = boardEl.clientWidth;
    const H = boardEl.clientHeight;
    if (!W || !H) return;

    renderer.setSize(W, H, false);
    canvasEl.style.width = W + 'px';
    canvasEl.style.height = H + 'px';

    if (!camera) {
      camera = new THREE.OrthographicCamera(-W / 2, W / 2, H / 2, -H / 2, 0.1, 500);
      camera.position.set(0, 0, 120);
      camera.lookAt(0, 0, 0);
    } else {
      camera.left = -W / 2;
      camera.right = W / 2;
      camera.top = H / 2;
      camera.bottom = -H / 2;
      camera.updateProjectionMatrix();
    }

    clearContent();

    const info = tileRects();
    info.tiles.forEach((rect) => buildTileContent(state, rect, W, H));

    renderer.render(scene, camera);
  }

  function mount(canvas, board) {
    canvasEl = canvas;
    boardEl = board;
    if (!window.THREE) {
      console.warn('[MonoScene] three.js 未加载，3D 层降级为纯 2D');
      return;
    }
    initRenderer();
  }

  function resize() {
    if (lastState) update(lastState);
  }

  return { mount: mount, update: update, resize: resize };
})();
