// Extra visual panels for the CDE playground.
//
// Replaces the old DGAC LossBreakdown / HomophilyDial / ConfidenceBars / etc.
// with CDE-specific result visualisations:
//
//   • CDETrainingDynamics  — ACC vs time t for both GRAND and CDE branches
//   • CDEBenchmarkTable    — paper Table 2 highlights (real numbers)
//   • CDEFigure1           — interactive reproduction of Figure 1
//                            (ACC vs h_edge on synthetic graphs)
//   • LossBreakdown        — composes the above; kept as window export
//                            for app.jsx compatibility

const { useState: useStateX, useEffect: useEffectX, useMemo: useMemoX } = React;

// Inline KaTeX for HTML — light wrapper so we can mix LaTeX into prose.
function InlineKatex({ tex, style, displayMode=false }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!ref.current) return;
    if (!window.katex) { ref.current.textContent = tex; return; }
    try {
      window.katex.render(tex, ref.current, {
        throwOnError: false, displayMode, strict: "ignore",
      });
    } catch (e) {
      if (ref.current) ref.current.textContent = tex;
    }
  }, [tex, displayMode]);
  return <span ref={ref} style={style}/>;
}

// ============================================================
// CDE Training Dynamics — ACC trajectory plot + paper Table 2 numbers.
// Compares GRAND-only vs CDE branches over integration time t ∈ [0, T].
// ============================================================
function CDETrainingDynamics({ cde, tIdx, active }) {
  const accG = cde.accGrand;
  const accC = cde.accCDE;
  const N = accG.length;
  const tau = cde.tau;

  // Plot geometry
  const W = 380, H = 170, padL = 40, padR = 14, padT = 14, padB = 28;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const xToPx = i => padL + (i/(N-1)) * innerW;
  const yToPx = a => padT + (1 - a) * innerH;

  const path = (arr) => arr.map((a,i) =>
    `${i===0?"M":"L"}${xToPx(i).toFixed(1)},${yToPx(a).toFixed(1)}`
  ).join(" ");

  // Paper Table 2 highlights — real CDE-GRAND vs GRAND ACC (%) per dataset
  const benchmark = [
    { name:"Roman-empire", h:"-0.05", grand:71.60, cde:91.64, hl:true  },
    { name:"Wiki-cooc",    h:"-0.03", grand:92.03, cde:97.99, hl:false },
    { name:"Minesweeper",  h:" 0.01", grand:76.67, cde:95.50, hl:true  },
    { name:"Texas",        h:" 0.04", grand:80.27, cde:86.22, hl:false },
    { name:"Wisconsin",    h:" 0.07", grand:83.73, cde:87.45, hl:false },
  ];

  const C_GRAND = "oklch(0.55 0.13 250)";
  const C_CDE   = "oklch(0.45 0.20 320)";

  return (
    <div style={{
      background:"#fffdf7", border:"1px solid #e3ddd2", borderRadius:10,
      padding:"16px 18px", opacity: active?1:0.7, transition:"opacity .3s ease",
    }}>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:10}}>
        <span style={{fontSize:11, color:"#a8a194", letterSpacing:"0.14em"}}>
          训练动力学 · TRAINING DYNAMICS
        </span>
        <span className="mono" style={{fontSize:10.5, color: active?C_CDE:"#a8a194"}}>
          step {tIdx} / {N-1}
        </span>
      </div>

      <div style={{display:"grid", gridTemplateColumns:"1.1fr 1fr", gap:14}}>
        {/* LEFT — ACC vs t line chart */}
        <div>
          <div style={{fontSize:11, color:"#3d3a35", marginBottom:6, lineHeight:1.5}}>
            分类 ACC 随积分时间 <InlineKatex tex="t\in[0,T]"/> 演化（toy 20 节点异质图）
          </div>
          <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%", height:"auto",
            background:"#fdfaf2", border:"1px solid #f0eadf", borderRadius:6, display:"block"}}>
            {/* gridlines */}
            {[0, 0.25, 0.5, 0.75, 1.0].map(a => (
              <g key={a}>
                <line x1={padL} x2={W-padR} y1={yToPx(a)} y2={yToPx(a)}
                  stroke="#f0eadf" strokeWidth="1"/>
                <text x={padL-6} y={yToPx(a)+3} textAnchor="end"
                  style={{fontSize:9, fill:"#a8a194", fontFamily:"'JetBrains Mono',monospace"}}>
                  {(a*100).toFixed(0)}
                </text>
              </g>
            ))}
            {/* x-axis ticks */}
            {[0, 0.25, 0.5, 0.75, 1.0].map(f => {
              const i = Math.round(f * (N-1));
              return (
                <text key={f} x={xToPx(i)} y={H-padB+14} textAnchor="middle"
                  style={{fontSize:9, fill:"#827d75", fontFamily:"'JetBrains Mono',monospace"}}>
                  {(i*tau).toFixed(1)}
                </text>
              );
            })}
            <text x={padL+innerW/2} y={H-2} textAnchor="middle"
              style={{fontSize:9.5, fill:"#a8a194", letterSpacing:"0.06em"}}>t (积分时间)</text>
            <text x={6} y={padT+8}
              style={{fontSize:9, fill:"#a8a194", letterSpacing:"0.06em"}}>ACC %</text>

            {/* curves */}
            <path d={path(accG)} fill="none" stroke={C_GRAND} strokeWidth="2"
              strokeDasharray="3 3" opacity="0.85"/>
            <path d={path(accC)} fill="none" stroke={C_CDE} strokeWidth="2.4"
              opacity="0.95"/>

            {/* current t marker */}
            <line x1={xToPx(tIdx)} x2={xToPx(tIdx)} y1={padT-4} y2={H-padB}
              stroke="#1b1a18" strokeWidth="0.8" strokeDasharray="2 2"/>
            <circle cx={xToPx(tIdx)} cy={yToPx(accG[tIdx])} r="3.5"
              fill={C_GRAND} stroke="#fffdf7" strokeWidth="1"/>
            <circle cx={xToPx(tIdx)} cy={yToPx(accC[tIdx])} r="4"
              fill={C_CDE} stroke="#fffdf7" strokeWidth="1.2"/>

            {/* legend */}
            <g transform={`translate(${padL+8}, ${padT+6})`}>
              <line x1={0} y1={0} x2={18} y2={0} stroke={C_GRAND} strokeWidth="2" strokeDasharray="3 3"/>
              <text x={22} y={3} style={{fontSize:9.5, fill:C_GRAND, fontWeight:600}}>GRAND</text>
              <line x1={70} y1={0} x2={88} y2={0} stroke={C_CDE} strokeWidth="2.4"/>
              <text x={92} y={3} style={{fontSize:9.5, fill:C_CDE, fontWeight:600}}>CDE ★</text>
            </g>
          </svg>
          <div style={{fontSize:10.5, color:"#827d75", marginTop:6, lineHeight:1.5}}>
            t=0 两边一样（X(0) 离 centroid 最近）；t↑ 后 over-smoothing 出现，
            异质图上 GRAND 受影响通常更大。
            <span style={{color:"#a8a194"}}> · toy seed W；论文 +20% 见右 →</span>
          </div>
        </div>

        {/* RIGHT — Paper Table 2 highlights */}
        <div>
          <div style={{fontSize:11, color:"#3d3a35", marginBottom:6, lineHeight:1.5}}>
            论文 Table 2 · CDE-GRAND vs GRAND 在异质 benchmark 上的真实数字
          </div>
          <div style={{
            background:"#fdfaf2", border:"1px solid #f0eadf", borderRadius:6,
            padding:"10px 12px", fontSize:11.5, lineHeight:1.7,
          }}>
            <table style={{width:"100%", borderCollapse:"collapse", fontSize:11}}>
              <thead>
                <tr style={{borderBottom:"1px solid #e3ddd2"}}>
                  <th style={{textAlign:"left", color:"#827d75", fontWeight:500, padding:"3px 4px"}}>数据集</th>
                  <th style={{textAlign:"right", color:"#827d75", fontWeight:500, padding:"3px 4px"}}>
                    <InlineKatex tex="h_{\mathrm{adj}}"/>
                  </th>
                  <th style={{textAlign:"right", color:C_GRAND, fontWeight:600, padding:"3px 4px"}}>GRAND</th>
                  <th style={{textAlign:"right", color:C_CDE, fontWeight:600, padding:"3px 4px"}}>CDE-GRAND</th>
                  <th style={{textAlign:"right", color:"oklch(0.45 0.18 150)", fontWeight:600, padding:"3px 4px"}}>Δ</th>
                </tr>
              </thead>
              <tbody>
                {benchmark.map(b => {
                  const delta = b.cde - b.grand;
                  return (
                    <tr key={b.name} style={{
                      background: b.hl ? "oklch(0.97 0.04 320)" : "transparent",
                    }}>
                      <td style={{padding:"5px 4px", fontWeight: b.hl?600:400, color:"#1b1a18"}}>{b.name}</td>
                      <td style={{textAlign:"right", padding:"5px 4px", color:"#827d75"}} className="mono">{b.h}</td>
                      <td style={{textAlign:"right", padding:"5px 4px"}} className="mono">{b.grand.toFixed(2)}</td>
                      <td style={{textAlign:"right", padding:"5px 4px", fontWeight:b.hl?700:500, color:C_CDE}} className="mono">{b.cde.toFixed(2)}</td>
                      <td style={{textAlign:"right", padding:"5px 4px",
                        fontWeight:b.hl?700:500,
                        color: delta > 10 ? "oklch(0.40 0.20 30)" : "oklch(0.45 0.15 150)"}} className="mono">
                        {b.hl && "★ "}+{delta.toFixed(1)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{fontSize:10.5, color:"#827d75", marginTop:6, lineHeight:1.5}}>
            <InlineKatex tex="h_{\mathrm{adj}}"/> 越低（异质性越强），CDE 改进越大。
            Roman-empire 是最异质的（−0.05），CDE-GRAND <b style={{color:"oklch(0.40 0.20 30)"}}>+20pp</b>。
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// CDE Figure 1 reproduction — ACC vs edge-homophily curve.
// Sweeps h ∈ [0.1, 0.9] on synthetic graphs, runs both GRAND and
// CDE for each h. Crossover at h<0.5 in the paper.
// ============================================================
function CDEFigure1({ tweaks, active }) {
  const hs = useMemoX(() => Array.from({length:9}, (_,i) => 0.1 + i*0.1), []);

  const result = useMemoX(() => {
    const N = 20, K = 4;
    const buildGraph = (h, seed) => {
      const rng = (() => { let s = seed>>>0||1; return () => { s = (Math.imul(s,1664525)+1013904223)>>>0; return s/4294967296; }; })();
      const nodes = [];
      for (let c=0; c<K; c++)
        for (let i=0; i<N/K; i++) nodes.push({ id: c*(N/K)+i, cluster: c, tx:0, ty:0 });
      const edges = [];
      const seen = new Set();
      const addE = (a,b) => { if (a===b) return;
        const k = a<b?`${a}-${b}`:`${b}-${a}`;
        if (seen.has(k)) return;
        seen.add(k); edges.push([Math.min(a,b),Math.max(a,b)]); };
      for (let i=0; i<N; i++) {
        for (let t=0; t<3; t++) {
          const sameClu = rng() < h;
          const pool = nodes
            .map((n,id) => ((sameClu === (n.cluster===nodes[i].cluster)) && id!==i) ? id : -1)
            .filter(x => x>=0);
          if (!pool.length) continue;
          const j = pool[Math.floor(rng()*pool.length)];
          addE(i, j);
        }
      }
      return { nodes, edges };
    };

    const accG = [], accC = [];
    for (const h of hs) {
      let aG = 0, aC = 0, used = 0;
      for (let trial=0; trial<3; trial++) {
        const G = buildGraph(h, 0xC0FFEE + trial*7);
        if (!G.edges.length) continue;
        const r = window.CDE_MATH.runCDE(G, {
          rDim: 8, K: 4,
          T: 2.5, tau: 0.25, kappa: 0.5,
          w0: tweaks.beta * 0.15,
          seed: 33 + trial,
        });
        aG += r.accGrand[r.accGrand.length-1];
        aC += r.accCDE[r.accCDE.length-1];
        used++;
      }
      accG.push(used ? aG/used : 0);
      accC.push(used ? aC/used : 0);
    }
    return { accG, accC };
  }, [hs, tweaks.beta]);

  const W = 800, H = 200, padL = 42, padR = 16, padT = 14, padB = 30;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const xToPx = h => padL + ((h-0.1)/0.8) * innerW;
  const yToPx = a => padT + (1-a)*innerH;
  const pathOf = arr => arr.map((a,i) =>
    `${i===0?"M":"L"}${xToPx(hs[i]).toFixed(1)},${yToPx(a).toFixed(1)}`
  ).join(" ");

  const C_GRAND = "oklch(0.55 0.13 250)";
  const C_CDE   = "oklch(0.45 0.20 320)";

  return (
    <div style={{
      background:"#fffdf7", border:"1px solid #e3ddd2", borderRadius:10,
      padding:"16px 18px", marginTop:12, opacity: active?1:0.85, transition:"opacity .3s ease",
    }}>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:6}}>
        <span style={{fontSize:11, color:"#a8a194", letterSpacing:"0.14em"}}>
          论文 Figure 1 复现 · ACC vs <InlineKatex tex="h_{\mathrm{edge}}"/>
        </span>
        <span className="mono" style={{fontSize:10.5, color:"#827d75"}}>
          synth graphs · 3 seed avg
        </span>
      </div>
      <div style={{fontSize:11, color:"#3d3a35", marginBottom:8, lineHeight:1.55}}>
        在合成图上调控边同质率 <InlineKatex tex="h_{\mathrm{edge}}"/>。
        论文 Figure 1 显示 CDE 在 <InlineKatex tex="h<0.5"/> 区段碾压 GRAND/GCN/ACM-GCN
        — 以下是用 playground 的 toy ODE 在浏览器里实算的版本。
        <span style={{color:"#a8a194"}}>· 调 β 滑块改变 convection 强度看曲线变化。</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%", height:"auto",
        background:"#fdfaf2", border:"1px solid #f0eadf", borderRadius:6, display:"block"}}>
        {/* shaded heterophilic region */}
        <rect x={xToPx(0.1)} y={padT}
          width={xToPx(0.5)-xToPx(0.1)} height={innerH}
          fill="oklch(0.96 0.04 320)" opacity="0.7"/>
        <text x={(xToPx(0.1)+xToPx(0.5))/2} y={padT+13} textAnchor="middle"
          style={{fontSize:10, fill:"oklch(0.45 0.20 320)", letterSpacing:"0.05em",
            fontStyle:"italic"}}>
          ↓ 异质区（CDE 优势）
        </text>

        {/* gridlines */}
        {[0, 0.25, 0.5, 0.75, 1.0].map(a => (
          <g key={a}>
            <line x1={padL} x2={W-padR} y1={yToPx(a)} y2={yToPx(a)}
              stroke="#f0eadf" strokeWidth="1"/>
            <text x={padL-6} y={yToPx(a)+3} textAnchor="end"
              style={{fontSize:10, fill:"#a8a194", fontFamily:"'JetBrains Mono',monospace"}}>
              {(a*100).toFixed(0)}
            </text>
          </g>
        ))}
        {hs.map(h => (
          <text key={h} x={xToPx(h)} y={H-padB+14} textAnchor="middle"
            style={{fontSize:10, fill:"#827d75", fontFamily:"'JetBrains Mono',monospace"}}>
            {h.toFixed(1)}
          </text>
        ))}
        <text x={padL+innerW/2} y={H-4} textAnchor="middle"
          style={{fontSize:10, fill:"#a8a194", letterSpacing:"0.06em"}}>
          h_edge (边同质率)
        </text>
        <text x={8} y={padT+10}
          style={{fontSize:9.5, fill:"#a8a194", letterSpacing:"0.06em"}}>ACC %</text>

        {/* curves */}
        <path d={pathOf(result.accG)} fill="none" stroke={C_GRAND} strokeWidth="2.2"
          strokeDasharray="4 3" opacity="0.85"/>
        <path d={pathOf(result.accC)} fill="none" stroke={C_CDE} strokeWidth="2.6"/>
        {/* points */}
        {hs.map((h,i) => (
          <g key={h}>
            <circle cx={xToPx(h)} cy={yToPx(result.accG[i])} r="3"
              fill={C_GRAND} stroke="#fffdf7" strokeWidth="1"/>
            <circle cx={xToPx(h)} cy={yToPx(result.accC[i])} r="3.5"
              fill={C_CDE} stroke="#fffdf7" strokeWidth="1.2"/>
          </g>
        ))}

        {/* legend */}
        <g transform={`translate(${W-padR-180}, ${padT+8})`}>
          <line x1={0} y1={0} x2={20} y2={0} stroke={C_GRAND} strokeWidth="2.2" strokeDasharray="4 3"/>
          <text x={26} y={3} style={{fontSize:10.5, fill:C_GRAND, fontWeight:600}}>GRAND only</text>
          <line x1={102} y1={0} x2={122} y2={0} stroke={C_CDE} strokeWidth="2.6"/>
          <text x={128} y={3} style={{fontSize:10.5, fill:C_CDE, fontWeight:600}}>CDE ★</text>
        </g>
      </svg>
    </div>
  );
}

// ============================================================
// LossBreakdown — kept as the export name for app.jsx compatibility.
// Now actually shows training dynamics + benchmark + Figure 1.
// ============================================================
function LossBreakdown({ active, tick, cde, tIdx, tweaks }) {
  if (!cde) {
    return (
      <div style={{
        background:"#fffdf7", border:"1px solid #e3ddd2", borderRadius:10,
        padding:"16px 18px", color:"#a8a194", fontStyle:"italic",
      }}>初始化中…</div>
    );
  }
  return (
    <div>
      <CDETrainingDynamics cde={cde} tIdx={tIdx||0} active={active}/>
      <CDEFigure1 tweaks={tweaks||{beta:0.5}} active={active}/>
    </div>
  );
}

window.LossBreakdown = LossBreakdown;
window.CDETrainingDynamics = CDETrainingDynamics;
window.CDEFigure1 = CDEFigure1;
window.InlineKatex = InlineKatex;
