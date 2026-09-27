# Poolrooms v1.13

本机浏览器单页体验：有状态的非线性波场模拟、行走触发真实涟漪、运行时光子焦散、停止后的照明细化，以及近景有深度的程序瓷砖、釉面房间反射。WebGPU + 原生 JavaScript + Vite，无运行时第三方依赖，无位图资源。

```sh
npm install
npm run dev -- --port 4173
```

打开 http://127.0.0.1:4173/ 。需要支持 WebGPU 的桌面浏览器。WASD / 方向键行走，拖动画面转头，Shift 加速，M 静音；声音须先有用户手势。

```sh
npm test
npm run build
npm run verify
npm run verify:near
npm run verify:seams
```

`verify` 测真实 GPU 完成帧；`verify:near` 保存洞口内外交界接缝、内侧近照和拱顶；`verify:construction` 独立测近景性能；`verify:seams` 生成一条301帧、12秒的内侧沿缝序列，保存在仓库外 `../workroom-v1.13-evidence/final/`。这些是指定时间步的生产渲染，不是实时帧率测量。`verify:floor` 输出池底物理量对照，`verify:floor-motion` 输出12秒池底移动连续帧。`verify:record` 录制超过20秒的真实键盘行走、静止与水面特写；`verify:wakes` 检验波场传播、衰减、30/60Hz一致性和90秒稳定性；`verify:wake-performance` 在真实行走产生波源的条件下测GPU完成帧率。

光照回归用 `verify:motion`（连续时间步 PNG）、`verify:reference`（高样本参考）、`verify:analyze` 和 `proof`。`verify:wake-coupling`检查同一模拟有/无脚步的墙面与池底光通量；`node scripts/nonloop-v113.mjs`拍同机位6秒/26秒对照。时间步序列不冒充实时录像。有状态模拟须从初始条件连续推进，旧版任意相位回跳与“脚步过期即完全回到原图”的验证假设已作废。EVIDENCE_DIR、VERIFY_URL 可切换证据目录与运行地址。详细命令、数据和限制见 [验收记录](docs/ACCEPTANCE.md)。

目录：`src/render/` 是光子、天光积分、相机和镜头处理；`levels/` 是关卡数据；`materials/` 是程序材质；`scripts/` 是验证入口；`docs/` 保存物理取舍与验收记录。证据在仓库外，不进入构建。

本次对应 [BRIEF.md](BRIEF.md) 的 v1.13；水面、反射、墙面焦散逐帧使用同一时间。物理近似和预算分配见 [docs/PHYSICS.md](docs/PHYSICS.md)。没有 WebGL 降级路径。只作本地提交，不配置或推送远端。
