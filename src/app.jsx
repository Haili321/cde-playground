// Main DGAC Playground app.

const { useState, useEffect, useMemo, useRef } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "alpha": 0.9,
  "beta": 0.5,
  "topLayers": 5,
  "attrLayers": 5,
  "cpropLayers": 1,
  "dataset": "hetero",
  "showAttrGraph": true,
  "animateIter": true
}/*EDITMODE-END*/;

// Smooth transition ease curve reused for nodes + edges when step changes.
const SMOOTH_T = "cubic-bezier(0.4, 0, 0.2, 1)";
const NODE_XITION = { transition: `transform 0.6s ${SMOOTH_T}` };
const LINE_XITION = {
  transition: `x1 0.6s ${SMOOTH_T}, y1 0.6s ${SMOOTH_T}, x2 0.6s ${SMOOTH_T}, y2 0.6s ${SMOOTH_T}, stroke 0.3s, stroke-width 0.3s, opacity 0.3s`,
};

// ============================================================
// CorrectionTheater — plays out the "C-prop fixes a wrong node"
// story. Picks one k-means-mis-assigned node whose neighbors
// majority-vote the right cluster; every ~2.8s cycle:
//   (1) orange warning ring flashes around protagonist
//   (2) neighbor edges brighten + thicken
//   (3) colored particles fly from each neighbor to protagonist
//       (particle color = neighbor's current k-means color)
//   (4) vote-tally bar below protagonist fills up
//   (5) protagonist fill animates from wrong color → truth color
//   (6) green "rescue" ring flashes to celebrate the fix
// Entirely SMIL-driven (no React timers), so it stays buttery
// smooth even when other parts re-render.
// ============================================================
function CorrectionTheater({ wrongNode, neighbors, posOf, kmColor, flipColor,
                             nbColors, nbKmClusters, nbTruthClusters, nbIsWrong,
                             protagonistTruthK, voteMaxK, clusterColors }) {
  const [wx, wy] = posOf(wrongNode);
  const DUR = 2.8;                        // full cycle seconds
  const tFlashIn    = 0.06;               // warning ring appears
  const tFlashPeak  = 0.18;               // warning ring at max
  const tEdgesOn    = 0.20;               // neighbor edges highlighted
  const tParticle0  = 0.28;               // first particle leaves
  const particleGap = 0.06;               // between particles
  const tTravel     = 0.26;               // particle travel duration fraction
  const tTallyStart = 0.55;
  const tTallyFull  = 0.78;
  const tFlipStart  = 0.80;
  const tFlipEnd    = 0.86;
  const tRescuePk   = 0.90;
  const tRescueEnd  = 0.96;

  const totalNb = neighbors.length;
  // vote-bar geometry (below protagonist)
  const BAR_W = 54, BAR_H = 10;
  const barX = wx - BAR_W/2, barY = wy + 15;

  return (
    <g style={{pointerEvents:"none"}}>
      {/* (2) neighbor edges — brighten during active phase */}
      {neighbors.map((nb, i) => {
        const [nx, ny] = posOf(nb);
        return (
          <line key={"cte"+i} x1={nx} y1={ny} x2={wx} y2={wy}
            stroke="oklch(0.62 0.17 40)" strokeWidth="1" opacity="0">
            <animate attributeName="opacity"
              values={`0;0;0.9;0.9;0.2;0`}
              keyTimes={`0;${tEdgesOn};${tEdgesOn+0.02};${tTallyFull};${tRescueEnd};1`}
              dur={`${DUR}s`} repeatCount="indefinite"/>
            <animate attributeName="stroke-width"
              values={`1;1;2.6;2.6;1;1`}
              keyTimes={`0;${tEdgesOn};${tEdgesOn+0.02};${tTallyFull};${tRescueEnd};1`}
              dur={`${DUR}s`} repeatCount="indefinite"/>
          </line>
        );
      })}

      {/* (1) orange warning ring around protagonist */}
      <circle cx={wx} cy={wy} r="10" fill="none"
        stroke="oklch(0.65 0.20 38)" strokeWidth="2" opacity="0">
        <animate attributeName="opacity"
          values="0;0;1;0.85;0.2;0"
          keyTimes={`0;${tFlashIn};${tFlashPeak};0.45;${tTallyFull};1`}
          dur={`${DUR}s`} repeatCount="indefinite"/>
        <animate attributeName="r"
          values="10;10;22;17;12;10"
          keyTimes={`0;${tFlashIn};${tFlashPeak};0.45;${tTallyFull};1`}
          dur={`${DUR}s`} repeatCount="indefinite"/>
      </circle>

      {/* (3) color particles flowing from each neighbor → protagonist */}
      {neighbors.map((nb, i) => {
        const [nx, ny] = posOf(nb);
        const delay = tParticle0 + i * particleGap;
        // safe: delay + tTravel stays < tTallyFull
        const arrive = Math.min(delay + tTravel, 0.77);
        return (
          <g key={"ptc"+i}>
            <circle r="3.6" fill={nbColors[i]} opacity="0"
              stroke="#fffdf7" strokeWidth="0.8">
              <animateMotion
                dur={`${DUR}s`} repeatCount="indefinite"
                path={`M${nx},${ny} L${wx},${wy}`}
                keyTimes={`0;${delay};${arrive};1`}
                keyPoints="0;0;1;1"
                calcMode="linear"/>
              <animate attributeName="opacity"
                values="0;0;1;1;0;0"
                keyTimes={`0;${delay};${delay+0.015};${arrive-0.015};${arrive};1`}
                dur={`${DUR}s`} repeatCount="indefinite"/>
            </circle>
          </g>
        );
      })}

      {/* (4) vote-tally — ONE CELL PER NEIGHBOR (not one wedge per cluster).
             Each cell shows that neighbor's current k-means color; a diagonal
             hatch overlay flags neighbors whose k-means color ≠ their truth
             (they're "wrong neighbors" whose vote still counts). Same-color
             cells are kept adjacent for visual clustering. */}
      <rect x={barX} y={barY} width={BAR_W} height={BAR_H}
        fill="#f0eadf" rx={2} opacity="0">
        <animate attributeName="opacity"
          values="0;0;0.85;0.85;0"
          keyTimes={`0;${tTallyStart};${tTallyStart+0.03};${tRescueEnd};1`}
          dur={`${DUR}s`} repeatCount="indefinite"/>
      </rect>
      {(() => {
        const cellGap = 0.8;
        const cellW = (BAR_W - cellGap*(totalNb-1)) / totalNb;
        // Sort neighbors: winner km-cluster cells first, then by km-cluster index
        const order = neighbors.map((_, i) => i).sort((a, b) => {
          const ka = nbKmClusters[a], kb = nbKmClusters[b];
          if (ka === voteMaxK && kb !== voteMaxK) return -1;
          if (kb === voteMaxK && ka !== voteMaxK) return 1;
          return ka - kb;
        });
        const segs = [];
        order.forEach((i, idx) => {
          const k = nbKmClusters[i];
          const truthK = nbTruthClusters[i];
          const isWinner = k === voteMaxK;
          const isWrong = nbIsWrong[i];
          // "supportive" = neighbor truly in same cluster as protagonist
          //   (regardless of how km labeled it)
          const isSupportive = truthK === protagonistTruthK;
          const x = barX + idx * (cellW + cellGap);
          const dotCx = x + cellW/2;
          const dotCy = barY + BAR_H + 3.2;
          segs.push(
            <g key={"vt"+i}>
              {/* vote cell: fill = neighbor's km color (= its vote) */}
              <rect x={x} y={barY} width={cellW} height={BAR_H}
                fill={clusterColors[k]} rx={1} opacity="0"
                stroke={isWinner ? "#1b1a18" : "none"}
                strokeWidth={isWinner ? 0.9 : 0}>
                <animate attributeName="opacity"
                  values={`0;0;1;1;0`}
                  keyTimes={`0;${tTallyStart};${tTallyFull};${tRescueEnd};1`}
                  dur={`${DUR}s`} repeatCount="indefinite"/>
              </rect>
              {/* diagonal hatch — only for the rare wrong-km neighbor
                  (km label disagrees with its truth); stays hidden on demos
                  where every neighbor is correctly km-labeled. */}
              {isWrong && [0.22, 0.50, 0.78].map((off, j) => (
                <line key={"h"+j}
                  x1={x + cellW*off - 2.6} y1={barY + BAR_H - 0.6}
                  x2={x + cellW*off + 2.6} y2={barY + 0.6}
                  stroke="#1b1a18" strokeWidth="1.5" opacity="0" strokeLinecap="round">
                  <animate attributeName="opacity"
                    values={`0;0;0.9;0.9;0`}
                    keyTimes={`0;${tTallyStart};${tTallyFull};${tRescueEnd};1`}
                    dur={`${DUR}s`} repeatCount="indefinite"/>
                </line>
              ))}
              {/* truth dot below cell — colored by neighbor's TRUE cluster.
                  Same color as cell = km correct; cross-protagonist color =
                  heterophilic edge. A darker ring marks dots matching the
                  protagonist's truth cluster (the "supportive" neighbors). */}
              <circle cx={dotCx} cy={dotCy} r={2.6}
                fill={clusterColors[truthK]} opacity="0"
                stroke={isSupportive ? "#1b1a18" : "#fffdf7"}
                strokeWidth={isSupportive ? 1.1 : 0.8}>
                <animate attributeName="opacity"
                  values={`0;0;1;1;0`}
                  keyTimes={`0;${tTallyStart};${tTallyFull};${tRescueEnd};1`}
                  dur={`${DUR}s`} repeatCount="indefinite"/>
              </circle>
            </g>
          );
        });
        return segs;
      })()}

      {/* (5) protagonist node — fill animates wrong → truth */}
      <circle cx={wx} cy={wy} r={7.5}
        fill={kmColor} stroke="#1b1a18" strokeWidth={1.8}>
        <animate attributeName="fill"
          values={`${kmColor};${kmColor};${flipColor};${flipColor}`}
          keyTimes={`0;${tFlipStart};${tFlipEnd};1`}
          dur={`${DUR}s`} repeatCount="indefinite"/>
        <animate attributeName="stroke-width"
          values={`1.8;1.8;2.4;1.2;1.2`}
          keyTimes={`0;${tFlipStart};${tFlipEnd};${tRescueEnd};1`}
          dur={`${DUR}s`} repeatCount="indefinite"/>
        <animate attributeName="r"
          values={`7.5;7.5;9.5;7.5;7.5`}
          keyTimes={`0;${tFlipStart};${tFlipEnd};${tRescueEnd};1`}
          dur={`${DUR}s`} repeatCount="indefinite"/>
      </circle>

      {/* (6) green rescue ring after flip */}
      <circle cx={wx} cy={wy} r="10" fill="none"
        stroke="oklch(0.62 0.16 150)" strokeWidth="2" opacity="0">
        <animate attributeName="opacity"
          values="0;0;1;0"
          keyTimes={`0;${tFlipEnd};${tRescuePk};${tRescueEnd}`}
          dur={`${DUR}s`} repeatCount="indefinite"/>
        <animate attributeName="r"
          values="10;10;28;28"
          keyTimes={`0;${tFlipEnd};${tRescuePk};${tRescueEnd}`}
          dur={`${DUR}s`} repeatCount="indefinite"/>
      </circle>
    </g>
  );
}

