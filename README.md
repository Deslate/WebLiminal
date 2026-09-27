# Poolrooms v1.15

本机浏览器单页体验：有状态的非线性波场模拟、身体持续排水、行走产生尾迹与传播涟漪、运行时光子焦散、停止后的照明细化，以及近景有深度的程序瓷砖、釉面房间反射。WebGPU + 原生 JavaScript + Vite，无运行时第三方依赖，无位图资源。

```sh
npm install
npm run dev -- --port 4173
```

打开 http://127.0.0.1:4173/ 。需要支持 WebGPU 的桌面浏览器。WASD / 方向键行走，拖动画面转头，水中1.6m/s趟水（Shift仅在干地加速），V切换固定旁观机位，M 静音；声音须先有用户手势。

```sh
npm test
npm run build
npm run verify
npm run verify:near
npm run verify:seams
```

`verify` 测真实GPU完成帧；`verify:near` / `verify:seams` 检查近景材质与接缝。`verify:record` 录制包含可见圆柱的真实键盘行走录像；`verify:body` 检验持续占位、几米外传播、停步衰减、最高水中速度和30/60Hz一致性；`verify:body-stop` 输出停后64秒的观察帧；`verify:body-motion` 检查第一人称低头时人物与相机同时移动的连续帧；`verify:body-coupling` 做保持圆柱/脚步不变、仅开关持续排水的光影A/B。`verify:wake-performance` 独立测第一人称行走帧率。证据在仓库外 `../workroom-v1.15-evidence/final/`。

光照回归用 `verify:motion`（连续时间步 PNG）、`verify:reference`（高样本参考）、`verify:analyze` 和 `proof`。`verify:wake-coupling`检查同一模拟有/无脚步的墙面与池底光通量；`node scripts/nonloop-v113.mjs`拍同机位6秒/26秒对照。时间步序列不冒充实时录像。有状态模拟须从初始条件连续推进，旧版任意相位回跳与“脚步过期即完全回到原图”的验证假设已作废。EVIDENCE_DIR、VERIFY_URL 可切换证据目录与运行地址。详细命令、数据和限制见 [验收记录](docs/ACCEPTANCE.md)。

目录：`src/render/` 是光子、天光积分、相机和镜头处理；`levels/` 是关卡数据；`materials/` 是程序材质；`scripts/` 是验证入口；`docs/` 保存物理取舍与验收记录。证据在仓库外，不进入构建。

本次对应 [BRIEF.md](BRIEF.md) 的v1.15：圆柱代理通过软占位位移势持续驱动波场，移动推动水，停步后波继续传播和衰减。它不是精确刚体边界或完整人体动画；近似与预算见 [docs/PHYSICS.md](docs/PHYSICS.md)。旁观相机与玩家分离，WASD仍移动玩家。没有WebGL降级路径。只作本地提交，不配置或推送远端。
