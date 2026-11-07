/** Static import check: every module must parse and resolve in Node. */
const modules = [
  '../src/domain/core.js', '../src/domain/inventory.js', '../src/domain/transfers.js',
  '../src/domain/sales.js', '../src/domain/purchasing.js', '../src/domain/projects.js',
  '../src/domain/crm.js', '../src/domain/opname.js', '../src/domain/reports.js',
  '../src/domain/seed.js', '../src/data/store.js', '../src/data/backup.js',
  '../src/data/simulation.js', '../src/ui/dom.js', '../src/ui/shell.js',
  '../src/ui/views/common.js', '../src/ui/views/print.js', '../src/ui/views/dashboard.js',
  '../src/ui/views/inventory.js', '../src/ui/views/transfers.js', '../src/ui/views/purchasing.js',
  '../src/ui/views/sales.js', '../src/ui/views/projects.js', '../src/ui/views/customers.js',
  '../src/ui/views/opname.js', '../src/ui/views/reports.js', '../src/ui/views/master.js',
  '../src/ui/views/simulation.js',
];

let failed = 0;
for (const path of modules) {
  try {
    await import(path);
    console.log('ok  ', path);
  } catch (err) {
    failed += 1;
    console.error('FAIL', path, '\n', err);
  }
}
if (failed) {
  console.error(`\n${failed} modul gagal dimuat.`);
  process.exit(1);
}
console.log(`\n${modules.length} modul dimuat tanpa error.`);
