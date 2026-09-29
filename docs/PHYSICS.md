v1.47：背景时钟恢复 1.0、60 Hz 有限水深积分、128 方向并行动态漫反射；时间频谱、静置录像、完整 Benchmark 与未达标项见 [ACCEPTANCE-v1.47.md](ACCEPTANCE-v1.47.md)。

v1.45：背景局部压力包改为整个湿域的带限随机压力，空间波纹更细、背景时钟放慢；120 秒细波持续，实测 42.78fps。墙面强变化改善但未完整通过“爆闪消失”验收；机制、原始数据及未达标项见 [ACCEPTANCE-v1.45.md](ACCEPTANCE-v1.45.md)。

v1.44：背景传播已替换为湿域无通量图上的有限水深算子 `sqrt(L)tanh(H sqrt(L))`，保留耗散，以匹配色散时间尺度的随机压力持续补给细波。身体／离散脚步求解器和光传输不变。均匀水深、网格与多项式近似边界及实测见 [ACCEPTANCE-v1.44.md](ACCEPTANCE-v1.44.md)；下方浅水背景描述保留为历史。

v1.38：相接共面拱门体块的照明重建跨chart连续寻址，消除柱子中央竖向明暗接缝；水、材质与原滤波宽度未改。多角度对照、数值极限检查及性能见 [ACCEPTANCE-v1.38.md](ACCEPTANCE-v1.38.md)。

v1.37：背景与脚步冲击范围缩短，空间频率分别提高约28%/23%；保持离散脚步与平静背景。录像、频谱、性能与解析边界见 [ACCEPTANCE-v1.37.md](ACCEPTANCE-v1.37.md)。

v1.36：删除持续宽弓浪压力，加入真实步程触发的弹道回落冲量；前方碎波、录像、性能与未解析飞沫近似见 [ACCEPTANCE-v1.36.md](ACCEPTANCE-v1.36.md)。

前向弓浪更新：保留紧凑脚步压力，重新标定身体前后压力，默认视角的前方法线 RMS 提至 4.650°。实现、录像、速度范围和近似见 [ACCEPTANCE-forward.md](ACCEPTANCE-forward.md)。

v1.35：ESC 取消渲染调度并暂停模拟时钟，保留最后帧；恢复首帧使用原时间。水波与光传输不变。硬件占用、连续帧和性能见 [ACCEPTANCE-v1.35.md](ACCEPTANCE-v1.35.md)。

v1.33 当前更新：脚步压力移至真实时间的有限水深身体求解器，重新标定受力范围与强度；背景幅度 0.018，默认 18.3°/24mm。录像、性能与内部墙体边界的新增折扣见 [ACCEPTANCE-v1.33.md](ACCEPTANCE-v1.33.md)。以下为历史记录。

v1.32 当前更新：近身压力足迹半径改为 0.36/0.25m，默认相机向下 40°、14mm，使第一人称能看到真实弓浪。背景波速不变；数据、录像及视角取舍见 [ACCEPTANCE-v1.32.md](ACCEPTANCE-v1.32.md)。以下为历史记录。

v1.31 定位并修复池底规则细网：折射天光的有限水面采样单元改为按投影足迹重建，水波与太阳焦散保持原实现。A/B、频谱、录像和限制见 [ACCEPTANCE-v1.31.md](ACCEPTANCE-v1.31.md)。

v1.16 回退后的专项调整：背景模拟时间倍率0.28；普通行走身体压力增强，快走与站立保持原标定。数据与录像见 [ACCEPTANCE-v1.16-tuning.md](ACCEPTANCE-v1.16-tuning.md)。以下保留原v1.16记录。

# v1.16：身体扰动的有限水深色散尾迹

旧版等效排水势驱动浅水恢复项，重力波没有完整色散，主要生成径向/近横向波列。v1.16 移除旧的径向身体驱动，新增 `body-waves.js/.wgsl`：身体扰动是有高度、垂直速度记忆的线性有限水深重力—毛细波初值问题。背景与脚步继续使用 v1.14 的非线性高度场，见 [v1.15 方法存档](PHYSICS-v1.15.md)。

## 演化与近身压力

每个波数的状态为复数高度 η̂ 和复数速度 v̂：

```
ω²(k) = (9.81 k + 0.000073 k³) tanh(k D)
η̂_tt + ω² η̂ = ω² b̂
```

当前水深 D 直接进入色散关系。身体的等效平衡位移势 b 是局部高斯占位项（半径 0.24m）和随速度平方增强的前后压力偶极子（半径 0.17m、沿行走方向求导）。强度 A=min(0.10m,0.24D)，占位系数 0.30，偶极系数 0.24，导数长度 0.20m。等效受力中心位于 `body.position + 0.225s * body.velocity`，最高水中速度时领先 0.36m；这是软身体压力的标定，不是宣称解出了刚性圆柱表面压力分布。该标定修正初版波峰落在圆柱后半部的问题。