// ==============================================================
// CDETheatre — the playground's signature animation.
//
// Two side-by-side SVG panels showing the same graph evolving under:
//   LEFT  · GRAND only       ∂x/∂t = div(D∇x)
//   RIGHT · CDE              ∂x/∂t = div(D∇x) − div(v·x)
//
// Time scrubber lets the user drag t ∈ [0, T]. Node colour = nearest-
// centroid prediction, mis-classified nodes get dark stroke. Right panel
// overlays per-node velocity arrows showing the convection direction.
// Bottom: live ACC display (left vs right) so the user sees CDE pull
// ahead as t increases on the heterophilic graph.
// ==============================================================
function CDETheatre({ cde, tIdx, setTIdx, autoplay, setAutoplay, tweaks, stepId }) {
  const G = window.DEMO_GRAPHS[tweaks.dataset];
  const PW = 380, PH = 300;          // each panel
  const numSteps = cde.steps;
  const t = Math.max(0, Math.min(numSteps, tIdx));

  // Auto-play
  React.useEffect(() => {
    if (!autoplay) return;
    const id = setInterval(() => {
      setTIdx(prev => {
        if (prev >= numSteps) { setAutoplay(false); return numSteps; }
        return prev + 1;
      });
    }, 280);
    return () => clearInterval(id);
  }, [autoplay, numSteps]);

  // Project current X(t) for both panels — same projection rule.
  const projGrand = window.CDE_MATH.project2DAnchored(cde.trajGrand[t], cde.centers);
  const projCDE   = window.CDE_MATH.project2DAnchored(cde.trajCDE[t], cde.centers);
  const velsCDE   = cde.velFields[t];

  // Predicted classes by nearest centroid
  const predGrand = window.CDE_MATH.classifyNearest(cde.trajGrand[t], cde.centers);
  const predCDE   = window.CDE_MATH.classifyNearest(cde.trajCDE[t], cde.centers);

  const accGrand = cde.accGrand[t];
  const accCDE   = cde.accCDE[t];
  const accAdv   = (accCDE - accGrand) * 100;

  const clusterColors = G.clusters.map(c => c.color);

  // Pos of node n in panel using projection proj. Anchor is its layout (n.tx, n.ty);
  // we add a small displacement from the 2D projection of X(t).
  const posOf = (n, proj) => {
    const ax = n.tx, ay = n.ty;
    const [dx, dy] = proj[n.id];
    const k = 0.16;
    return [(ax + dx*k) * PW, (ay + dy*k) * PH];
  };

  const renderPanel = (pred, proj, panelKind) => {
    const showVel = panelKind === "cde";
    return (
      <svg viewBox={`0 0 ${PW} ${PH}`}
        style={{width:"100%", height:"auto", display:"block",
                background:"#fffdf7", borderRadius:6, border:"1px solid #e3ddd2"}}>
        {/* edges */}
        {G.edges.map(([a,b], i) => {
          const [x1,y1] = posOf(G.nodes[a], proj);
          const [x2,y2] = posOf(G.nodes[b], proj);
          const sameClu = G.nodes[a].cluster === G.nodes[b].cluster;
          return <line key={"e"+i}
            x1={x1} y1={y1} x2={x2} y2={y2}
            stroke={sameClu ? "#cfc8ba" : "oklch(0.70 0.10 35)"}
            strokeWidth={sameClu ? 0.9 : 1.1}
            opacity={sameClu ? 0.55 : 0.65}
            style={{transition:"x1 0.3s, y1 0.3s, x2 0.3s, y2 0.3s"}}/>;
        })}
        {/* nodes — drawn before arrows so the arrows sit on top */}
        {G.nodes.map((n, i) => {
          const [cx, cy] = posOf(n, proj);
          const c = clusterColors[pred[i]];
          const wrong = pred[i] !== n.cluster;
          return (
            <g key={"n"+n.id} transform={`translate(${cx},${cy})`}
              style={{transition:"transform 0.3s cubic-bezier(0.4,0,0.2,1)"}}>
              <circle cx="0" cy="0" r={7}
                fill={c}
                stroke={wrong ? "#1b1a18" : "#fffdf7"}
                strokeWidth={wrong ? 1.8 : 1.1}
                style={{transition:"fill 0.3s ease, stroke 0.3s ease"}}/>
              {wrong && <circle cx="4.5" cy="-4.5" r="2.5" fill="#1b1a18"/>}
            </g>
          );
        })}
        {/* velocity arrows on CDE panel — drawn LAST so they layer on top of nodes.
            Projected to first 2 dims; arrows start outside the node radius. */}
        {showVel && (
          <>
            <defs>
              <marker id="vel-arrowhead" viewBox="0 0 8 8" refX="6" refY="4"
                markerWidth="5" markerHeight="5" orient="auto">
                <path d="M0,0 L8,4 L0,8 z" fill="oklch(0.30 0.22 320)"/>
              </marker>
            </defs>
            {G.nodes.map((n, i) => {
              const [cx, cy] = posOf(n, proj);
              const v = velsCDE[i];
              const rawLen = Math.sqrt(v[0]*v[0] + v[1]*v[1]);
              if (rawLen < 0.005) return null;
              const mag = Math.min(0.2, rawLen);
              const drawLen = 10 + (mag/0.2) * 12;
              const dx = v[0]/rawLen, dy = v[1]/rawLen;
              const margin = 9;
              const sx = cx + dx*margin, sy = cy + dy*margin;
              const ex = sx + dx*drawLen, ey = sy + dy*drawLen;
              return (
                <line key={"v"+i} x1={sx} y1={sy} x2={ex} y2={ey}
                  stroke="oklch(0.32 0.22 320)" strokeWidth="1.6" opacity="0.92"
                  markerEnd="url(#vel-arrowhead)"
                  style={{pointerEvents:"none"}}/>
              );
            })}
          </>
        )}
      </svg>
    );
  };

  const tReal = (t * cde.tau).toFixed(2);

  return (
    <div>
      {/* time controller */}
      <div style={{display:"flex", alignItems:"center", gap:12, marginBottom:12}}>
        <button onClick={()=>setAutoplay(!autoplay)}
          style={{padding:"5px 12px", border:"1px solid #1b1a18",
            background:autoplay?"#1b1a18":"transparent",
            color:autoplay?"#fffdf7":"#1b1a18",
            borderRadius:6, cursor:"pointer", fontSize:12, fontWeight:600,
            minWidth:80}}>
          {autoplay ? "⏸ 暂停" : "▶ 播放"}
        </button>
        <button onClick={()=>{setTIdx(0); setAutoplay(false);}}
          style={{padding:"5px 10px", border:"1px solid #c8c1b4",
            background:"transparent", color:"#3d3a35",
            borderRadius:6, cursor:"pointer", fontSize:11.5}}>
          ↺ 重置
        </button>
        <input type="range" min={0} max={numSteps} step={1} value={t}
          onChange={e => { setTIdx(+e.target.value); setAutoplay(false); }}
          style={{flex:1, accentColor:"#1b1a18"}}/>
        <span className="mono" style={{fontSize:11.5, color:"#3d3a35", minWidth:90, textAlign:"right"}}>
          t = <b>{tReal}</b> / {cde.T.toFixed(1)}
        </span>
      </div>

      {/* dual panel */}
      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:12}}>
        {/* LEFT — GRAND only */}
        <div>
          <div style={{display:"flex", alignItems:"baseline", justifyContent:"space-between", marginBottom:6}}>
            <div style={{fontSize:11.5, color:"oklch(0.55 0.13 250)", fontWeight:600, letterSpacing:"0.06em"}}>
              GRAND only · 纯热扩散
            </div>
            <div className="mono" style={{fontSize:10, color:"#a8a194"}}>div(D∇x)</div>
          </div>
          {renderPanel(predGrand, projGrand, "grand")}
          <div style={{marginTop:8, padding:"8px 12px", background:"oklch(0.97 0.02 250)",
            border:"1px solid oklch(0.85 0.06 250)", borderRadius:6,
            display:"flex", alignItems:"baseline", justifyContent:"space-between"}}>
            <span style={{fontSize:11, color:"#3d3a35"}}>分类 ACC</span>
            <span className="mono" style={{fontSize:18, color:"oklch(0.40 0.10 250)", fontWeight:600}}>
              {(accGrand*100).toFixed(1)}<span style={{fontSize:11, color:"#a8a194"}}>%</span>
            </span>
          </div>
        </div>

        {/* RIGHT — CDE */}
        <div>
          <div style={{display:"flex", alignItems:"baseline", justifyContent:"space-between", marginBottom:6}}>
            <div style={{fontSize:11.5, color:"oklch(0.55 0.16 320)", fontWeight:600, letterSpacing:"0.06em"}}>
              CDE · 扩散 + 对流 ★
            </div>
            <div className="mono" style={{fontSize:10, color:"#a8a194"}}>div(D∇x) − div(v·x)</div>
          </div>
          {renderPanel(predCDE, projCDE, "cde")}
          <div style={{marginTop:8, padding:"8px 12px", background:"oklch(0.97 0.03 320)",
            border:"1px solid oklch(0.78 0.10 320)", borderRadius:6,
            display:"flex", alignItems:"baseline", justifyContent:"space-between"}}>
            <span style={{fontSize:11, color:"#3d3a35"}}>分类 ACC</span>
            <span className="mono" style={{fontSize:18, color:"oklch(0.40 0.13 320)", fontWeight:600}}>
              {(accCDE*100).toFixed(1)}<span style={{fontSize:11, color:"#a8a194"}}>%</span>
              {Math.abs(accAdv) > 0.5 && (
                <span style={{fontSize:11, marginLeft:8,
                  color: accAdv > 0 ? "oklch(0.45 0.15 150)" : "oklch(0.55 0.15 25)",
                  fontWeight:700}}>
                  {accAdv > 0 ? "★ +" : ""}{accAdv.toFixed(1)}<span style={{fontSize:9}}>pp</span>
                </span>
              )}
            </span>
          </div>
        </div>
      </div>

      {/* legend */}
      <div style={{marginTop:10, fontSize:10.5, color:"#827d75",
        display:"flex", gap:18, flexWrap:"wrap", lineHeight:1.5}}>
        <span>● 节点颜色 = 当前分类预测（按最近 centroid）</span>
        <span style={{color:"#1b1a18"}}>⬤ 误分节点</span>
        <span style={{color:"oklch(0.30 0.22 320)"}}>→ velocity 箭头（每节点 V_ij 平均, Eq.10）</span>
      </div>
    </div>
  );
}

