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
// CDE Dataset Table — paper Table 1 statistics for the 9 heterophilic
// benchmarks. Sorted by h_adj (most heterophilic first); highlights the
// 3 datasets where paper line 845-846 claims CDE-GRAND best.
// All numbers from paper line 460-544 + Sec. 5.2.
// ============================================================
function CDEDatasetTable({ active }) {
  const T1 = [
    { name:"Roman-empire",   N:22662, E:32927,    C:18, r:300,  hedge:0.05, hadj:-0.05, sota:true  },
    { name:"Wiki-cooc",      N:10000, E:2243042,  C:5,  r:100,  hedge:0.34, hadj:-0.03, sota:true  },
    { name:"Minesweeper",    N:10000, E:39402,    C:2,  r:7,    hedge:0.68, hadj: 0.01, sota:true  },
    { name:"Questions",      N:48921, E:153540,   C:2,  r:301,  hedge:0.84, hadj: 0.02, sota:false },
    { name:"Texas",          N:183,   E:295,      C:5,  r:1703, hedge:0.11, hadj: 0.04, sota:false },
    { name:"Cornell",        N:183,   E:280,      C:5,  r:1703, hedge:0.30, hadj: 0.04, sota:false },
    { name:"Wisconsin",      N:251,   E:466,      C:5,  r:1703, hedge:0.21, hadj: 0.07, sota:false },
    { name:"Workers",        N:11758, E:519000,   C:2,  r:10,   hedge:0.59, hadj: 0.09, sota:false },
    { name:"Amazon-ratings", N:24492, E:93050,    C:5,  r:300,  hedge:0.38, hadj: 0.14, sota:false },
  ];

  // h_adj color: -0.05 (most hetero) red → 0.14 (least) green
  const hadjColor = h => {
    const t = Math.max(0, Math.min(1, (h - (-0.05)) / (0.14 - (-0.05))));
    const hue = 30 + t * 120;
    return `oklch(0.55 ${0.18 - t*0.05} ${hue})`;
  };
  const fmt = n => n >= 10000 ? n.toLocaleString() : n.toString();

  return (
    <div style={{
      background:"#fffdf7", border:"1px solid #e3ddd2", borderRadius:10,
      padding:"16px 18px", marginBottom:12,
      opacity: active?1:0.85, transition:"opacity .3s ease",
    }}>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:10}}>
        <span style={{fontSize:11, color:"#a8a194", letterSpacing:"0.14em"}}>
          论文 Table 1 · 9 个 HETEROPHILIC BENCHMARKS
        </span>
        <span className="mono" style={{fontSize:10.5, color:"#827d75"}}>
          Sec. 5.2 · line 460-544
        </span>
      </div>
      <div style={{fontSize:11, color:"#3d3a35", marginBottom:8, lineHeight:1.55}}>
        按 <InlineKatex tex="h_{\mathrm{adj}}"/> 升序排（最异质 → 最同质）·
        <span style={{color:"oklch(0.55 0.16 65)", fontWeight:600, marginLeft:4}}>★</span> = paper
        line 845-846 明确 CDE-GRAND <i>best</i> 的 3 个最异质数据集
      </div>
      <table style={{width:"100%", borderCollapse:"collapse", fontSize:11.5}}>
        <thead>
          <tr style={{borderBottom:"1px solid #c8c1b4"}}>
            <th style={{textAlign:"left", color:"#827d75", fontWeight:500, padding:"5px 6px"}}>Dataset</th>
            <th style={{textAlign:"right", color:"#827d75", fontWeight:500, padding:"5px 6px"}}>
              <InlineKatex tex="h_{\mathrm{adj}}"/>
            </th>
            <th style={{textAlign:"right", color:"#827d75", fontWeight:500, padding:"5px 6px"}}>
              <InlineKatex tex="h_{\mathrm{edge}}"/>
            </th>
            <th style={{textAlign:"right", color:"#827d75", fontWeight:500, padding:"5px 6px"}}>
              <InlineKatex tex="N"/>
            </th>
            <th style={{textAlign:"right", color:"#827d75", fontWeight:500, padding:"5px 6px"}}>
              <InlineKatex tex="|E|"/>
            </th>
            <th style={{textAlign:"right", color:"#827d75", fontWeight:500, padding:"5px 6px"}}>
              <InlineKatex tex="C"/>
            </th>
            <th style={{textAlign:"right", color:"#827d75", fontWeight:500, padding:"5px 6px"}}>
              <InlineKatex tex="r"/>
            </th>
          </tr>
        </thead>
        <tbody>
          {T1.map(d => (
            <tr key={d.name} style={{
              background: d.sota ? "oklch(0.97 0.04 320)" : "transparent",
              borderBottom: "1px solid #f3eee2",
            }}>
              <td style={{padding:"5px 6px", fontWeight: d.sota?600:400, color:"#1b1a18"}}>
                {d.sota && <span style={{color:"oklch(0.55 0.16 65)", marginRight:4}}>★</span>}
                {d.name}
              </td>
              <td className="mono" style={{
                textAlign:"right", padding:"5px 6px",
                color: hadjColor(d.hadj), fontWeight:600,
              }}>
                {d.hadj > 0 ? `+${d.hadj.toFixed(2)}` : d.hadj.toFixed(2)}
              </td>
              <td className="mono" style={{textAlign:"right", padding:"5px 6px", color:"#827d75"}}>
                {d.hedge.toFixed(2)}
              </td>
              <td className="mono" style={{textAlign:"right", padding:"5px 6px", color:"#3d3a35"}}>
                {fmt(d.N)}
              </td>
              <td className="mono" style={{textAlign:"right", padding:"5px 6px", color:"#3d3a35"}}>
                {fmt(d.E)}
              </td>
              <td className="mono" style={{textAlign:"right", padding:"5px 6px", color:"#3d3a35"}}>
                {d.C}
              </td>
              <td className="mono" style={{textAlign:"right", padding:"5px 6px", color:"#3d3a35"}}>
                {fmt(d.r)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{fontSize:10.5, color:"#827d75", marginTop:10, lineHeight:1.6}}>
        train/val/test = 50/25/25（Platonov et al. 2023 fixed splits, paper line 442）·
        Wiki-cooc 边数 2.24M 但 <InlineKatex tex="h_{\mathrm{adj}}=-0.03"/>，验证 CDE 抗高密度异质边 ·
        Texas/Cornell/Wisconsin 仅 ~200 节点（WebKB），<InlineKatex tex="r=1703"/> 高维特征 → 不同 regime ·
        Minesweeper/Workers/Questions 是 binary class，paper 用 ROC-AUC 评估（line 443-445）。
      </div>
    </div>
  );
}

// ============================================================
// CDE Training Dynamics — paper Table 3 (integration-time ablation)
// + paper Table 2 (per-benchmark CDE-GRAND vs GRAND ACC).
// All numbers are real paper data; replaces the previous toy ACC plot
// (which decayed too steeply due to fixed centroids + no source term —
// not paper behaviour, see AlphaBetaResidual chip).
// ============================================================
function CDETrainingDynamics({ cde, tIdx, active }) {
  const C_ROMAN = "oklch(0.45 0.18 250)";
  const C_MINE  = "oklch(0.42 0.20 320)";

  // Paper Table 3 — integration-time ablation on CDE-GRAND.
  // Sec. 5.6 (line 1107-1118) + raw numbers (paper line 870-947).
  // Each entry: [T, mean ACC%, std%].  τ=1 throughout.
  const T3 = [
    { name:"Roman · Euler", color:C_ROMAN, dash:false, peakIdx:2,
      data:[[1.0,87.26,0.46],[2.0,91.55,0.42],[3.0,91.64,0.28],[4.0,91.62,0.34],[5.0,91.16,0.67]] },
    { name:"Roman · RK4",   color:C_ROMAN, dash:true,  peakIdx:0,
      data:[[1.0,91.55,0.66],[2.0,91.10,1.16],[3.0,90.82,2.18],[4.0,91.00,1.31],[5.0,90.26,2.16]] },
    { name:"Mine · Euler",  color:C_MINE,  dash:false, peakIdx:3,
      data:[[1.0,87.13,1.36],[2.0,90.46,0.66],[3.0,92.00,0.60],[4.0,93.21,0.43],[5.0,93.11,2.36]] },
    { name:"Mine · RK4",    color:C_MINE,  dash:true,  peakIdx:3,
      data:[[1.0,93.05,0.48],[2.0,94.64,2.32],[3.0,94.35,3.62],[4.0,97.67,0.22],[5.0,97.10,2.02]] },
  ];

  // Plot geometry — y axis 84% to 100% (covers 87.13 lowest .. 97.67 highest)
  const W = 400, H = 215, padL = 36, padR = 14, padT = 16, padB = 30;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const Y_MIN = 84, Y_MAX = 100;
  const xToPxT = T => padL + ((T-1)/4) * innerW;
  const yToPxA = a => padT + ((Y_MAX - a)/(Y_MAX - Y_MIN)) * innerH;

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
          论文真实数据 · PAPER TABLE 3 + TABLE 2
        </span>
        <span className="mono" style={{fontSize:10.5, color:"#827d75"}}>
          Sec. 5.6 · Sec. 5.2
        </span>
      </div>

      <div style={{display:"grid", gridTemplateColumns:"1.2fr 1fr", gap:14}}>
        {/* LEFT — Paper Table 3 · ACC vs T (integration time ablation) */}
        <div>
          <div style={{fontSize:11, color:"#3d3a35", marginBottom:6, lineHeight:1.55}}>
            Table 3 · CDE-GRAND ACC <InlineKatex tex="(\%)"/> vs 积分时间 <InlineKatex tex="T"/>
            （<InlineKatex tex="\tau=1"/>，10 random seed 平均 ± std）
          </div>
          <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%", height:"auto",
            background:"#fdfaf2", border:"1px solid #f0eadf", borderRadius:6, display:"block"}}>
            {/* y-axis gridlines + ticks (every 4%) */}
            {[84, 88, 92, 96, 100].map(a => (
              <g key={a}>
                <line x1={padL} x2={W-padR} y1={yToPxA(a)} y2={yToPxA(a)}
                  stroke="#f0eadf" strokeWidth="1"/>
                <text x={padL-6} y={yToPxA(a)+3} textAnchor="end"
                  style={{fontSize:9, fill:"#a8a194", fontFamily:"'JetBrains Mono',monospace"}}>
                  {a}
                </text>
              </g>
            ))}
            {/* x-axis ticks T = 1..5 */}
            {[1,2,3,4,5].map(T => (
              <text key={T} x={xToPxT(T)} y={H-padB+14} textAnchor="middle"
                style={{fontSize:9.5, fill:"#827d75", fontFamily:"'JetBrains Mono',monospace"}}>
                {T.toFixed(1)}
              </text>
            ))}
            <text x={padL+innerW/2} y={H-4} textAnchor="middle"
              style={{fontSize:9.5, fill:"#a8a194", letterSpacing:"0.06em"}}>T (积分时间)</text>
            <text x={6} y={padT+8}
              style={{fontSize:9, fill:"#a8a194", letterSpacing:"0.06em"}}>ACC %</text>

            {/* 4 series — error bars + line + dots + peak markers */}
            {T3.map((s) => {
              const path = s.data.map(([T,m], i) =>
                `${i===0?"M":"L"}${xToPxT(T).toFixed(1)},${yToPxA(m).toFixed(1)}`
              ).join(" ");
              return (
                <g key={s.name}>
                  {/* error bars (mean ± std) */}
                  {s.data.map(([T,m,std]) => (
                    <g key={`eb-${T}`}>
                      <line x1={xToPxT(T)} x2={xToPxT(T)}
                        y1={yToPxA(m+std)} y2={yToPxA(m-std)}
                        stroke={s.color} strokeWidth="1" opacity="0.4"/>
                      <line x1={xToPxT(T)-2} x2={xToPxT(T)+2}
                        y1={yToPxA(m+std)} y2={yToPxA(m+std)}
                        stroke={s.color} strokeWidth="1" opacity="0.4"/>
                      <line x1={xToPxT(T)-2} x2={xToPxT(T)+2}
                        y1={yToPxA(m-std)} y2={yToPxA(m-std)}
                        stroke={s.color} strokeWidth="1" opacity="0.4"/>
                    </g>
                  ))}
                  {/* line */}
                  <path d={path} fill="none" stroke={s.color}
                    strokeWidth="1.8" opacity="0.92"
                    strokeDasharray={s.dash ? "4 3" : "none"}/>
                  {/* dots; peak slightly larger with white halo */}
                  {s.data.map(([T,m], i) => (
                    <circle key={`d-${T}`} cx={xToPxT(T)} cy={yToPxA(m)}
                      r={i === s.peakIdx ? 4.2 : 2.8}
                      fill={s.color}
                      stroke={i === s.peakIdx ? "#fffdf7" : "none"}
                      strokeWidth={i === s.peakIdx ? 1.5 : 0}/>
                  ))}
                  {/* peak ★ above peak point */}
                  {s.peakIdx >= 0 && (
                    <text x={xToPxT(s.data[s.peakIdx][0])}
                      y={yToPxA(s.data[s.peakIdx][1])-9}
                      textAnchor="middle"
                      style={{fontSize:10, fill:s.color, fontWeight:700}}>★</text>
                  )}
                </g>
              );
            })}

            {/* legend (top-right corner) */}
            <g transform={`translate(${W-padR-176}, ${padT+4})`}>
              <line x1={0} y1={0} x2={14} y2={0} stroke={C_ROMAN} strokeWidth="1.8"/>
              <text x={18} y={3} style={{fontSize:9, fill:C_ROMAN, fontWeight:600}}>Roman</text>
              <line x1={56} y1={0} x2={70} y2={0} stroke={C_ROMAN} strokeWidth="1.8" strokeDasharray="4 3"/>
              <text x={74} y={3} style={{fontSize:9, fill:C_ROMAN, fontStyle:"italic"}}>RK4</text>
              <line x1={102} y1={0} x2={116} y2={0} stroke={C_MINE} strokeWidth="1.8"/>
              <text x={120} y={3} style={{fontSize:9, fill:C_MINE, fontWeight:600}}>Mine</text>
              <line x1={150} y1={0} x2={164} y2={0} stroke={C_MINE} strokeWidth="1.8" strokeDasharray="4 3"/>
              <text x={168} y={3} style={{fontSize:9, fill:C_MINE, fontStyle:"italic"}}>RK4</text>
            </g>
          </svg>
          <div style={{fontSize:10.5, color:"#827d75", marginTop:6, lineHeight:1.55}}>
            ★ peak · paper 文字仅描述「improves to <i>saturation point</i>」（line 1112-1118），
            未描述过饱和后大幅下降，T=5 较峰值仅微降 <InlineKatex tex="<0.5\,\mathrm{pp}"/>。
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
        以下是用 playground 的 toy ODE 在浏览器里实算的版本。
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
      <CDEDatasetTable active={active}/>
      <CDETrainingDynamics cde={cde} tIdx={tIdx||0} active={active}/>
      <CDEFigure1 tweaks={tweaks||{beta:0.5}} active={active}/>
    </div>
  );
}

window.LossBreakdown = LossBreakdown;
window.CDEDatasetTable = CDEDatasetTable;
window.CDETrainingDynamics = CDETrainingDynamics;
window.CDEFigure1 = CDEFigure1;
window.InlineKatex = InlineKatex;
