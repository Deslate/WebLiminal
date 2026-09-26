# Poolrooms v1.5

本机浏览器单页体验：持续动态水面、运行时光子焦散、停止后的照明细化，以及近景有深度的程序瓷砖、釉面房间反射。WebGPU + 原生 JavaScript + Vite，无运行时第三方依赖，无位图资源。

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
npm run verify:record
```

`verify` 测真实 GPU 完成帧；`verify:near` 保存 30cm 贴墙/柱体证据并测贴墙性能；`verify:record` 录制包含 8 秒盯墙及随后视角移动，共 16 秒演示的实时浏览器 WebM。录像文件为仓库外 `../workroom-v1.5-evidence/final/wall-caustics-continuous.webm`，不会以录屏开销测帧率。

光照回归用 `verify:motion`（连续时间步 PNG）、`verify:reference`（高样本参考）、`verify:analyze` 和 `proof`。时间步序列不冒充实时录像。EVIDENCE_DIR、VERIFY_URL 可切换证据目录与运行地址。详细命令、数据和限制见 [验收记录](docs/ACCEPTANCE.md)。

目录：`src/render/` 是光子、天光积分、相机和镜头处理；`levels/` 是关卡数据；`materials/` 是程序材质；`scripts/` 是验证入口；`docs/` 保存物理取舍与验收记录。证据在仓库外，不进入构建。

本次对应 [BRIEF.md](BRIEF.md) 的 v1.5；水面、反射、墙面焦散逐帧使用同一时间。物理近似和预算分配见 [docs/PHYSICS.md](docs/PHYSICS.md)。没有 WebGL 降级路径。只作本地提交，不配置或推送远端。
