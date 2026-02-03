# KingShit

休闲塔防游戏 MVP - 类 Kingshot 广告风格

## 技术栈

- **引擎**: Cocos Creator 3.8.x
- **语言**: TypeScript
- **代码规范**: ESLint + Prettier

## 开发环境

### 前置要求

- Node.js 18+
- Cocos Creator 3.8.x (通过 Cocos Dashboard 安装)

### 安装依赖

```bash
npm install
```

### 开发流程

1. 用 Cocos Dashboard 打开项目
2. 在编辑器中预览和调试
3. 代码变更后运行 `npm run lint` 检查

## 项目结构

```
assets/
├── scripts/
│   ├── core/           # 核心框架
│   │   ├── base/       # 基类
│   │   ├── managers/   # 管理器
│   │   └── utils/      # 工具函数
│   ├── gameplay/       # 游戏玩法
│   │   ├── buildings/  # 建筑系统
│   │   ├── units/      # 单位系统
│   │   ├── combat/     # 战斗系统
│   │   ├── economy/    # 经济系统
│   │   └── wave/       # 波次系统
│   ├── ui/             # UI 脚本
│   └── data/           # 数据配置
├── prefabs/            # 预制体
├── scenes/             # 场景
└── textures/           # 纹理
```

## 命令

| 命令 | 说明 |
|-----|------|
| `npm run lint` | 检查并修复代码规范 |
| `npm run format` | 格式化代码 |
