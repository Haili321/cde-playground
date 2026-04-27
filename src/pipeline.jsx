// Pipeline SVG — the CDE architecture diagram.
//
//  GRAPH → X(0) → ┌─[DIFFUSION  div(D⊙∇X)]─┐
//                 │                          ⊕ → dX/dt → ODE → X(T) → CLS → ŷ
//                 └─[CONVECTION div(V⊙X)]──┘
//                       ↑
//                  [VELOCITY V_ij = σ(W(x_j-x_i))]   ★ Eq.10
//
// Blocks are clickable: clicking jumps to the step they represent.

const { useMemo } = React;

// KaTeX-rendered sub-text inside SVG via foreignObject.
function SubKatex({ x, y, w, h, tex, color }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!ref.current || !window.katex) return;
    try {
      window.katex.render(tex, ref.current, {
        throwOnError: false, displayMode: false, strict: "ignore",
      });
    } catch(e) {
      if (ref.current) ref.current.textContent = tex;
    }
  }, [tex]);
  return (
    <foreignObject x={x} y={y} width={w} height={h} style={{pointerEvents:"none", overflow:"visible"}}>
      <div xmlns="http://www.w3.org/1999/xhtml" ref={ref}
        style={{width:"100%", height:"100%", display:"flex",
          alignItems:"center", justifyContent:"center",
          fontSize:"10.5px", color, lineHeight:1.2, whiteSpace:"nowrap"}}/>
    </foreignObject>
  );
}

function PipeBlock({ x, y, w, h, label, sub, subTex, color, active, dim, onClick, hoverable, featured }) {
  const stroke = active ? color : "#c8c1b4";
  const textFill = active ? color : "#3d3a35";
  const subFill = active ? color : "#827d75";
  const textOp = active ? 1 : (dim ? 0.55 : 0.9);
  const rectOp = active ? 1 : (dim ? 0.5 : 0.85);
  const [hover, setHover] = React.useState(false);
  const isClickable = !!onClick;
  const rectStroke = hover && isClickable ? color : stroke;
  const hasSub = !!(sub || subTex);
  // Featured blocks get gold inline highlight (analogous to FEATURED_CHIPS in formulas)
  const fillBg = featured
    ? (hover && isClickable ? "oklch(0.97 0.05 80)" : "oklch(0.965 0.04 80)")
    : (hover && isClickable ? "oklch(0.985 0.01 85)" : "#fffdf7");
  return (
    <g
      style={{
        transition:"opacity .35s ease",
        cursor: isClickable ? "pointer" : "default",
      }}
      onClick={onClick}
      onMouseEnter={()=>setHover(true)}
      onMouseLeave={()=>setHover(false)}
    >
      {isClickable && (
        <rect x={x-2} y={y-2} width={w+4} height={h+4} fill="transparent"/>
      )}
      <g opacity={rectOp} style={{transition:"opacity .35s ease"}}>
        <rect x={x} y={y} width={w} height={h} rx="8" ry="8"
          fill={fillBg}
          stroke={featured ? "oklch(0.65 0.16 70)" : rectStroke}
          strokeWidth={active?2: (featured ? 1.5 : (hover && isClickable ? 1.6 : 1))}
          style={{transition:"stroke .15s, stroke-width .15s, fill .15s"}}/>
        {active && <rect x={x} y={y} width={w} height="3" rx="8" fill={color}/>}
        {featured && !active && <rect x={x} y={y} width={w} height="3" rx="8" fill="oklch(0.70 0.16 70)" opacity="0.7"/>}
      </g>
      <g opacity={textOp} style={{transition:"opacity .35s ease"}}>
        <text x={x+w/2} y={hasSub ? y+h/2-3 : y+h/2+4} textAnchor="middle"
          style={{fontSize:12.5, fontWeight:600, fill: featured ? "oklch(0.32 0.1 65)" : textFill,
            fontFamily:"'Inter','Noto Serif SC',sans-serif", pointerEvents:"none"}}>
          {featured && "★ "}{label}
        </text>
        {subTex ? (
          <SubKatex x={x+2} y={y+h/2+2} w={w-4} h={h/2-2} tex={subTex} color={subFill}/>
        ) : sub && (
          <text x={x+w/2} y={y+h/2+13} textAnchor="middle"
            style={{fontSize:10, fill:subFill,
              fontFamily:"'JetBrains Mono',monospace", pointerEvents:"none"}}>
            {sub}
          </text>
        )}
      </g>
    </g>
  );
}

