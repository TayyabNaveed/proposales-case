import fs from 'node:fs';
import {parseEnv} from 'node:util';
export function loadLocalEnv(){
 if(fs.existsSync('.env.local')){
  const local=parseEnv(fs.readFileSync('.env.local','utf8'));
  for(const [key,value] of Object.entries(local))if(process.env[key]===undefined)process.env[key]=value;
 }
}
export function safeFailure(error:unknown){
 // Do not print provider errors, SQL connection details or model raw responses.
 const code=typeof error==='object'&&error!==null&&'code'in error?String(error.code):'';
 console.error(JSON.stringify({ok:false,errorCode:/^[A-Z0-9_]{2,50}$/.test(code)?code:'PROBE_FAILED'}));
 process.exitCode=1;
}
