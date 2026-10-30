// Запуск: node tests/run-tests.js — проверяет, что потомство наследует характеристики родителей.
const fs = require('fs'), vm = require('vm'), path = require('path');
for (const f of ['core', 'genome', 'brain', 'memory', 'world', 'species', 'sim', 'sprites', 'lab'])
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'js', f + '.js'), 'utf8'), { filename: f + '.js' });
const res = AW.Lab.runInheritanceTests();
let fail = 0;
for (const t of res) { console.log(`${t.ok ? '✓' : '✗'} ${t.name} — ${t.detail}`); if (!t.ok) fail++; }
console.log(fail ? `\nПровалено: ${fail}` : `\nВсе ${res.length} тестов пройдены`);
process.exit(fail ? 1 : 0);
