# 此处无深水 · Poolrooms v1.1

这一版优先消除移动时的采样斑点。相机改为确定性着色，水面同时追踪反射与折射；焦散和间接光来自运行时计算的世界空间光子缓存。零位图资产。

```sh
npm ci
npm run dev
```

打开 **http://127.0.0.1:4173/**。WASD / 方向键移动，拖动环顾，Shift 加快，M 静音。首次按键/点击后才可能播放声音；需要 WebGPU 桌面浏览器。

移动和静止使用同一路径，无相机历史累积、随机景深、随机釉面延续或胶片颗粒。4 个固定子像素样本与程序材质的面积覆盖抗锯齿保留接缝。光子缓存启动时预计算 48×131072 条路径，移动不清空。**水波相位固定，取消高频毛细波；当前并非持续动画水面。** 改水位、波幅或天窗参数会重新计算光照。

- `src/render/`：解析几何、光子传播与缓存、确定性相机、曝光呈现。
- `materials/porcelain.wgsl`：程序化材质槽；小于像素的接缝与微细节做面积过滤。
- `levels/`：纯数据关卡；`src/collision.js` / `src/audio.js`：碰撞与合成音景。
- `scripts/validate-content.mjs`：内容及零位图校验。
- `npm test` / `npm run build`：碰撞测试及静态构建。
- `npm run verify`：首帧、GPU 完成帧率、实际键盘行走与控制台验证。
- `npm run verify:motion`：五类持续移动的截图与停止后像素一致性检查。
- `npm run verify:frames`：浏览器 compositor 每帧 PNG 抓取，含暗部提高曝光的压力场景。
- `npm run proof`：同次运行的水位、开口、波高变化与光路审计。

最新证据在仓库外 **`../workroom-v1.1-evidence/`**。旧 `../workroom-v1-evidence/` 只作历史记录。构建为相对路径的纯静态前端，无外链运行资源。

实测与覆盖范围见 [验收记录](docs/ACCEPTANCE.md)，算法和明确近似见 [渲染说明](docs/PHYSICS.md)。开发前读 [AGENTS.md](AGENTS.md)。
