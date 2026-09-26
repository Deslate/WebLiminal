# 此处无深水 · STILL WATER

Poolrooms v0。一个房间、一盘录像、一次有意安排的异常。

```sh
npm ci
npm run dev
```

打开 **http://127.0.0.1:4173/**。自动进入，无菜单。WASD / 方向键移动，按住鼠标拖动环顾，Shift 加快，M 静音。初次访问若浏览器阻止自动播放，任意键或点击即可唤醒声音。

`npm run build` 输出纯静态 `dist/`。可原样部署到 GitHub Pages 子路径，无运行时外链、后端或 CDN。没有配置远端。

## 场景

过曝的长条天井照进奶油色瓷砖拱廊。18 cm 浅水中能看见池底、折动的倒影与游移的焦散。开场 2.6 秒包含磁带噪声、色差、横向跟踪误差和 PLAY 标记，始终显示同一个场景。

第 34.6 秒（开场结束后 32 秒），天光开始熄灭，通风底噪退去，远处的中间门洞落下一面无来由的瓷砖墙；水面的纹路逆着房间传播，一次低沉的撞击留在长混响里。约 8.4 秒后光照回来，画面角落的 occupancy 从 00 变成 01。没有怪物，没有随机触发。切到后台会暂停这段时间。

## 实现

Vite + Three.js WebGL2，无 UI 框架。采用 WebGL2 是为了现阶段桌面兼容和直接验证，未实现 WebGPU 后端。程序化瓷砖/焦散、阴影贴图、平面反射与菲涅耳水面，再经过轻量的录像带后处理。像素比上限 1.5，慢帧触发降低渲染分辨率和反射采样。声音由本地 Web Audio 合成，无音频下载。

`public/first-frame.jpg` 是同一场景的预渲染照片，在 JS / GPU 准备期间显示；第一帧渲染完成后才显露 canvas。它不是替代可移动场景的背景图。

```text
levels/                 纯 JSON 关卡数据
materials/              瓷砖材质槽位、水面着色器
src/
  main.js               时间线、输入、渲染循环
  world.js              房间、拱门、灯光和碰撞体
  collision.js          有半径的分步碰撞
  audio.js              水声、机房低鸣、混响和异常
  film.js               录像带后处理
  style.css             录像标记及淡出字幕
public/first-frame.jpg  首帧照片
scripts/                内容校验、碰撞测试、浏览器验收
  validate-content.mjs  将来供 CI 调用的入口
  verify.mjs            实际浏览器帧时间与验收证据
  generate-poster.mjs   从场景刷新首帧照片
AGENTS.md               如何继续加内容
BRIEF.md                原始需求
```

验收结果及诚实的限制见 [docs/ACCEPTANCE.md](docs/ACCEPTANCE.md)。