function Arrow({ from, to, active, curve=0, color="#9a9388", dashed }) {
  const [x1,y1]=from, [x2,y2]=to;
  const mx=(x1+x2)/2, my=(y1+y2)/2 - curve;
  const op = active?1:0.6;
  const stroke = active ? color : "#bdb6a8";
  return (
    <g opacity={op} style={{transition:"opacity .35s ease"}}>
      <defs>
        <marker id={`arr-${color.replace(/[^a-z0-9]/gi,'')}-${active?1:0}`} viewBox="0 0 10 10"
          refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0,0 L10,5 L0,10 z" fill={stroke}/>
        </marker>
      </defs>
      <path d={`M${x1},${y1} Q${mx},${my} ${x2},${y2}`}
        stroke={stroke} strokeWidth={active?1.8:1.2} fill="none"
        strokeDasharray={dashed?"4 4":"none"}
        markerEnd={`url(#arr-${color.replace(/[^a-z0-9]/gi,'')}-${active?1:0})`}/>
    </g>
  );
}

function PlusBadge({ x, y, active, color }){
  return (
    <g style={{pointerEvents:"none"}} opacity={active?1:0.55}>
      <circle cx={x} cy={y} r="13" fill="#fffdf7" stroke={color} strokeWidth={active?1.8:1.2}/>
      <text x={x} y={y+5} textAnchor="middle"
        style={{fontSize:16, fill:color, fontFamily:"'JetBrains Mono',monospace", fontWeight:600}}>+</text>
    </g>
  );
}