b̂ 使用局部高斯压力的解析 Fourier 变换，含身体平移的相位。它不是解析尾迹、指定 V 形、指定角度或按时间播放波纹。V 形区域、波列、身后低谷来自受迫色散演化；停止后压力恢复静止占位，已生成的高度与速度继续演化。**谱基底中的正弦/余弦是 FFT 和线性振子积分，不是回退到预设几条正弦波的水面动画。**

每显示帧直接积分真实经过的时间，源在 ≤1/240s 的内部积分步中按运动轨迹取中点，振子在该步作精确常力积分。高度与速度以 `exp[-dt*(0.035+0.0007k²)]` 衰减，最短可解析波耗散更强。启动时初始化为身体已占位的平衡状态，不人为激起一次“身体掉入水中”的圆环。没有冻结相位，没有历史图像混合。站定时仍持续占位；脚步小压力包仍由真实碰撞后步程触发。

## 离散、边界与预算

- 256×512、12.5cm 网格，计算域 32×64m，池子本身 14×27m。每帧两次二维 FFT，共 34 个蝶形 pass，加演化和吸收共 36 passes。新状态存储约 4MiB。
- 外围 5m 渐增吸收带、8/s 最大吸收，位于池子边界之外；FFT 周期接缝在更远处。它减少绕回，不把空间循环直接暴露为池中重复纹理。没有声称这是物理反射池壁。
- Nyquist 行/列清零：该离散极限无法表示任意平移的实数波形。不是模糊画面。空间输出使用 C1 三次插值，再进入已有共享水面系数。
- 背景/脚步原 448×864、360Hz 非线性求解器及其真实几何无通量边界保留。组合高度与导数供全部水面求交、反射、折射和实时光子读取；墙与池底没有额外尾迹图案。光子时钟与水面时钟相同。
- 阳光 147456 包/帧、天光 524288 包/帧、间接传播 4 次、相机确定性分支、正常胶片颗粒 0.004 均未削减。未引入位图输入。
- W/方向键水中慢走 0.8m/s，Shift 快走 1.6m/s；保持此前水中速度上限，干地规则不变。V 为固定高位旁观相机，玩家独立运动。