// === Graph view: shows nodes, topology edges, optional attribute edges ===
function GraphView({ stepId, tweaks, iter, dgac }) {
  const G = window.DEMO_GRAPHS[tweaks.dataset] || window.DEMO_GRAPHS.hetero;
  const W = 420, H = 360;

  // Determine what to show at this step
  const showEdges = true;
  const showAttrEdges = tweaks.showAttrGraph && (stepId==="attribute" || stepId==="encode" || stepId==="fusion");

  // 2D projection from the active embedding at this step
  const proj = useMemo(() => {
    let src = dgac.H0;
    if (stepId==="topology") src = dgac.Ht;
    else if (stepId==="attribute") src = dgac.Ha;
    else if (stepId==="fusion" || stepId==="kmeans" || stepId==="loss") src = dgac.H;
    else if (stepId==="cprop" || stepId==="output") src = dgac.H;
    return window.DGAC_MATH.project2D(src);
  }, [dgac, stepId]);

  // per-step cluster prediction for coloring
  const predAssign = (() => {
    if (stepId==="kmeans") return dgac.km.assign;
    if (stepId==="cprop" || stepId==="output" || stepId==="loss") return dgac.refined.assign;
    return null;
  })();

  // Match predicted labels onto truth colors (via best permutation, same as acc)
  const colorPerm = useMemo(() => {
    if (!predAssign) return [0,1,2,3];
    // find best perm mapping pred → truth
    const K = 4;
    const perms = [];
    const h = (a, k)=>{ if(k===a.length){ perms.push(a.slice()); return;} for(let i=k;i<a.length;i++){ [a[k],a[i]]=[a[i],a[k]]; h(a,k+1); [a[k],a[i]]=[a[i],a[k]]; } };
    h([0,1,2,3], 0);
    let best=perms[0], bv=-1;
    for(const p of perms){
      let c=0; for(let i=0;i<predAssign.length;i++) if(p[predAssign[i]]===dgac.truth[i]) c++;
      if(c>bv){bv=c; best=p;}
    }
    return best;
  }, [predAssign, dgac.truth]);

  const clusterColors = G.clusters.map(c => c.color);
  const colorMode = (() => {
    if (["input","encode"].includes(stepId)) return "truth";
    if (["topology","attribute","fusion"].includes(stepId)) return "neutral";
    if (stepId==="kmeans") return "pred";
    return "pred";
  })();

  const nodeFill = (n) => {
    if (colorMode==="truth") return n.color;
    if (colorMode==="neutral") return "#d9d2c3";
    if (colorMode==="pred" && predAssign) return clusterColors[colorPerm[predAssign[n.id]]];
    return "#ccc";
  };
  const isWrongNode = (n) => {
    if (!predAssign) return false;
    return colorPerm[predAssign[n.id]] !== n.cluster;
  };

  // blend base anchor position with H-projection offset
  const posOf = (n) => {
    const ax = n.tx, ay = n.ty;
    const [dx, dy] = proj[n.id];
    // strength of H-driven displacement grows with pipeline progress
    const k = ["input","encode"].includes(stepId) ? 0
            : ["topology","attribute","fusion","kmeans"].includes(stepId) ? 0.10
            : 0.08;
    return [ (ax + dx*k) * W, (ay + dy*k) * H ];
  };

  // diffusion halos — SMIL-driven smooth pulse (independent of React re-render)
  // Note: cprop step has its own CorrectionTheater, so we skip halo there to avoid visual clutter
  const showHalo = tweaks.animateIter && (stepId==="topology" || stepId==="attribute");
  const haloColor = stepId==="topology" ? "oklch(0.55 0.13 250)"
                  : stepId==="attribute" ? "oklch(0.58 0.13 35)"
                  : "oklch(0.55 0.13 150)";

  // k-means' own best color permutation (independent of predAssign's step-based choice)
  // used for the CorrectionTheater: we want to show how k-means MIS-colored nodes get fixed.
  const kmColorPerm = useMemo(() => {
    const K = 4;
    const perms = [];
    const h = (a, k) => {
      if (k === a.length) { perms.push(a.slice()); return; }
      for (let i = k; i < a.length; i++) { [a[k],a[i]]=[a[i],a[k]]; h(a, k+1); [a[k],a[i]]=[a[i],a[k]]; }
    };
    h([0,1,2,3], 0);
    let best = perms[0], bv = -1;
    for (const p of perms) {
      let c = 0;
      for (let i = 0; i < dgac.km.assign.length; i++) if (p[dgac.km.assign[i]] === dgac.truth[i]) c++;
      if (c > bv) { bv = c; best = p; }
    }
    return best;
  }, [dgac.km.assign, dgac.truth]);

  // Pick one "demo-friendly" wrong node for C-prop theater:
  //   - was mis-assigned by k-means
  //   - has ≥ 2 neighbors
  //   - majority of neighbors' k-means colors point to the TRUTH cluster
  //     (so the animation shows a clear win, not ambiguous voting)
  const demoWrong = useMemo(() => {
    if (stepId !== "cprop") return null;
    const K = 4;
    const kmAssign = dgac.km.assign;
    const truth = dgac.truth;
    const wrongIds = [];
    for (let i = 0; i < G.nodes.length; i++) {
      if (kmColorPerm[kmAssign[i]] !== truth[i]) wrongIds.push(i);
    }
    if (wrongIds.length === 0) return null;

    const rated = wrongIds.map(id => {
      const nbIds = [];
      for (const [a, b] of G.edges) {
        if (a === id) nbIds.push(b);
        else if (b === id) nbIds.push(a);
      }
      const votes = new Array(K).fill(0);
      for (const nb of nbIds) votes[kmColorPerm[kmAssign[nb]]]++;
      let maj = 0;
      for (let k = 1; k < K; k++) if (votes[k] > votes[maj]) maj = k;
      return { id, nbIds, votes, maj, count: nbIds.length };
    }).filter(r => r.count >= 2 && r.maj === truth[r.id]);

    if (rated.length === 0) return null;
    // prefer ~3 neighbors (visual clarity), tie-break by more correct neighbors
    rated.sort((a, b) => {
      const aDist = Math.abs(a.count - 3), bDist = Math.abs(b.count - 3);
      if (aDist !== bDist) return aDist - bDist;
      return b.votes[b.maj]/b.count - a.votes[a.maj]/a.count;
    });
    const r = rated[0];
    const nbKmClusters = r.nbIds.map(id => kmColorPerm[dgac.km.assign[id]]);
    const nbTruthClusters = r.nbIds.map(id => dgac.truth[id]);
    return {
      node: G.nodes[r.id],
      neighbors: r.nbIds.map(id => G.nodes[id]),
      nbColors: r.nbIds.map((_, i) => clusterColors[nbKmClusters[i]]),
      nbKmClusters,
      nbTruthClusters,
      nbIsWrong: r.nbIds.map((id, i) => nbKmClusters[i] !== dgac.truth[id]),
      protagonistTruthK: dgac.truth[r.id],
      kmColor: clusterColors[kmColorPerm[dgac.km.assign[r.id]]],
      flipColor: clusterColors[r.maj],
      voteMaxK: r.maj,
    };
  }, [stepId, G, dgac.km.assign, dgac.truth, kmColorPerm, clusterColors]);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%", height:"auto", display:"block",
      background:"#fffdf7", borderRadius:8, border:"1px solid #e3ddd2"}}>
      <defs>
        <filter id="softglow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.5"/>
        </filter>
      </defs>

      {/* topology edges — CSS transition smooths position changes when step shifts */}
      {showEdges && G.edges.map(([a,b],i)=>{
        const [x1,y1]=posOf(G.nodes[a]), [x2,y2]=posOf(G.nodes[b]);
        const sameClu = G.nodes[a].cluster===G.nodes[b].cluster;
        return <line key={"e"+i}
          x1={x1} y1={y1} x2={x2} y2={y2}
          stroke={stepId==="topology"?"oklch(0.55 0.13 250)":"#cfc8ba"}
          strokeWidth={stepId==="topology"?1.4:0.9}
          opacity={stepId==="topology"?0.6:(sameClu?0.5:0.35)}
          style={LINE_XITION}/>;
      })}

      {/* attribute edges (dashed) */}
      {showAttrEdges && dgac.attrEdges.map(([a,b],i)=>{
        const [x1,y1]=posOf(G.nodes[a]), [x2,y2]=posOf(G.nodes[b]);
        return <line key={"ae"+i}
          x1={x1} y1={y1} x2={x2} y2={y2}
          stroke={"oklch(0.58 0.13 35)"}
          strokeWidth={1.2}
          strokeDasharray="3 3"
          opacity={stepId==="attribute"?0.7:0.35}
          style={LINE_XITION}/>;
      })}

      {/* nodes — wrapped in <g transform> so CSS transition smooths them when step changes.
          The C-prop protagonist is skipped here — CorrectionTheater paints it instead. */}
      {G.nodes.map(n => {
        if (demoWrong && demoWrong.node.id === n.id) return null;
        const [cx, cy] = posOf(n);
        const wrong = isWrongNode(n);
        return (
          <g key={n.id} transform={`translate(${cx},${cy})`} style={NODE_XITION}>
            {showHalo && (
              <circle cx="0" cy="0" r="6" fill="none"
                stroke={haloColor} strokeWidth="1.2" opacity="0.5">
                <animate attributeName="r" values="6;24" dur="1.6s"
                  begin={`${(n.id%5)*0.12}s`} repeatCount="indefinite"/>
                <animate attributeName="opacity" values="0.55;0" dur="1.6s"
                  begin={`${(n.id%5)*0.12}s`} repeatCount="indefinite"/>
              </circle>
            )}
            <circle cx="0" cy="0" r={7.5}
              fill={nodeFill(n)}
              stroke={wrong?"#1b1a18":"#fffdf7"}
              strokeWidth={wrong?2:1.2}
              style={{transition:"fill 0.5s ease, stroke 0.3s ease, stroke-width 0.3s ease"}}/>
            {wrong && (
              <circle cx="5" cy="-5" r={3} fill="#1b1a18"/>
            )}
          </g>
        );
      })}

      {/* C-prop correction theater — plays on cprop step */}
      {demoWrong && (
        <CorrectionTheater
          wrongNode={demoWrong.node}
          neighbors={demoWrong.neighbors}
          posOf={posOf}
          kmColor={demoWrong.kmColor}
          flipColor={demoWrong.flipColor}
          nbColors={demoWrong.nbColors}
          nbKmClusters={demoWrong.nbKmClusters}
          nbTruthClusters={demoWrong.nbTruthClusters}
          nbIsWrong={demoWrong.nbIsWrong}
          protagonistTruthK={demoWrong.protagonistTruthK}
          voteMaxK={demoWrong.voteMaxK}
          clusterColors={clusterColors}/>
      )}

      {/* legend / caption */}
      <text x={12} y={H-12} style={{fontSize:10.5, fill:"#827d75", fontFamily:"'JetBrains Mono',monospace"}}>
        {colorMode==="truth" && "● 真实簇标签 (仅此处展示)"}
        {colorMode==="neutral" && "○ 节点随 H 位移 → 观察 H = αÂH+H₀ 收敛"}
        {colorMode==="pred" && stepId==="kmeans" && "● kmeans 初分配, ⬤ 标记误分配节点"}
        {colorMode==="pred" && stepId==="cprop" && "● 上格=邻居 km 投票色 · 下点=邻居真实簇（深圈=与中心同簇的支持邻居）· Eq.16"}
        {colorMode==="pred" && stepId!=="kmeans" && stepId!=="cprop" && "● C-prop 平滑后的聚类结果, ⬤ 误分配"}
      </text>
    </svg>
  );
}

