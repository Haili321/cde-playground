// Tweaks panel — floating bottom-right, controls α, β, L, L_c, and dataset mode.
// Persists via EDITMODE-BEGIN block in app.jsx.

function TweakRow({ label, value, children, hint }) {
  return (
    <div style={{marginBottom:12}}>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:4}}>
        <span style={{fontSize:11.5, color:"#3d3a35", fontWeight:500, letterSpacing:"0.02em"}}>{label}</span>
        <span className="mono" style={{fontSize:11, color:"#1b1a18", fontWeight:600}}>{value}</span>
      </div>
      {children}
      {hint && <div style={{fontSize:10.5, color:"#a8a194", marginTop:3}}>{hint}</div>}
    </div>
  );
}

function Slider({ value, min, max, step, onChange, color }) {
  return (
    <input type="range" min={min} max={max} step={step} value={value}
      onChange={e=>onChange(parseFloat(e.target.value))}
      style={{
        width:"100%", accentColor: color,
        height: 4,
      }}/>
  );
}

function SegButton({ options, value, onChange }) {
  return (
    <div style={{display:"flex", border:"1px solid #e3ddd2", borderRadius:6, overflow:"hidden"}}>
      {options.map(o => (
        <button key={o.value}
          onClick={()=>onChange(o.value)}
          style={{
            flex:1, padding:"5px 8px", fontSize:11,
            border:"none", cursor:"pointer",
            background: value===o.value ? "#1b1a18" : "transparent",
            color: value===o.value ? "#fffdf7" : "#3d3a35",
            fontFamily: "'Inter',sans-serif",
            borderRight:"1px solid #e3ddd2",
          }}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// Compact horizontal slider cell for the inline Tweaks bar.
function TweakCell({ label, sub, value, children, color }) {
  return (
    <div style={{minWidth:0, display:"flex", flexDirection:"column", gap:4}}>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"baseline", gap:6}}>
        <span style={{fontSize:10.5, color:"#3d3a35", fontWeight:500, letterSpacing:"0.02em",
          whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis"}}>
          {label}{sub && <span style={{color:"#a8a194", marginLeft:4, fontWeight:400}}>{sub}</span>}
        </span>
        <span className="mono" style={{fontSize:10.5, color, fontWeight:600, whiteSpace:"nowrap"}}>{value}</span>
      </div>
      {children}
    </div>
  );
}

function TweaksPanel({ tweaks, setTweak, visible }) {
  // CDE-relevant controls only: dataset toggle, integration time T (was alpha),
  // convection strength w0 (was beta), and a τ (step size) display.
  // Underlying tweak keys (alpha/beta/...) are kept so app.jsx wiring stays
  // intact — only the labels change.
  const A_DIFF = "oklch(0.55 0.13 250)";   // diffusion blue
  const A_VEL  = "oklch(0.45 0.20 320)";   // velocity violet (Eq.10)

  const T = (0.5 + tweaks.alpha * 4.5).toFixed(2);    // matches cde_math wiring
  const w0 = (tweaks.beta * 0.15).toFixed(3);
  const tau = 0.25;
  const stepCount = Math.round((0.5 + tweaks.alpha * 4.5)/tau);

  return (
    <div style={{
      background:"#fffdf7", border:"1px solid #e3ddd2", borderRadius:10,
      padding:"14px 20px 16px", marginTop:16, marginBottom:16,
      fontFamily:"'Inter',sans-serif",
    }}>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:12}}>
        <div style={{fontSize:11, color:"#a8a194", letterSpacing:"0.14em"}}>
          超参数 · TWEAKS
        </div>
        <div style={{fontSize:10.5, color:"#827d75"}}>
          滑块联动剧场、训练动力学、Figure 1 复现
        </div>
      </div>

      <div style={{display:"grid",
        gridTemplateColumns:"minmax(170px, 0.9fr) repeat(2, minmax(150px, 1.2fr)) minmax(180px, 1.2fr) minmax(140px, 0.9fr)",
        gap:20, alignItems:"end"}}>

        <TweakCell label="数据集" value={tweaks.dataset==="hetero"?"异质 (Texas-like)":"同质 (Cora-like)"} color="#1b1a18">
          <SegButton
            value={tweaks.dataset}
            onChange={v=>setTweak("dataset", v)}
            options={[
              {value:"hetero", label:"异质"},
              {value:"homo",   label:"同质"},
            ]}/>
        </TweakCell>

        <TweakCell label="T" sub="积分时间" value={T} color={A_DIFF}>
          <Slider value={tweaks.alpha} min={0.1} max={1.0} step={0.05}
            color={A_DIFF} onChange={v=>setTweak("alpha", v)}/>
        </TweakCell>

        <TweakCell label="w₀" sub="对流强度 (Eq.10)" value={w0} color={A_VEL}>
          <Slider value={tweaks.beta} min={0.0} max={1.0} step={0.02}
            color={A_VEL} onChange={v=>setTweak("beta", v)}/>
        </TweakCell>

        <TweakCell label="积分细节" sub="" value={`τ=${tau}, ${stepCount} steps`} color="#827d75">
          <div style={{fontSize:10.5, color:"#827d75", lineHeight:1.55,
            background:"#fdfaf2", padding:"6px 8px", borderRadius:4, border:"1px solid #f0eadf"}}>
            forward Euler · X(t+τ) = X(t) + τ·f(X(t))
          </div>
        </TweakCell>

        <TweakCell label="显示" value="" color="#3d3a35">
          <div style={{display:"flex", gap:12, marginTop:2}}>
            <label style={{fontSize:10.5, display:"flex", gap:4, alignItems:"center", color:"#3d3a35", cursor:"pointer"}}>
              <input type="checkbox" checked={tweaks.showAttrGraph}
                onChange={e=>setTweak("showAttrGraph", e.target.checked)}/>
              velocity 箭头
            </label>
          </div>
        </TweakCell>
      </div>
      <div style={{marginTop:10, fontSize:10.5, color:"#827d75", lineHeight:1.55}}>
        <span style={{color:A_DIFF, fontWeight:600}}>T</span> = 积分到的目标时间（论文饱和点 ~1.0；越大越「深」但也容易 over-smooth）·
        <span style={{color:A_VEL, fontWeight:600, marginLeft:6}}>w₀</span> = 对流权重 W 的对角强度（toy seed；w₀=0 ⇒ CDE 退化为 GRAND）·
        论文里 W 是端到端学的
      </div>
    </div>
  );
}

window.TweaksPanel = TweaksPanel;
