// Step definitions — narrative backbone of the CDE playground.
// IJCAI 2023 — Graph Neural Convection-Diffusion with Heterophily.
// Each step knows which pipeline elements are "active" (highlighted),
// which formula block to highlight, and what's shown on the graph.
//
// NOTE: Step IDs are kept generic ("input", "encode", ...) for now to
// avoid breaking other files during initial scaffolding. They'll be
// renamed to CDE-specific IDs (heat / cde / velocity / ode / classify)
// when formulas.jsx and pipeline.jsx are rewritten in the next pass.

const STEPS = [
  {
    id: "init",
    title: "输入 · 带属性图",
    subtitle: "G = (V, E, w),  X(0) ∈ ℝ^{N×r}",
    active: ["input-x", "input-a"],
    formula: "input",
    desc: "论文 Sec. 3.2 — CDE 的输入和标准 GNN 一样：节点集 V (|V|=N)、边集 E、边权 w，节点特征矩阵 X(0)。每个节点 i 有一个 r 维特征向量 x_i(0)。任务是节点分类（半监督），关键挑战是异质图（h_edge 低，连边节点常常不同类）。",
  },
  {
    id: "intuition",
    title: "物理直觉 · 热扩散 vs 对流扩散",
    subtitle: "Eq.1: ∂x/∂t = div(D∇x)   |   Eq.2: ∂x/∂t = div(D∇x) − div(v·x)",
    active: ["input-x", "input-a", "s-enc", "a-enc"],
    formula: "encode",
    desc: "CDE 的核心隐喻 —— 把节点特征当流体浓度。一杯静水里滴墨水（heat 方程，Eq.1）：墨水沿浓度梯度均匀扩散，最终一片均匀。但河里滴墨水（CDE，Eq.2）：墨水还会被水流带走，沿速度场 v 定向流动。同质图像固体，热扩散就够；异质图像气体/液体，必须有对流项。",
  },
  {
    id: "diffusion",
    title: "图上的扩散项 · GRAND 形式",
    subtitle: "Eq.5: dX/dt = (A(X)−I)X  ↔  Σ_{j∈N(i)} A_{ij}(x_j−x_i)  (展开形式)",
    active: ["s-enc", "top-diff"],
    formula: "topology",
    desc: "论文 Eq.3-5 — 把连续 PDE 在图上离散：边上的梯度 (∇X)_{ij} = x_j − x_i，节点上的散度 (div X)_i = Σ_{j∈N(i)} X_{ij}。代入热方程得 dX/dt = (A(X)−I)X，其中 A 可以是 GRAND-LAP（常量）/ GRAND-GAT / GRAND-TRANS / GraphBel 等几种 attention 选择 —— 这就是已有的扩散类 GNN（GRAND, GraphBel）。",
  },
  {
    id: "convection",
    title: "图上的对流项 · CDE 的核心 ★",
    subtitle: "(div(V⊙X))_i = Σ_{j∈N(i)} V_{ij} ⊙ x_j   [Eq.9]",
    active: ["a-enc", "attr-diff"],
    formula: "attribute",
    desc: "论文 Eq.8-9 — CDE 在 GRAND 之上加的全部贡献。每条边 (i,j) 配一个「速度向量」V_{ij} ∈ ℝ^r，节点的对流项是邻居特征和边速度向量的逐元素积之和。物理上 v 控制信息往哪流；图上它让节点能「逆梯度」接收信息，这是处理异质边的关键。⚠️ 注意：论文 Appendix B 把这里写成 ⊙ x_i 与主文 Eq.9 矛盾 —— 看 code 注释 (function_laplacian_convection.py:81-82) 「v_ij elementwise product with x_j」，主文 Eq.9 是对的，Appendix B 是 typo。",
  },
  {
    id: "velocity",
    title: "Velocity 学法 · learnable per-edge",
    subtitle: "V_{ij} = σ(W (x_j − x_i))   [Eq.10 ★★]",
    active: ["top-diff", "attr-diff", "fusion"],
    formula: "fusion",
    desc: "论文 Eq.10 — 全文最重要一公式。速度由特征差驱动：W 是可学习矩阵，σ 是激活函数。直觉：同质邻居 (x_j ≈ x_i) → V ≈ 0 → 退回纯扩散；异质邻居 (x_j ≠ x_i) → V 显著 → 对流主导。但 V 的方向不一定与 x_j − x_i 同向（W 和 σ 学出来的）—— 模型自己决定该让信息往哪流。📌 Code 实际细节：σ 在官方 code 里是 ReLU（paper 没明说），且 code 用 (x_i−x_j) 而 paper 是 (x_j−x_i) —— W 可学等价。点 ★ Eq.10 chip 看完整对比。",
  },
  {
    id: "ode",
    title: "ODE 求解 · forward Euler / RK4",
    subtitle: "X(t+τ) = X(t) + τ · f(X(t)),  迭代到 t = T",
    active: ["fusion", "kmeans"],
    formula: "kmeans",
    desc: "论文 Sec. 4.2 / Algorithm 1 — 数值积分到时间 T。dX/dt = div(D⊙∇X) + div(V⊙X) 用 Euler 或 RK4 求解（Chen 2018 NeuralODE 框架）。T/τ 等效于「层数」（因为没有显式 layer，每个 ODE step 算一次邻居聚合）。论文 Table 3：T=1.0 已饱和，T=5.0 反而下降。",
  },
  {
    id: "classify",
    title: "节点分类输出",
    subtitle: "ŷ = MLP(X(T)),  loss = cross-entropy",
    active: ["kmeans", "cprop"],
    formula: "cprop",
    desc: "Algorithm 1 第 3-4 步 — 取 ODE 解的终态 X(T) 通过 MLP 分类头得到节点类别预测，标准 cross-entropy 损失训练。注意 v 不是给定的物理速度场，而是端到端从分类 loss 反传梯度学出来的（W 是 V_{ij}=σ(W(x_j−x_i)) 里的可学习矩阵）。",
  },
  {
    id: "benchmark",
    title: "异质图 benchmark 表现",
    subtitle: "Roman-empire: GRAND 71.6% → CDE-GRAND 91.6%   ★ +20%",
    active: ["fusion", "cprop", "loss"],
    formula: "loss",
    desc: "论文 Table 2 — CDE-GRAND 在 9 个异质 benchmark 上全部 SOTA 或并列。h_adj 越低（异质性越强）改进越大：Roman-empire (h_adj=−0.05) 提升 +20%，Minesweeper +19%，Wiki-cooc +6%。Figure 1 在合成图上调控 h_edge，CDE 在 h<0.5 区间碾压 GRAND/GCN/ACM-GCN。",
  },
  {
    id: "plugin",
    title: "Plug-in 哲学",
    subtitle: "CDE = (任何 diffusion baseline) + 对流项",
    active: ["cprop", "output"],
    formula: "output",
    desc: "Section 5.6 — CDE 不是替换 diffusion，是在它之上「加一项」。论文给了 CDE-GRAND（用 GRAND 的扩散）/ CDE-GraphBel（用 GraphBel 的扩散），都比各自 baseline 显著提升。计算成本只增加 ~10% 训练 / ~1% 推理（Table 5）—— 几乎是 free upgrade。",
  },
];

window.STEPS = STEPS;
