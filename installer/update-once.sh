#!/bin/sh
# One-time migration to 0.1.8 using the installed app's bundled Node runtime.
set -eu
EXECUTABLE=${1:-}
case "$EXECUTABLE" in --check|--yes) EXECUTABLE='' ;; esac
if [ -n "$EXECUTABLE" ]; then shift
else
  if command -v portal-console >/dev/null 2>&1; then EXECUTABLE=$(command -v portal-console)
  elif [ -x "$HOME/.local/bin/portal-console" ]; then EXECUTABLE="$HOME/.local/bin/portal-console"
  elif [ -x "$HOME/Applications/portal-console.app/Contents/MacOS/portal-console" ]; then EXECUTABLE="$HOME/Applications/portal-console.app/Contents/MacOS/portal-console"
  elif [ -x /Applications/portal-console.app/Contents/MacOS/portal-console ]; then EXECUTABLE=/Applications/portal-console.app/Contents/MacOS/portal-console
  else echo 'Pass the installed AppImage, .app or portal-console executable as the first argument.' >&2; exit 1; fi
fi
case "$EXECUTABLE" in *.app) EXECUTABLE="$EXECUTABLE/Contents/MacOS/portal-console" ;; esac
WORK=$(mktemp -d)
trap 'rm -rf -- "$WORK"' EXIT HUP INT TERM
export PORTAL_UPDATE_BOOTSTRAP="$WORK"
ELECTRON_RUN_AS_NODE=1 "$EXECUTABLE" -e '
const https=require("node:https"), fs=require("node:fs"), path=require("node:path"), crypto=require("node:crypto");
const {pipeline}=require("node:stream/promises");
function get(url,n=0){return new Promise((resolve,reject)=>{
  const u=new URL(url); if(u.protocol!=="https:"|| !["github.com","api.github.com"].includes(u.hostname)&&!u.hostname.endsWith(".githubusercontent.com"))return reject(new Error("Invalid download host"));
  const r=https.get(u,{headers:{"User-Agent":"Portal-Console-Updater"}},s=>{if([301,302,303,307,308].includes(s.statusCode)){s.resume();if(n>=5||!s.headers.location)return reject(new Error("Invalid redirect"));get(new URL(s.headers.location,u).href,n+1).then(resolve,reject)}else if(s.statusCode!==200){s.resume();reject(new Error("GitHub HTTP "+s.statusCode))}else resolve(s)});r.setTimeout(30000,()=>r.destroy(new Error("Download timed out")));r.on("error",reject);
})}
(async()=>{
 const metadata=await get("https://api.github.com/repos/drmsglados6/portal-console/releases/tags/v0.1.8");const chunks=[];let size=0;
 for await(const c of metadata){size+=c.length;if(size>4194304)throw new Error("Metadata too large");chunks.push(c)}
 const release=JSON.parse(Buffer.concat(chunks));const assets=release.assets.filter(a=>a.name==="update-once.cjs");
 const url="https://github.com/drmsglados6/portal-console/releases/download/v0.1.8/update-once.cjs";
 if(release.draft||release.prerelease||assets.length!==1||assets[0].browser_download_url!==url||!/^sha256:[a-f0-9]{64}$/.test(assets[0].digest))throw new Error("Invalid updater metadata");
 const asset=assets[0],file=path.join(process.env.PORTAL_UPDATE_BOOTSTRAP,"update-once.cjs");
 if(!Number.isSafeInteger(asset.size)||asset.size<=0||asset.size>4194304)throw new Error("Updater size is invalid");
 const {Transform}=require("node:stream");let bytes=0;const hash=crypto.createHash("sha256");
 await pipeline(await get(url),new Transform({transform(c,e,cb){bytes+=c.length;if(bytes>asset.size)return cb(new Error("Updater too large"));hash.update(c);cb(null,c)}}),fs.createWriteStream(file,{flags:"wx",mode:384}));
 if(bytes!==asset.size||"sha256:"+hash.digest("hex")!==asset.digest)throw new Error("Updater SHA-256 verification failed");
 process.argv=[process.execPath,file,...process.argv.slice(1)];require(file);
})().catch(e=>{console.error("Update failed: "+e.message);process.exitCode=1});
' -- "$@"
