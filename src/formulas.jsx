// Formula panel — KaTeX math + click-to-explain popovers (CDE edition).
//
// Paper: Graph Neural Convection-Diffusion with Heterophily (IJCAI 2023)
// arXiv: 2305.16780
//
// Each GLOSSARY entry:
//   tex     — small chip + popover header symbol
//   name    — bilingual short title
//   formula — optional longer KaTeX formula in popover body
//   desc    — multi-line description (\n separates lines, supports $...$ inline math)
//   role    — one-line "role in CDE" pill (PLAIN TEXT — no LaTeX!)
//
// Strict rules learned from DGAC playground:
//   • desc CANNOT contain markdown **bold** (won't render, shows literal **)
//   • role is PLAIN TEXT — no $...$, no \mathcal, no LaTeX
//   • Inner Chinese-context quotes use 「」 not "..." (the latter break JS strings)

const { useState: useStateF, useRef: useRefF, useEffect: useEffectF } = React;

const GLOSSARY = {
  // ─── 符号层 · Symbol primitives ──────────────────────────────────────
  "G": {
    tex:"\\mathcal G",
    name:"图 · Graph",
    formula:"\\mathcal G=(V,\\,E,\\,w)",
    desc:"论文 Sec. 3.2 —— 输入图是 $(V,E,w)$ 三元组：节点集 $V$、边集 $E$、边权函数 $w:E\\to\\mathbb R^+$。\n注意 CDE 比标准 GNN 多一个 $w$（边权融入扩散系数 $D$ 中）；无权图视作 $w\\equiv 1$。\n另外还有节点特征矩阵 $X(0)\\in\\mathbb R^{N\\times r}$ 作为初始条件（PDE 的 initial value）。",
    role:"输入图"
  },
  "V": {
    tex:"V",
    name:"节点集 · Node set",
    formula:"V=\\{1,2,\\dots,N\\}",
    desc:"图中所有节点。$|V|=N$。\n每个节点 $i\\in V$ 在时间 $t$ 有一个 $r$ 维特征向量 $x_i(t)\\in\\mathbb R^r$，随 PDE 演化。",
    role:"图组成"
  },
  "E": {
    tex:"E",
    name:"边集 · Edge set",
    formula:"E\\subseteq V\\times V",
    desc:"边集合。CDE 论文按无向图处理（$(i,j)\\in E\\Leftrightarrow (j,i)\\in E$）。\n$E$ 决定了图上的离散梯度算子（论文 Eq.3）：每条边 $(i,j)$ 上配一个梯度值 $(\\nabla X)_{ij}=x_j-x_i$。",
    role:"图组成"
  },
  "weight": {
    tex:"w",
    name:"边权函数 · Edge weights",
    formula:"w:E\\to\\mathbb R^+",
    desc:"每条边可带正实数权重。\nCDE 论文里 $w$ 通常融入扩散系数 $D$（$D$ 是 $|E|\\times|E|$ 对角矩阵，每条边一个标量）。\n无权图视作 $w\\equiv 1$。",
    role:"边权"
  },
  "N": {
    tex:"N",
    name:"节点数",
    formula:"N=|V|",
    desc:"图中节点总数。\n论文实验集大小：Roman-empire $N=22662$，Wiki-cooc $N=10000$，Texas/Cornell $N=183$，Wisconsin $N=251$。",
    role:"标量"
  },
  "r": {
    tex:"r",
    name:"特征维度",
    formula:"r=\\dim(x_i)",
    desc:"节点特征向量的维度。\n$X(t)\\in\\mathbb R^{N\\times r}$，每行 $x_i(t)$ 是 $r$ 维。\n常见值：Cora $r=1433$，Texas $r=1703$，Roman-empire $r=300$。\n实际实现里通常先经一个 MLP 把 raw 输入压缩到较小的隐藏维（论文 Algorithm 1 第 1 步）。",
    role:"标量"
  },
  "Xt": {
    tex:"X(t)",
    name:"时变特征矩阵 · Time-evolving features",
    formula:"X(t)\\in\\mathbb R^{N\\times r},\\quad t\\in[0,T]",
    desc:"CDE 的核心建模对象 —— 节点特征随时间演化。\n初值 $X(0)$ 通常由 raw 输入经 MLP 压缩得到（Alg.1 step 1）。\n中间态由 PDE $\\partial X/\\partial t = \\mathrm{div}(D\\odot\\nabla X)+\\mathrm{div}(V\\odot X)$ 决定（Eq.8），用 ODE solver 数值求解。\n终态 $X(T)$ 经分类头做节点分类（Alg.1 step 3-4）。",
    role:"演化变量"
  },
  "xi": {
    tex:"x_i(t)",
    name:"节点特征向量",
    formula:"x_i(t)\\in\\mathbb R^r",
    desc:"节点 $i$ 在时间 $t$ 的特征向量，是 $X(t)$ 的第 $i$ 行（论文记作行向量 $\\mathbf x_i^\\top(t)$）。\n论文 Sec. 3.1（line 220-221）海洋类比：可把 $x_i(t)$ 想成位置 $i$ 处的「热浓度」，随 PDE 演化。\n$x_i(t)$ 是图上 PDE $\\partial x/\\partial t = \\dots$ 的离散对应物。",
    role:"节点状态"
  },
  "partt": {
    tex:"\\partial_t",
    name:"时间偏导 · Time derivative",
    formula:"\\frac{\\partial x}{\\partial t}",
    desc:"PDE 的左侧 —— 描述特征随时间如何变化。\n热扩散：$\\partial x/\\partial t = \\mathrm{div}(D\\nabla x)$（Eq.1）。\nCDE：$\\partial x/\\partial t = \\mathrm{div}(D\\nabla x) - \\mathrm{div}(\\mathbf v\\,x)$（Eq.2）。\n图上离散化后变成 ODE $dX/dt = f(X)$，用 Euler 或 RK4 数值求解。",
    role:"PDE 算子"
  },
  "nablaOp": {
    tex:"\\nabla",
    name:"梯度算子（连续）",
    formula:"\\nabla x = \\bigl(\\tfrac{\\partial x}{\\partial u_1},\\dots,\\tfrac{\\partial x}{\\partial u_d}\\bigr)",
    desc:"经典向量分析中的梯度 —— 把标量场 $x$ 变成向量场，指向 $x$ 增长最快的方向。\n热方程 $\\partial x/\\partial t = \\mathrm{div}(D\\nabla x)$ 的 $\\nabla x$ 是浓度梯度。\n图上离散化（论文 Eq.3）：$(\\nabla X)_{ij} = x_j - x_i$ —— 每条边上的「梯度」就是端点特征差。",
    role:"微分算子"
  },
  "divOp": {
    tex:"\\mathrm{div}",
    name:"散度算子（连续）",
    formula:"\\mathrm{div}(\\mathbf F) = \\textstyle\\sum_i \\frac{\\partial F_i}{\\partial u_i}",
    desc:"向量场 $\\mathbf F$ 的散度 —— 描述场的「源/汇」强度（流出该点的净流量）。\n图上离散化（论文 Eq.4）：$(\\mathrm{div}\\,\\mathcal X)_i = \\sum_{j:(i,j)\\in E}\\mathcal X_{ij}$ —— 节点 $i$ 处散度是其所有连接边上量的求和。\n这就是熟悉的 GNN 邻居聚合（neighbor aggregation）。",
    role:"微分算子"
  },
  "gradX": {
    tex:"(\\nabla X)_{ij}",
    name:"图上梯度 · Graph gradient",
    formula:"(\\nabla X(t))_{ij} = x_j(t) - x_i(t),\\quad \\forall(i,j)\\in E",
    desc:"论文 Eq.3 —— 把连续梯度 $\\nabla x$ 在图上离散化。\n每条边 $(i,j)$ 上的「梯度」就是端点特征差 $x_j - x_i$。\n直觉：梯度大说明两端「不一样」（异质），梯度小说明「一样」（同质）。\nCDE 的速度公式（Eq.10）正是由这个差驱动：$V_{ij}=\\sigma(W(x_j-x_i))$。",
    role:"图离散化（Eq.3）"
  },
  "divX": {
    tex:"(\\mathrm{div}\\,\\mathcal X)_i",
    name:"图上散度 · Graph divergence",
    formula:"(\\mathrm{div}\\,\\mathcal X)_i = \\textstyle\\sum_{j:(i,j)\\in E}\\mathcal X_{ij}",
    desc:"论文 Eq.4 —— 节点 $i$ 处散度是其所有连接边上量的求和。\n这正是 GNN 的 neighbor aggregation。\nCDE 的两项都用此算子：\n  · 扩散项 $(\\mathrm{div}(D\\odot\\nabla X))_i = \\sum_{j\\in N(i)} D_{ij}(x_j-x_i)$（沿梯度求和）\n  · 对流项 $(\\mathrm{div}(V\\odot X))_i = \\sum_{j\\in N(i)} V_{ij}\\odot x_j$（Eq.9，特征本身加权和）",
    role:"图离散化（Eq.4）"
  },
  "Dmatrix": {
    tex:"D",
    name:"扩散系数矩阵 · Diffusivity",
    formula:"D\\;:\\;\\;|E|\\times|E|\\;\\text{对角矩阵}",
    desc:"扩散系数。物理上 $D$ 决定「热传导」的速率与方向。\n图上的 GRAND 实现里 $D$ 通常实例化为 attention 矩阵 $A(X(t))$（论文 Eq.5），即 $D_{ij}$ 是边 $(i,j)$ 上的可学习相似度。\n四种经典选择：GRAND-LAP（常数）/ GRAND-GAT / GRAND-TRANS / GraphBel（Beltrami flow）。\nCDE 把对流项加到任何一种 $D$ 选择之上，构成 CDE-GRAND-LAP / CDE-GRAND-GAT / CDE-GRAND-TRANS / CDE-GraphBel。",
    role:"扩散系数"
  },
  "Vij": {
    tex:"V_{ij}(t)",
    name:"边速度向量 · Per-edge velocity ★",
    formula:"V_{ij}(t)\\in\\mathbb R^r,\\quad V_{ij}(t)=\\sigma\\bigl(W(x_j(t)-x_i(t))\\bigr)",
    desc:"CDE 的核心创新。每条边 $(i,j)$ 在时间 $t$ 配一个 $r$ 维速度向量。\n物理类比（论文 Sec. 3.1 line 222-223）：流体力学里 $\\mathbf v$ 类似洋流，CDE 让每条图边都有一个独立的「水流」方向。\nPaper Sec. 4.1（line 366-372）原话解读：\n  · $V_{ij}$ 决定从邻居 $j$ 到节点 $i$ 的「优先信息输运方向」\n  · $V$ 不一定与 $x_j-x_i$ 同向（line 368-369：「the velocity is not always in the same direction as the difference」），因 $W$ 与 $\\sigma$ 都可学\n  · 这种灵活性正是异质图所需的（line 370-372）\n时间依赖：$V_{ij}(t)$ 每个 ODE step 都重新算（因为 $x_i, x_j$ 在变）。",
    role:"学习目标"
  },
  "Vmatrix": {
    tex:"V(t)",
    name:"速度场 · Velocity field",
    formula:"V(t)=\\{V_{ij}(t)\\}_{(i,j)\\in E}",
    desc:"全图所有边速度向量的集合，组成「速度场」（vector field on edges）。\n物理类比：$V$ 在图上的意义类似流体里的 $\\mathbf v$ field —— 每个位置（这里是边）有一个方向向量。\n与扩散系数 $D$ 不同：$D$ 是标量场（控制扩散速率），$V$ 是向量场（控制流向）。",
    role:"全场速度"
  },
  "hadamard": {
    tex:"\\odot",
    name:"Hadamard 积 · Element-wise product",
    formula:"(a\\odot b)_k = a_k\\,b_k",
    desc:"逐元素相乘。\n论文 Eq.5 / Eq.8 / Eq.9 都用 $\\odot$：\n  · $D\\odot\\nabla X$：每条边上把标量 $D_{ij}$ broadcast 乘到边梯度 $(\\nabla X)_{ij}\\in\\mathbb R^r$ 上\n  · $V\\odot X$：边速度向量 $V_{ij}\\in\\mathbb R^r$ 与节点特征 $x_j\\in\\mathbb R^r$ 的逐元素积",
    role:"运算符"
  },
  "Amatrix": {
    tex:"A(X(t))",
    name:"可学习注意力矩阵 · Learnable attention",
    formula:"A(X(t))_{ij} = a(x_i(t),\\,x_j(t))",
    desc:"GRAND 风格的扩散用 attention 矩阵 $A$ 实现 $D$ 的角色（论文 Eq.5）。\n动力学化简：$dX/dt = \\mathrm{div}(D\\odot\\nabla X) = (A(X(t)) - I)\\,X(t)$。\n$A$ 由 pairwise similarity $a(x_i,x_j)$ 给出，论文给出四种典型选择：\n  · GRAND-LAP：$A$ 为常数（线性扩散，最简）\n  · GRAND-GAT：GAT 风格 LeakyReLU+softmax（Eq.12）\n  · GRAND-TRANS：Transformer 风格 scaled-dot-product（Eq.11）\n  · GraphBel：Beltrami 流（Song 2022）\nCDE 把对流项加在任何一种之上。",
    role:"扩散系数实例"
  },
  "aij": {
    tex:"a(x_i,x_j)",
    name:"节点间相似度",
    formula:"a:\\mathbb R^r\\times\\mathbb R^r\\to\\mathbb R",
    desc:"GRAND 框架里的可学习二元相似函数。$A(X)_{ij} = a(x_i, x_j)$。\n两种主要实现（论文 Eq.11-12）：\n  · TRANS：$a = \\mathrm{softmax}\\!\\bigl((W_K x_i)^\\top W_Q x_j / \\sqrt{d_k}\\bigr)$\n  · GAT：$a = \\frac{\\exp(\\mathrm{LeakyReLU}(\\mathbf a^\\top[Wx_i\\|Wx_j]))}{\\sum_k\\exp(\\dots)}$\n论文 Sec. 5.6 ablation：四种 diffusion 加 CDE 对流都能稳定提升。",
    role:"相似度函数"
  },
  "Imatrix": {
    tex:"I",
    name:"单位矩阵",
    formula:"I\\in\\mathbb R^{N\\times N}",
    desc:"$N\\times N$ 单位矩阵。\nGRAND 动力学 $dX/dt = (A(X)-I)X$（Eq.5）里减去 $I$ 让对角元为零（消除自循环），让信息纯粹来自邻居。",
    role:"矩阵常量"
  },
  "sigma": {
    tex:"\\sigma",
    name:"激活函数",
    formula:"\\sigma:\\mathbb R\\to\\mathbb R",
    desc:"非线性激活函数（如 $\\tanh$ / ReLU / GELU）。\nCDE 的速度公式（Eq.10）：$V_{ij} = \\sigma(W(x_j-x_i))$。\n如果 $\\sigma=\\mathrm{id}$ 则 $V$ 是 $x_j-x_i$ 的线性变换；非线性 $\\sigma$ 让 $V$ 可以「拐弯」—— 学到方向不必与 $x_j-x_i$ 同向。\n论文实现常用 $\\tanh$（输出有界 $[-1,1]$，数值稳定）。",
    role:"激活函数"
  },
  "Wmatrix": {
    tex:"W",
    name:"可学习速度权重 · Velocity weight",
    formula:"W\\in\\mathbb R^{r\\times r}",
    desc:"Eq.10 里的可学习矩阵。$V_{ij} = \\sigma(W(x_j - x_i))$。\n论文实现里 $W$ 用 PyTorch 的 `nn.Linear(r, r, bias=False)`。\n$W$ 是 paper Eq.10 明确描述的可学习参数；code 里 CDE 在 baseline 之上还有更多额外参数（频谱解耦的 $W_{\\mathrm{low}}/W_{\\mathrm{high}}$、concat-linear 的 lin2、LapConv 的 gate 等 —— paper 没明写，见 OutputLowHigh / EdgeAttention1 chip）。CDE 比 GRAND 增加 ~10% 训练时间 / ~1% 推理时间（paper Table 5 + line 1208-1209）。\n物理意义：$W$ 决定特征差如何映射成速度方向。\nplayground 用 random Gaussian $W$ 作 toy seed（不真训练，物理形式严格但不是论文学到的最优）。",
    role:"可学习参数"
  },
  "Tint": {
    tex:"T",
    name:"积分时间 · Integration time",
    formula:"T\\in\\mathbb R^+",
    desc:"ODE 积分到的目标时间（Algorithm 1）。\n相当于 GNN 的「层数」概念 —— 但 CDE 是连续 PDE，无显式 layer（Table 3 caption）。每个 ODE step 算一次邻居聚合，$T/\\tau$ 等效隐式层数（$\\tau$ 是步长）。\nTable 3 ablation（line 1112-1118）：随 $T$ 增大准确率提升直至「saturation point」，更大 $T$ 计算成本更高。Roman-empire (Euler) 在 $T=3$ 达 91.64% 峰值，Minesweeper (Euler) 在 $T=4$ 达 93.21% 峰值。",
    role:"超参（时间）"
  },
  "tau": {
    tex:"\\tau",
    name:"ODE 步长 · Step size",
    formula:"\\tau = T/L",
    desc:"数值积分的离散步长。\nforward Euler 更新：$X(t+\\tau) = X(t) + \\tau\\,f(X(t))$。\n步数 $L = T/\\tau$。$\\tau$ 越小积分越精确但越慢。\nCDE 论文：固定 $\\tau=1$，调整 $T$ 控制深度。",
    role:"超参（步长）"
  },
  "yu": {
    tex:"y_i",
    name:"节点标签 · Node label",
    formula:"y_i\\in\\{1,\\dots,C\\}",
    desc:"节点 $i$ 的真实类别（$C$ 是类别数）。\nCDE 是半监督节点分类：训练集只有部分节点的 $y_i$ 已知，目标是预测剩余节点。\n论文 Table 1 数据集：Roman-empire $C=18$，Wiki-cooc $C=5$，Texas/Cornell/Wisconsin $C=5$ 等。",
    role:"监督标签"
  },

  // ─── Definition 层 ───────────────────────────────────────────────
  "hedge": {
    tex:"h_{\\mathrm{edge}}",
    name:"边同质率 · Edge homophily ratio",
    formula:"h_{\\mathrm{edge}} = \\frac{|\\{(u,v)\\in E\\,:\\,y_u=y_v\\}|}{|E|}",
    desc:"论文 Definition 1 / Eq.6 —— 同质边（两端同类）占总边数的比例。\n$h_{\\mathrm{edge}}=1$：完全同质（所有边连接同类节点，Cora 接近此）。\n$h_{\\mathrm{edge}}=0$：完全异质（所有边跨类，Roman-empire 接近此）。\nCDE 论文 Figure 1 在合成图上把 $h$ 从 0.1 扫到 0.9，证明 CDE 在 $h<0.5$ 区段显著优于 GRAND/GCN/ACM-GCN。",
    role:"图属性"
  },
  "hadj": {
    tex:"h_{\\mathrm{adj}}",
    name:"调整同质率 · Adjusted homophily",
    formula:"h_{\\mathrm{adj}} = \\frac{h_{\\mathrm{edge}}-\\sum_{k=1}^C D_k^2/(2|E|)^2}{1-\\sum_{k=1}^C D_k^2/(2|E|)^2}",
    desc:"论文 Definition 2 / Eq.7（Platonov et al. 2022）—— 标准 $h_{\\mathrm{edge}}$ 对类别数和类别不平衡敏感，无法跨数据集公平比较。\n$h_{\\mathrm{adj}}$ 减去随机连接的期望（与 modularity 类似），让不同 $C$ 和不平衡数据集可比。\n负值表示「比随机更异质」（Roman-empire $h_{\\mathrm{adj}}=-0.05$，Wiki-cooc $-0.03$）；越接近 $1$ 越同质。\n论文 Table 2：CDE 在 $h_{\\mathrm{adj}}$ 越低的数据集改进越大。",
    role:"图属性（标准化）"
  },

  // ─── Eq 层 · Equation cards ─────────────────────────────────────
  "Eq1Heat": {
    tex:"\\text{Eq.1}",
    name:"热扩散方程（连续）· Heat equation",
    formula:"\\frac{\\partial x}{\\partial t} = \\mathrm{div}(D\\,\\nabla x),\\;\\;t>0",
    desc:"论文 Eq.1 / 经典物理 —— 热量沿浓度梯度均匀扩散。\n$D$ 是 thermal diffusivity（介质决定）。\n核心物理：信息从高浓度区流向低浓度区，最终全场趋于均匀。\n图 GNN 视角：这就是 GCN/GRAND 的连续极限。$D=$ 邻接矩阵时退化为标准 graph Laplacian smoothing。\n问题（paper line 41-44 + 67-79）：异质图上把不该融合的邻居信息也融合了 → over-smoothing → 「fail to optimally utilize information in heterophilic graph datasets」→ 需要加对流项。",
    role:"基础 PDE（baseline）"
  },
  "Eq2CDE": {
    tex:"\\text{Eq.2}",
    name:"对流-扩散方程 · Convection-Diffusion ★",
    formula:"\\frac{\\partial x}{\\partial t} = \\mathrm{div}(D\\,\\nabla x) - \\mathrm{div}(\\mathbf v\\,x)",
    desc:"论文 Eq.2 —— CDE 的连续形式。\n第一项 $\\mathrm{div}(D\\nabla x)$：扩散，沿浓度梯度（与 heat 方程相同）。\n第二项 $-\\mathrm{div}(\\mathbf v x)$：对流，沿速度场 $\\mathbf v$ 定向流动。\n经典物理例子：海水温度演化 = 扩散（热传导）+ 对流（洋流带走热量）。\n关键：当 $\\mathbf v\\equiv 0$ 时退化为 heat 方程；CDE 把 $\\mathbf v$ 学成 per-edge 的 $V_{ij}$（Eq.10），就能处理异质图。",
    role:"CDE 灵魂（Eq.2）"
  },
  "Eq3Grad": {
    tex:"\\text{Eq.3}",
    name:"图梯度（离散化）",
    formula:"(\\nabla X(t))_{ij} = x_j(t) - x_i(t),\\;\\forall(i,j)\\in E",
    desc:"论文 Eq.3 —— 连续梯度 $\\nabla x$ 在图上离散化为「边上的特征差」。\n这个看似简单的离散化是 GRAND 框架的关键：连续 PDE → 图上离散动力系统 → ODE → 数值求解 → 端到端可训。",
    role:"图离散化（Eq.3）"
  },
  "Eq4Div": {
    tex:"\\text{Eq.4}",
    name:"图散度（离散化）",
    formula:"(\\mathrm{div}\\,\\mathcal X)_i = \\textstyle\\sum_{j:(i,j)\\in E}\\mathcal X_{ij}",
    desc:"论文 Eq.4 —— 边上量在节点处的「流出净量」。\n图上散度 = 邻居聚合（neighbor sum）—— 这就是 GNN 的核心操作。\n配合 Eq.3 图梯度，得到 GNN 的 PDE 解释：每个 GNN message-passing layer 是 PDE 一个时间步的 Euler 离散。",
    role:"图离散化（Eq.4）"
  },
  "Eq5GRAND": {
    tex:"\\text{Eq.5}",
    name:"GRAND 动力学",
    formula:"\\frac{dX(t)}{dt} = \\mathrm{div}(D(X(t),t)\\odot\\nabla X(t)) = \\bigl(A(X(t)) - I\\bigr)\\,X(t)",
    desc:"论文 Eq.5（Chamberlain 2021a, GRAND）—— 把 heat 方程用 Eq.3-4 在图上离散得到的形式。\n两个等价写法：\n  · 一般形式：$\\mathrm{div}(D\\odot\\nabla X)$\n  · 矩阵形式：$(A(X)-I)X$，其中 $A_{ij}=a(x_i,x_j)$ 是可学习相似度\n这是 CDE 的扩散项基础，可以选 GRAND-LAP / GAT / TRANS / GraphBel 四种实现。\nCDE 的全部贡献是在 Eq.5 之上加对流项（Eq.8-9）。",
    role:"baseline 动力学（Eq.5）"
  },
  "Eq8CDEGraph": {
    tex:"\\text{Eq.8}",
    name:"图上 CDE",
    formula:"\\frac{\\partial X}{\\partial t} = \\mathrm{div}(D(X(t),t)\\odot\\nabla X(t)) + \\mathrm{div}(V(t)\\odot X(t))",
    desc:"论文 Eq.8 —— CDE 在图上的最终形式。\n第一项 = GRAND 的扩散（Eq.5）。\n第二项 = CDE 新加的对流项（Eq.9 展开）。\n这是 plug-in 设计的精髓：第一项可以是 LAP/GAT/TRANS/GraphBel 四种之一，第二项是 CDE 的全部贡献。\n论文 Table 4：四种 baseline 加 CDE 对流都能稳定提升。",
    role:"CDE 主方程（Eq.8）"
  },
  "Eq9Conv": {
    tex:"\\text{Eq.9}",
    name:"对流项展开",
    formula:"(\\mathrm{div}(V(t)\\odot X(t)))_i = \\textstyle\\sum_{j:(i,j)\\in E}V_{ij}(t)\\odot x_j(t)",
    desc:"论文 Eq.9 —— 对流项在节点 $i$ 处的展开式。\n直接读：节点 $i$ 收到的「对流贡献」是其所有邻居特征 $x_j$ 与对应边速度 $V_{ij}$ 的逐元素积之和。\n对比扩散项：$\\sum_j D_{ij}(x_j-x_i)$（特征差求和）vs $\\sum_j V_{ij}\\odot x_j$（特征本身加权和）。\n后者让信息可以「逆梯度」流动 —— 异质边上 $V_{ij}$ 大，可以反向重定向。\n⚠️ 论文 Appendix B 把这里写成 $V_{ij}\\odot x_i$（⊙ 自己），与主文 Eq.9 矛盾 —— 经查官方 code（function_laplacian_convection.py 第 81-82 行注释明示「v_ij elementwise product with x_j」），主文 Eq.9 是对的，Appendix B 是 typo。",
    role:"对流离散（Eq.9）"
  },
  "Eq10Velocity": {
    tex:"\\text{Eq.10}\\,\\bigstar",
    name:"速度的 learnable 公式 ★★",
    formula:"V_{ij}(t) = \\sigma\\bigl(W\\,(x_j(t) - x_i(t))\\bigr)",
    desc:"论文 Eq.10（Sec. 4.1，line 361-372）—— CDE method 的核心定义，paper 称之为「simple yet effective velocity formulation」。\n$W\\in\\mathbb R^{r\\times r}$ 是可学习矩阵，$\\sigma$ 是激活函数。\nPaper 原话解读（line 366-372）：\n  · $V_{ij}$ 决定从邻居 $j$ 到节点 $i$ 的「优先信息输运方向」\n  · $V$ 不一定与 $x_j-x_i$ 同向（line 368-369：「the velocity is not always in the same direction as the difference」），因 $W$ 与 $\\sigma$ 都可学\n  · 这种灵活性正是异质图所需的（line 370-372）\n参数效率：$W$ 只 $r^2$ 个参数就能控制 $|E|$ 条边的速度，不需要每边独立参数化。\n📌 Code 实际 vs Paper：\n  · Paper Eq.10 写一般 $\\sigma$；官方 code 实际是 $\\mathrm{ReLU}$（4 个 convection 文件统一）\n  · Code 写 $\\mathrm{ReLU}(W(x_i-x_j))$（方向反），但 $W$ 可学，效果等价于 paper 写法\n  · LapConv code 还多了个标量门控 $a_{ij}=\\tanh(\\mathrm{gate}([x_i\\|x_j]))$ 乘在 $V_{ij}\\odot x_j$ 之前（paper 没明写）\nplayground 用 random Gaussian $W$ + $\\sigma=\\tanh$ 作 toy seed；论文是端到端从分类 loss 反传梯度学。",
    role:"CDE 灵魂（Eq.10 ★★）"
  },
  "Eq11AttnTRANS": {
    tex:"\\text{Eq.11}",
    name:"GRAND-TRANS attention",
    formula:"a(x_i,x_j) = \\mathrm{softmax}\\!\\left(\\tfrac{(W_K x_i)^\\top W_Q x_j}{\\sqrt{d_k}}\\right)",
    desc:"论文 Eq.11 —— Transformer 风格的 scaled dot-product attention。\n$W_K, W_Q$ 可学习；$d_k$ 是 key/query 维度（超参）。\n四种 attention 之一（与 GAT、LAP、GraphBel 并列）。\nGRAND-TRANS + CDE 对流 = CDE-GRAND-TRANS（论文 Table 4）。",
    role:"Attention 变体"
  },
  "Eq12AttnGAT": {
    tex:"\\text{Eq.12}",
    name:"GRAND-GAT attention",
    formula:"a(x_i,x_j) = \\frac{\\exp(\\mathrm{LeakyReLU}(\\mathbf a^\\top[Wx_i\\|Wx_j]))}{\\sum_{k\\in\\mathcal N_i}\\exp(\\mathrm{LeakyReLU}(\\mathbf a^\\top[Wx_i\\|Wx_k]))}",
    desc:"论文 Eq.12 —— GAT 风格 attention（Veličković 2018）。\n$W, \\mathbf a$ 可学习；$\\|$ 是拼接。\n比 TRANS 更早（GAT 2018 vs Transformer-style 2021），效果在不同图上各有优劣。\nplayground 在 Tweaks 面板会让用户切换四种 attention 看 ACC 变化。",
    role:"Attention 变体"
  },

  // ─── Concept 层 ──────────────────────────────────────────────────
  "HeatDiffusion": {
    tex:"\\text{Heat}",
    name:"热扩散（概念）",
    formula:"\\partial x/\\partial t = \\mathrm{div}(D\\nabla x)",
    desc:"经典物理过程：浓度沿梯度均匀扩散，最终趋于平衡（一片均匀）。\n图 GNN 视角：信息在邻居间求平均 → 反复迭代 → 全图趋同。\n好处：在同质图上效果好（同类节点天然相似，平均后变得更相似）。\n坏处（paper line 41-44）：异质图上把跨类节点也平均了 → 类边界模糊 → 「fail to optimally utilize information」。\nCDE 的诊断：纯 heat 方程不够，需要加对流项 $-\\mathrm{div}(\\mathbf v x)$。",
    role:"baseline 物理"
  },
  "ConvectionDiffusion": {
    tex:"\\text{CDE}",
    name:"对流-扩散（概念）★",
    formula:"\\partial x/\\partial t = \\mathrm{div}(D\\nabla x) - \\mathrm{div}(\\mathbf v\\,x)",
    desc:"经典流体力学 —— 流体里同时有扩散（浓度梯度驱动）和对流（速度场驱动）。\n论文 Sec. 3.1 海洋类比（line 219-223）：海水中 $x$ 是热浓度，$\\mathbf v$ 是洋流。\nSec. 4 (line 325-340) 进一步类比：同质图像固体材料（粒子受连接束缚，热扩散主导），异质图像气/液材料（粒子运动自由，必须有对流项）。\nCDE GNN 把这套 PDE 搬到图上：扩散项处理同质邻居（信息聚合），对流项处理异质邻居（信息重定向）。\n比 heat 方程严格更一般 —— heat 是 $\\mathbf v=0$ 的特例。",
    role:"核心概念 ★"
  },
  "ODESolverEuler": {
    tex:"\\text{Euler}",
    name:"前向 Euler 求解",
    formula:"X(t+\\tau) = X(t) + \\tau\\,f(X(t))",
    desc:"最简单的显式 ODE 求解器：用当前点的导数做一步线性外推。\n步数 $L = T/\\tau$。\n论文 Table 2 主实验用 Euler（速度优先）；ablation Table 3 对比 RK4。\n精度 $O(\\tau)$，慢但稳定。",
    role:"求解器"
  },
  "ODESolverRK4": {
    tex:"\\text{RK4}",
    name:"Runge-Kutta 4 阶",
    formula:"X_{n+1} = X_n + \\tfrac{\\tau}{6}(k_1+2k_2+2k_3+k_4)",
    desc:"经典 4 阶龙格-库塔法，每步 4 次函数估值，精度 $O(\\tau^4)$。\nMinesweeper 上 RK4 比 Euler 显著更好（Table 3：93.05 vs 87.13 at T=1）。\n代价：每步 4 倍计算。\n论文主表用 Euler 是 trade-off（性能/速度）。",
    role:"求解器"
  },
  "Algorithm1": {
    tex:"\\text{Alg.1}",
    name:"Neural CDE Inference",
    formula:"",
    desc:"论文 Algorithm 1（4 行）：\n  1. raw 输入特征经 MLP 压缩 → $X(0)$\n  2. ODE solver 求解 Eq.8 → 得到 $X(t)$ for $t\\in[0,T]$\n  3. 取终态 $X(T)$\n  4. 通过分类头做节点分类（cross-entropy loss）\n训练：所有可学习参数（MLP、$W$ in Eq.10、attention 参数）端到端联合优化。",
    role:"算法"
  },

  // ─── Code-only 细节层 · paper 没明写但 code 里有的工程设计 ───────
  "AlphaBetaResidual": {
    tex:"\\alpha,\\,\\beta",
    name:"GRAND-style 残差 ODE · Residual ODE function",
    formula:"f(X) = \\alpha\\,(\\,\\mathrm{ax}-X\\,) + \\beta\\,X(0)",
    desc:"论文主文没明写，但官方 code 里 ODE function 不是直接 $dX/dt = \\mathrm{ax}$，而是 GRAND 风格的残差：\n  · $\\alpha = \\mathrm{sigmoid}(\\alpha_{\\mathrm{train}})$ —— 可学习标量，控制扩散+对流的整体步长\n  · $\\beta\\,X(0)$ —— optional source term，把初始态 $X(0)$ 作为持续注入项（防止 $X(t)$ 远离原始特征过远）\nCode (function_*_convection.py)：\n```\nf = alpha * (ax - x)\nif add_source:\n    f += beta_train * x_0\n```\n论文 Table 8 显示 hetero datasets 大部分启用 `add_source=True` —— 暗示这个残差项对异质性能贡献显著。",
    role:"ODE function 工程细节"
  },

  "OutputLowHigh": {
    tex:"W_{\\mathrm{low}},\\,W_{\\mathrm{high}}",
    name:"频谱解耦 · Spectral path split",
    formula:"\\mathrm{ax} = (\\,\\lambda_1\\cdot\\mathrm{ax}_{\\mathrm{conv}}\\,W_{\\mathrm{high}}\\,) + (\\,\\mathrm{ax}_{\\mathrm{diff}}\\,W_{\\mathrm{low}}\\,)",
    desc:"📌 论文完全没提，但 code 里**核心**的设计：扩散贡献和对流贡献走两条独立的输出投影路径。\n  · 扩散贡献 $\\mathrm{ax}_{\\mathrm{diff}}$ → $W_{\\mathrm{low}}$ 矩阵（保留低频）\n  · 对流贡献 $\\mathrm{ax}_{\\mathrm{conv}}$ → $W_{\\mathrm{high}}$ 矩阵（放大高频）\n  · GAT/Trans Conv 还多一个可学习标量 $\\lambda_1$ 控制对流整体强度（LapConv 没有）\n频谱视角：heat diffusion 是低通滤波器（让所有节点趋同），CDE 加的对流项相当于高通滤波器（保留差异）。两条路径独立学习能让模型自适应平衡同质与异质信号。\n这是为什么 CDE 能在完全同质的图上也不严重降低性能（论文 Sec. 5.3 提到 Cora/Pubmed 上 CDE-GRAND 与 GRAND 相当）：$W_{\\mathrm{high}}$ 可以学到接近零，让对流贡献不干扰扩散。",
    role:"频谱解耦"
  },

  "EdgeAttention1": {
    tex:"a_{ij}",
    name:"边标量门控 · Edge-scalar gate",
    formula:"a_{ij} = \\tanh\\bigl(\\,\\mathrm{gate}([x_i\\,\\|\\,x_j])\\,\\bigr)",
    desc:"📌 LapConv 独有，paper 没写：除 $V_{ij}\\in\\mathbb R^r$ 外，每条边还多一个标量门控 $a_{ij}\\in\\mathbb R$。\nCode (function_laplacian_convection.py 第 79-80 行)：\n```\nh2 = torch.cat([src, dst_k], dim=1)\nattention1 = torch.tanh(self.gate(h2)).squeeze()\n```\n实际对流贡献变成 $\\sum_{j\\in N(i)} a_{ij}\\cdot V_{ij}\\odot x_j$ 而非简单的 $\\sum V_{ij}\\odot x_j$。\n直觉：$a_{ij}$ 是 GAT-like 标量 attention，作用是「这条边到底在 convection 里要不要算」。如果 gate 学到把某些边的 $a_{ij}$ 推到 $\\pm 0$，等同于关掉这条边的 convection 贡献。\nGAT-Conv 和 Trans-Conv 不用这个，它们用各自 attention layer 的输出做扩散项 attention（不是对流门控）。",
    role:"工程细节（LapConv）"
  },

  "AppendixBTypo": {
    tex:"\\text{App.B}",
    name:"Appendix B 的 typo 警告",
    formula:"",
    desc:"⚠️ 阅读论文时容易踩的坑：\n论文主文 Eq.9：$(\\mathrm{div}(V\\odot X))_i = \\sum_{j\\in N(i)} V_{ij}\\odot x_j$（⊙ $x_j$）\nAppendix B 写：$\\partial_t x_i = \\sum a(x_i,x_j)(x_j-x_i) + \\sigma(W(x_j-x_i))\\odot x_i$（⊙ $x_i$）\n并配文字「we dot product this flow with $x_i$」。\n两者矛盾。哪个是对的？\n→ 看 code：`x_new = F.relu(W(x_i-x_j)) * dst_k`，且代码注释明示「v_ij elementwise product with $x_j$ in the paper」。\n→ 主文 Eq.9 是对的；**Appendix B 是 typo**（多处「x_i」应该是「x_j」）。\nplayground 按主文 Eq.9 实现。这是阅读 paper 时容易困惑的细节。",
    role:"Paper 注解"
  },

  "EarlyStopPath": {
    tex:"\\mathrm{Path\\text{-}best}",
    name:"⚠ 测试时路径选优 · Path-best test selection",
    formula:"\\hat y = f_{\\mathrm{cls}}\\bigl(X(t^{*})\\bigr),\\quad t^{*}=\\arg\\max_{t\\in[0,\\,3T]}\\;\\mathrm{ValAcc}(X(t))",
    desc:"⚠️ 这是 paper Sec. 5 完全没明说但 code 默认启用的「隐藏技巧」，对解读 Table 2 的 +20% 数字至关重要。\n📌 三层细节（来自 early_stop_solver.py + run_GNN_raw.py 第 167 行）：\n  ① 默认启用：`run_GNN_raw.py:167` 的 `model = GNNhe if no_early else GNNheter` —— 默认走 GNNheter（带 EarlyStopInt）；要关掉得显式 `--no_early`\n  ② 测试时 ODE 跑 3T 不是 T：`EarlyStopInt.t = [0, earlystopxT * T]`，`earlystopxT` 默认 3.0（line 291）。训练时 T=1.0，测试时 ODE 实际跑到 t=3.0，从更长路径上选\n  ③ 双层 best：`run_GNN_raw.py:201-206` —— epoch best vs ODE-path best 取较大值。前者跨 epoch 选最佳，后者单次 ODE forward 内跨 t 选最佳\n所以 paper Table 2 的 ACC 不是「X(T) endpoint 分类准确率」，而是「t∈[0, 3T] 路径上 val-best 时刻 t* 的 X(t*) 分类准确率」。\n这是合法的 model selection（用 val_mask 不是 test_mask 选 t*），但 paper 主文 Algorithm 1 写「step 3: return X(T)」误导读者以为是 endpoint。\n📌 Hetero datasets 的 best_params 没明确设 earlystopxT，意味着用默认 3.0；homo datasets（如 Pubmed）显式设 5.0。\nplayground 没实现这个机制（toy 太小不需要），但 popover 应让读者意识到 paper 数字的实际含义。",
    role:"Paper 隐藏技巧"
  },
};

