import {readFileSync,lstatSync,realpathSync} from 'node:fs';
import {join} from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {canonicalVersion} from './upstream-policy.mjs';
import {readReleaseArchive} from './release-archive.mjs';

/** Validate exact final/canary identity before acquiring a runtime lease or touching any profile. */
export function readLaunchArtifact(workspace,manifest){
 const root=realpathSync.native(workspace);let runtime=join(root,'.runtime');for(const path of[runtime,join(runtime,'packages')]){const stat=lstatSync(path);if(!stat.isDirectory()||stat.isSymbolicLink()||realpathSync.native(path)!==path)throw Error('Bundle runtime directory is not owned.');}
 const ordinary=(path,limit)=>{const stat=lstatSync(path);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>limit||realpathSync.native(path)!==path)throw Error('Bundle artifact must be an ordinary bounded file.');return readFileSync(path);};
 let artifact;try{artifact=JSON.parse(ordinary(join(runtime,'package-artifact.json'),16384));}catch{throw Error('Build and run npm run pack:bundle first.');}
 if(!canonicalVersion(manifest?.version)||!/^\d+\.\d+\.\d+(?:-canary\.[1-9]\d*)?$/.test(manifest.version)||!artifact||Object.keys(artifact).sort().join(',')!=='file,sha256'||!/^[a-f0-9]{64}$/.test(artifact.sha256??'')||artifact.file!==`dsh-zhen-${manifest.version}-${artifact.sha256.slice(0,16)}.tgz`)throw Error('Bundle artifact filename or version differs from the source.');
 const archivePath=join(runtime,'packages',artifact.file),release=readReleaseArchive(ordinary(archivePath,8*1024*1024));
 if(release.sha256!==artifact.sha256||!isDeepStrictEqual(release.manifest,manifest))throw Error('Bundle artifact digest or full manifest does not match.');
 return{artifact,archivePath,digest:release.sha256};
}
