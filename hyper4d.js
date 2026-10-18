/* ============================================================
   4D 几何模块 - 四维超立方体 (Tesseract) 投影到 3D
   ------------------------------------------------------------
   真正的 4D 几何：16 顶点 / 32 棱 / 8 个立方体胞
   在 4D 空间旋转 → 投影到 3D → 呈 "内外翻转" 的错视效果
   依赖：THREE
   ============================================================ */

const Hyper4D = (() => {

  // ---------- 4D 顶点运算 ----------
  // 顶点表示为 [x, y, z, w]
  function rotate4D(v, angleXY, angleZW, angleXW, angleYZ) {
    let [x, y, z, w] = v;

    // XY 平面旋转
    let c = Math.cos(angleXY), s = Math.sin(angleXY);
    let nx = x * c - y * s;
    let ny = x * s + y * c;
    x = nx; y = ny;

    // ZW 平面旋转
    c = Math.cos(angleZW); s = Math.sin(angleZW);
    let nz = z * c - w * s;
    let nw = z * s + w * c;
    z = nz; w = nw;

    // XW 平面旋转
    c = Math.cos(angleXW); s = Math.sin(angleXW);
    nx = x * c - w * s;
    nw = x * s + w * c;
    x = nx; w = nw;

    // YZ 平面旋转
    c = Math.cos(angleYZ); s = Math.sin(angleYZ);
    ny = y * c - z * s;
    nz = y * s + z * c;
    y = ny; z = nz;

    return [x, y, z, w];
  }

  // 4D → 3D 透视投影
  // distance: 4D 摄像机距离；w 越大越远，投影后越小
  function project4Dto3D(v, distance = 2.6) {
    const [x, y, z, w] = v;
    // w 方向透视除法
    const k = 1 / (distance - w);
    // 缩放因子，让结果落在合理范围
    return new THREE.Vector3(x * k * 1.6, y * k * 1.6, z * k * 1.6);
  }

  // ---------- 生成超立方体几何数据 ----------
  function tesseractData() {
    // 16 个顶点：所有 (±1, ±1, ±1, ±1) 组合
    const verts4 = [];
    for (let i = 0; i < 16; i++) {
      verts4.push([
        (i & 1) ? 1 : -1,
        (i & 2) ? 1 : -1,
        (i & 4) ? 1 : -1,
        (i & 8) ? 1 : -1
      ]);
    }

    // 32 条棱：两个顶点仅在一个坐标上不同
    const edges = [];
    for (let i = 0; i < 16; i++) {
      for (let j = i + 1; j < 16; j++) {
        let diff = 0;
        for (let k = 0; k < 4; k++) if (verts4[i][k] !== verts4[j][k]) diff++;
        if (diff === 1) edges.push([i, j]);
      }
    }
    return { verts4, edges };
  }

  const TESSERACT = tesseractData();

  // ---------- 创建一个动态超立方体对象 ----------
  function createTesseract(opts = {}) {
    const {
      size = 1,
      color = 0x66aaff,
      color2 = 0xaa66ff,
      lineWidth = 1,
      opacity = 0.85,
      spinSpeed = 0.5,
      distance = 2.6,
      glow = true
    } = opts;

    const group = new THREE.Group();

    // 用 LineSegments 绘制 32 条棱
    const positions = new Float32Array(TESSERACT.edges.length * 2 * 3);
    const colors = new Float32Array(TESSERACT.edges.length * 2 * 3);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      linewidth: lineWidth
    });

    const lines = new THREE.LineSegments(geo, mat);
    group.add(lines);

    // 顶点光点（16 个小球/点）
    const pointsGeo = new THREE.BufferGeometry();
    const pointsPos = new Float32Array(16 * 3);
    pointsGeo.setAttribute('position', new THREE.BufferAttribute(pointsPos, 3));
    const pointsMat = new THREE.PointsMaterial({
      color,
      size: size * 0.12,
      transparent: true,
      opacity: opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true
    });
    const points = new THREE.Points(pointsGeo, pointsMat);
    group.add(points);

    // 内部发光球（可选）
    let core = null;
    if (glow) {
      core = new THREE.Mesh(
        new THREE.SphereGeometry(size * 0.15, 12, 12),
        new THREE.MeshBasicMaterial({
          color: color2, transparent: true, opacity: 0.5,
          blending: THREE.AdditiveBlending, depthWrite: false
        })
      );
      group.add(core);
    }

    const state = {
      angles: [0, 0, 0, 0],   // XY, ZW, XW, YZ
      speeds: [
        spinSpeed * 0.7,
        spinSpeed,
        spinSpeed * 0.4,
        spinSpeed * 0.55
      ],
      size, distance, color, color2, group,
      geo, pointsGeo, mat, pointsMat, core,
      edgeColors: [new THREE.Color(color), new THREE.Color(color2)]
    };

    // 立即可见
    updateTesseract(state, 0);

    return state;
  }

  // ---------- 每帧更新（核心：4D 旋转 + 投影） ----------
  function updateTesseract(state, dt, speedMult = 1) {
    const { angles, speeds, distance, size } = state;

    // 累加 4D 旋转角
    for (let i = 0; i < 4; i++) {
      angles[i] += speeds[i] * dt * speedMult;
    }

    const posAttr = state.geo.attributes.position;
    const colAttr = state.geo.attributes.color;
    const posArr = posAttr.array;
    const colArr = colAttr.array;

    // 先计算所有 16 个顶点的 3D 投影坐标
    const proj = new Array(16);
    for (let i = 0; i < 16; i++) {
      const r = rotate4D(TESSERACT.verts4[i], angles[0], angles[1], angles[2], angles[3]);
      const p = project4Dto3D(r, distance);
      proj[i] = p.clone().multiplyScalar(size);
    }

    // 填充棱的顶点
    TESSERACT.edges.forEach(([a, b], idx) => {
      const pa = proj[a], pb = proj[b];
      posArr[idx * 6 + 0] = pa.x;
      posArr[idx * 6 + 1] = pa.y;
      posArr[idx * 6 + 2] = pa.z;
      posArr[idx * 6 + 3] = pb.x;
      posArr[idx * 6 + 4] = pb.y;
      posArr[idx * 6 + 5] = pb.z;

      // 颜色随深度 / w 值渐变，营造 4D 层次感
      const depthA = (pa.length() + 3) / 6;
      const depthB = (pb.length() + 3) / 6;
      const ca = state.edgeColors[0].clone().lerp(state.edgeColors[1], Math.min(1, Math.max(0, depthA)));
      const cb = state.edgeColors[0].clone().lerp(state.edgeColors[1], Math.min(1, Math.max(0, depthB)));
      colArr[idx * 6 + 0] = ca.r; colArr[idx * 6 + 1] = ca.g; colArr[idx * 6 + 2] = ca.b;
      colArr[idx * 6 + 3] = cb.r; colArr[idx * 6 + 4] = cb.g; colArr[idx * 6 + 5] = cb.b;
    });

    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;

    // 顶点光点
    const ppos = state.pointsGeo.attributes.position.array;
    for (let i = 0; i < 16; i++) {
      ppos[i * 3] = proj[i].x;
      ppos[i * 3 + 1] = proj[i].y;
      ppos[i * 3 + 2] = proj[i].z;
    }
    state.pointsGeo.attributes.position.needsUpdate = true;

    // 核心脉冲
    if (state.core) {
      const pulse = 1 + Math.sin(angles[1] * 2) * 0.15;
      state.core.scale.setScalar(pulse);
      state.core.material.opacity = 0.35 + Math.sin(angles[2] * 3) * 0.15;
    }
  }

  // ---------- 释放资源 ----------
  function disposeTesseract(state) {
    if (!state || !state.group) return;
    state.group.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
    if (state.group.parent) state.group.parent.remove(state.group);
  }

  // ---------- 便捷：创建法阵光环 ----------
  // 多个超立方体叠加形成的旋转法阵
  function createHyperGlyph(opts = {}) {
    const {
      color = 0x66aaff,
      size = 1.4,
      layers = 2
    } = opts;

    const group = new THREE.Group();
    const cubes = [];

    for (let i = 0; i < layers; i++) {
      const st = createTesseract({
        size: size * (1 - i * 0.28),
        color: i % 2 === 0 ? color : 0xaa66ff,
        color2: i % 2 === 0 ? 0xffffff : color,
        opacity: 0.55 - i * 0.12,
        spinSpeed: 0.6 + i * 0.35,
        distance: 2.6 + i * 0.4
      });
      group.add(st.group);
      cubes.push(st);
    }

    return { group, cubes, update(dt, mult) { cubes.forEach((c, i) => updateTesseract(c, dt, mult * (1 + i * 0.4))); } };
  }

  return {
    createTesseract,
    updateTesseract,
    disposeTesseract,
    createHyperGlyph,
    rotate4D,
    project4Dto3D
  };
})();