// ─── RELATED · only symbols literally in each entry's Definition formula ──
const RELATED = {
  // 符号层
  G:           ["V","E","weight"],
  V:           ["N"],
  E:           ["V"],
  weight:      ["E"],
  N:           ["V"],
  r:           ["xi"],
  Xt:          ["N","r","Tint"],
  xi:          ["r","Xt"],
  partt:       [],
  nablaOp:     [],
  divOp:       [],
  gradX:       ["xi","Xt","E","Eq3Grad"],
  divX:        ["E","Eq4Div"],
  Dmatrix:     ["E"],
  Vij:         ["xi","sigma","Wmatrix","Eq10Velocity","r"],
  Vmatrix:     ["Vij","E"],
  hadamard:    [],
  Amatrix:     ["aij","xi","Xt"],
  aij:         ["xi","r"],
  Imatrix:     ["N"],
  sigma:       [],
  Wmatrix:     ["r"],
  Tint:        [],
  tau:         ["Tint"],
  yu:          [],

  // Definition 层
  hedge:       ["E","yu"],
  hadj:        ["hedge","E"],

  // Eq 层
  Eq1Heat:     ["partt","divOp","Dmatrix","nablaOp"],
  Eq2CDE:      ["partt","divOp","Dmatrix","nablaOp"],
  Eq3Grad:     ["xi","Xt","E","gradX"],
  Eq4Div:      ["divX","E"],
  Eq5GRAND:    ["Xt","Dmatrix","gradX","Amatrix","Imatrix","divOp","hadamard"],
  Eq8CDEGraph: ["partt","Xt","divOp","Dmatrix","gradX","Vmatrix","hadamard"],
  Eq9Conv:     ["divX","Vij","xi","E","hadamard"],
  Eq10Velocity:["Vij","sigma","Wmatrix","xi"],
  Eq11AttnTRANS:["aij","xi"],
  Eq12AttnGAT: ["aij","xi","Wmatrix"],

  // Concept 层
  HeatDiffusion:      ["partt","divOp","Dmatrix","nablaOp","Eq1Heat"],
  ConvectionDiffusion:["partt","divOp","Dmatrix","nablaOp","Vmatrix","Eq2CDE","Eq8CDEGraph"],
  ODESolverEuler:     ["Xt","tau","Tint"],
  ODESolverRK4:       ["Xt","tau"],
  Algorithm1:         ["Xt","Tint","Vij","Wmatrix","yu"],

  // Code-only 工程细节层
  AlphaBetaResidual:  ["Xt","Algorithm1","Eq8CDEGraph"],
  OutputLowHigh:      ["Eq8CDEGraph","Eq9Conv","Eq10Velocity"],
  EdgeAttention1:     ["xi","Vij","Eq9Conv"],
  AppendixBTypo:      ["Eq9Conv","Eq10Velocity","Vij"],
  EarlyStopPath:      ["Xt","Tint","Algorithm1","yu"],
};

