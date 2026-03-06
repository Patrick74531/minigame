#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, 'docs', 'softcopyright');
const HTML_DIR = path.join(OUTPUT_DIR, 'html');
const PDF_DIR = path.join(OUTPUT_DIR, 'pdf');
const SOURCE_DIR = path.join(OUTPUT_DIR, 'source');
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CHROME_USER_DATA_DIR = path.join(ROOT, 'tmp', 'chrome-softcopyright-profile');

const SOURCE_ROOTS = [
    'assets/scripts',
    'devvit/src/server',
    'devvit/src/client',
];

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.sh']);

const SOFTWARE_NAME_ZH = '老奶大战机器人游戏软件';
const SOFTWARE_NAME_EN = 'Granny vs Robot';
const SOFTWARE_SHORT_NAME = '老奶大战机器人';

const escapeHtml = str =>
    str
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');

async function fileExists(filePath) {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

async function walkFiles(dir) {
    const result = [];
    if (!(await fileExists(dir))) return result;

    const queue = [dir];
    while (queue.length > 0) {
        const current = queue.pop();
        if (!current) continue;
        const entries = await fs.readdir(current, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.name.startsWith('.')) continue;
            const fullPath = path.join(current, entry.name);
            if (entry.isDirectory()) {
                queue.push(fullPath);
            } else if (entry.isFile()) {
                result.push(fullPath);
            }
        }
    }
    return result.sort((a, b) => a.localeCompare(b, 'en'));
}

function toPosixRelative(absPath) {
    return path.relative(ROOT, absPath).split(path.sep).join('/');
}

async function readText(filePath) {
    return (await fs.readFile(filePath, 'utf8')).replaceAll('\r\n', '\n');
}

function countLines(text) {
    if (text.length === 0) return 0;
    return text.split('\n').length;
}

function formatDateCN(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}年${m}月${d}日`;
}

function toBaseHtml(title, body, options = {}) {
    const monospace = options.monospace === true;
    return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: A4; margin: 18mm 16mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: #111;
      font-family: ${monospace ? '"SF Mono","Menlo","Consolas",monospace' : '"PingFang SC","Noto Sans SC","Microsoft YaHei","Heiti SC",sans-serif'};
      font-size: ${monospace ? '12px' : '14px'};
      line-height: ${monospace ? '1.35' : '1.7'};
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    h1,h2,h3 { margin: 0.8em 0 0.35em; }
    h1 { font-size: 24px; text-align: center; margin-top: 0; }
    h2 { font-size: 18px; border-left: 4px solid #1f2937; padding-left: 10px; }
    h3 { font-size: 15px; }
    p { margin: 0.45em 0; text-align: justify; }
    table { width: 100%; border-collapse: collapse; margin: 8px 0 14px; }
    th, td { border: 1px solid #444; padding: 8px; vertical-align: top; }
    th { background: #f3f4f6; font-weight: 700; }
    ul, ol { margin: 0.35em 0 0.5em 1.4em; padding: 0; }
    .small { font-size: 12px; color: #444; }
    .page-break { page-break-before: always; }
    .muted { color: #555; }
    .mono-block {
      white-space: pre-wrap;
      font-family: "SF Mono","Menlo","Consolas",monospace;
      font-size: 12px;
      background: #fafafa;
      border: 1px solid #ddd;
      padding: 10px 12px;
    }
  </style>
</head>
<body>
${body}
</body>
</html>`;
}

function toCodeHtml(title, lines, startLineNumber, note) {
    const pages = [];
    const linesPerPage = 50;
    const pageCount = Math.ceil(lines.length / linesPerPage);

    for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
        const begin = pageIndex * linesPerPage;
        const pageLines = lines.slice(begin, begin + linesPerPage);
        const renderedLines = pageLines
            .map((line, idx) => {
                const no = startLineNumber + begin + idx;
                const noStr = String(no).padStart(5, '0');
                return `<span class="ln">${noStr}</span>  ${escapeHtml(line)}`;
            })
            .join('\n');

        pages.push(`
<section class="code-page ${pageIndex > 0 ? 'next-page' : ''}">
  <header>
    <div class="title">${escapeHtml(title)}</div>
    <div class="meta">第 ${pageIndex + 1} / ${pageCount} 页</div>
  </header>
  <pre>${renderedLines}</pre>
</section>`);
    }

    return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: A4; margin: 12mm 12mm; }
    body {
      margin: 0;
      color: #111;
      font-family: "SF Mono","Menlo","Consolas",monospace;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .code-page { page-break-after: always; }
    .code-page:last-child { page-break-after: auto; }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid #444;
      padding-bottom: 4px;
      margin-bottom: 4px;
      font-size: 11px;
    }
    .title { font-weight: 700; }
    pre {
      margin: 0;
      font-size: 10px;
      line-height: 1.27;
      white-space: pre;
      overflow: hidden;
      word-break: normal;
      font-variant-ligatures: none;
    }
    .ln {
      display: inline-block;
      width: 48px;
      color: #666;
      user-select: none;
    }
  </style>
</head>
<body>
  <!-- ${escapeHtml(note)} -->
  ${pages.join('\n')}
