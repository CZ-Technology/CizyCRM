import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';

const [workflow]=JSON.parse(await readFile(new URL('../../infra/cz-technology/workflows/deploy-updater.n8n.json',import.meta.url),'utf8'));
const source=workflow.nodes.find(n=>n.name==='Verificar deploy').parameters.jsCode;
const evaluate=new Function('$input','$','$execution',source);
const targetTag='v1.89.0';
function verify(output){
 return evaluate({first:()=>({json:output})},name=>{
  assert.equal(name,'Code in JavaScript');return {first:()=>({json:{targetTag}})};
 },{id:'25884'})[0].json;
}
const success={code:0,signal:null,stdout:'deploy_result=ok version=v1.89.0\n',stderr:''};
test('o resultado real da execucao 25884 segue para o aviso de sucesso',()=>{
 assert.deepEqual(verify(success),{ok:true,targetTag,attemptId:'25884'});
});
test('falha, sinal, marcador ausente, outra versao e texto parcial nunca viram sucesso',()=>{
 for(const patch of [{code:1},{code:undefined},{signal:'SIGTERM'},{error:{message:'SSH failed'}},{stdout:''},
  {stdout:'deploy_result=ok version=v1.86.0\n'},{stdout:'echo deploy_result=ok version=v1.89.0\n'},
  {stdout:'deploy_result=error version=v1.89.0\n'},{stdout:'deploy_result=ok version=v1.89.0-extra\n'}]){
  assert.equal(verify({...success,...patch}).ok,false,JSON.stringify(patch));
 }
});
test('aceita linhas de log e CRLF, sem caracteres de controle invisiveis no codigo',()=>{
 assert.equal(verify({...success,stdout:'log anterior\r\ndeploy_result=ok version=v1.89.0\r\n'}).ok,true);
 assert.equal(source.includes(String.fromCharCode(8)),false);
});

test('monitor avisa falhas da main e ignora verificacoes de pull requests',async()=>{
 const [monitor]=JSON.parse(await readFile(new URL('../../infra/cz-technology/workflows/sync-monitor.n8n.json',import.meta.url),'utf8'));
 const select=new Function('$',monitor.nodes.find(n=>n.name==='Selecionar avisos').parameters.jsCode);
 const base={name:'Sync upstream (a cada 3 releases)',status:'completed',conclusion:'failure',updated_at:new Date().toISOString()};
 const runs=[
  {...base,id:1,event:'pull_request',head_branch:'fix/verify-fork-ops'},
  {...base,id:2,event:'pull_request_target',head_branch:'main'},
  {...base,id:3,event:'workflow_dispatch',head_branch:'feature/test'},
  {...base,id:4,event:'schedule',head_branch:'main'},
  {...base,id:5,event:'push',head_branch:'main'},
 ];
 const result=select(name=>name==='GitHub Actions'?{first:()=>({json:{workflow_runs:runs}})}:{all:()=>[]});
 assert.deepEqual(result.map(i=>i.json),[{kind:'sync-failed',value:'4'},{kind:'sync-failed',value:'5'}]);
});