// ---- KaTeX renderer ---------------------------------------------------
function Katex({ tex, display }) {
  const ref = useRefF(null);
  useEffectF(() => {
    const render = () => {
      if (window.katex && ref.current) {
        try {
          window.katex.render(tex, ref.current, {
            displayMode: !!display, throwOnError: false, strict: "ignore",
          });
        } catch (e) { ref.current.textContent = tex; }
      }
    };
    if (window.katex) render();
    else {
      const id = setInterval(()=>{ if (window.katex){ clearInterval(id); render(); } }, 50);
      return ()=>clearInterval(id);
    }
  }, [tex, display]);
  return <span ref={ref}/>;
}

// Parse "text with $x_i$ math $\\mathcal L$ inside" → mix of text + KaTeX.
function InlineMath({ text }) {
  const parts = [];
  const re = /\$([^$]+)\$/g;
  let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({t:"txt", v: text.slice(last, m.index)});
    parts.push({t:"tex", v: m[1]});
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({t:"txt", v: text.slice(last)});
  return <>
    {parts.map((p,i)=> p.t === "tex"
      ? <span key={i} style={{fontSize:"1.05em", color:"oklch(0.92 0.06 85)"}}>
          <Katex tex={p.v}/>
        </span>
      : <span key={i}>{p.v}</span>
    )}
  </>;
}

