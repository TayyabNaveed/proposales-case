import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createProposales} from '../src/server/providers/proposales.js';
import {createDatabase,createOperationStore} from '../src/server/db.js';
import {draftEvidence} from '../src/server/discovery.js';
import {executeDraft} from '../src/server/operations.js';
import {loadLocalEnv,safeFailure} from './env.js';
const command=process.argv[2];
try{
 loadLocalEnv();
 if(command==='model'){
  const {probeStructuredModel}=await import('../src/server/providers/deepseek.js');
  console.log(JSON.stringify(await probeStructuredModel()));
 }else{
  const companyId=process.env.PROPOSALES_COMPANY_ID??'';
  const api=createProposales({apiKey:process.env.PROPOSALES_API_KEY??'',companyId});
  const company=await api.verifyCompany();
  if(command==='companies')console.log(JSON.stringify({ok:true,companyScopeVerified:true,currency:company.currency}));
  else if(command==='content')console.log(JSON.stringify({ok:true,contentCount:await api.contentCount()}));
  else if(command==='draft'||command==='verify-draft'){
   const pool=createDatabase();
   try{
    const store=createOperationStore(pool);
    const key=`company:${companyId}:discovery-offer:v1`;
    const input={title:'Discovery — Metascalers case (do not send)',description:'Synthetic integration check. This is an unsent technical-case draft, not a commercial offer. No recipient, price or service commitment has been approved.',operationKey:key};
    const hash=createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const outcome=command==='draft'?await executeDraft({key,hash,store,create:()=>api.createDraft(input)}):await store.get(key);
    if(outcome.state!=='confirmed'||!outcome.providerId){console.log(JSON.stringify({ok:false,state:outcome.state,reconciliationRequired:true}));process.exitCode=1;}
    else{
     const proposal=await api.getDraft(outcome.providerId);
     const matches=await api.findByOperation(key);
     const result={...draftEvidence(proposal,matches,outcome.providerId,key),state:outcome.state,providerStatus:proposal.status,metadataRoundTrip:proposal.data?.case_operation===key,searchFindsDraft:matches.some(m=>m.uuid===outcome.providerId),recipientSet:proposal.recipient_is_set??null,blocks:proposal.blocks?.length??null,currency:proposal.currency??null};
     fs.mkdirSync('private',{recursive:true,mode:0o700});
     fs.writeFileSync('private/discovery-draft.json',JSON.stringify({providerId:outcome.providerId,operationKey:key,...result},null,2)+'\n',{mode:0o600});
     console.log(JSON.stringify(result));if(!result.ok)process.exitCode=1;
    }
   }finally{await pool.end();}
  }else throw new Error('Usage: probe companies|content|draft|verify-draft|model');
 }
}catch(e){safeFailure(e);}
