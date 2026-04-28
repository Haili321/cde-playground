// Step definitions — narrative backbone of the CDE playground.
// IJCAI 2023 — Graph Neural Convection-Diffusion with Heterophily.
//
// subtitle + desc support inline math via $...$ — rendered by MixedMath
// in app.jsx (KaTeX). Chinese / English text stays in normal font, math
// segments render properly with subscripts / superscripts / symbols.

const STEPS = [
  {
    id: "init",
    title: "输入 · 带属性图",
    subtitle: "$\\mathcal G=(V,\\,E,\\,w)$,  $X(0)\\in\\mathbb R^{N\\times r}$",
    active: ["input-x", "input-a"],
    formula: "input",
    desc: "论文 Sec. 3.2 — CDE 的输入和标准 GNN 一样：节点集 $V$（$|V|=N$）、边集 $E$、边权 $w$，节点特征矩阵 $X(0)$。每个节点 $i$ 有一个 $r$ 维特征向量 $x_i(0)$。任务是节点分类（半监督），关键挑战是异质图（$h_{\\text{edge}}$ 低，连边节点常常不同类）。",
  },
  {
    id: "intuition",
    title: "物理直觉 · 热扩散 vs 对流扩散",
    subtitle: "Eq.1: $\\partial_t x = \\mathrm{div}(D\\nabla x)$  ·  Eq.2: $\\partial_t x = \\mathrm{div}(D\\nabla x) - \\mathrm{div}(\\mathbf v\\,x)$",
    active: ["input-x", "input-a", "s-enc", "a-enc"],
    formula: "encode",
    desc: "论文 Sec. 3.1 给的海洋学类比：$x$ 是海水中的热浓度，速度场 $\\mathbf v$ 是洋流（line 219-223）。Eq.1 纯扩散下，热只沿浓度梯度流；Eq.2 加对流后，洋流会把热「带着走」，输运方向由 $\\mathbf v$ 决定。Sec. 4 进一步类比（line 325-340）：同质图像固体材料（粒子受连接束缚，热扩散主导信息聚合），异质图像气体或流体（粒子运动相对自由，必须有对流项才能描述信息流动）。",
  },
  {
    id: "diffusion",
    title: "图上的扩散项 · GRAND 形式",
    subtitle: "Eq.5: $dX/dt = (A(X)-I)X \\;\\leftrightarrow\\; \\sum_{j\\in N(i)} A_{ij}(x_j-x_i)$  (展开)",
    active: ["s-enc", "top-diff"],
    formula: "topology",
    desc: "论文 Eq.3-5 — 把连续 PDE 在图上离散：边上的梯度 $(\\nabla X)_{ij} = x_j - x_i$，节点上的散度 $(\\mathrm{div}\\,X)_i = \\sum_{j\\in N(i)} X_{ij}$。代入热方程得 $dX/dt = (A(X)-I)X$，其中 $A$ 可以是 GRAND-LAP（常量）/ GRAND-GAT / GRAND-TRANS / GraphBel 等几种 attention 选择 —— 这就是已有的扩散类 GNN（GRAND, GraphBel）。",
  },
  {
    id: "convection",
    title: "图上的对流项 · CDE 的核心 ★",
    subtitle: "Eq.9: $(\\mathrm{div}(V\\odot X))_i = \\sum_{j\\in N(i)} V_{ij} \\odot x_j$",
    active: ["a-enc", "attr-diff"],
    formula: "attribute",
    desc: "论文 Eq.8-9 — CDE 在 GRAND 之上加的全部贡献。每条边 $(i,j)$ 配一个「速度向量」$V_{ij} \\in \\mathbb R^r$，节点的对流项是邻居特征和边速度向量的逐元素积之和。物理上 $\\mathbf v$ 描述信息「怎么流动」（Sec. 3.1，line 217-218）；Sec. 4.1 (line 366-372) 进一步说 $V_{ij}$ 决定从 $j$ 到 $i$ 的「优先信息输运方向」，这种灵活性正是异质图所需的。⚠️ 注意：论文 Appendix B 把这里写成 $\\odot x_i$ 与主文 Eq.9 矛盾 —— 看 code 注释（function_laplacian_convection.py:81-82）「v_ij elementwise product with $x_j$」，主文 Eq.9 是对的，Appendix B 是 typo。",
  },
  {
    id: "velocity",
    title: "Velocity 学法 · learnable per-edge",
    subtitle: "Eq.10 ★★: $V_{ij} = \\sigma(W (x_j - x_i))$",
    active: ["top-diff", "attr-diff", "fusion"],
    formula: "fusion",
    desc: "论文 Eq.10（Sec. 4.1，line 361-372）：$W$ 是可学习矩阵，$\\sigma$ 是激活函数；速度由特征差 $x_j(t)-x_i(t)$ 决定，但 paper 明确指出 $V$ 不一定与 $x_j - x_i$ 同向（line 368-369：「the velocity is not always in the same direction as the difference」），因为 $W$ 与 $\\sigma$ 都是可学的。这种灵活适应性正是异质图所需的（line 370-372）。📌 Code 实际细节：$\\sigma$ 在官方 code 里是 ReLU（paper 没明说），且 code 用 $(x_i-x_j)$ 而 paper 是 $(x_j-x_i)$ —— $W$ 可学等价。点 ★ Eq.10 chip 看完整对比。",
  },
  {
    id: "ode",
    title: "ODE 求解 · forward Euler / RK4",
    subtitle: "$X(t+\\tau) = X(t) + \\tau\\,f(X(t))$,  迭代到 $t = T$",
    active: ["fusion", "kmeans"],
    formula: "kmeans",
    desc: "论文 Sec. 4.2 / Algorithm 1 — 数值积分到时间 $T$。$dX/dt = (A(X)-I)X + \\mathrm{div}(V\\odot X)$（Eq.8 图形式）用 Euler 或 RK4 求解（Chen 2018 NeuralODE 框架）。$T/\\tau$ 等效于「隐式层数」 —— Table 3 caption：「neural diffusion 模型无显式 layer，可把 ODE 求解步数视作 implicit layers」。Sec. 5.6 / Table 3 (line 1112-1118)：随 $T$ 增大准确率提升直至「饱和点」(saturation point)，更大 $T$ 计算成本更高。Roman-empire (Euler) 在 $T=3$ 达 $91.64\\%$ 后微降，Minesweeper (Euler) 在 $T=4$ 达 $93.21\\%$ 后微降。",
  },
  {
    id: "classify",
    title: "节点分类输出",
    subtitle: "$\\hat y_i = \\arg\\max_c\\,\\mathrm{MLP}(x_i(T))_c$,  loss = cross-entropy",
    active: ["kmeans", "cprop"],
    formula: "cprop",
    desc: "Algorithm 1 第 3-4 步 — 取 ODE 解的终态 $X(T)$ 通过 MLP 分类头得到节点类别预测，标准 cross-entropy 损失训练：$\\mathcal L = -\\sum_{i\\in V_{\\text{train}}}\\log p_{i,y_i}$。注意 $\\mathbf v$ 不是给定的物理速度场，而是端到端从分类 loss 反传梯度学出来的（$W$ 是 $V_{ij}=\\sigma(W(x_j-x_i))$ 里的可学习矩阵）。",
  },
  {
    id: "benchmark",
    title: "异质图 benchmark 表现",
    subtitle: "Roman-empire ($h_{\\mathrm{adj}}=-0.05$): GRAND $71.6\\%$ → CDE-GRAND $\\mathbf{91.6\\%}$  ★ +20pp",
    active: ["fusion", "cprop", "loss"],
    formula: "loss",
    desc: "论文 Table 2 — CDE-GRAND 在 9 个异质 benchmark 上全部 SOTA 或并列。$h_{\\mathrm{adj}}$ 越低（异质性越强）改进越大：Roman-empire ($h_{\\mathrm{adj}}=-0.05$) 提升 +20pp，Minesweeper +19pp，Wiki-cooc +6pp。Figure 1 在合成图上调控 $h_{\\mathrm{edge}}$，CDE 在 $h<0.5$ 区间碾压 GRAND/GCN/ACM-GCN。⚠️ 注意 Table 2 数字不是 $X(T)$ endpoint —— 是 $t\\in[0,3T]$ 路径上 val-best 的 $t^*$ 时刻 ACC（点 ⚠ Path-best chip 看完整解释）。",
  },
  {
    id: "plugin",
    title: "Plug-in 哲学",
    subtitle: "CDE = (任何 diffusion baseline) + 对流项  $\\mathrm{div}(V\\odot X)$",
    active: ["cprop", "output"],
    formula: "output",
    desc: "Sec. 4.1 + Sec. 5.6 — CDE 不是替换 diffusion，是在它之上「加对流项」。论文给了 CDE-GRAND（用 GRAND 的扩散）/ CDE-GraphBel（用 GraphBel 的扩散），都比各自 baseline 显著提升（Table 4，Roman-empire / Minesweeper 提升 $\\geq 15\\%$，line 1200-1204）。计算开销 (Table 5, Cora 数据集)：paper line 1208-1209 原话「around 10% is increased for training time, while, over 1% is increased for inference time」 — 实测 CDE-GRAND 训练 9.55→10.43 ms (+9.2%)、推理 4.66→4.72 ms (+1.3%)。paper 评价为「acceptable trade-off」(line 1209-1211)。",
  },
];

window.STEPS = STEPS;