// Featured chips — DGAC's was DE (狄利克雷能量); CDE's is Eq.10 (the velocity formula
// — the entire paper's contribution in a single line)
const FEATURED_CHIPS = new Set(["Eq10Velocity"]);
// Warning chips — paper-vs-code discrepancies / typos / "be careful" notes
// rendered with an orange ⚠ style so readers don't miss the gotcha
const WARNING_CHIPS = new Set(["AppendixBTypo", "EarlyStopPath"]);
// Code-only chips — engineering details surfaced from official code, not in paper.
// Rendered with a subtle 📌 prefix in a slightly different palette.
const CODE_CHIPS    = new Set(["AlphaBetaResidual","OutputLowHigh","EdgeAttention1"]);

function SymChip({ id, onOpen }) {
  const e = GLOSSARY[id]; if (!e) return null;
  const featured = FEATURED_CHIPS.has(id);
  const warning  = WARNING_CHIPS.has(id);
  const codeOnly = CODE_CHIPS.has(id);
  // Palette per chip kind
  let baseBg = "#faf7f1", baseBorder = "#e3ddd2",
      hoverBg = "#fff", hoverBord = "#c8c1b4",
      labelColor = "#827d75",
      symColor = "#1b1a18", textColor = "#3d3a35",
      prefix = null, prefixColor = null,
      shadow = "none", weight = 400, titleSuffix = "";
  if (featured) {
    baseBg = "oklch(0.93 0.08 75)"; baseBorder = "oklch(0.70 0.14 70)";
    hoverBg = "oklch(0.96 0.1 75)"; hoverBord = "oklch(0.55 0.16 65)";
    labelColor = "oklch(0.42 0.12 65)"; textColor = "oklch(0.3 0.08 65)";
    symColor = "oklch(0.25 0.1 65)";
    prefix = "★"; prefixColor = "oklch(0.55 0.16 65)";
    shadow = "0 0 0 1px oklch(0.85 0.08 75 / 0.5)";
    weight = 600; titleSuffix = "（核心公式）";
  } else if (warning) {
    baseBg = "oklch(0.95 0.07 35)"; baseBorder = "oklch(0.65 0.16 35)";
    hoverBg = "oklch(0.97 0.09 35)"; hoverBord = "oklch(0.50 0.18 30)";
    labelColor = "oklch(0.40 0.13 30)"; textColor = "oklch(0.30 0.10 30)";
    symColor = "oklch(0.25 0.12 30)";
    prefix = "⚠"; prefixColor = "oklch(0.55 0.18 30)";
    shadow = "0 0 0 1px oklch(0.85 0.08 35 / 0.5)";
    weight = 600; titleSuffix = "（paper 注解）";
  } else if (codeOnly) {
    baseBg = "oklch(0.96 0.04 250)"; baseBorder = "oklch(0.72 0.10 245)";
    hoverBg = "oklch(0.98 0.06 250)"; hoverBord = "oklch(0.55 0.14 245)";
    labelColor = "oklch(0.42 0.10 245)"; textColor = "oklch(0.30 0.10 245)";
    symColor = "oklch(0.25 0.12 245)";
    prefix = "📌"; prefixColor = null;
    weight = 500; titleSuffix = "（code 工程细节）";
  }
  return (
    <button
      onClick={ev=>{ ev.stopPropagation(); onOpen(id, ev.currentTarget); }}
      style={{
        display:"inline-flex", alignItems:"center", gap:6,
        padding:"3px 10px 3px 9px",
        background: baseBg,
        border: `1px solid ${baseBorder}`,
        borderRadius:14, cursor:"pointer",
        fontFamily:"'Inter',sans-serif", fontSize:11,
        color: textColor,
        transition:"background .15s, border-color .15s",
        fontWeight: weight,
        boxShadow: shadow,
      }}
      onMouseEnter={ev=>{ ev.currentTarget.style.background=hoverBg; ev.currentTarget.style.borderColor=hoverBord; }}
      onMouseLeave={ev=>{ ev.currentTarget.style.background=baseBg; ev.currentTarget.style.borderColor=baseBorder; }}
      title={`${prefix?prefix+' ':''}${e.name}${titleSuffix}`}
    >
      {prefix && (
        <span style={{fontSize:10, color: prefixColor||"inherit", marginRight:-2}}>{prefix}</span>
      )}
      <span style={{fontSize:13.5, color: symColor}}><Katex tex={e.tex}/></span>
      <span style={{color: labelColor}}>{e.name.split(" · ")[0]}</span>
    </button>
  );
}

