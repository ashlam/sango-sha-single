'use strict';
/* ============================================================
 *  三国杀 · 技能单元测试
 *  用法：
 *    node tools/skilltest.js            跑全部
 *    node tools/skilltest.js 流离       只跑名字含「流离」的
 *    node tools/skilltest.js 锁定技     只跑某分组
 * ============================================================ */
const fs = require('fs');
const path = require('path');
const H = require('./skilllib');

const dir = path.join(__dirname, 'tests');
fs.readdirSync(dir)
  .filter(f => f.endsWith('.js'))
  .sort()
  .forEach(f => require(path.join(dir, f)));

const filter = process.argv[2] || '';
H.run(filter).then(n => process.exit(n ? 1 : 0));