// === Step scrubber ===
function Scrubber({ step, steps, idx, setIdx, playing, setPlaying }) {
  return (
    <div style={{marginTop:20, padding:"16px 20px", background:"#fffdf7",
      border:"1px solid #e3ddd2", borderRadius:8}}>
      <div style={{display:"flex", alignItems:"center", gap:12, marginBottom:12}}>
        <button onClick={()=>setIdx(Math.max(0, idx-1))}
          disabled={idx===0}
          style={{padding:"8px 14px", fontSize:12, border:"1px solid #e3ddd2",
            background:idx===0?"#f7f5f1":"transparent", borderRadius:6,
            cursor:idx===0?"default":"pointer", color:idx===0?"#c8c1b4":"#1b1a18"}}>← 上一步</button>
        <button onClick={()=>setIdx(Math.min(steps.length-1, idx+1))}
          disabled={idx===steps.length-1}
          style={{padding:"8px 14px", fontSize:12, border:"1px solid #1b1a18",
            background:idx===steps.length-1?"#f7f5f1":"#1b1a18",
            color:idx===steps.length-1?"#c8c1b4":"#fffdf7", borderRadius:6,
            cursor:idx===steps.length-1?"default":"pointer", fontWeight:600}}>下一步 →</button>
        <div style={{marginLeft:"auto", fontSize:12, color:"#827d75"}} className="mono">
          {idx+1} / {steps.length}
        </div>
      </div>

      {/* dots */}
      <div style={{display:"flex", gap:4, alignItems:"center", marginBottom:12}}>
        {steps.map((s,i)=>(
          <button key={s.id} onClick={()=>setIdx(i)}
            title={s.title}
            style={{
              flex:1, height:6, border:"none", cursor:"pointer",
              background: i<=idx ? "#1b1a18" : "#e3ddd2",
              borderRadius:3,
              transition:"background .3s ease",
            }}/>
        ))}
      </div>

      <div style={{display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:6}}>
        <span className="serif" style={{fontSize:18, fontWeight:600, color:"#1b1a18"}}>
          <span style={{color:"#a8a194", fontSize:13, marginRight:8, fontFamily:"'JetBrains Mono',monospace"}}>
            step {String(idx+1).padStart(2,"0")}
          </span>
          {step.title}
        </span>
        <span className="mono" style={{fontSize:12, color:"#827d75"}}>{step.subtitle}</span>
      </div>
      <p style={{fontSize:13.5, lineHeight:1.7, color:"#3d3a35", margin:0}}>{step.desc}</p>
    </div>
  );
}