function PipelineDiagram({ activeSet, tweaks, onStepJump }) {
  // Color palette for CDE (same as formulas.jsx)
  const A_DIFF = "oklch(0.55 0.13 250)";   // diffusion blue
  const A_CONV = "oklch(0.58 0.13 35)";    // convection amber
  const A_VEL  = "oklch(0.52 0.13 300)";   // velocity violet (Eq.10)
  const A_OUT  = "oklch(0.55 0.13 150)";   // ODE / classifier green
  const A_LOSS = "oklch(0.50 0.05 260)";   // benchmark slate

  const w = 1410, h = 320;
  const on = k => activeSet.has(k);
  const go = id => onStepJump && onStepJump(id);

  // X positions for stage columns
  const X = {
    graph:   20,
    input:   170,
    diff:    320,
    combine: 620,
    ode:     790,
    xT:      950,
    cls:     1080,
    yhat:    1240,
  };
  // Y bands
  const Y = {
    diff: 75,    // top row (diffusion)
    conv: 175,   // bottom row (convection)
    mid:  125,   // middle (combine/ODE/X(T)/cls/ŷ)
    vel:  246,   // below convection (velocity source — Eq.10)
    loss: 22,    // top bar (benchmark / ACC)
    col:  290,
  };

  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{width:"100%", height:"auto", display:"block"}}>
      {/* ── benchmark bar (top) ── */}
      <PipeBlock x={X.combine} y={Y.loss} w={X.cls + 130 - X.combine} h={36}
        subTex="\text{Roman-empire: GRAND }71.6\%\;\to\;\text{CDE-GRAND }91.6\%\;\;\bigstar+20\%"
        color={A_LOSS} active={on("loss")} dim={!on("loss")}
        onClick={()=>go("loss")}/>

      {/* ── source: G = (V, E, w) ── */}
      <PipeBlock x={X.graph} y={Y.mid-14} w={110} h={54}
        label="图 G" subTex="(V,\,E,\,w)" color="#3d3a35"
        active={on("input-x")||on("input-a")} onClick={()=>go("input")}/>

      {/* ── X(0) input ── */}
      <PipeBlock x={X.input} y={Y.mid-14} w={100} h={54}
        label="X(0)" subTex="\mathbb R^{N\times r}" color="#3d3a35"
        active={on("input-x")||on("input-a")} onClick={()=>go("input")}/>

      {/* ── diffusion block (top row) — GRAND-style ── */}
      <PipeBlock x={X.diff} y={Y.diff} w={260} h={56}
        label="扩散项 · DIFFUSION"
        subTex="\mathrm{div}(D\odot\nabla X)\;\;\text{(Eq.5)}"
        color={A_DIFF} active={on("top-diff")||on("s-enc")} onClick={()=>go("topology")}/>

      {/* ── convection block (bottom row) — CDE's contribution ── */}
      <PipeBlock x={X.diff} y={Y.conv} w={260} h={56}
        label="对流项 · CONVECTION"
        subTex="\mathrm{div}(V\odot X)\;\;\text{(Eq.9)}"
        color={A_CONV} active={on("attr-diff")||on("a-enc")} onClick={()=>go("attribute")}/>

      {/* ── velocity formula (★ FEATURED) — feeds the convection block ── */}
      <PipeBlock x={X.diff+30} y={Y.vel} w={200} h={42}
        label="velocity"
        subTex="V_{ij}=\sigma(W(x_j-x_i))"
        color={A_VEL} active={on("fusion")} onClick={()=>go("fusion")} featured={true}/>

      {/* ── attention variants annotation under diffusion (clickable to step "output") ── */}
      <text x={X.diff+130} y={Y.diff-8} textAnchor="middle"
        style={{fontSize:9.5, fill: on("output") ? A_VEL : "#a8a194", fontStyle:"italic",
          letterSpacing:"0.04em", cursor:"pointer"}}
        onClick={()=>go("output")}>
        D = LAP / GAT / TRANS / GraphBel  (Eq.11/12)
      </text>

      {/* ── plus combine ── */}
      <PlusBadge x={X.combine-15} y={Y.mid+13} active={on("topology")||on("attribute")||on("fusion")} color={A_OUT}/>

      {/* ── dX/dt ── */}
      <PipeBlock x={X.combine} y={Y.mid-14} w={130} h={54}
        label="dX/dt"
        subTex="\frac{\partial X}{\partial t}\;\;\text{(Eq.8)}"
        color={A_OUT} active={on("topology")||on("attribute")||on("fusion")}
        onClick={()=>go("attribute")}/>

      {/* ── ODE solver ── */}
      <PipeBlock x={X.ode} y={Y.mid-14} w={130} h={54}
        label="ODE solver"
        subTex={`\\text{Euler / RK4}\\;\\;T=${(tweaks.alpha*5).toFixed(1)}`}
        color={A_OUT} active={on("kmeans")} onClick={()=>go("kmeans")}/>

      {/* ── X(T) ── */}
      <PipeBlock x={X.xT} y={Y.mid-14} w={100} h={54}
        label="X(T)" subTex="\text{(终态)}"
        color={A_OUT} active={on("kmeans")||on("cprop")} onClick={()=>go("cprop")}/>

      {/* ── classifier ── */}
      <PipeBlock x={X.cls} y={Y.mid-14} w={130} h={54}
        label="MLP 分类头" subTex="\hat y_i=\arg\max_c\,f(x_i(T))"
        color={A_OUT} active={on("cprop")} onClick={()=>go("cprop")}/>

      {/* ── ŷ output ── */}
      <PipeBlock x={X.yhat} y={Y.mid-14} w={90} h={54}
        label="ŷ" subTex="\{1,\dots,C\}^{N}"
        color={A_OUT} active={on("output")||on("cprop")} onClick={()=>go("output")}/>

      {/* ── arrows ── */}
      {/* G → X(0) */}
      <Arrow from={[X.graph+110, Y.mid+13]} to={[X.input, Y.mid+13]}
        active={on("input-x")||on("input-a")} color="#3d3a35"/>

      {/* X(0) splits into two branches */}
      <Arrow from={[X.input+100, Y.mid+5]}  to={[X.diff, Y.diff+28]}
        active={on("top-diff")||on("topology")} color={A_DIFF} curve={-12}/>
      <Arrow from={[X.input+100, Y.mid+22]} to={[X.diff, Y.conv+28]}
        active={on("attr-diff")||on("attribute")} color={A_CONV} curve={12}/>

      {/* velocity → convection (upward arrow) */}
      <Arrow from={[X.diff+130, Y.vel]} to={[X.diff+130, Y.conv+56+2]}
        active={on("fusion")||on("attribute")} color={A_VEL}/>

      {/* diffusion → combine (top branch joining mid) */}
      <Arrow from={[X.diff+260, Y.diff+28]} to={[X.combine-3, Y.mid+5]}
        active={on("topology")||on("fusion")} color={A_DIFF} curve={10}/>
      {/* convection → combine (bottom branch joining mid) */}
      <Arrow from={[X.diff+260, Y.conv+28]} to={[X.combine-3, Y.mid+22]}
        active={on("attribute")||on("fusion")} color={A_CONV} curve={-10}/>

      {/* combine → ODE → X(T) → cls → ŷ (mid horizontal) */}
      <Arrow from={[X.combine+130, Y.mid+13]} to={[X.ode, Y.mid+13]}
        active={on("kmeans")} color={A_OUT}/>
      <Arrow from={[X.ode+130, Y.mid+13]} to={[X.xT, Y.mid+13]}
        active={on("kmeans")||on("cprop")} color={A_OUT}/>
      <Arrow from={[X.xT+100, Y.mid+13]} to={[X.cls, Y.mid+13]}
        active={on("cprop")} color={A_OUT}/>
      <Arrow from={[X.cls+130, Y.mid+13]} to={[X.yhat, Y.mid+13]}
        active={on("cprop")||on("output")} color={A_OUT}/>

      {/* loss feedback (dashed) */}
      <Arrow from={[X.cls+65, Y.mid-14]} to={[X.cls+65, Y.loss+36]}
        active={on("loss")} color={A_LOSS} dashed/>

      {/* column titles */}
      <text x={X.graph+55}    y={Y.col} textAnchor="middle" style={{fontSize:10.5, fill:"#827d75", letterSpacing:"0.08em"}}>GRAPH</text>
      <text x={X.input+50}    y={Y.col} textAnchor="middle" style={{fontSize:10.5, fill:"#827d75", letterSpacing:"0.08em"}}>X(0)</text>
      <text x={X.diff+130}    y={Y.col} textAnchor="middle" style={{fontSize:10.5, fill:"#827d75", letterSpacing:"0.08em"}}>DIFFUSION + CONVECTION</text>
      <text x={X.combine+65}  y={Y.col} textAnchor="middle" style={{fontSize:10.5, fill:"#827d75", letterSpacing:"0.08em"}}>dX/dt</text>
      <text x={X.ode+65}      y={Y.col} textAnchor="middle" style={{fontSize:10.5, fill:"#827d75", letterSpacing:"0.08em"}}>ODE SOLVER</text>
      <text x={X.xT+50}       y={Y.col} textAnchor="middle" style={{fontSize:10.5, fill:"#827d75", letterSpacing:"0.08em"}}>X(T)</text>
      <text x={X.cls+65}      y={Y.col} textAnchor="middle" style={{fontSize:10.5, fill:"#827d75", letterSpacing:"0.08em"}}>CLASSIFY → ŷ</text>

      {/* hint */}
      <text x={w-12} y={h-8} textAnchor="end"
        style={{fontSize:10, fill:"#a8a194", fontStyle:"italic"}}>
        点击任意方块跳到对应步骤 →
      </text>
    </svg>
  );
}

window.PipelineDiagram = PipelineDiagram;