有限水深色散及不同条件下的尾迹形式参考 [Journal of Fluid Mechanics: Asymmetrical wakes over anisotropic bathymetries](https://www.cambridge.org/core/journals/journal-of-fluid-mechanics/article/asymmetrical-wakes-over-anisotropic-bathymetries/3E0119AD7971516E0831851507EFDA10)。经典 19.47° 并非任意有限水深、速度下的通用夹角，参见 [Pethiyagoda 等：What is the apparent angle of a Kelvin ship wave pattern?](https://arxiv.org/abs/1405.2500)。代码没有硬编码 Kelvin 角度。

## 明确的折扣

1. **线性等效压力身体波，不是完整人体/圆柱流固耦合。** 没有求水平速度、涡量、湍流、真实脱落尾涡、飞沫或破浪；实现的是弓形水脊、后斜波臂、凹陷及波动合拢。第 3 条若要求真实旋转尾涡，则没有做到。
2. **身体色散分量与背景非线性分量是线性组合。** 背景各尺度仍相互调制，但身体波没有反向改变背景 PDE 的传播刚度，不能宣称整个新组合是完全耦合的非线性流体。
3. **新增身体分量没有解内部池壁/柱体的反射边界**：干单元不显示水，但谱传播并不认识内部障碍，存在透过内部墙体的非局部响应。背景和脚步仍使用原无通量边界。靠内部墙体转弯、复杂狭窄通道中的尾迹不算完成了物理验收。
4. 当前身体网格可靠细节约 0.5m；毫米毛细波未解析。慢走尾迹更弱，仍可能看见物理波列中的横向分量，不能声称任意速度都只剩两根干净的 V 线。
5. 当前浅池不硬锁 19.5°；速度/水深改变角度和波谱。未穷举极浅水、长时间反复急转和所有设备。相机/焦散原有离散采样限制见旧文档。


## v1.39：跨体块的共享照明接收域

相接共面同材质面由几何连通关系合并为共同的世界坐标格；拱洞立壁和半圆弧使用连续弧长展开格。光子记录与相机查询、天光积分及漫反射探针都使用共同坐标。Surface 描述符从32变为64字节，新增域边界与拓扑标志。网格内部不再存在独立体块的边缘夹取；真实转角仍分开计算入射照度。原有重建模板未加宽。孔洞覆盖率和无效探针掩码防止共享矩形外包围域填出虚构表面。

这取代 v1.38 仅等尺寸拱门正背面可相邻寻址的限制，支持不同尺寸共面矩形的 T 形连接。共享外包围矩形增加掩码空槽存储，详见 [v1.39 验收](ACCEPTANCE-v1.39.md)。不是任意曲面网格展开算法，也没有消除真实折角的方向性照明差异。


## v1.40：镜面路径不随相机距离关闭

主相机釉面反射不再乘 `1-smoothstep(3,5,h.t)`，也不在该权重接近零时跳过射线；远处仍以真实法线/Fresnel权重追踪场景。材质LOD和有界反射空间滤波不变。粗糙环境剩余项 `photons.rgb*coat*.08` 仍是照度近似，并非完整GGX多次镜面路径积分。原3–5m消失来自明确的镜面路径门控，不是该近似或滤波的作用范围。证据及性能代价见 [v1.40验收](ACCEPTANCE-v1.40.md)。


## v1.41：法线矩与粗糙镜面求积

主相机瓷砖法线不再在3–5m被距离LOD清零；在由相机与入射角估计的像素足迹中作四点斜率积分。均值决定解析法线，斜率方差和进入 `r_eff^4=r_base^4+Var(s_u)+Var(s_v)`，采用各向同性GGX核心宽度矩匹配，上限1。这是有限足迹/有限采样近似，尤其窄倒角和大掠射角不是精确积分；没有声称无界GGX分布存在有限全局方差。

不透明主表面反射每个相机子样本追踪八个确定性GGX方向（通常两子样本共十六个方向），使用Fresnel、Smith和NDF采样的PDF权重。瓷砖反射不再以单中心射线加1.1像素空间滤波模拟粗糙度；旧空间滤波对该分支旁路，水面分支不变。次级材质近似和小照度项仍在，并非无限次镜面路径追踪。质量与动态分辨率性能限制见 [v1.41验收](ACCEPTANCE-v1.41.md)。


## v1.42后续：正式提高静态光传输预算

缓存光子每批196608、正常场景128批；面积天光16×16=256点，积分归一化同步更新。每帧实时太阳147456包、天光524288包、4轮间接传播、原接收格与相机预算未变。这是采样精度提升，不是照明能量倍乘。背景水的120秒消融确认显式耗散消耗短波，而现有持续随机压力几乎只补长波；有限水深传播尚未替换浅水背景算子。外力能量预算候选只留在实验脚本，正式波场和脚步未改。详见 [后续机制报告](ACCEPTANCE-v1.42-followup.md)。

## v1.43：实时水光的有限太阳圆盘

实时太阳水光从单方向改为与缓存一致的0.00465rad角半径，四个对称角度节点由相邻水面采样点配对积分，每点两条相反光线，功率各半。太阳光包294912/帧，天光仍524288/帧。光通量整数记录由24位小数改为30位小数，避免弱反射光包细分后向下量化损失；缓冲尺寸不变。没有改变水面、材质、接收网格及重建核。墙面接收格加密和光源消融表明，已复现区域的强明暗主要来自当前波面聚焦；这次修正仅使角度积分更准确，没有解决背景水波模型的全部真实感问题。测量、性能波动及录像见 [v1.43报告](ACCEPTANCE-v1.43.md)。

### v1.53: energy partition audit

Cached mean-water indirect transport excludes the first solid deposition after water when no diffuse bounce has yet occurred. Runtime `W` supplies that class; the diffuse solver supplies `sum(T^k (W-Wflat), k=1..4)`. Thus the composition is `C + W + delta`, not `C + W + T(W)`.

The flat reference previously changed emission quadrature as well as geometry: its wave envelope uniform had not been initialized, and zeroing wave amplitude changed the projected aperture padding. It now shares the runtime envelope and amplitude; `sampling.w=1` flattens geometry alone. In the zero-wave, body-free GPU fixture, `W-Wflat` and every propagated increment are exactly zero. This removes quadrature mismatch without changing attenuation, filtering or live reflected packets.

Primary GGX continuation already integrates indirect reflected radiance. The old `photons * coat * .08` terminal approximation is now restricted to hits without that continuation (secondary hits and untraced tiny coats), eliminating primary overlap. Secondary rough reflection remains an approximation.

The audit integrates each unique receiver cell once, using physical covered area. These are receiver-event irradiance integrals, not emitted watts: summing multiple diffuse events is not itself an energy violation. The separate full-indirect photon reference includes the omitted first-water class; only its `fine0` is the reference, never its deliberately redundant diagnostic `combined` buffer. Reference reconstruction, finite sampling, transport classes and bounce truncation differ from runtime, so agreement is a consistency check, not proof of exact conservation or of every local value. Evidence: `../workroom-v1.53-evidence/energy-summary.json`.


完整反射＋透射上的面积积分与天花板GGX求积修复，见 [本轮诊断](EXPERIMENT-full-light-v159.md)。性能按用户要求待独占GPU时补测，未用重放速度代替帧率。