// === Header ===
function Header(){
  return (
    <header style={{marginBottom:18}}>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:6}}>
        <div>
          <div style={{fontSize:11, color:"#a8a194", letterSpacing:"0.18em", marginBottom:4}}>
            IJCAI 2023 · INTERACTIVE WALK-THROUGH
          </div>
          <h1 className="serif" style={{margin:0, fontSize:28, fontWeight:600, color:"#1b1a18"}}>
            CDE · <span style={{fontWeight:400, color:"#3d3a35"}}>Graph Neural Convection-Diffusion with Heterophily</span>
          </h1>
        </div>
        <div style={{textAlign:"right", fontSize:11.5, color:"#827d75", lineHeight:1.5}} className="mono">
          <div>
            <a href="https://github.com/Haili321/cde-playground" target="_blank" rel="noreferrer"
               style={{color:"inherit", textDecoration:"none", borderBottom:"1px dotted #c9c3b7"}}>
              github.com/Haili321/cde-playground
            </a>
          </div>
          <div>对流-扩散 PDE · 异质图友好 · learnable velocity</div>
        </div>
      </div>
      <div style={{height:1, background:"#e3ddd2", marginTop:14}}/>
    </header>
  );
}

// === Summary strip ===
function BottomStrip() {
  const items = [
    { k:"+20%", v:"Roman-empire ACC vs GRAND" },
    { k:"9/9", v:"异质 benchmark 全部 SOTA" },
    { k:"~1%", v:"推理时间 vs GRAND（几乎免费）" },
    { k:"v_ij = σ(W(x_j−x_i))", v:"learnable per-edge velocity (Eq.10)" },
  ];
  return (
    <div style={{marginTop:18, display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10}}>
      {items.map((x,i)=>(
        <div key={i} style={{background:"#fffdf7", border:"1px solid #e3ddd2", borderRadius:8, padding:"12px 14px"}}>
          <div className="serif" style={{fontSize:22, fontWeight:600, color:"#1b1a18"}}>{x.k}</div>
          <div style={{fontSize:11.5, color:"#827d75"}}>{x.v}</div>
        </div>
      ))}
    </div>
  );
}