</body>
</html>`;
}

async function writeFile(filePath, content) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, 'utf8');
}

async function renderPdf(htmlPath, pdfPath) {
    await fs.mkdir(path.dirname(pdfPath), { recursive: true });
    await fs.mkdir(CHROME_USER_DATA_DIR, { recursive: true });

    if (await fileExists(pdfPath)) {
        await fs.rm(pdfPath);
    }

    const child = spawn(
        CHROME_PATH,
        [
            '--headless=new',
            '--disable-gpu',
            '--no-first-run',
            '--no-default-browser-check',
            '--disable-background-networking',
            '--disable-sync',
            '--hide-scrollbars',
            '--mute-audio',
            '--allow-file-access-from-files',
            '--no-pdf-header-footer',
            `--user-data-dir=${CHROME_USER_DATA_DIR}`,
            `--print-to-pdf=${pdfPath}`,
            `file://${htmlPath}`,
        ],
        { stdio: 'ignore' }
    );

    const startedAt = Date.now();
    let lastSize = -1;
    let stableTicks = 0;
    let rendered = false;

    while (Date.now() - startedAt < 120_000) {
        await new Promise(resolve => setTimeout(resolve, 1_000));
        if (!(await fileExists(pdfPath))) continue;

        const stat = await fs.stat(pdfPath);
        if (stat.size <= 0) continue;

        if (stat.size === lastSize) {
            stableTicks += 1;
        } else {
            stableTicks = 0;
            lastSize = stat.size;
        }

        if (stableTicks >= 2) {
            rendered = true;
            break;
        }
    }

    if (!child.killed) {
        child.kill('SIGKILL');
    }

    if (!rendered) {
        throw new Error(`PDF render timeout: ${pdfPath}`);
    }
}

function between(text, startToken, endToken) {
    const start = text.indexOf(startToken);
    if (start < 0) return '';
    const end = text.indexOf(endToken, start + startToken.length);
    if (end < 0) return text.slice(start + startToken.length);
    return text.slice(start + startToken.length, end);
}

