# Poolrooms v1.3

本机浏览器单页体验：持续动态水面、运行时光子焦散、干净的移动相机，以及停车后一秒内的照明细化。WebGPU + 原生 JavaScript + Vite，无运行时第三方依赖、无位图资源。

```sh
npm install
npm run dev -- --port 4173
```

打开 http://127.0.0.1:4173/ 。需要支持 WebGPU 的桌面浏览器。WASD / 方向键行走，拖动画面转头，Shift 加速，M 静音；声音须先有用户手势。

```sh
npm test
npm run build
npm run verify
npm run verify:motion
npm run verify:reference
npm run verify:analyze
npm run proof
```

`verify` 测真实 GPU 完成帧；`verify:motion` 保存三机位同相位比较、停止过程和 12 秒含停走转换的连续 PNG；`verify:reference` 生成高样本比较基准。证据默认在仓库外 `../workroom-v1.3-evidence/`。可用 `python scripts/encode-evidence.py ../workroom-v1.3-evidence/final` 编码 WebM（本机已装 Pillow，使用 Playwright 自带 ffmpeg）；原始 PNG 是无损依据。影片按 30Hz 时间步合成，不冒充实际运行帧率。

目录：`src/render/` 是光子、天光积分、相机和镜头处理；`levels/` 是关卡数据；`materials/` 是程序材质槽；`scripts/` 是验证入口；`docs/` 保存物理取舍与验收记录。

当前标准见 [BRIEF.md](BRIEF.md)，物理路径与限制见 [docs/PHYSICS.md](docs/PHYSICS.md)，测量和证据见 [docs/ACCEPTANCE.md](docs/ACCEPTANCE.md)。没有 WebGL 降级路径。只作本地提交，不配置或推送远端。
