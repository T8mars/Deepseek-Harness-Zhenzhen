import { mkdirSync,writeFileSync,appendFileSync } from 'node:fs';
import { collectProposal } from './update-proposal.mjs';
const validation=Object.fromEntries(['prepare','dependencies','review','contracts','installation'].map(name=>[name,process.env[`VALIDATION_${name.toUpperCase()}`]||'skipped']));
const proposal=collectProposal(process.cwd(),validation);mkdirSync('.runtime',{recursive:true});writeFileSync('.runtime/update-proposal.json',JSON.stringify(proposal)+'\n');
console.log(`Prepared ${proposal.files.length} explicitly allowed files; no private root files or executable bundles attached.`);
if(process.env.GITHUB_OUTPUT)appendFileSync(process.env.GITHUB_OUTPUT,`has_proposal=${proposal.files.length>0}\n`);