async function build() {
    const packageJson = JSON.parse(await readText(path.join(ROOT, 'package.json')));
    const rootSourceFiles = [];
    for (const relRoot of SOURCE_ROOTS) {
        const absRoot = path.join(ROOT, relRoot);
        const files = await walkFiles(absRoot);
        for (const absPath of files) {
            const ext = path.extname(absPath).toLowerCase();
            if (!SOURCE_EXTENSIONS.has(ext)) continue;
            rootSourceFiles.push(absPath);
        }
    }
    rootSourceFiles.sort((a, b) => toPosixRelative(a).localeCompare(toPosixRelative(b), 'en'));

    const gameTsFiles = rootSourceFiles.filter(
        f => toPosixRelative(f).startsWith('assets/scripts/') && path.extname(f) === '.ts'
    );
    const allLineStats = [];
    for (const file of rootSourceFiles) {
        const text = await readText(file);
        allLineStats.push({ file, lines: countLines(text), text });
    }

    const totalCodeLines = allLineStats.reduce((sum, item) => sum + item.lines, 0);
    const gameCodeLines = allLineStats
        .filter(item => toPosixRelative(item.file).startsWith('assets/scripts/'))
        .reduce((sum, item) => sum + item.lines, 0);

    const gameConfigText = await readText(path.join(ROOT, 'assets/scripts/data/GameConfig.ts'));
    const waveConfigText = await readText(
        path.join(ROOT, 'assets/scripts/data/config/WaveInfiniteConfig.ts')
    );
    const itemDefsText = await readText(path.join(ROOT, 'assets/scripts/gameplay/items/ItemDefs.ts'));

    const weaponSection = between(gameConfigText, 'WEAPONS: {', '} as Record<string, any>,');
    const weaponCount = (weaponSection.match(/^\s{12}[a-z_]+:\s*\{/gm) ?? []).length;

    const buffSection = between(gameConfigText, 'BUFF_CARDS: {', 'WEAPON_SYSTEM: {');
    const buffCount = (buffSection.match(/id:\s*'[^']+'/g) ?? []).length;

    const enemyMainSection = between(waveConfigText, 'ENEMY_ARCHETYPES: [', '],\n    /** 三类型数量分配模板池');
    const enemyMainCount = (enemyMainSection.match(/id:\s*'[^']+'/g) ?? []).length;

    const enemyBossSection = between(waveConfigText, 'BOSS_ARCHETYPES: [', '],\n    },');
    const enemyBossCount = (enemyBossSection.match(/id:\s*'[^']+'/g) ?? []).length;

    const itemCount = (itemDefsText.match(/^\s{4}[a-z_]+:\s*\{/gm) ?? []).length;

    const now = new Date();
    const todayCn = formatDateCN(now);

    const version = packageJson.version ?? '0.1.0';
    const creatorVersion = packageJson.creator?.version ?? '3.8.x';

    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    await fs.mkdir(HTML_DIR, { recursive: true });
    await fs.mkdir(PDF_DIR, { recursive: true });
    await fs.mkdir(SOURCE_DIR, { recursive: true });

    // 1) 软著信息汇总
    const summaryMd = `# 软著申请信息汇总（草案）

## 基本信息

- 软件全称：${SOFTWARE_NAME_ZH} V${version}
- 软件简称：${SOFTWARE_SHORT_NAME}
- 英文名称：${SOFTWARE_NAME_EN}
- 版本号：V${version}
- 软件分类：游戏软件（休闲塔防策略）
- 开发完成日期：${todayCn}
- 首次发表状态：未发表（如已上线请改为“已发表”并填写日期与平台）

## 技术信息

- 开发语言：TypeScript（含少量 JavaScript/Shell 构建脚本）
- 开发工具：Cocos Creator ${creatorVersion}、Node.js 18+、Devvit SDK 0.12.13
- 运行环境：Web/H5（PC 与移动浏览器），可部署至 Reddit Devvit、TikTok 小游戏平台
- 源代码规模：约 ${totalCodeLines.toLocaleString('zh-CN')} 行（其中核心客户端脚本约 ${gameCodeLines.toLocaleString('zh-CN')} 行）

## 功能规模

- 建筑类型：8 类（基地/兵营/机炮塔/冰霜塔/闪电塔/路障/金矿/温泉）
- 武器类型：${weaponCount} 类（机枪/喷火器/加农炮/故障波）
- 增益卡牌：${buffCount} 张
- Boss 道具：${itemCount} 类
- 敌人原型：常规 ${enemyMainCount} 类 + Boss 事件 ${enemyBossCount} 类

## 申请人待补充信息（必填）

- 著作权人名称（个人/公司全称）
- 证件号码（身份证号/统一社会信用代码）
- 联系地址、邮编、联系人、电话、邮箱
- 权利取得方式（原始取得）
- 软件是否合作开发/委托开发（如有需补充协议材料）
`;

    const summaryHtml = toBaseHtml(
        '软著申请信息汇总',
        `
<h1>计算机软件著作权登记信息汇总（草案）</h1>
<p class="muted">文档生成时间：${escapeHtml(todayCn)}。请在提交前补全申请人主体信息并核对版本号、完成日期。</p>

<h2>一、软件基本信息</h2>
<table>
  <tr><th style="width:28%">字段</th><th>内容</th></tr>
  <tr><td>软件全称</td><td>${escapeHtml(SOFTWARE_NAME_ZH)} V${escapeHtml(version)}</td></tr>
  <tr><td>软件简称</td><td>${escapeHtml(SOFTWARE_SHORT_NAME)}</td></tr>
  <tr><td>英文名称</td><td>${escapeHtml(SOFTWARE_NAME_EN)}</td></tr>
  <tr><td>版本号</td><td>V${escapeHtml(version)}</td></tr>
  <tr><td>软件分类</td><td>游戏软件（休闲塔防策略）</td></tr>
  <tr><td>开发完成日期</td><td>${escapeHtml(todayCn)}</td></tr>
  <tr><td>首次发表状态</td><td>未发表（如已上线请改“已发表”并写明平台和日期）</td></tr>
</table>

<h2>二、技术与规模信息</h2>
<table>
  <tr><th style="width:28%">字段</th><th>内容</th></tr>
  <tr><td>开发语言</td><td>TypeScript（含少量 JavaScript/Shell 构建脚本）</td></tr>
  <tr><td>开发工具</td><td>Cocos Creator ${escapeHtml(creatorVersion)}、Node.js 18+、Devvit SDK 0.12.13、Hono、Redis</td></tr>
  <tr><td>运行平台</td><td>Web/H5（PC 与移动浏览器）；现有部署链路可对接 Reddit Devvit、TikTok 小游戏平台</td></tr>
  <tr><td>源码规模</td><td>项目相关代码约 ${totalCodeLines.toLocaleString('zh-CN')} 行；核心客户端脚本约 ${gameCodeLines.toLocaleString('zh-CN')} 行</td></tr>
  <tr><td>核心建筑</td><td>8 类（基地/兵营/机炮塔/冰霜塔/闪电塔/路障/金矿/温泉）</td></tr>
  <tr><td>武器系统</td><td>${weaponCount} 类武器，支持最高 5 级成长</td></tr>
  <tr><td>肉鸽强化</td><td>${buffCount} 张增益卡牌，支持三选一</td></tr>
  <tr><td>Boss 道具</td><td>${itemCount} 类战利品道具</td></tr>
  <tr><td>敌人原型</td><td>常规 ${enemyMainCount} 类 + Boss 事件 ${enemyBossCount} 类</td></tr>
</table>

<h2>三、申请表待补全字段（必填）</h2>
<ul>
  <li>著作权人名称（个人姓名或公司全称）</li>
  <li>证件号码（身份证号/统一社会信用代码）</li>
  <li>详细地址、邮编、联系人、电话、电子邮箱</li>
  <li>权利取得方式（一般为原始取得）</li>
  <li>是否合作开发/委托开发（如是，需附合作或委托协议）</li>
</ul>
<p class="small">说明：官方申请表需在中国版权保护中心系统中在线填写并导出，本文档用于统一准备字段，降低补正风险。</p>
`
    );

    await writeFile(path.join(OUTPUT_DIR, '01_软著申请信息汇总.md'), summaryMd);
    await writeFile(path.join(HTML_DIR, '01_软著申请信息汇总.html'), summaryHtml);

    // 2) 软件说明书
    const specMd = `# ${SOFTWARE_NAME_ZH} 软件说明书（用于软著登记）

## 1. 软件概述

${SOFTWARE_NAME_ZH}（${SOFTWARE_NAME_EN}）是一款融合“动作生存 + 塔防建造 + 肉鸽成长”的休闲策略游戏软件。玩家在三路战场中操控主角，建设防御工事并使用武器与增益体系抵御机器人波次进攻。

## 2. 开发目标

1. 提供低学习成本、高策略深度的休闲塔防体验。  
2. 构建可持续扩展的事件驱动与数据驱动架构。  
3. 支持跨平台发布（Web/Reddit/TikTok）与统一社交数据接口。  

## 3. 系统组成

- 游戏客户端：Cocos Creator + TypeScript，负责渲染、交互、战斗逻辑。
- 平台服务端：Node.js + Hono，提供排行榜、分数提交、钻石结算等接口。
- 数据存储：Redis，用于排行榜、用户元数据、限流与结算状态。

## 4. 主要功能

### 4.1 角色与战斗
- 角色移动与自动攻击；
- 英雄等级成长与属性提升；
- 复活与战斗状态管理。

### 4.2 建筑系统
- 支持 8 类建筑；
- 建造、升级、销毁与恢复；
- 建筑差异化功能（产兵、输出、减速、连锁伤害、产金、治疗等）。

### 4.3 波次与敌人
- 无限波次递进；
- 三路刷怪口按波次解锁；
- 随机组合出怪并带权重惩罚；
- 精英与 Boss 事件。

### 4.4 武器与肉鸽成长
- ${weaponCount} 类武器空投三选一；
- 武器重复选择自动升级；
- ${buffCount} 张增益卡牌三选一并即时生效。

### 4.5 道具与经济
- Boss 宝箱掉落后触发三选一道具；
- ${itemCount} 类道具支持背包管理与即时使用；
- 钻石结算、商店购买与关注奖励机制。

### 4.6 排行榜与社交
- 成绩提交与个人最高分保留；
- 排行榜读取与展示；
- 提交频率限制与幂等提交保护。

## 5. 核心流程

1. 进入游戏并初始化资源与平台桥接；
2. 建造基础防线并开始波次；
3. 每波根据敌人组合与强度递进进行攻防；
4. 波间触发武器/卡牌/道具选择；
5. 游戏结束后结算分数并更新排行榜。

## 6. 关键技术实现

- 事件总线：统一事件定义与类型化载荷。
- 配置中心：将平衡参数集中在配置模块，支持快速调优。
- 对象池与资源预加载：降低运行时卡顿与内存抖动。
- 平台桥接：统一接口适配 Reddit/TikTok 不同后端。

## 7. 运行环境

- 操作系统：Windows/macOS（开发）、Android/iOS（运行）
- 运行载体：Web 浏览器或内嵌 WebView
- 开发工具：Cocos Creator ${creatorVersion}
- Node 环境：Node.js 18+

## 8. 程序规模

- 核心客户端脚本：${gameTsFiles.length} 个 TypeScript 文件，约 ${gameCodeLines.toLocaleString('zh-CN')} 行。
- 全项目相关代码：约 ${totalCodeLines.toLocaleString('zh-CN')} 行。

## 9. 版本信息

- 软件版本：V${version}
- 生成日期：${todayCn}
- 著作权归属：由申请人依法享有，具体以申请表主体为准。
`;

    const specHtml = toBaseHtml(
        `${SOFTWARE_NAME_ZH} 软件说明书`,
        `
<h1>${escapeHtml(SOFTWARE_NAME_ZH)} 软件说明书</h1>
<p class="muted">（用于计算机软件著作权登记）</p>

<h2>1. 软件概述</h2>
<p>${escapeHtml(SOFTWARE_NAME_ZH)}（${escapeHtml(SOFTWARE_NAME_EN)}）是一款融合“动作生存 + 塔防建造 + 肉鸽成长”的休闲策略游戏软件。玩家在三路战场中操控主角，通过建设防御工事、选择武器和增益、管理道具与资源来抵御机器人军团的持续进攻。</p>
<p>本软件强调“低门槛操作 + 中高策略深度”的设计目标，支持移动端与桌面端 Web 场景，可适配社区小游戏和短视频小游戏发布形态。</p>

<h2>2. 开发目标</h2>
<ol>
  <li>建立可长期迭代的塔防玩法基础框架，兼顾爽快感与可重复游玩性。</li>
  <li>通过事件驱动与配置驱动的技术路线，提升版本维护效率和扩展能力。</li>
  <li>实现跨平台发布能力，统一排行榜与结算交互接口，降低平台迁移成本。</li>
</ol>

<h2>3. 系统架构</h2>
<table>
  <tr><th style="width:26%">层级</th><th>技术</th><th>职责</th></tr>
  <tr><td>客户端层</td><td>Cocos Creator ${escapeHtml(creatorVersion)} + TypeScript</td><td>场景渲染、交互输入、战斗逻辑、UI 展示与本地存档</td></tr>
  <tr><td>服务接口层</td><td>Node.js + Hono</td><td>初始化信息、排行榜、分数提交、统计与钻石接口</td></tr>
  <tr><td>数据存储层</td><td>Redis</td><td>排行榜有序集合、玩家元数据、限流键、结算幂等键</td></tr>
  <tr><td>平台桥接层</td><td>SocialBridge 统一抽象</td><td>屏蔽 Reddit/TikTok 平台差异，复用客户端业务逻辑</td></tr>
</table>

<h2>4. 功能模块</h2>
<h3>4.1 角色与战斗模块</h3>
<p>实现角色移动、自动索敌攻击、经验成长、复活与战斗状态机管理。通过统一事件广播（如波次开始、击杀、升级）连接 UI 与玩法模块。</p>

<h3>4.2 建筑与经济模块</h3>
<p>提供 8 类建筑（基地、兵营、机炮塔、冰霜塔、闪电塔、路障、金矿、温泉），支持建造、升级、破坏与恢复。经济系统包含金币获取、花费与自动收集。</p>

<h3>4.3 波次与 AI 模块</h3>
<p>支持无限波次，含三路解锁、精英单位、Boss 事件。通过组合记忆窗口、近期出现惩罚和标签占比惩罚算法，平衡随机性与新鲜感。</p>

<h3>4.4 武器与增益模块</h3>
<p>提供 ${weaponCount} 类武器，采用空投三选一机制；重复获取触发武器升级。增益卡牌共 ${buffCount} 张，支持蓝/紫/金稀有度梯度与多属性叠加。</p>

<h3>4.5 Boss 道具模块</h3>
<p>Boss 击杀后掉落宝箱，触发三选一道具。当前实现 ${itemCount} 类道具，包括清场、冻结、建筑恢复、快速复活、建筑升级等关键战术效果。</p>

<h3>4.6 排行榜与结算模块</h3>
<p>服务端支持分数提交与排行榜读取，采用幂等 runId 防止重复记分，配合限流策略防止刷榜。支持回合钻石结算与道具购买流程。</p>

<h2>5. 核心业务流程</h2>
<ol>
  <li>启动阶段：初始化资源、输入系统、平台桥接、UI 与核心服务。</li>
  <li>战斗阶段：玩家建造防线，波次系统生成敌人并触发战斗。</li>
  <li>成长阶段：波间提供武器/卡牌选择，Boss 后提供道具选择。</li>
  <li>结算阶段：游戏结束后提交分数，刷新排行榜，执行钻石结算。</li>
</ol>

<h2>6. 技术特点</h2>
<ul>
  <li>事件驱动：统一事件中心减少模块耦合，提高可维护性。</li>
  <li>配置驱动：平衡参数集中管理，便于快速调优和 A/B 方案切换。</li>
  <li>性能优化：对象池、资源预加载、运行时降频检查降低卡顿概率。</li>
  <li>跨平台抽象：同一客户端逻辑适配不同平台 API 与域名策略。</li>
</ul>

<h2>7. 运行环境</h2>
<table>
  <tr><th style="width:26%">项目</th><th>说明</th></tr>
  <tr><td>开发操作系统</td><td>macOS / Windows</td></tr>
  <tr><td>运行环境</td><td>Web 浏览器、移动端 WebView</td></tr>
  <tr><td>开发引擎</td><td>Cocos Creator ${escapeHtml(creatorVersion)}</td></tr>
  <tr><td>主要语言</td><td>TypeScript</td></tr>
  <tr><td>Node 环境</td><td>Node.js 18+</td></tr>
</table>

<h2>8. 程序规模</h2>
<p>核心客户端脚本：${gameTsFiles.length} 个 TypeScript 文件，约 ${gameCodeLines.toLocaleString('zh-CN')} 行。</p>
<p>全项目相关代码：约 ${totalCodeLines.toLocaleString('zh-CN')} 行。</p>

<h2>9. 版本与权属说明</h2>
<p>软件版本号：V${escapeHtml(version)}。文档生成日期：${escapeHtml(todayCn)}。</p>
<p>本说明书用于软著登记材料准备，著作权归属信息以正式申请表填报主体为准。</p>
`
    );

    await writeFile(path.join(OUTPUT_DIR, '02_软件说明书.md'), specMd);
    await writeFile(path.join(HTML_DIR, '02_软件说明书.html'), specHtml);

    // 3) 用户手册
    const manualMd = `# ${SOFTWARE_NAME_ZH} 用户操作手册（软著材料）

## 1. 适用范围
本手册用于说明 ${SOFTWARE_NAME_ZH} 的安装运行方式、基本操作、核心玩法与常见问题处理流程。

## 2. 启动方式
1. 使用 Cocos Creator 打开项目并运行预览；或
2. 执行项目构建脚本产出 Web 包并通过网页访问。

## 3. 基础操作
- PC：W/A/S/D 控制移动（或方向键）
- 移动端：虚拟摇杆控制移动
- 战斗：角色自动攻击附近目标
- 交互：点击按钮完成建造、升级、选卡、选武器、使用道具

## 4. 核心玩法流程
1. 进入游戏后优先完成基础建造；
2. 按波次抵御敌人并收集资源；
3. 在关键节点选择武器和增益卡；
4. Boss 出现并掉落宝箱后选择道具；
5. 防线失守则进入结算并提交成绩。

## 5. 功能界面说明

### 5.1 首页
- 开始游戏
- 继续游戏（存在存档时）
- 排行榜
- 商店

### 5.2 战斗 HUD
- 当前金币
- 当前波次/倒计时
- 基地生命值
- 技能/道具/武器状态

### 5.3 选择类界面
- 武器三选一
- 增益卡三选一
- 道具三选一

## 6. 存档与恢复
- 自动存档：运行中定时写入本地存档；
- 关键时机存档：切后台或页面隐藏时触发即时保存；
- 继续游戏：检测到有效存档时可从首页恢复。

## 7. 常见问题
- 排行榜加载失败：检查网络与接口连通性；
- 分数重复提交：系统使用 runId 幂等保护；
- 页面卡顿：确认资源预加载完成并检查设备性能。

## 8. 版本信息
- 软件版本：V${version}
- 文档日期：${todayCn}
`;

    const manualHtml = toBaseHtml(
        `${SOFTWARE_NAME_ZH} 用户操作手册`,
        `
<h1>${escapeHtml(SOFTWARE_NAME_ZH)} 用户操作手册</h1>
<p class="muted">（用于软著登记辅助材料）</p>

<h2>1. 手册用途</h2>
<p>本手册用于说明软件的启动方式、操作流程、主要功能页面和常见问题处理方法，可作为软著登记中的“用户操作说明”材料。</p>

<h2>2. 启动与运行</h2>
<ol>
  <li>开发调试：使用 Cocos Creator 打开工程后在编辑器内预览运行。</li>
  <li>发布运行：执行构建脚本生成 Web 产物，通过浏览器或平台 WebView 访问。</li>
</ol>
<table>
  <tr><th style="width:28%">项目</th><th>说明</th></tr>
  <tr><td>推荐 Node.js</td><td>18 及以上版本</td></tr>
  <tr><td>推荐引擎版本</td><td>Cocos Creator ${escapeHtml(creatorVersion)}</td></tr>
  <tr><td>运行载体</td><td>PC 浏览器、移动浏览器、内嵌 WebView</td></tr>
</table>

<h2>3. 基础操作</h2>
<ul>
  <li>PC 端移动：W / A / S / D（或方向键）</li>
  <li>移动端移动：虚拟摇杆</li>
  <li>攻击方式：自动攻击（根据目标范围判定）</li>
  <li>交互方式：点击按钮完成建造、升级、选卡、选武器、使用道具</li>
</ul>

<h2>4. 玩法流程</h2>
<ol>
  <li>战前建造：选择建造点放置防御建筑，形成基础火力与经济循环。</li>
  <li>波次防守：敌人按三路与随机组合进攻，玩家需动态调整防线。</li>
  <li>成长选择：在波间进行武器、增益卡牌、道具选择，形成局内成长。</li>
  <li>Boss 回合：击败 Boss 后获取宝箱，提升局内逆转与策略空间。</li>
  <li>回合结算：失败或结束后提交成绩并更新排行榜、结算钻石。</li>
</ol>

<h2>5. 主要界面说明</h2>
<h3>5.1 首页</h3>
<ul>
  <li>开始游戏：进入新的一局。</li>
  <li>继续游戏：检测到本地有效存档时可继续。</li>
  <li>排行榜：查看最高分与波次排行。</li>
  <li>商店：消耗钻石购买道具。</li>
</ul>

<h3>5.2 战斗 HUD</h3>
<ul>
  <li>金币显示：反映当前可用于建造和升级的资源。</li>
  <li>波次信息：展示当前波次与下一波倒计时。</li>
  <li>基地生命：展示基地当前生命状态。</li>
  <li>武器/道具栏：展示当前可用能力和库存。</li>
</ul>

<h3>5.3 选择界面</h3>
<ul>
  <li>武器选择：每次提供 3 选 1，重复武器可升级。</li>
  <li>增益卡选择：每次提供 3 选 1，强化角色属性。</li>
  <li>道具选择：Boss 宝箱触发 3 选 1，进入背包待使用。</li>
</ul>

<h2>6. 存档与恢复</h2>
<p>软件具备自动存档能力，支持定时保存、关键节点即时保存以及版本迁移读取。用户重启后可通过“继续游戏”恢复最近一局状态。</p>

<h2>7. 常见问题处理</h2>
<table>
  <tr><th style="width:34%">问题</th><th>处理建议</th></tr>
  <tr><td>排行榜无法刷新</td><td>检查网络连通性、后端接口状态与平台域名配置。</td></tr>
  <tr><td>成绩疑似重复提交</td><td>系统已通过 runId 做幂等防重，检查客户端 runId 传递逻辑。</td></tr>
  <tr><td>移动端加载慢</td><td>确认首次资源加载完成，必要时降低并发后台应用占用。</td></tr>
  <tr><td>恢复存档失败</td><td>检查本地存档是否过期或版本结构不兼容。</td></tr>
</table>

<h2>8. 版本信息</h2>
<p>软件版本：V${escapeHtml(version)}。</p>
<p>文档生成日期：${escapeHtml(todayCn)}。</p>
`
    );

    await writeFile(path.join(OUTPUT_DIR, '03_用户操作手册.md'), manualMd);
    await writeFile(path.join(HTML_DIR, '03_用户操作手册.html'), manualHtml);

    // 4) 提交清单与步骤
    const checklistMd = `# 软著提交清单与步骤（办理版）

## A. 你现在可直接使用的文件（本次已生成）

1. 01_软著申请信息汇总.pdf  
2. 02_软件说明书.pdf  
3. 03_用户操作手册.pdf  
4. 04_源程序_前1500行.pdf / txt  
5. 05_源程序_后1500行.pdf / txt  

## B. 仍需你补充的材料（无法从代码自动生成）

1. 申请人身份证明文件  
2. 著作权归属证明（如合作/委托开发）  
3. 官方系统导出的《计算机软件著作权登记申请表》  

## C. 提交步骤建议

1. 先在版权保护中心系统填写申请表。  
2. 上传源程序文档（前后各1500行）。  
3. 上传软件说明书（建议使用本包中的 02_软件说明书.pdf）。  
4. 上传身份证明与其他权属文件。  
5. 提交后关注补正通知，按通知补充。  

## D. 填写注意

- 运行平台写“当前已实现和可验证”的环境，不写尚未实现的平台。  
- 软件名称、版本号、完成日期应和说明书及源程序保持一致。  
- 若后续上线微信/抖音正式版，可在后续版本登记中更新平台信息。  
`;

    const checklistHtml = toBaseHtml(
        '软著提交清单与步骤',
        `
<h1>软著提交清单与步骤</h1>
<p class="muted">该清单用于把“已自动生成材料”与“需人工补充材料”分开处理，降低退回率。</p>

<h2>A. 已生成文件（可直接用）</h2>
<ol>
  <li><code>01_软著申请信息汇总.pdf</code></li>
  <li><code>02_软件说明书.pdf</code></li>
  <li><code>03_用户操作手册.pdf</code></li>
  <li><code>04_源程序_前1500行.pdf</code> 与 <code>04_源程序_前1500行.txt</code></li>
  <li><code>05_源程序_后1500行.pdf</code> 与 <code>05_源程序_后1500行.txt</code></li>
</ol>

<h2>B. 需你补充的材料</h2>
<ul>
  <li>申请人身份证明（个人身份证 / 企业营业执照）</li>
  <li>权属证明（仅合作开发/委托开发场景）</li>
  <li>官方系统导出的《计算机软件著作权登记申请表》</li>
</ul>

<h2>C. 提交流程建议</h2>
<ol>
  <li>在版权保护中心系统填写并导出申请表。</li>
  <li>上传源程序（前后各 1500 行）和说明文档。</li>
  <li>上传主体证明及必要权属附件。</li>
  <li>提交后关注补正通知并在期限内处理。</li>
</ol>

<h2>D. 一致性检查要点</h2>
<table>
  <tr><th style="width:30%">检查项</th><th>要求</th></tr>
  <tr><td>软件名称</td><td>申请表、说明书、源程序封面保持一致</td></tr>
  <tr><td>版本号</td><td>统一使用 V${escapeHtml(version)}</td></tr>
  <tr><td>完成日期</td><td>申请表与说明书一致</td></tr>
  <tr><td>运行平台</td><td>仅写当前已实现、可验证的平台环境</td></tr>
  <tr><td>主体信息</td><td>名称、证件号、联系人、地址完整准确</td></tr>
</table>
`
    );

    await writeFile(path.join(OUTPUT_DIR, '06_提交清单与步骤.md'), checklistMd);
    await writeFile(path.join(HTML_DIR, '06_提交清单与步骤.html'), checklistHtml);

    // 7) 权属与声明模板（按需）
    const rightsMd = `# 权属与声明模板（按需提交）

> 说明：以下模板用于软著办理中常见“补充说明”场景。请按实际情况填写并加盖签字/公章后再提交。

## 模板 A：软件权属声明（原始开发）

声明人（著作权人）：【填写姓名或公司全称】  
证件号码/统一社会信用代码：【填写】  

现声明如下：  
1. 《${SOFTWARE_NAME_ZH}》（版本 V${version}）系声明人独立完成开发。  
2. 该软件开发过程中不存在侵害第三方著作权、商标权或其他知识产权的情形。  
3. 声明人对该软件依法享有完整著作权，并承担由此声明引起的法律责任。  

声明人签字/盖章：__________  
日期：____年__月__日  

## 模板 B：未委托/未合作开发说明

兹说明，《${SOFTWARE_NAME_ZH}》（版本 V${version}）为本主体自行研发，  
不存在委托开发、合作开发、受让取得等权利来源情形。  

说明主体签字/盖章：__________  
日期：____年__月__日  

## 模板 C：委托代理授权书（如委托代办）

委托人：__________  
受托人：__________  

委托事项：办理《${SOFTWARE_NAME_ZH}》计算机软件著作权登记相关手续，  
包括材料提交、补正、领取证书等。  

授权期限：____年__月__日至____年__月__日。  

委托人签字/盖章：__________  
受托人签字/盖章：__________  
日期：____年__月__日  
`;

    const rightsHtml = toBaseHtml(
        '权属与声明模板（按需提交）',
        `
<h1>权属与声明模板（按需提交）</h1>
<p class="muted">以下模板用于软著办理中的常见补充材料场景。请按实际情况填写，签字或加盖公章后提交。</p>

<h2>模板 A：软件权属声明（原始开发）</h2>
<p>声明人（著作权人）：【填写姓名或公司全称】</p>
<p>证件号码/统一社会信用代码：【填写】</p>
<p>现声明如下：</p>
<ol>
  <li>《${escapeHtml(SOFTWARE_NAME_ZH)}》（版本 V${escapeHtml(version)}）系声明人独立完成开发。</li>
  <li>该软件开发过程中不存在侵害第三方知识产权的情形。</li>
  <li>声明人对该软件依法享有完整著作权，并承担由此声明引起的法律责任。</li>
</ol>
<p>声明人签字/盖章：__________</p>
<p>日期：____年__月__日</p>

<h2>模板 B：未委托/未合作开发说明</h2>
<p>兹说明，《${escapeHtml(SOFTWARE_NAME_ZH)}》（版本 V${escapeHtml(version)}）为本主体自行研发，不存在委托开发、合作开发、受让取得等权利来源情形。</p>
<p>说明主体签字/盖章：__________</p>
<p>日期：____年__月__日</p>

<h2>模板 C：委托代理授权书（如委托代办）</h2>
<p>委托人：__________</p>
<p>受托人：__________</p>
<p>委托事项：办理《${escapeHtml(SOFTWARE_NAME_ZH)}》计算机软件著作权登记相关手续，包括材料提交、补正、领取证书等。</p>
<p>授权期限：____年__月__日至____年__月__日。</p>
<p>委托人签字/盖章：__________</p>
<p>受托人签字/盖章：__________</p>
<p>日期：____年__月__日</p>
`
    );

    await writeFile(path.join(OUTPUT_DIR, '07_权属与声明模板.md'), rightsMd);
    await writeFile(path.join(HTML_DIR, '07_权属与声明模板.html'), rightsHtml);

    // 8) 源程序前后 1500 行
    const mergedSourceLines = [];
    for (const item of allLineStats) {
        const rel = toPosixRelative(item.file);
        mergedSourceLines.push(`// ===== FILE: ${rel} =====`);
        mergedSourceLines.push(...item.text.split('\n'));
    }

    const first1500 = mergedSourceLines.slice(0, 1500);
    const last1500 = mergedSourceLines.slice(-1500);

    await writeFile(path.join(SOURCE_DIR, '04_源程序_前1500行.txt'), `${first1500.join('\n')}\n`);
    await writeFile(path.join(SOURCE_DIR, '05_源程序_后1500行.txt'), `${last1500.join('\n')}\n`);

    const sourceFrontHtml = toCodeHtml(
        `${SOFTWARE_NAME_ZH} 源程序文档（前1500行）`,
        first1500,
        1,
        '源程序按项目代码合并后截取前 1500 行，保留文件边界标记，供软著登记提交。'
    );
    const sourceBackStart = mergedSourceLines.length - last1500.length + 1;
    const sourceBackHtml = toCodeHtml(
        `${SOFTWARE_NAME_ZH} 源程序文档（后1500行）`,
        last1500,
        sourceBackStart,
        '源程序按项目代码合并后截取后 1500 行，保留文件边界标记，供软著登记提交。'
    );

    await writeFile(path.join(HTML_DIR, '04_源程序_前1500行.html'), sourceFrontHtml);
    await writeFile(path.join(HTML_DIR, '05_源程序_后1500行.html'), sourceBackHtml);

    // 6) 渲染 PDF
    const htmlToPdfPairs = [
        ['01_软著申请信息汇总.html', '01_软著申请信息汇总.pdf'],
        ['02_软件说明书.html', '02_软件说明书.pdf'],
        ['03_用户操作手册.html', '03_用户操作手册.pdf'],
        ['04_源程序_前1500行.html', '04_源程序_前1500行.pdf'],
        ['05_源程序_后1500行.html', '05_源程序_后1500行.pdf'],
        ['06_提交清单与步骤.html', '06_提交清单与步骤.pdf'],
        ['07_权属与声明模板.html', '07_权属与声明模板.pdf'],
    ];

    for (const [htmlName, pdfName] of htmlToPdfPairs) {
        const htmlPath = path.join(HTML_DIR, htmlName);
        const pdfPath = path.join(PDF_DIR, pdfName);
        await renderPdf(htmlPath, pdfPath);
    }

    // 7) 打包 zip
    const zipPath = path.join(OUTPUT_DIR, '软著提交包_老奶大战机器人.zip');
    if (await fileExists(zipPath)) {
        await fs.rm(zipPath);
    }
    await execFileAsync('zip', [
        '-r',
        zipPath,
        'pdf',
        'source',
        '01_软著申请信息汇总.md',
        '02_软件说明书.md',
        '03_用户操作手册.md',
        '06_提交清单与步骤.md',
        '07_权属与声明模板.md',
    ], { cwd: OUTPUT_DIR });

    const readme = `# 软著材料输出目录

生成时间：${todayCn}

## 目录说明

- \`pdf/\`：可直接提交的 PDF 材料
- \`source/\`：源程序前后 1500 行 TXT 文档
- \`html/\`：用于生成 PDF 的中间文件（可忽略）
- \`软著提交包_老奶大战机器人.zip\`：打包好的提交文件

## 关键提示

1. 官方《软件著作权登记申请表》需在版权保护中心系统在线填写并导出，本目录未自动生成该官方表单。
2. 请在提交前补全申请人主体信息（姓名/公司名称、证件号、联系方式）。
3. 若需改动说明书内容，可编辑同目录下的 Markdown 文件后重新执行本脚本。
`;
    await writeFile(path.join(OUTPUT_DIR, 'README.md'), readme);

    if (await fileExists(CHROME_USER_DATA_DIR)) {
        await fs.rm(CHROME_USER_DATA_DIR, { recursive: true, force: true });
    }

    console.log('Softcopyright package generated at:', OUTPUT_DIR);
    console.log('ZIP:', zipPath);
}

build().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
