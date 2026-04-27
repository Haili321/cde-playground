# CDE Paper-vs-Code Deep Reading Notes

> 这份笔记是 cde-playground 的 supplement，记录在「读完 paper 14 页 + 通读 23 个 official source 文件」过程中发现的 18 项 **paper 没明说但 code 里有** 的细节。
>
> Paper: [Graph Neural Convection-Diffusion with Heterophily, IJCAI 2023](https://arxiv.org/abs/2305.16780)
> Code: https://github.com/zknus/Graph-Diffusion-CDE
>
> 写作动机：playground 里只能给每个发现一个 popover 简介。这里给完整版本，便于审稿 / 综述写作 / debug 复现实验。

---

## 阅读覆盖

✅ **完全读完**（method 主干）：
- `function_laplacian_convection.py` ★（CDE-LAP 核心）
- `function_GAT_convection.py`、`function_transformer_convection.py`
- `function_beltrami_convection.py`、`function_beltramitrans_convection.py`
- `function_beltrami_gat.py`（发现 conv 被注释掉）
- 4 个 baseline diffusion 文件（无 conv）
- `GNN_he.py`、`GNN_heter.py`
- `base_classes.py`、`block_constant.py`、`block_transformer_attention.py`
- `model_configurations.py`、`run_GNN_raw.py`
- `early_stop_solver.py` ★
- `discrete_models.py`、`graphcon_models.py`
- `utils.py`、`data.py`、`heterophilic.py`
- `best_params.py`、`best_params_discrete.py`、`best_params_graphocn.py`

⚠️ 略读：`GNN_plot.py`（visualization helper，不影响 method）

---

## 18 项发现

按对 paper 数字解释的影响排序。⭐ 越多越关键。

### ⭐⭐⭐ 1. EarlyStopPath：测试时 ODE 跑 3T，路径选优 t*

**Paper Table 2 数字不是 X(T) endpoint ACC，是 t∈[0, 3T] 路径上 val-best 时刻 t* 的 ACC。**

三层细节：
1. **默认启用**：`run_GNN_raw.py:167`
   ```python
   model = GNNhe if opt["no_early"] else GNNheter
   ```
   默认 GNNheter（带 EarlyStopInt）；要关掉得显式 `--no_early`。
2. **测试 ODE 跑 3T**：`early_stop_solver.py:244` `self.t = [0, earlystopxT * t]`，`earlystopxT` 默认 3.0（`run_GNN_raw.py:291`）。
3. **双层 best**：`run_GNN_raw.py:201-206`
   ```python
   if model.odeblock.test_integrator.solver.best_val > val_acc:
       val_acc = solver.best_val; test_acc = solver.best_test
   ```
   epoch best vs ODE-path best 取较大值。

合法的 model selection（用 val_mask）但与 Algorithm 1 "step 3: return X(T)" 直观不符。

### ⭐⭐⭐ 2. OutputLowHigh：频谱解耦（paper 完全没写）

```python
# function_laplacian_convection.py:99
ax = mm(ax3, output_high) + mm(ax2, output_low)

# function_GAT_convection.py:111 / function_transformer_convection.py:106
ax = lamda1 * mm(ax3, output_high) + mm(ax2, output_low)
```

- 扩散贡献 `ax2` → `output_low` 矩阵（低频路径）
- 对流贡献 `ax3` → `output_high` 矩阵（高频路径）
- GAT/Trans-Conv 多一个可学习 `lamda1` 控制对流整体强度

频谱视角：heat = low-pass，convection = high-pass。两条路径独立学习能让模型自适应平衡同质 vs 异质信号。**这是 CDE 在同质图（Cora/Pubmed）上不显著降低性能的真正原因** —— `output_high` 可学到接近零，让 conv 不干扰。

### ⭐⭐ 3. AppendixBTypo：Eq.9 vs Appendix B 矛盾

- **主文 Eq.9**: `(div(V⊙X))_i = Σ V_ij ⊙ x_j`（⊙ x_j）
- **Appendix B**: `Σ σ(W(x_j-x_i)) ⊙ x_i`（⊙ x_i）+ 文字 "we dot product this flow with x_i"

Code 决定权威：
```python
# function_laplacian_convection.py:81-82
x_new = F.relu(torch.mm(src - dst_k, self.weight_mlp)) * dst_k
# x_new is v_ij elementwise product with x_j in the paper
```
→ **主文 Eq.9 对，Appendix B 是 typo**。

### ⭐⭐ 4. AlphaBetaResidual：GRAND-style 残差 ODE function

```python
ax = relu(lin2(cat([x, ax])))     # concat-linear residual
alpha = sigmoid(alpha_train)       # learnable α
f = alpha * (ax - x)               # residual
if add_source: f += beta_train * x_0  # optional source term
```

ODE function 不是直接 `dX/dt = ax`，而是 `dX/dt = α·(ax - X) + β·X(0)`。Paper Algorithm 1 没明写。`best_params.py` 显示 hetero datasets 几乎全用 `add_source=True`。

### ⭐⭐ 5. Eq.10 实际形式与 paper 写法的 4 处差异

| | Paper Eq.10 | Code（4 个 conv 文件） |
|---|---|---|
| σ | 一般激活 | `F.relu` |
| 方向 | `(x_j - x_i)` | `(src - dst_k) = (x_i - x_j)` |
| LapConv 额外 | — | `attention1 = tanh(gate([x_i\|\|x_j]))` 标量门控 |
| W | 单一矩阵 | `weight_mlp` 加 `weight_low/weight_high` 在某些 Beltrami 变体 |

W 可学，方向反等价；但「σ 具体是 ReLU」和「LapConv 多一个标量门控」paper 没明说。

### ⭐ 6. Random Walk vs GCN normalization（hyperparameter）

`utils.py`：
- `get_rw_adj`: `deg.pow_(-1)` → `D⁻¹·A`（row-wise，不对称）
- `gcn_norm_fill_val`: `deg.pow_(-0.5)` → `D⁻¹/²·A·D⁻¹/²`（对称）

`best_params.py` `data_norm`：hetero datasets 多用 `'rw'`，homo 多用 `'gcn'`。Paper Sec. C 一笔带过。

### ⭐ 7. squareplus 替代 softmax

`utils.py:179-208`：
```python
out = (out + sqrt(out² + 4)) / 2
return out / (out_sum + 1e-16)
```

Paper Eq.11 写 `softmax(...)`，best_params 多数 `'square_plus': True` 时实际用 squareplus。Twitter @jon_barron 的提议，比 softmax 数值稳定。

### ⭐ 8. GNN_he vs GNN_heter 功能差异显著

`GNN_heter.py` 比 `GNN_he.py` 多支持：
- **Beltrami mode**: features `mx(x)` cat positional encoding `mp(p)`
- **augment**: feature 维度 0-padding 一倍（稳定 ODE）
- **use_labels**: 输入 x 末尾包含 one-hot label
- **forward_encoder / forward_ODE 拆分**：便于局部 ablation
- **EarlyStopInt 自定义 test integrator**

`run_GNN_raw.py:167` 默认 GNNheter。

### ⭐ 9. AttODEblock vs ConstantODEblock：attention 一次算 vs 每 step 重算

- `block_transformer_attention.py:38` `AttODEblock`：在 ODE forward 之前**一次性**计算 attention，整个 ODE forward 用固定 attention
- `block_constant.py` + GAT-Conv/Trans-Conv 的 forward：每个 ODE step 都重新计算 attention（time-varying）

Paper Eq.5 写 `dX/dt = (A(X(t)) - I)X` 暗示 A 是 X(t) 的函数（time-varying），但 AttODEblock 实际只在 t=0 算一次。两种 design choice 的 trade-off paper 没解释。

### 6. 4 个 Beltrami 变体里 3 个的 convection 实际被注释掉

文件审查结果：
- `function_beltrami_van.py` (`ODEFuncBektramiAtt`): pure Beltrami，本来就无 conv（vanilla baseline）
- `function_beltrami_trans.py` (`ODEFuncBektramiAtt` 同名类): forward 中 conv 部分**全注释掉**（line 100-111），但 `__init__` 里还**定义了** weight_mlp / output_low/high / gate / lin2 等参数
- `function_beltrami_gat.py` (`ODEFuncBeltramiGAT`): 同样 conv 部分**全注释掉**
- `function_beltrami_convection.py` (`ODEFuncBeltramiCONV`): **真正的 CDE-Beltrami**（GAT-style attention 内层）
- `function_beltramitrans_convection.py` (`ODEFuncBeltramiTRANSCONV`): **真正的 CDE-Beltrami-Trans**

含义：paper Table 4 的 `CDE-GraphBel` 实际指 `belconv` (`function_beltrami_convection.py`)，与 `belgat` 的命名暗示不一致。`belgat` 是历史遗留 dead code。

### 7. discrete_models.py：σ=tanh 不是 ReLU

`discrete_models.py:178`：
```python
x_new = torch.tanh(torch.mm(src - dst_k, self.weight_mlp)) * dst_k
```

ODE 版（`function_*_convection.py`）全部用 `F.relu`。**同一篇 paper 的两个 variant 用不同激活**，paper 没解释。

discrete 版另有：
- 每层独立 `epsilons[i]`（GraphCON-style residual：`X * (1 + tanh(ε)) + dt·ax`）
- 每层独立 `lamda[i]` 是**逐 dim 的向量**（不是 scalar），tile 到 N×r —— 比 GAT-Conv 的 `lamda1` 单 scalar 复杂

### 8. 4 个 conv 文件的实现差异比 paper 暗示的大

| 文件 | attention1 | lamda1 | lin2 后 ReLU | 扩散项 attention |
|---|---|---|---|---|
| LapConv | ✓ tanh(gate) | ✗ | ✗ | TransAttention 简化版 |
| GATConv | ✗ | ✓ | ✓ | GAT (Wx, leakyrelu) |
| TransConv | ✗ | ✓ | ✓ | Transformer (KQV) |
| BeltramiConv | ✗（注释掉） | ✗ | ✗ | Beltrami / mean curvature |

不一致超过 paper 文字暗示。LapConv 是最特殊的。

### 9. "Plug-in" 哲学的精确语义

`function_laplacian_diffusion.py` (LaplacianODEFunc, baseline) **才 60 行**：
```python
def forward(self, t, x):
    ax = self.sparse_multiply(x)
    alpha = torch.sigmoid(self.alpha_train)
    f = alpha * (ax - x)
    if add_source: f += beta_train * x_0
    return f
```

`function_laplacian_convection.py` (CDE-LAP) **超过 200 行**：上面这一切 + weight_mlp + output_low/high + gate (attention1) + lin2 concat + bn 等。

CDE 不是字面"baseline + 一项"，是**复用 attention type 但 ODE function 整体重写**。

### 10. GraphCON_GCN_conv：二阶 ODE + CDE conv 混合

`graphcon_models.py:300+`：
```python
Y = Y + dt * (act(conv(X) + res(X)) - α·Y - γ·X)   # 加速度
X = X + dt * (Y + lamda1 * ax3)                     # 位置 = 速度 + conv 贡献
```

二阶动力学（GraphCON 风格 Rusch 2022），加上 CDE 对流项。**Paper Table 4 没列**，是 supplementary D 实验。

### 11. 数据集 split 多种但默认用 GeomGCN fixed splits

`heterophilic.py`：
- `generate_random_splits`: 60/20/20 random（paper 主表用此）
- `get_fixed_splits`: GeomGCN fixed splits（hetero benchmarks 默认）
- `random_disassortative_splits`: Pei 2019
- `Planetoid2`: 自定义 Planetoid loader

Paper Sec. 5.2 提到「fixed data splitting from Pei 2019」，code 默认走 GeomGCN fixed splits，与论文表述基本一致。

### 12. Hetero benchmarks 来源：Platonov 2023

`data.py:194`：
```python
elif ds in ['wiki-cooc', 'roman-empire', 'amazon-ratings',
            'minesweeper', 'workers', 'questions']:
    data = np.load(f'../HeterophilousDatasets/data/{ds}.npz')
```

6 个新 hetero benchmarks 直接从 `.npz` 文件加载（features / labels / edges / 10-split masks）。来源是 Platonov 2023 ([arXiv:2302.11640](https://arxiv.org/abs/2302.11640))。

### 13. ODE solver 默认 dopri5（自适应），实际表现 = Euler

`run_GNN_raw.py:273`：default method is `dopri5` (paper Algorithm 1 也写 RK4/Euler/dopri5)。但 `best_params.py` hetero datasets 显式 `'method': 'euler'`。

含义：paper Table 3 ablation T 时用的是 Euler；hetero benchmarks Table 2 也是 Euler。Dopri5 是 default but 实际 hetero 不用。

### 14. label_rate 在 hetero 实验里通常是 0.5

`run_GNN_raw.py:235` `label_rate` default 0.5，但 hetero datasets 实际用 60/20/20 split（即 60% train mask），label_rate 没生效。这个参数主要给 `--use_labels` 用。

### 15. self_loop_weight 几乎全 1

`best_params.py` 几乎所有数据集 `'self_loop_weight': 1`，少数（如 Computers）用 `1.7`。每个 attention layer 还会显式 `add_remaining_self_loops`，所以图实际是带自环的。

### 16. attention_norm_idx：行 vs 列归一化

`best_params.py` 多数 `'attention_norm_idx': 1`（按列归一化），但有些（如 Photo）用 0（按行）。影响 attention 矩阵是 right-stochastic vs left-stochastic。Paper 没讨论这个选择。

### 17. tol_scale 数量级巨大（dopri5 误差控制）

`best_params.py` `'tol_scale'` 从 1.0 到 ~10000 不等。`atol = tol_scale * 1e-7`, `rtol = tol_scale * 1e-9`（base_classes.py:38）。tol_scale=10000 意味着 atol=1e-3, rtol=1e-5 —— 相当宽松，实际让 dopri5 自适应步长接近 Euler 行为。

### 18. opt 默认值经常被 best_params 覆盖

`run_GNN_raw.py:148` `opt = {**cmd_opt, **best_opt}` —— best_params 覆盖 cmd args（除非显式 `merge_cmd_args` 会反向覆盖）。读 paper 时不要从 argparse defaults 推断实际超参，看 best_params 才准。

---

## 实验 reproduction 检查清单

按这份笔记重现 paper 的 Table 2 数字时：
- ✓ 使用 `GNNheter`（默认）— `EarlyStopInt` 启用
- ✓ 测试时 ODE 跑 `earlystopxT * T` = 3T（默认）
- ✓ 路径选优 + 双层 best
- ✓ method = `euler`（best_params 强制）
- ✓ data_norm = `rw`（hetero）or `gcn`（minesweeper 等）
- ✓ self_loop_weight = 1
- ✓ add_source = True（hetero datasets）
- ✓ 60/20/20 split + 10 random seeds 平均

去掉 EarlyStopInt（用 `--no_early` 的 `GNNhe`）应能复现一个**更低**的数字 —— 但 paper 没报这个 ablation。

---

## 给 reviewer / 读者的建议

读 paper 时：
- **不要从 Algorithm 1 推断 endpoint ACC** —— 默认行为是 path-best at 3T
- **不要从 Eq.10 推断 σ 是任意激活** —— code 是 ReLU
- **不要从 Eq.5 推断 D 是 time-varying** —— 取决于 block (constant vs attention)
- **不要忽略 Appendix B 的 ⊙x_i** —— 与主文 Eq.9 矛盾，code 决定主文对
- **不要从 plug-in 描述推断架构** —— 实际是重新实现整个 ODE function + 频谱解耦

---

*由 cde-playground 项目深读 paper + code 整理. Apr 2026.*
