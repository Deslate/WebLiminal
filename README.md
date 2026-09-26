# 此处无深水 · Poolrooms v1

零位图资源的 WebGPU Poolrooms。光子从天窗进入房间，在真实波面反射、折射、吸收，再形成墙面与池底照明。

```sh
npm ci
npm run dev
```

打开 **http://127.0.0.1:4173/**。WASD / 方向键移动，拖动环顾，Shift 加快，M 静音。新浏览器通常需要第一次按键/点击才能播放声音。需要支持 WebGPU 的桌面浏览器；没有用旧渲染路径做降级。

相机静止后会固定波面时刻并逐渐收敛；移动时恢复动态波面。没有菜单、开始按钮、参数面板或 FPS UI。开场和声音保留；34.6 秒的异常现在通过改变太阳入射功率重新算光，不再降下一块旧版假墙。

- `src/render/`：共享几何求交、光子传播、密度估计、相机路径、镜头呈现。
- `materials/porcelain.wgsl`：固定签名的程序化材质槽位。
- `levels/poolrooms.json`：机位、边界、光学参数。
- `src/collision.js`、`src/audio.js`：碰撞和合成音景。
- `scripts/validate-content.mjs`：内容与零位图资源检查入口。
- `scripts/proof-v1.mjs`：同次运行的三张防伪图与独立光路审计。
- `scripts/verify-v1.mjs`：实际 GPU 完成帧率、首帧、输入、声音、控制台与网络验证。

`npm run build` 生成可部署到 GitHub Pages 子目录的静态 `dist/`。无运行时 npm 依赖，无图像、模型、字体或音频外链。

截图必须放在仓库外。此次交付位于 **`../workroom-v1-evidence/final/`**：原状、水位改变、天窗收窄及 1920×1200 完整截图；另含平水控制、恢复原状复验、路径记录和 SHA-256 清单。前四轮渲染检查保留在其父目录。

具体方法见 [光传输说明](docs/PHYSICS.md)，真实结果和未达成部分见 [验收记录](docs/ACCEPTANCE.md)。加内容前读 [AGENTS.md](AGENTS.md)。