function Eq({ tex, hl }) {
  return (
    <div style={{
      fontSize: 17, padding:"10px 14px",
      background: hl ? "oklch(0.965 0.03 85)" : "#fdfaf3",
      borderRadius: 6, margin:"6px 0",
      border: hl ? "1px solid oklch(0.88 0.06 85)" : "1px solid transparent",
      overflowX:"auto",
      transition:"background .3s, border-color .3s",
    }}>
      <Katex tex={tex} display/>
    </div>
  );
}

function Block({ active, color, eyebrow, children, syms, onOpen, note }) {
  if (!active) return null;
  return (
    <div style={{
      borderLeft: `3px solid ${color}`,
      paddingLeft: 16, marginBottom: 22,
      animation: "fmlFade .35s ease",
    }}>
      <div style={{fontSize:10.5, color, letterSpacing:"0.14em", marginBottom:8, fontWeight:700,
        fontFamily:"'Inter',sans-serif"}}>{eyebrow}</div>
      {children}
      {note && <div style={{fontSize:12, color:"#827d75", marginTop:6, lineHeight:1.6}}>{note}</div>}
      {syms && syms.length>0 && (
        <div style={{display:"flex", flexWrap:"wrap", gap:6, marginTop:10}}>
          {syms.map(s => <SymChip key={s} id={s} onOpen={onOpen}/>)}
        </div>
      )}
    </div>
  );
}