// === App ===
function App() {
  const [tweaks, setTweaks] = useState(TWEAK_DEFAULTS);
  const [idx, setIdx] = useState(()=>{
    const saved = localStorage.getItem("dgac_step");
    return saved ? Math.min(parseInt(saved), window.STEPS.length-1) : 0;
  });
  const [playing, setPlaying] = useState(false);
  const [tweaksVisible, setTweaksVisible] = useState(false);
  const [iter, setIter] = useState(0);
  // Time scrubber for the dual-panel CDE theatre
  const [tIdx, setTIdx] = useState(0);
  const [autoplay, setAutoplay] = useState(false);

  const steps = window.STEPS;
  const step = steps[idx];
  const activeSet = useMemo(()=>new Set(step.active), [step]);

  // REAL DGAC pipeline result — kept for the legacy panels (Loss/Confidence/Hetero)
  // until they're rewritten for CDE in the next pass.
  const dgac = useMemo(()=>{
    const G = window.DEMO_GRAPHS[tweaks.dataset];
    return window.DGAC_MATH.runDGAC(G, tweaks);
  }, [tweaks.dataset, tweaks.alpha, tweaks.beta,
      tweaks.topLayers, tweaks.attrLayers, tweaks.cpropLayers]);

  // CDE result — runs both GRAND-only and CDE forward passes, returns full
  // trajectories of X(t) for the time-scrubbed dual-panel theatre.
  // alpha slider repurposed as integration time T  (∈ [0.5, 5]);
  // beta slider repurposed as convection strength (β=0 → CDE = GRAND).
  const cde = useMemo(()=>{
    const G = window.DEMO_GRAPHS[tweaks.dataset];
    return window.CDE_MATH.runCDE(G, {
      rDim: 8, K: 4,
      T: 0.5 + tweaks.alpha * 4.5,  // alpha ∈ [0.1, 1] → T ∈ [0.95, 5]
      tau: 0.25,
      kappa: 0.5,                   // gentler heat diffusion
      w0: tweaks.beta * 0.15,       // β=0 → no convection (CDE=GRAND); β=1 → strong
      seed: 33,
    });
  }, [tweaks.dataset, tweaks.alpha, tweaks.beta]);

  // Clamp tIdx when steps change (e.g. T changes → fewer steps)
  useEffect(()=>{
    if (tIdx > cde.steps) setTIdx(cde.steps);
  }, [cde.steps, tIdx]);

  useEffect(()=>{ localStorage.setItem("dgac_step", idx); }, [idx]);

  // autoplay removed — steps only advance via user action.

  // iteration ticker for halo animation
  useEffect(()=>{
    const t = setInterval(()=>setIter(i=>i+1), 600);
    return ()=>clearInterval(t);
  }, []);

  // edit-mode wiring
  useEffect(()=>{
    const handler = (e)=>{
      if (e.data?.type === "__activate_edit_mode") setTweaksVisible(true);
      if (e.data?.type === "__deactivate_edit_mode") setTweaksVisible(false);
    };
    window.addEventListener("message", handler);
    window.parent.postMessage({type:"__edit_mode_available"}, "*");
    return ()=>window.removeEventListener("message", handler);
  }, []);

  const setTweak = (k, v)=>{
    setTweaks(prev=>{
      const next = {...prev, [k]: v};
      window.parent.postMessage({type:"__edit_mode_set_keys", edits:{[k]:v}}, "*");
      return next;
    });
  };

  return (
    <div data-screen-label="DGAC Playground"
      style={{maxWidth:1280, margin:"0 auto", padding:"28px 36px 56px"}}>
      <Header/>

      {/* Full-width architecture diagram */}
      <div style={{background:"#fffdf7", border:"1px solid #e3ddd2", borderRadius:10, padding:"18px 24px 14px", marginBottom:0}}>
        <div style={{fontSize:11, color:"#a8a194", letterSpacing:"0.14em", marginBottom:10}}>
          架构流程图 · ARCHITECTURE
        </div>
        <window.PipelineDiagram activeSet={activeSet} tweaks={tweaks}
          onStepJump={(id)=>{
            const i = steps.findIndex(s=>s.id===id);
            if (i>=0) setIdx(i);
          }}/>
      </div>

      {/* Inline Tweaks bar — lives right under the architecture, above the grid */}
      <window.TweaksPanel tweaks={tweaks} setTweak={setTweak} visible={tweaksVisible}/>

      {/* Main grid */}
      <div style={{display:"grid", gridTemplateColumns:"1.3fr 1fr", gap:24}}>
        {/* Left column: graph view + loss */}
        <div>
          <div style={{display:"grid", gridTemplateColumns:"1fr", gap:12}}>
            <div style={{background:"#fffdf7", border:"1px solid #e3ddd2", borderRadius:10, padding:"16px 18px"}}>
              <div style={{display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:12}}>
                <div style={{fontSize:11, color:"#a8a194", letterSpacing:"0.14em"}}>
                  双 panel 时间剧场 · DUAL-PANEL TIME THEATRE ★
                </div>
                <div style={{fontSize:11, color:"#827d75"}} className="mono">
                  step {tIdx} / {cde.steps}
                </div>
              </div>
              <CDETheatre cde={cde} tIdx={tIdx} setTIdx={setTIdx}
                autoplay={autoplay} setAutoplay={setAutoplay}
                tweaks={tweaks} stepId={step.id}/>
            </div>

            <window.LossBreakdown active={step.id==="loss"||step.id==="output"} tick={iter}
              cde={cde} tIdx={tIdx} tweaks={tweaks}/>
          </div>
        </div>

        {/* Right column: formulas */}
        <div>
          <div style={{background:"#fffdf7", border:"1px solid #e3ddd2", borderRadius:10, padding:"18px 20px", position:"sticky", top:20}}>
            <div style={{fontSize:11, color:"#a8a194", letterSpacing:"0.14em", marginBottom:12}}>
              公式 · FORMULAS
            </div>
            <window.FormulaPanel step={step} tweaks={tweaks}/>
          </div>
        </div>
      </div>

      {/* Scrubber full width */}
      <Scrubber step={step} steps={steps} idx={idx} setIdx={setIdx}
        playing={playing} setPlaying={setPlaying}/>

      <BottomStrip/>

      <footer style={{marginTop:28, paddingTop:20, borderTop:"1px solid #e3ddd2",
        fontSize:11.5, color:"#a8a194", display:"flex", justifyContent:"space-between"}}>
        <span>CDE · IJCAI 2023</span>
        <span className="mono">CDE Playground · interactive walkthrough</span>
      </footer>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
