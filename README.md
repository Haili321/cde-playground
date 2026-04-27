# CDE Playground · Interactive Walkthrough

An interactive visualisation of **CDE** (*Graph Neural Convection-Diffusion with Heterophily*,
[Zhao, Kang, Song, She, Wang, Tay — IJCAI 2023](https://arxiv.org/abs/2305.16780)).

> 🌐 **Live demo**: [dcs.warwick.ac.uk/~u1898019/cde-playground/](https://www.dcs.warwick.ac.uk/~u1898019/cde-playground/)

<p align="center">
  <img src="https://img.shields.io/badge/React-18.3-61DAFB?logo=react&logoColor=white" alt="react">
  <img src="https://img.shields.io/badge/KaTeX-0.16-329F36" alt="katex">
  <img src="https://img.shields.io/badge/no%20build%20step-✓-64d2ff" alt="no-build">
  <img src="https://img.shields.io/badge/zh--CN-100%25-d93b1e" alt="chinese">
</p>

---

## What this is

A single-page interactive walkthrough that teaches the CDE method:

- **Heat diffusion** baseline — `∂x/∂t = div(D∇x)` (the GRAND family of GNNs)
- **Convection-Diffusion equation** — adds a velocity field `v` to redirect information
  flow on heterophilic edges: `∂x/∂t = div(D∇x) − div(v·x)`
- **Per-edge velocity** — `V_{ij} = σ(W(x_j − x_i))` (Eq.10), learnable, the soul of CDE
- **Numerical ODE solve** (forward Euler / RK4) integrated to time T
- **Plug-in design** — drops on top of any diffusion baseline (CDE-GRAND, CDE-GraphBel)

The signature animation contrasts **GRAND vs CDE on the same heterophilic graph** —
showing how convection lets information avoid bad neighbours and preserve cluster structure.

## Why CDE matters

On the **Roman-empire** dataset (h_adj = −0.05, the most heterophilic of all):

| Method | ACC |
|---|---|
| GRAND (heat diffusion only) | 71.6% |
| **CDE-GRAND** (heat + convection) | **91.6%** |
| improvement | **+20.0%** |

Adding the convection term costs only ~10% extra training time and ~1% extra inference —
nearly free for the gain. The same plug-in works on Wiki-cooc (+6%), Minesweeper (+19%),
Texas (+6%), and 5 other heterophilic benchmarks.

## Features

- 🌊 **Dual-panel time theatre** — heat-only vs CDE on the same graph,
  with a continuous time scrubber `t ∈ [0, T]`
- 🧭 **8-step scrubber** — physical intuition → graph discretisation → convection → solver → result
- 📐 **Paper-faithful KaTeX** — every Eq. in the playground points to a paper Eq./Section
- 🎛️ **Tweaks panel** — integration time `T`, step size `τ`, attention variant
  (GRAND-LAP / GAT / TRANS / GraphBel), heat vs CDE toggle
- 🧠 **Velocity field viz** — per-node velocity arrows show learnt direction of information transport
- 📊 **Figure 1 reproduction** — interactive ACC vs h_edge curve
  (CDE vs GRAND vs GCN vs ACM-GCN)
- 🧮 **Glossary popovers** — symbol clicks open accumulative explanation cards
- 💾 **Step state persisted** — current step saved to `localStorage`
- 🌏 **Chinese UI**

## Tech stack

- **React 18.3** via UMD CDN
- **Babel standalone 7.29** — in-browser JSX (no build step)
- **KaTeX 0.16** — maths rendering (in-SVG via foreignObject)
- **Pure SVG + SMIL** — all diagrams and animations, no canvas
- **Toy front-end ODE solver** — forward Euler in pure JS, runs in the browser

The implementation prioritises **explanation over reproduction** — `W` in Eq.10 uses a
seed-initialised matrix rather than the paper's end-to-end-trained one, faithfully showing
the convection mechanism without needing a Python training environment.

## Running locally

```bash
git clone https://github.com/Haili321/cde-playground.git
cd cde-playground
python3 -m http.server 8000
# open http://localhost:8000/
```

Or just open `index.html` directly in a browser.

## File structure

```
cde-playground/
├── index.html          # Entry — loads React, Babel, KaTeX, then src/*
└── src/
    ├── app.jsx         # Top-level + header/footer + layout
    ├── graph.jsx       # Demo graph layout + rendering
    ├── steps.jsx       # 8-step narrative definitions
    ├── pipeline.jsx    # CDE architecture SVG pipeline
    ├── formulas.jsx    # GLOSSARY + RELATED + popover system
    ├── tweaks.jsx      # Hyper-parameter panel
    ├── extras.jsx      # Dual-panel time theatre + Figure 1 + loss
    └── cde_math.js     # Toy V_ij = σ(W(x_j−x_i)) + Euler ODE solve
```

## About CDE

CDE proposes incorporating the convection-diffusion PDE into GNN message passing.
Standard GNNs based on heat diffusion implicitly assume homophily — connected nodes
are similar. On heterophilic graphs this breaks: information from dissimilar neighbours
gets averaged in and over-smoothing follows. CDE adds a learnt velocity term that lets
the model *redirect* information flow at every edge, dramatically improving robustness
on heterophilic benchmarks while remaining strictly more general than the underlying
diffusion baseline.

Paper: **Graph Neural Convection-Diffusion with Heterophily** · Kai Zhao\*, Qiyu Kang\*,
Yang Song, Rui She, Sijie Wang, Wee Peng Tay (NTU + C3 AI) ·
*IJCAI 2023* · [arXiv:2305.16780](https://arxiv.org/abs/2305.16780) ·
[code](https://github.com/zknus/Graph-Diffusion-CDE)

## Companion playground

A sibling walkthrough for **DGAC** (WWW 2025) — also tackling heterophilic graphs but via
dual-branch diffusion + cluster propagation rather than PDE convection — lives at
[github.com/Haili321/dgac-playground](https://github.com/Haili321/dgac-playground).
The two playgrounds together survey two distinct architectures for graph-agnostic
learning under heterophily.

## License

MIT — see [LICENSE](LICENSE).

Original CDE algorithm credit belongs to the paper authors; this repository contains
only the educational interactive visualisation.

---

<p align="center">
  <sub>Built by <a href="https://github.com/Haili321">Haili Yuan</a> ·
  PhD in Graph-Agnostic Clustering @ University of Warwick</sub>
</p>