function Popover({ id, anchor, onClose, onOpen }){
  const [expandedIds, setExpandedIds] = useStateF([]);
  const popRef = useRefF(null);
  const prevLenF = useRefF(0);
  useEffectF(() => { setExpandedIds([]); if (popRef.current) popRef.current.scrollTop = 0; prevLenF.current = 0; }, [id]);
  useEffectF(() => {
    if (expandedIds.length > prevLenF.current && popRef.current) {
      requestAnimationFrame(() => {
        if (!popRef.current) return;
        const blocks = popRef.current.querySelectorAll('[data-exp-block]');
        const newest = blocks[blocks.length - 1];
        if (newest) {
          popRef.current.scrollTo({
            top: Math.max(0, newest.offsetTop - 60),
            behavior: 'smooth'
          });
        }
      });
    }
    prevLenF.current = expandedIds.length;
  }, [expandedIds]);
  const toggleExp = (k) => setExpandedIds(prev => {
    const i = prev.indexOf(k);
    if (i === -1) return [...prev, k];
    return [...prev.slice(0, i), ...prev.slice(i + 1)];
  });
  const pushExp = (k) => setExpandedIds(prev => prev.includes(k) ? prev : [...prev, k]);
  const removeExp = (k) => setExpandedIds(prev => prev.filter(x => x !== k));
  if (!id || !anchor) return null;
  const e = GLOSSARY[id]; if (!e) return null;
  const r = anchor.getBoundingClientRect();
  const W = 380;
  const MARGIN = 12;
  const left = Math.min(window.innerWidth - W - MARGIN, Math.max(MARGIN, r.left - 10));
  const spaceBelow = window.innerHeight - r.bottom - MARGIN - 10;
  const spaceAbove = r.top - MARGIN - 10;
  let top, maxH;
  if (spaceBelow >= 280) { top = r.bottom + 10; maxH = spaceBelow; }
  else if (spaceAbove >= 280) { maxH = spaceAbove; top = r.top - maxH - 10; }
  else { top = MARGIN; maxH = window.innerHeight - 2 * MARGIN; }
  const parts = e.desc.split("\n");
  const [zh, en] = e.name.split(" · ");
  const content = (
    <div ref={popRef} onClick={ev=>ev.stopPropagation()}
      onWheel={ev => ev.stopPropagation()}
      style={{
        position:"fixed", left, top, width:W, zIndex:9999,
        maxHeight: maxH, overflowY:"auto", overscrollBehavior:"contain",
        background:"#1b1a18", color:"#fffdf7",
        borderRadius:12,
        boxShadow:"0 20px 48px -10px rgba(0,0,0,0.5), 0 2px 6px rgba(0,0,0,0.25)",
        border:"1px solid oklch(0.3 0.02 80)",
        fontFamily:"'Inter',sans-serif",
      }}>
      <div style={{padding:"18px 22px 14px", background:"oklch(0.18 0.01 80)",
        borderBottom:"1px solid oklch(0.28 0.02 80)"}}>
        <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:8}}>
          <div style={{fontSize:14, color:"#fffdf7", fontWeight:600, letterSpacing:"0.01em"}}>{zh}</div>
          <button onClick={onClose}
            style={{background:"transparent", border:"none", color:"#a8a194", cursor:"pointer",
              fontSize:20, lineHeight:1, padding:"0 2px"}}>×</button>
        </div>
        {en && <div style={{fontSize:10.5, color:"#a8a194", letterSpacing:"0.14em",
          textTransform:"uppercase", marginTop:4, fontFamily:"'JetBrains Mono',monospace"}}>{en}</div>}
        {e.role && (
          <div style={{display:"inline-block", marginTop:12, padding:"3px 10px",
            background:"oklch(0.28 0.04 85)", color:"oklch(0.9 0.08 85)",
            borderRadius:10, fontSize:10, letterSpacing:"0.06em",
            fontFamily:"'JetBrains Mono',monospace", textTransform:"uppercase"}}>
            {e.role}
          </div>
        )}
      </div>

      <div style={{padding:"18px 22px 16px", background:"oklch(0.215 0.012 80)",
        borderBottom:"1px solid oklch(0.28 0.02 80)"}}>
        <div style={{fontSize:10, color:"#827d75", letterSpacing:"0.18em", marginBottom:10,
          fontFamily:"'JetBrains Mono',monospace", textTransform:"uppercase"}}>Symbol</div>
        <div style={{fontSize:34, color:"oklch(0.94 0.1 85)", marginBottom:4, minHeight:42,
          display:"flex", alignItems:"center", justifyContent:"center", padding:"10px 0"}}>
          <Katex tex={e.tex} display/>
        </div>
        {e.formula && <>
          <div style={{fontSize:10, color:"#827d75", letterSpacing:"0.18em", marginTop:14, marginBottom:8,
            fontFamily:"'JetBrains Mono',monospace", textTransform:"uppercase"}}>Definition</div>
          <div style={{fontSize:15.5, color:"#f5f0e4", padding:"14px 14px",
            background:"oklch(0.14 0.008 80)", borderRadius:8,
            border:"1px solid oklch(0.28 0.02 80)", overflowX:"auto",
            display:"flex", alignItems:"center", justifyContent:"center", minHeight:48}}>
            <Katex tex={e.formula} display/>
          </div>
        </>}
      </div>

      <div style={{padding:"16px 22px 20px"}}>
        <div style={{fontSize:10, color:"#827d75", letterSpacing:"0.18em", marginBottom:10,
          fontFamily:"'JetBrains Mono',monospace", textTransform:"uppercase"}}>Description</div>
        <div style={{fontSize:12.5, lineHeight:1.8, color:"#e6dfce"}}>
          {parts.map((p,i)=>(
            <div key={i} style={{marginBottom:8}}>
              <InlineMath text={p}/>
            </div>
          ))}
        </div>
      </div>

      {(() => {
        const rels = (RELATED[id] || []).filter(k => GLOSSARY[k]);
        if (!rels.length) return null;
        return (
          <div style={{padding:"14px 22px 18px",
            borderTop:"1px solid oklch(0.28 0.02 80)",
            background:"oklch(0.16 0.008 80)"}}>
            <div style={{fontSize:10, color:"#827d75", letterSpacing:"0.18em", marginBottom:10,
              fontFamily:"'JetBrains Mono',monospace", textTransform:"uppercase"}}>Related · 继续追问</div>
            <div style={{display:"flex", flexWrap:"wrap", gap:8}}>
              {rels.map(k => {
                const rEntry = GLOSSARY[k];
                const zhName = (rEntry.name||"").split(" · ")[0];
                const isExp = expandedIds.includes(k);
                return (
                  <button key={k}
                    onClick={ev => { ev.stopPropagation(); toggleExp(k); }}
                    title={zhName}
                    style={{
                      cursor:"pointer", padding:"5px 12px",
                      background: isExp ? "oklch(0.36 0.06 85)" : "oklch(0.24 0.02 80)",
                      color:"oklch(0.94 0.1 85)",
                      border: isExp ? "1px solid oklch(0.58 0.1 85)" : "1px solid oklch(0.32 0.03 85)",
                      borderRadius:999, fontSize:13, lineHeight:1.2,
                      display:"inline-flex", alignItems:"center", gap:6,
                      transition:"all 0.12s",
                    }}>
                    <Katex tex={rEntry.tex} display={false}/>
                    <span style={{fontSize:10.5, color: isExp ? "oklch(0.9 0.1 85)" : "#a8a194",
                      fontFamily:"'Inter',sans-serif"}}>{zhName}</span>
                  </button>
                );
              })}
            </div>

            {expandedIds.map((eid, idx) => {
              const exp = GLOSSARY[eid];
              if (!exp) return null;
              const subRels = (RELATED[eid] || []).filter(k => GLOSSARY[k]);
              return (
                <div key={eid+'-'+idx} data-exp-block={eid}
                  style={{marginTop:idx===0?14:10, padding:"12px 14px 14px",
                  background:"oklch(0.12 0.008 80)", borderRadius:8,
                  border:"1px solid oklch(0.32 0.03 85)",
                  animation:"fmlFade 0.16s ease-out"}}>
                  <div style={{display:"flex", justifyContent:"space-between",
                    alignItems:"center", marginBottom:10, paddingBottom:8,
                    borderBottom:"1px dashed oklch(0.26 0.02 80)"}}>
                    <div style={{display:"flex", alignItems:"baseline", gap:8}}>
                      <span style={{fontSize:11, color:"#827d75",
                        fontFamily:"'JetBrains Mono',monospace"}}>{idx+1}.</span>
                      <span style={{fontSize:18, color:"oklch(0.94 0.1 85)"}}>
                        <Katex tex={exp.tex} display={false}/>
                      </span>
                      <span style={{fontSize:12, color:"#e6dfce", fontWeight:600}}>
                        {(exp.name||"").split(" · ")[0]}
                      </span>
                    </div>
                    <button onClick={ev => { ev.stopPropagation(); removeExp(eid); }}
                      style={{padding:"3px 8px", background:"transparent", color:"#a8a194",
                        border:"1px solid oklch(0.34 0.03 85)", borderRadius:6, fontSize:12,
                        cursor:"pointer", lineHeight:1}}
                      title="收起这一段">×</button>
                  </div>
                  {exp.formula && (
                    <div style={{fontSize:14.5, color:"#f5f0e4", padding:"10px 12px",
                      background:"oklch(0.09 0.008 80)", borderRadius:6, marginBottom:10,
                      overflowX:"auto", display:"flex", justifyContent:"center",
                      alignItems:"center", minHeight:40}}>
                      <Katex tex={exp.formula} display/>
                    </div>
                  )}
                  <div style={{fontSize:12, lineHeight:1.75, color:"#d4cbb8"}}>
                    {exp.desc.split("\n").map((p,i)=>(
                      <div key={i} style={{marginBottom:5}}>
                        <InlineMath text={p}/>
                      </div>
                    ))}
                  </div>
                  {subRels.length > 0 && (
                    <div style={{marginTop:12, paddingTop:10,
                      borderTop:"1px dashed oklch(0.26 0.02 80)"}}>
                      <div style={{fontSize:9.5, color:"#827d75", letterSpacing:"0.18em",
                        marginBottom:8, fontFamily:"'JetBrains Mono',monospace",
                        textTransform:"uppercase"}}>继续 → 追加到下方</div>
                      <div style={{display:"flex", flexWrap:"wrap", gap:6}}>
                        {subRels.map(k => {
                          const rEntry = GLOSSARY[k];
                          const zhName = (rEntry.name||"").split(" · ")[0];
                          const already = expandedIds.includes(k);
                          return (
                            <button key={k}
                              onClick={ev => { ev.stopPropagation(); pushExp(k); }}
                              title={already ? `${zhName}（已展开）` : zhName}
                              disabled={already}
                              style={{
                                cursor: already ? "default" : "pointer",
                                padding:"3px 9px",
                                background: already ? "oklch(0.22 0.03 85)" : "oklch(0.18 0.008 80)",
                                color: already ? "#827d75" : "#d4cbb8",
                                border: already ? "1px solid oklch(0.32 0.04 85)" : "1px solid oklch(0.28 0.02 80)",
                                borderRadius:999, fontSize:11.5,
                                display:"inline-flex", alignItems:"center", gap:4,
                                opacity: already ? 0.55 : 1, transition:"all 0.12s"}}>
                              <Katex tex={rEntry.tex} display={false}/>
                              <span style={{fontSize:9.5,
                                color: already ? "#6a655c" : "#a8a194"}}>{zhName}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })()}
    </div>
  );
  return ReactDOM.createPortal(content, document.body);
}

function FormulaPanel({ step, tweaks }) {
  const [pop, setPop] = useStateF({id:null, anchor:null});
  const open = (id, el) => setPop({id, anchor:el});
  const close = () => setPop({id:null, anchor:null});

  const id = step.id;
  // Color theme — diffusion blue / convection amber / fusion violet / output green / loss slate
  const A_DIFF = "oklch(0.55 0.13 250)";
  const A_CONV = "oklch(0.58 0.13 35)";
  const A_VEL  = "oklch(0.52 0.13 300)";
  const A_OUT  = "oklch(0.55 0.13 150)";
  const A_LOSS = "oklch(0.50 0.05 260)";

  return (
    <div onClick={close} style={{color:"#1b1a18"}}>
      <style>{`@keyframes fmlFade { from{opacity:0; transform:translateY(4px);} to{opacity:1; transform:none;} }`}</style>
      <div style={{fontSize:11, color:"#a8a194", marginBottom:14, fontStyle:"italic",
        paddingBottom:10, borderBottom:"1px dashed #e3ddd2",
        display:"flex", justifyContent:"space-between", alignItems:"baseline", gap:12}}>
        <span>当前步骤 · 点击符号查看定义</span>
        <span className="mono" style={{color:"#827d75", fontStyle:"normal"}}>
          step · <b style={{color:"#3d3a35"}}>{id}</b>
        </span>
      </div>

      {/* step 1: input — 带属性图 G + X(0) */}
      <Block active={id==="init"} color="#3d3a35" eyebrow="输入 · INPUT"
        onOpen={open} syms={["G","V","E","weight","N","r","Xt","xi","yu"]}>
        <Eq hl={id==="init"}
          tex="\mathcal G=(V,\,E,\,w),\quad X(0)\in\mathbb R^{N\times r}"/>
        <Eq hl={id==="init"}
          tex="x_i(t)\in\mathbb R^r,\;\; t\in[0,T]"/>
      </Block>

      {/* step 2: encode — 物理直觉 heat vs CDE */}
      <Block active={id==="intuition"} color={A_CONV} eyebrow="物理直觉 · HEAT vs CDE"
        onOpen={open} syms={["Eq1Heat","Eq2CDE","HeatDiffusion","ConvectionDiffusion","partt","divOp","nablaOp","Dmatrix","Vmatrix"]}
        note="一杯静水 vs 一条河 —— 同一滴墨水，纯扩散和扩散+对流两种命运。CDE 把河流物理学搬到图上。">
        <Eq hl={id==="intuition"}
          tex="\text{Eq.1 (heat)}:\;\;\frac{\partial x}{\partial t}=\mathrm{div}(D\nabla x)"/>
        <Eq hl={id==="intuition"}
          tex="\text{Eq.2 (CDE)}:\;\;\frac{\partial x}{\partial t}=\mathrm{div}(D\nabla x)-\mathrm{div}(\mathbf v\,x)"/>
      </Block>

      {/* step 3: topology — 图扩散项 GRAND */}
      <Block active={id==="diffusion"} color={A_DIFF} eyebrow="图上的扩散项 · DIFFUSION (GRAND)"
        onOpen={open} syms={["Eq3Grad","Eq4Div","Eq5GRAND","gradX","divX","Amatrix","aij","hadamard","Imatrix","Dmatrix"]}
        note="把连续 PDE 在图上离散：边上的「梯度」= 端点特征差，节点上的「散度」= 邻居求和。代入 heat 方程得 GRAND 动力学（已有的扩散类 GNN 全在此框架下）。">
        <Eq hl={id==="diffusion"}
          tex="(\nabla X)_{ij}=x_j-x_i\;\;\text{(Eq.3)},\quad (\mathrm{div}\,\mathcal X)_i=\textstyle\sum_{j\in N(i)}\mathcal X_{ij}\;\;\text{(Eq.4)}"/>
        <Eq hl={id==="diffusion"}
          tex="\frac{dX(t)}{dt}=\mathrm{div}\bigl(D(X(t),t)\odot\nabla X(t)\bigr)=(A(X(t))-I)\,X(t)\;\;\text{(Eq.5)}"/>
      </Block>

      {/* step 4: attribute — 图对流项（CDE 核心 ★） */}
      <Block active={id==="convection"} color={A_CONV} eyebrow="图上的对流项 · CONVECTION ★"
        onOpen={open} syms={["Eq8CDEGraph","Eq9Conv","Vij","Vmatrix","hadamard","divX","EdgeAttention1","AppendixBTypo"]}
        note="CDE 在 GRAND 之上加的全部贡献。每条边 (i,j) 配速度向量 V_ij ∈ ℝ^r；节点的对流贡献 = 邻居特征与边速度的逐元素积之和。">
        <Eq hl={id==="convection"}
          tex="\frac{\partial X}{\partial t}=\underbrace{\mathrm{div}(D\odot\nabla X)}_{\text{diffusion}}+\underbrace{\mathrm{div}(V\odot X)}_{\text{convection}}\;\;\text{(Eq.8)}"/>
        <Eq hl={id==="convection"}
          tex="\bigl(\mathrm{div}(V\odot X)\bigr)_i=\textstyle\sum_{j:(i,j)\in E}V_{ij}\odot x_j\;\;\text{(Eq.9)}"/>
      </Block>

      {/* step 5: fusion — Velocity learnable formula (Eq.10 ★★) */}
      <Block active={id==="velocity"} color={A_VEL} eyebrow="Velocity 公式 · VELOCITY (Eq.10) ★★"
        onOpen={open} syms={["Eq10Velocity","Vij","sigma","Wmatrix","xi","gradX","OutputLowHigh"]}
        note="全文最重要一公式：速度由特征差驱动。同质邻居 → V≈0 → 退回纯扩散；异质邻居 → V 显著 → 对流主导。W 和 σ 让模型自己学「该往哪流」。">
        <Eq hl={id==="velocity"}
          tex="V_{ij}(t)=\sigma\bigl(W\,(x_j(t)-x_i(t))\bigr)\;\;\text{(Eq.10)}"/>
      </Block>

      {/* step 6: kmeans — ODE solver */}
      <Block active={id==="ode"} color={A_OUT} eyebrow="ODE 求解 · ODE SOLVER"
        onOpen={open} syms={["Tint","tau","ODESolverEuler","ODESolverRK4","Algorithm1","Xt","AlphaBetaResidual","EarlyStopPath"]}
        note={`论文 T=1.0 已饱和，T=5.0 反而下降。RK4 在 Minesweeper 上比 Euler 显著好（Table 3：93.05 vs 87.13）。当前积分时间 T = ${tweaks.alpha.toFixed(2)}（playground 用 alpha 滑块代理）。`}>
        <Eq hl={id==="ode"}
          tex="X(t+\tau)=X(t)+\tau\,f(X(t)),\quad f(X)=\mathrm{div}(D\odot\nabla X)+\mathrm{div}(V\odot X)"/>
        <Eq hl={id==="ode"}
          tex="X(T)=X(0)+\int_0^T f(X(s))\,ds,\quad L=T/\tau\;\text{ steps}"/>
      </Block>

      {/* step 7: cprop — 节点分类输出 */}
      <Block active={id==="classify"} color={A_OUT} eyebrow="分类输出 · CLASSIFY"
        onOpen={open} syms={["Algorithm1","Xt","Tint","yu"]}
        note="Algorithm 1 step 3-4：取 ODE 解的终态 X(T) → MLP 分类头 → 半监督 cross-entropy 损失（仅在训练节点上累加）。所有可学参数（input MLP、ODE 内部 W/α/β、分类头）端到端联合优化。">
        <Eq hl={id==="classify"}
          tex="p_{i,c}=\mathrm{softmax}(\mathrm{MLP}(x_i(T)))_c,\quad \hat y_i=\arg\max_c\,p_{i,c}"/>
        <Eq hl={id==="classify"}
          tex="\mathcal L = -\sum_{i\in V_{\mathrm{train}}}\log p_{i,\,y_i}\quad\text{(半监督 cross-entropy)}"/>
      </Block>

      {/* step 8: loss — 异质 benchmark 表现 */}
      <Block active={id==="benchmark"} color={A_LOSS} eyebrow="异质图 · BENCHMARK"
        onOpen={open} syms={["hedge","hadj","yu","E","EarlyStopPath"]}
        note="先用 h_edge / h_adj 量化「异质性多强」（下方两式），再看 paper Table 2：在 h_adj 越低（异质性越强）的数据集上，CDE-GRAND 改进越大 — Roman-empire (h_adj=−0.05) +20pp, Minesweeper (0.01) +19pp, Wiki-cooc (−0.03) +6pp。详细 ACC 表与 Figure 1 复现见下方训练动力学面板 →">
        <Eq hl={id==="benchmark"}
          tex="h_{\mathrm{edge}}=\frac{|\{(u,v)\in E\,:\,y_u=y_v\}|}{|E|}\;\;\text{(Eq.6, Def.1)}"/>
        <Eq hl={id==="benchmark"}
          tex="h_{\mathrm{adj}}=\frac{h_{\mathrm{edge}}-\sum_k D_k^2/(2|E|)^2}{1-\sum_k D_k^2/(2|E|)^2}\;\;\text{(Eq.7, Def.2 — Platonov 2022)}"/>
      </Block>

      {/* step 9: output — Plug-in 哲学 */}
      <Block active={id==="plugin"} color={A_VEL} eyebrow="Plug-in 哲学 · PLUG-IN"
        onOpen={open} syms={["Amatrix","aij","Eq11AttnTRANS","Eq12AttnGAT","Vmatrix"]}
        note="CDE = (任何 diffusion baseline) + 对流项。论文 Table 4：四种 baseline (LAP/GAT/TRANS/GraphBel) + CDE 都稳定提升。计算成本只增加 ~10% 训练 / ~1% 推理（Table 5）。">
        <Eq hl={id==="plugin"}
          tex="\text{CDE-GRAND-TRANS}:\;\;a(x_i,x_j)=\mathrm{softmax}\!\bigl((W_K x_i)^\top W_Q x_j/\sqrt{d_k}\bigr)\;\;\text{(Eq.11)}"/>
        <Eq hl={id==="plugin"}
          tex="\text{CDE-GRAND-GAT}:\;\;a(x_i,x_j)=\frac{\exp(\mathrm{LeakyReLU}(\mathbf a^\top[Wx_i\|Wx_j]))}{\sum_k\exp(\dots)}\;\;\text{(Eq.12)}"/>
      </Block>

      <Popover id={pop.id} anchor={pop.anchor} onClose={close} onOpen={open}/>
    </div>
  );
}

window.FormulaPanel = FormulaPanel;
