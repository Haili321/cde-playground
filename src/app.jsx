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

// ==============================================================
// MixedMath — renders text with $...$ tex segments interleaved.
// Chinese text stays in normal font; math segments are KaTeX-rendered.
// Uses renderToString + dangerouslySetInnerHTML so React fully owns
// the DOM (no ref/innerHTML conflict that can trigger update loops).
// ==============================================================
function MixedMath({ text }) {
  const parts = useMemo(() => {
    const out = [];
    const re = /\$([^$]+)\$/g;
    let last = 0, m;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) out.push({ t: "txt", v: text.slice(last, m.index) });
      out.push({ t: "tex", v: m[1] });
      last = m.index + m[0].length;
    }
    if (last < text.length) out.push({ t: "txt", v: text.slice(last) });
    return out;
  }, [text]);
  return <>{parts.map((p, i) => p.t === "tex"
    ? <KatexInline key={i} tex={p.v}/>
    : <span key={i}>{p.v}</span>)}</>;
}

function KatexInline({ tex }) {
  const html = useMemo(() => {
    if (!window.katex) return null;
    try {
      return window.katex.renderToString(tex, {
        throwOnError: false,
        displayMode: false,
        strict: "ignore",
        output: "html",
      });
    } catch (e) {
      console.warn("[KaTeX]", tex, e);
      return null;
    }
  }, [tex]);
  if (html == null) return <span style={{margin:"0 1px"}}>{tex}</span>;
  return <span style={{margin:"0 1px"}} dangerouslySetInnerHTML={{__html: html}}/>;
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
    const showVel = panelKind === "cde" && tweaks.showAttrGraph !== false;
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
        <span style={{fontSize:12.5, color:"#3d3a35", maxWidth:"60%", textAlign:"right"}}>
          <MixedMath text={step.subtitle}/>
        </span>
      </div>
      <p style={{fontSize:13.5, lineHeight:1.85, color:"#3d3a35", margin:0}}>
        <MixedMath text={step.desc}/>
      </p>
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
    { k:"3/9", v:"hetero datasets where CDE is best (line 845-846)" },
    { k:"~1%", v:"推理时间增量 vs GRAND (line 1208-1211)" },
    { tex:"V_{ij}=\\sigma\\bigl(W(x_j-x_i)\\bigr)", v:"learnable per-edge velocity (Eq.10)" },
  ];
  const Kx = window.InlineKatex;
  return (
    <div style={{marginTop:18, display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10}}>
      {items.map((x,i)=>(
        <div key={i} style={{background:"#fffdf7", border:"1px solid #e3ddd2", borderRadius:8, padding:"12px 14px"}}>
          {x.tex ? (
            <div style={{fontSize:18, color:"#1b1a18", display:"flex", alignItems:"center", minHeight:30}}>
              {Kx ? <Kx tex={x.tex}/> : <span className="mono">{x.tex}</span>}
            </div>
          ) : (
            <div className="serif" style={{fontSize:22, fontWeight:600, color:"#1b1a18"}}>{x.k}</div>
          )}
          <div style={{fontSize:11.5, color:"#827d75", marginTop: x.tex ? 4 : 0}}>{x.v}</div>
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

            <window.LossBreakdown active={step.id==="benchmark"||step.id==="plugin"} tick={iter}
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
