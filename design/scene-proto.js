/* ============================================================
   大富翁 · 3D 层（原型版 scene-proto.js）
   ---------------------------------------------------------
   相对 js/scene.js 的改动：
   1) 房子改成一堵薄墙 + 四坡屋顶：
      正式版用 BoxGeometry(w,h,w) 建墙，厚度方向的剪切会把
      "墙"和"顶"甩到两个位置（放大后能看到屋顶悬空、墙身掉在下面）。
      把厚度压到 0.1w 后，墙面几乎不会被剪切位移，屋顶才会正好压在墙上；
   2) 房子 / 棋子整体往格子内侧收，离格线留出余量；
   3) 棋子收窄一点、加一块很小的接地投影，看起来是立在棋盘上。
   剪切投影这套做法（y' = y + k·z）与正式版一致，地面仍与格子像素对齐。
   ============================================================ */

window.MonoScene = (function () {
  const SHEAR = 0.62;
  let SHEAR_M = null;

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

  function shearedGeom(geom) {
    geom.applyMatrix4(shearMatrix());
    return geom;
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
    houseBody: 0xe8dfcb,
    houseRoof: 0xcf5a4d,
    hotelBody: 0xeedfb0,
    hotelRoof: 0xc9a227,
    edge: 0x1b2a35
  };

  /* 竖向基准：以格子中心为 0，向下为正（屏幕方向） */
  const BASE_OFFSET = 0.34;   // 房子底座
  const PAWN_OFFSET = 0.38;   // 棋子底座（比房子更靠前，站在房子前面）

  function initRenderer() {
    renderer = new THREE.WebGLRenderer({ canvas: canvasEl, alpha: true, antialias: true });
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);

    scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 0.82));

    const dir = new THREE.DirectionalLight(0xffffff, 0.5);
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

  function groundShadow(r, opacity) {
    const m = new THREE.Mesh(
      new THREE.CircleGeometry(r, 18),
      new THREE.MeshBasicMaterial({
        color: 0x1b2a35,
        transparent: true,
        opacity: opacity,
        depthWrite: false
      })
    );
    m.position.z = 0.002;
    return m;
  }

  /* 房子：立面轮廓（方墙 + 三角顶）拉伸一点厚度，剪切后侧壁露出来，像一栋立着的小房子 */
  function extrudeShape(shape, depth) {
    const g = new THREE.ExtrudeGeometry(shape, { depth: depth, bevelEnabled: false, curveSegments: 1 });
    g.translate(0, 0, -depth / 2);
    return shearedGeom(g);
  }

  /* 细描边：小尺寸下没有它，浅色房体在白色格子上会消失 */
  function withEdges(mesh, opacity) {
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(mesh.geometry),
      new THREE.LineBasicMaterial({ color: COLORS.edge, transparent: true, opacity: opacity })
    );
    mesh.add(edges);
    return mesh;
  }

  function makeHouse(w, h, roofH, bodyColor, roofColor) {
    const group = new THREE.Group();
    const depth = w * 0.16;

    const wallShape = new THREE.Shape();
    wallShape.moveTo(-w / 2, 0);
    wallShape.lineTo(w / 2, 0);
    wallShape.lineTo(w / 2, h);
    wallShape.lineTo(-w / 2, h);
    wallShape.closePath();

    const wall = withEdges(new THREE.Mesh(
      extrudeShape(wallShape, depth),
      new THREE.MeshLambertMaterial({ color: bodyColor })
    ), 0.28);
    group.add(wall);

    const roofShape = new THREE.Shape();
    roofShape.moveTo(-w * 0.56, 0);
    roofShape.lineTo(w * 0.56, 0);
    roofShape.lineTo(0, roofH);
    roofShape.closePath();

    const roof = withEdges(new THREE.Mesh(
      extrudeShape(roofShape, depth),
      new THREE.MeshLambertMaterial({ color: roofColor })
    ), 0.26);
    roof.position.y = h;
    group.add(roof);

    return group;
  }

  /* 棋子：底座 + 高身体 + 球头（沿用正式版构造，只做收窄与投影） */
  function makePawn(color, s) {
    const group = new THREE.Group();

    const shadow = groundShadow(s * 0.4, 0.14);
    shadow.position.y = -s * 0.04;
    group.add(shadow);

    const base = new THREE.Mesh(
      shearedGeom(new THREE.CylinderGeometry(s * 0.4, s * 0.46, s * 0.24, 16)),
      new THREE.MeshLambertMaterial({ color: color })
    );
    base.position.y = s * 0.12;
    group.add(base);

    const stem = new THREE.Mesh(
      shearedGeom(new THREE.CylinderGeometry(s * 0.16, s * 0.28, s * 0.52, 14)),
      new THREE.MeshLambertMaterial({ color: color })
    );
    stem.position.y = s * 0.24 + s * 0.26;
    group.add(stem);

    const head = new THREE.Mesh(
      shearedGeom(new THREE.SphereGeometry(s * 0.24, 16, 12)),
      new THREE.MeshLambertMaterial({ color: color })
    );
    head.position.y = s * 0.24 + s * 0.52 + s * 0.18;
    group.add(head);

    return group;
  }

  function buildTileContent(state, rect, W, H) {
    const D = window.MonoData;
    const tile = D.TILES[rect.i];
    if (!tile) return;

    const wx = rect.cx - W / 2;
    const wy = H / 2 - rect.cy;
    const minSide = Math.min(rect.w, rect.h);

    if (tile.type === 'prop') {
      const pr = state.props[rect.i];
      if (pr && pr.owner && pr.houses > 0) {
        const hotel = pr.houses === 5;
        const roofColor = hotel ? COLORS.hotelRoof : COLORS.houseRoof;
        const bodyColor = hotel ? COLORS.hotelBody : COLORS.houseBody;
        const baseY = wy - minSide * BASE_OFFSET;

        if (hotel) {
          const g = makeHouse(minSide * 0.32, minSide * 0.2, minSide * 0.13, bodyColor, roofColor);
          g.position.set(wx, baseY, 0);
          content.add(g);
        } else {
          const n = pr.houses;
          const w = minSide * 0.17;
          const h = minSide * 0.16;
          const roofH = minSide * 0.1;
          const gap = w * 1.35;
          const startX = wx - ((n - 1) * gap) / 2;
          for (let k = 0; k < n; k++) {
            const g = makeHouse(w, h, roofH, bodyColor, roofColor);
            g.position.set(startX + k * gap, baseY, 0);
            content.add(g);
          }
        }
      }
    }

    const here = state.players.filter((p) => !p.bankrupt && p.pos === rect.i);
    if (here.length) {
      const s = Math.min(rect.w, rect.h) * 0.2;
      const hasBuild = !!(state.props[rect.i] && state.props[rect.i].owner && state.props[rect.i].houses > 0);
      const slots = [
        { x: 0.3, y: 0 },
        { x: -0.3, y: 0 },
        { x: 0, y: 0.07 },
        { x: 0.44, y: 0.05 }
      ];
      here.forEach((p, idx) => {
        const slot = slots[idx % slots.length];
        const spread = hasBuild ? 1 : 0.6;
        const pawn = makePawn(new THREE.Color(p.color).getHex(), s);
        pawn.position.set(
          wx + minSide * slot.x * spread,
          wy - minSide * (PAWN_OFFSET - slot.y),
          0.02
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
