import { execFileSync } from 'node:child_process';
execFileSync('git', ['config', '--local', 'core.hooksPath', '.githooks'], { stdio: 'inherit' });
console.log('Installed local commit and push guards.');
