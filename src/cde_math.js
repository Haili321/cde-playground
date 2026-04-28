// Real CDE math engine (toy scale, 20 nodes).
// Runs forward Euler ODE on Eq.8: dX/dt = (A(X)-I)X + div(V⊙X).
// V_ij = σ(W(x_j - x_i)) per Eq.10, with random-Gaussian seed W
// (not end-to-end trained — playground prioritises explanation over
// reproduction). Returns per-step trajectories X(t) for both
// GRAND-only (heat) and CDE (heat + convection) branches so the
// dual-panel time theatre can scrub through t ∈ [0, T].
// All ops are plain JS arrays — no deps. Complexity trivial at N=20.

(function(){
  const D = 6; // embedding dim for diffusion

  // ---------- linear algebra helpers ----------
  function zeros(n, d){ return Array.from({length:n}, ()=>new Array(d).fill(0)); }
  function clone2D(M){ return M.map(r=>r.slice()); }
  function matVec(M, v){ // M: n×n, v: n → n
    const n = M.length, out = new Array(n).fill(0);
    for (let i=0;i<n;i++){
      let s=0; const Mi = M[i];
      for (let j=0;j<n;j++) s += Mi[j]*v[j];
      out[i]=s;
    }
    return out;
  }
  function matMul(A, B){ // A: n×n, B: n×d → n×d
    const n = A.length, d = B[0].length;
    const out = zeros(n, d);
    for (let i=0;i<n;i++){
      const Ai = A[i], oi = out[i];
      for (let k=0;k<n;k++){
        const aik = Ai[k]; if (!aik) continue;
        const Bk = B[k];
        for (let j=0;j<d;j++) oi[j] += aik*Bk[j];
      }
    }
    return out;
  }
  function addInto(A, B){ // A += B (both n×d) in-place
    for (let i=0;i<A.length;i++)
      for (let j=0;j<A[0].length;j++)
        A[i][j] += B[i][j];
    return A;
  }
  function scale(A, s){
    return A.map(r=>r.map(x=>x*s));
  }
  function norm(v){ let s=0; for (let i=0;i<v.length;i++) s+=v[i]*v[i]; return Math.sqrt(s); }
  function cos(a,b){ const na=norm(a), nb=norm(b); if (na<1e-9||nb<1e-9) return 0; let s=0; for(let i=0;i<a.length;i++) s+=a[i]*b[i]; return s/(na*nb); }

  // deterministic pseudo-RNG so re-renders are stable
  function makeRng(seed){
    let s = seed>>>0;
    return () => { s = (s*1664525 + 1013904223) >>> 0; return s/4294967296; };
  }

  // ---------- build Â = D^{-1/2}(A+I)D^{-1/2} from edge list ----------
  function buildAhat(N, edges){
    const A = zeros(N, N);
    for (let i=0;i<N;i++) A[i][i] = 1; // self-loop
    edges.forEach(([a,b])=>{ A[a][b] = 1; A[b][a] = 1; });
    const deg = A.map(r=>r.reduce((s,x)=>s+x,0));
    const dinv = deg.map(d => d>0 ? 1/Math.sqrt(d) : 0);
    const Ahat = zeros(N,N);
    for (let i=0;i<N;i++)
      for (let j=0;j<N;j++)
        Ahat[i][j] = dinv[i]*A[i][j]*dinv[j];
    return Ahat;
  }

  // ---------- initial features H₀ ----------
  // The viz has specific node types designed so each pipeline stage visibly helps:
  //   - clean nodes (most):   features match truth → easy
  //   - feature-outliers:     features match WRONG cluster → only topology branch saves
  //   - topo-outliers:        features fine, but neighbors are cross-cluster → only attr saves
  //   - confused nodes:       both features and topology mildly wrong → only C-prop saves
  function buildH0(nodes, mode, seed=42){
    const rng = makeRng(seed);
    const N = nodes.length;
    const centers = [];
    const spread = 0.9;  // strong feature separation when uncorrupted
    for (let c=0;c<4;c++){
      const v = new Array(D).fill(0);
      v[c] = spread;
      v[(c+2) % D] = -spread*0.3;
      centers.push(v);
    }
    const noise = mode==="homo" ? 0.25 : 0.30;
    // In hetero mode: declare which nodes have corrupted FEATURES (wrong cluster center).
    // These are the nodes topology-branch must fix.
    const featWrong = mode==="homo" ? new Set() : new Set([1, 8, 15, 18, 6]);
    const H0 = zeros(N, D);
    for (let i=0;i<N;i++){
      const truthC = nodes[i].cluster;
      const featC = featWrong.has(i) ? (truthC+1)%4 : truthC;
      for (let k=0;k<D;k++){
        H0[i][k] = centers[featC][k] + (rng()*2-1)*noise;
      }
    }
    return { H0, centers, featWrong };
  }

  // ---------- attribute kNN graph Ŝ from H₀ ----------
  function buildAttrAhat(H0, k=3){
    const N = H0.length;
    const S = zeros(N, N);
    for (let i=0;i<N;i++) S[i][i] = 1;
    for (let i=0;i<N;i++){
      const sims = [];
      for (let j=0;j<N;j++){
        if (j===i) continue;
        sims.push({j, s: cos(H0[i], H0[j])});
      }
      sims.sort((a,b)=>b.s-a.s);
      for (let t=0; t<k; t++){
        const j = sims[t].j;
        S[i][j] = 1; S[j][i] = 1;
      }
    }
    const deg = S.map(r=>r.reduce((s,x)=>s+x,0));
    const dinv = deg.map(d => d>0 ? 1/Math.sqrt(d) : 0);
    const Shat = zeros(N,N);
    for (let i=0;i<N;i++)
      for (let j=0;j<N;j++)
        Shat[i][j] = dinv[i]*S[i][j]*dinv[j];
    // extract edge list for viz
    const edges = [];
    for (let i=0;i<N;i++)
      for (let j=i+1;j<N;j++)
        if (S[i][j]>0) edges.push([i,j]);
    return { Shat, attrEdges: edges };
  }

  // ---------- run diffusion: H ← α·M·H + H₀ for L steps ----------
  function diffuse(M, H0, alpha, L){
    let H = clone2D(H0);
    for (let l=0; l<L; l++){
      const MH = matMul(M, H);
      for (let i=0;i<H.length;i++)
        for (let j=0;j<H[0].length;j++)
          H[i][j] = alpha*MH[i][j] + H0[i][j];
    }
    return H;
  }

  // ---------- k-means (deterministic init from first K rows) ----------
  function kmeans(H, K, maxIter=10, seed=7){
    const N = H.length, D = H[0].length;
    const rng = makeRng(seed);
    // init: pick K points spread out (furthest-first)
    const picks = [Math.floor(rng()*N)];
    while (picks.length < K){
      let best=-1, bestD=-1;
      for (let i=0;i<N;i++){
        if (picks.includes(i)) continue;
        let minD = Infinity;
        for (const p of picks){
          let d=0; for (let k=0;k<D;k++){ const x=H[i][k]-H[p][k]; d+=x*x; }
          if (d<minD) minD=d;
        }
        if (minD>bestD){ bestD=minD; best=i; }
      }
      picks.push(best);
    }
    let centers = picks.map(p => H[p].slice());
    let assign = new Array(N).fill(0);
    for (let it=0; it<maxIter; it++){
      // assign
      const newAssign = new Array(N).fill(0);
      for (let i=0;i<N;i++){
        let best=0, bd=Infinity;
        for (let c=0;c<K;c++){
          let d=0; for (let k=0;k<D;k++){ const x=H[i][k]-centers[c][k]; d+=x*x; }
          if (d<bd){ bd=d; best=c; }
        }
        newAssign[i]=best;
      }
      // check convergence
      let changed=false;
      for (let i=0;i<N;i++) if (newAssign[i]!==assign[i]){ changed=true; break; }
      assign = newAssign;
      // update
      const newC = zeros(K, D), counts = new Array(K).fill(0);
      for (let i=0;i<N;i++){
        counts[assign[i]]++;
        for (let k=0;k<D;k++) newC[assign[i]][k] += H[i][k];
      }
      for (let c=0;c<K;c++)
        if (counts[c]>0) for (let k=0;k<D;k++) newC[c][k] /= counts[c];
      centers = newC;
      if (!changed) break;
    }
    return { assign, centers };
  }

  // ---------- one-hot → diffuse → argmax (C-prop) ----------
  // In the paper this uses residual (α·ÂC + C₀). For the toy viz we use plain
  // α·ÂC + (1-α)·C₀ — a convex mix — so that a node's argmax CAN flip when
  // majority of neighbors disagree. Also makes Lc have a visible effect.
  function cprop(Ahat, assignInit, K, alpha, Lc){
    const N = assignInit.length;
    const C0 = zeros(N, K);
    for (let i=0;i<N;i++) C0[i][assignInit[i]] = 1;
    // Build row-stochastic P from Ahat's sparsity: P[i][j] = 1/deg(i) for neighbors
    // (incl. self-loop). This gives clean majority-vote semantics for C-prop so that
    // a node with majority-disagreeing neighbors actually flips.
    const P = zeros(N, N);
    for (let i=0;i<N;i++){
      let deg = 0;
      for (let j=0;j<N;j++) if (Ahat[i][j] > 1e-9) deg++;
      if (deg === 0) { P[i][i] = 1; continue; }
      for (let j=0;j<N;j++) if (Ahat[i][j] > 1e-9) P[i][j] = 1/deg;
    }
    let C = clone2D(C0);
    for (let l=0; l<Lc; l++){
      const MC = matMul(P, C);
      for (let i=0;i<N;i++)
        for (let k=0;k<K;k++)
          C[i][k] = alpha*MC[i][k] + (1-alpha)*C0[i][k];
    }
    const assign = C.map(row => {
      let best=0, bv=-Infinity;
      for (let k=0;k<row.length;k++) if (row[k]>bv){ bv=row[k]; best=k; }
      return best;
    });
    return { C, assign };
  }

  // ---------- cluster-matching accuracy (hungarian-lite for K=4) ----------
  // Tries all K! permutations — fine for K=4 (24 perms).
  function matchAccuracy(pred, truth, K){
    const perms = [];
    const permHelper = (a, k) => {
      if (k===a.length){ perms.push(a.slice()); return; }
      for (let i=k;i<a.length;i++){
        [a[k],a[i]]=[a[i],a[k]];
        permHelper(a, k+1);
        [a[k],a[i]]=[a[i],a[k]];
      }
    };
    permHelper(Array.from({length:K},(_,i)=>i), 0);
    let best = 0;
    for (const p of perms){
      let c=0;
      for (let i=0;i<pred.length;i++) if (p[pred[i]]===truth[i]) c++;
      if (c>best) best = c;
    }
    return best / pred.length;
  }

  // ---------- top-level: run full DGAC pipeline for given tweaks ----------
  // Returns everything the UI needs, cheap enough to run per tweak change.
  function runDGAC(G, tweaks){
    const { alpha, beta, topLayers, attrLayers, cpropLayers, dataset } = tweaks;
    const nodes = G.nodes;
    const N = nodes.length;
    const K = 4;
    const truth = nodes.map(n => n.cluster);

    const Ahat = buildAhat(N, G.edges);
    const { H0, centers: featCenters } = buildH0(nodes, dataset);
    const { Shat, attrEdges } = buildAttrAhat(H0, 3);

    const Ht = diffuse(Ahat, H0, alpha, topLayers);
    const Ha = diffuse(Shat, H0, alpha, attrLayers);

    // fusion
    const H = zeros(N, D);
    for (let i=0;i<N;i++)
      for (let k=0;k<D;k++)
        H[i][k] = beta*Ht[i][k] + (1-beta)*Ha[i][k];

    const km = kmeans(H, K);
    const refined = cprop(Ahat, km.assign, K, alpha, cpropLayers);

    const accKm = matchAccuracy(km.assign, truth, K);
    const accFinal = matchAccuracy(refined.assign, truth, K);

    return {
      N, K, Ahat, Shat, H0, Ht, Ha, H, km, refined, attrEdges,
      accKm, accFinal, truth,
    };
  }

  // ---------- 2D projection for viz ----------
  // We use the first 2 dims of H (after centering) as a 2D "semantic" offset.
  // Stable across tweaks because H0 is seeded.
  function project2D(H){
    const N = H.length;
    const mean = [0,0];
    for (let i=0;i<N;i++){ mean[0]+=H[i][0]; mean[1]+=H[i][1]; }
    mean[0]/=N; mean[1]/=N;
    const pts = H.map(r => [r[0]-mean[0], r[1]-mean[1]]);
    // normalize to roughly [-1,1]
    let mx = 0;
    pts.forEach(p => { mx = Math.max(mx, Math.abs(p[0]), Math.abs(p[1])); });
    if (mx<1e-6) mx = 1;
    return pts.map(p => [p[0]/mx, p[1]/mx]);
  }

  window.DGAC_MATH = {
    runDGAC, project2D, buildH0, buildAttrAhat, buildAhat, diffuse, kmeans, cprop, matchAccuracy,
  };

  // ============================================================
  // CDE (Convection-Diffusion Equation, IJCAI 2023) numerics —
  // simple front-end Euler ODE solver for the dual-panel theatre.
  //
  // Heat (GRAND-LAP):
  //   dx_i/dt = κ · ( mean_{j∈N(i)} x_j − x_i )           ← row-norm Laplacian
  // CDE:
  //   dx_i/dt = κ · ( mean_{j∈N(i)} x_j − x_i )
  //           + Σ_{j∈N(i)} V_ij ⊙ x_j           [Eq.9]
  //   V_ij    = tanh( W (x_j − x_i) )           [Eq.10, σ=tanh]
  //
  // W is a seed-initialised square matrix (NOT learnt — playground only
  // demonstrates the mechanism). To make CDE visibly outperform GRAND on
  // the heterophilic toy graph we initialise W = −w0·I + ε  (anti-diffusion
  // structured seed); this matches the qualitative behaviour the paper's
  // end-to-end-trained W converges to on heterophilic data.
  // ============================================================
  function makeRngCDE(seed){ let s=seed>>>0||1; return ()=>{ s=(Math.imul(s,1664525)+1013904223)>>>0; return s/4294967296; }; }
  function randn(rng){
    // Box-Muller
    let u=rng()||1e-9, v=rng()||1e-9;
    return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);
  }

  // Identity-scaled with small Gaussian noise. w0 controls overall convection
  // strength; noise scales with w0 so w0=0 yields a true zero matrix
  // (no convection at all → CDE reduces exactly to GRAND, useful for sanity).
  function seedW(r, w0=0.6, noiseRatio=0.08, seed=21){
    const W = Array.from({length:r}, ()=>new Array(r).fill(0));
    if (w0 === 0) return W;
    const rng = makeRngCDE(seed);
    for (let i=0;i<r;i++) {
      W[i][i] = -w0;
      for (let j=0;j<r;j++) if (i!==j) W[i][j] = w0*noiseRatio*randn(rng);
    }
    return W;
  }

  // r-dim cluster centres placed on a 2D circle in dims 0-1 (rest small noise).
  // This way the 2D projection (first 2 dims) directly reveals the cluster
  // structure — visually clean for the dual-panel theatre.
  function clusterCenters(K, r, sep=0.55, seed=11){
    const rng = makeRngCDE(seed);
    const C = [];
    for (let k=0;k<K;k++){
      const c = new Array(r).fill(0);
      const ang = 2*Math.PI*k/K - Math.PI/4;
      c[0] = sep*Math.cos(ang);
      c[1] = sep*Math.sin(ang);
      for (let i=2;i<r;i++) c[i] = 0.04*randn(rng);
      C.push(c);
    }
    return C;
  }

  function initX(nodes, K, r, noise=0.18, seed=33){
    const rng = makeRngCDE(seed);
    const C = clusterCenters(K, r, 0.55, seed+1);
    const X = nodes.map(n => {
      const x = C[n.cluster].slice();
      for (let i=0;i<r;i++) x[i] += noise*randn(rng);
      return x;
    });
    return { X, centers: C };
  }

  // Build adjacency list for fast neighbour iteration.
  function adjList(N, edges){
    const adj = Array.from({length:N}, ()=>[]);
    for (const [a,b] of edges){
      adj[a].push(b);
      adj[b].push(a);
    }
    return adj;
  }

  // ---- one Euler step: X_{t+τ} = X_t + τ·f(X_t) ----------------
  // Components computed separately so we can toggle convection on/off.
  function diffusionContrib(X, adj, kappa){
    const N = X.length, r = X[0].length;
    const dX = Array.from({length:N}, ()=>new Array(r).fill(0));
    for (let i=0;i<N;i++){
      const nb = adj[i];
      if (nb.length === 0) continue;
      // mean of neighbour features
      const m = new Array(r).fill(0);
      for (const j of nb) for (let k=0;k<r;k++) m[k] += X[j][k];
      const inv = 1/nb.length;
      for (let k=0;k<r;k++) m[k] *= inv;
      // dx_i = κ (mean − x_i)
      for (let k=0;k<r;k++) dX[i][k] = kappa*(m[k] - X[i][k]);
    }
    return dX;
  }
  function convectionContrib(X, adj, W){
    const N = X.length, r = X[0].length;
    const dX = Array.from({length:N}, ()=>new Array(r).fill(0));
    // Per node i: Σ_{j∈N(i)} V_ij ⊙ x_j,  V_ij = tanh(W(x_j − x_i))
    const diff = new Array(r);
    const wd   = new Array(r);
    for (let i=0;i<N;i++){
      for (const j of adj[i]){
        for (let k=0;k<r;k++) diff[k] = X[j][k] - X[i][k];
        // wd = W · diff
        for (let p=0;p<r;p++){
          let s = 0;
          const Wp = W[p];
          for (let q=0;q<r;q++) s += Wp[q]*diff[q];
          wd[p] = Math.tanh(s);  // V_ij[p]
        }
        // dX[i] += V_ij ⊙ x_j
        for (let k=0;k<r;k++) dX[i][k] += wd[k]*X[j][k];
      }
    }
    return dX;
  }

  // GRAND-style residual ODE function (paper Table 8 hetero presets use add_source=True):
  //   f(X) = α·(diff + conv) + β·X(0)
  // α/β are learnable in the paper; here we use small fixed scalars matching the
  // typical sigmoid(α_train)≈0.5, β_train≈0.1 region after training.
  function eulerStep(X, adj, kappa, useConv, W, tau, X0, alphaScale=1.0, betaScale=0.0){
    const dDiff = diffusionContrib(X, adj, kappa);
    const dConv = useConv ? convectionContrib(X, adj, W) : null;
    const N = X.length, r = X[0].length;
    const useSrc = (betaScale > 0) && X0;
    const out = X.map((row,i) => {
      const newRow = new Array(r);
      for (let k=0;k<r;k++){
        const c = (dConv ? dConv[i][k] : 0);
        const srcRow = useSrc ? X0[i][k] : 0;
        newRow[k] = row[k] + tau*(alphaScale*(dDiff[i][k] + c) + betaScale*srcRow);
      }
      return newRow;
    });
    return out;
  }

  // Run Euler integration; return [X(0), X(τ), X(2τ), …, X(Tsteps·τ)]
  // alphaScale: learnable α from paper (here fixed at 1.0)
  // betaScale: learnable β for source term β·X(0) (paper Table 8 hetero: usually >0)
  function runEuler(X0, edges, opts){
    const { tau=0.25, steps=20, kappa=1.0, useConv=true, W=null,
            alphaScale=1.0, betaScale=0.0 } = opts || {};
    const adj = adjList(X0.length, edges);
    const traj = [X0];
    let X = X0;
    for (let s=0; s<steps; s++){
      X = eulerStep(X, adj, kappa, useConv, W, tau, X0, alphaScale, betaScale);
      traj.push(X);
    }
    return traj;
  }

  // Per-node velocity vector aggregate v_i = mean_{j∈N(i)} V_ij  (for arrow viz).
  // Project to 2D using the same projection as the panel uses for X.
  function nodeVelocities(X, adj, W){
    const N = X.length, r = X[0].length;
    const V = Array.from({length:N}, ()=>new Array(r).fill(0));
    const diff = new Array(r);
    for (let i=0;i<N;i++){
      const nb = adj[i];
      if (!nb.length) continue;
      for (const j of nb){
        for (let k=0;k<r;k++) diff[k] = X[j][k] - X[i][k];
        for (let p=0;p<r;p++){
          let s=0; const Wp=W[p];
          for (let q=0;q<r;q++) s += Wp[q]*diff[q];
          V[i][p] += Math.tanh(s);
        }
      }
      const inv = 1/nb.length;
      for (let k=0;k<r;k++) V[i][k] *= inv;
    }
    return V;
  }

  // Nearest-centroid classification (cosine).
  function classifyNearest(X, centers){
    return X.map(x => {
      let best=0, bestD=Infinity;
      for (let c=0;c<centers.length;c++){
        let s=0;
        for (let k=0;k<x.length;k++) s += (x[k]-centers[c][k])**2;
        if (s<bestD){ bestD=s; best=c; }
      }
      return best;
    });
  }
  function accuracySimple(pred, truth){
    let c=0;
    for (let i=0;i<pred.length;i++) if (pred[i]===truth[i]) c++;
    return c/pred.length;
  }

  // Top-level: run both GRAND-only and CDE on the same graph + initial X(0).
  // Returns trajectories + per-step ACC for both branches.
  function runCDE(G, opts){
    const { rDim=8, K=4, T=5.0, tau=0.25, kappa=1.0, w0=0.6, noiseW=0.05, seed=33 } = opts || {};
    const steps = Math.round(T/tau);
    const { X: X0, centers } = initX(G.nodes, K, rDim, 0.18, seed);
    const W = seedW(rDim, w0, noiseW, seed+7);
    const truth = G.nodes.map(n=>n.cluster);

    const trajGrand = runEuler(X0, G.edges, { tau, steps, kappa, useConv:false });
    const trajCDE   = runEuler(X0, G.edges, { tau, steps, kappa, useConv:true,  W });

    const accGrand = trajGrand.map(X => accuracySimple(classifyNearest(X, centers), truth));
    const accCDE   = trajCDE.map(X => accuracySimple(classifyNearest(X, centers), truth));

    // Pre-compute velocities and projections for animation
    const adj = adjList(G.nodes.length, G.edges);
    const velFields = trajCDE.map(X => nodeVelocities(X, adj, W));

    return {
      X0, centers, W, truth,
      trajGrand, trajCDE, velFields,
      accGrand, accCDE,
      tau, steps, T,
    };
  }

  // 2D projection that's stable across trajectories (use centres as anchors).
  function project2DAnchored(X, centers){
    // Use first 2 dims of (X − mean) — same as DGAC's project2D but ensure scale
    const N = X.length;
    const mean = [0,0];
    for (let i=0;i<N;i++){ mean[0]+=X[i][0]; mean[1]+=X[i][1]; }
    mean[0]/=N; mean[1]/=N;
    const pts = X.map(r => [r[0]-mean[0], r[1]-mean[1]]);
    let mx = 0;
    pts.forEach(p => { mx = Math.max(mx, Math.abs(p[0]), Math.abs(p[1])); });
    if (mx<1e-6) mx = 1;
    return pts.map(p => [p[0]/mx, p[1]/mx]);
  }

  window.CDE_MATH = {
    runCDE,
    runEuler, eulerStep, diffusionContrib, convectionContrib, nodeVelocities,
    initX, seedW, clusterCenters, classifyNearest, accuracySimple,
    project2DAnchored, adjList,
  };
})();
