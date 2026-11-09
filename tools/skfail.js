const fs=require('fs'), vm=require('vm'), path=require('path');
const sandbox={console,Math,Date,JSON,Promise,setTimeout,Number,Array,Object,String,Boolean,Set,Map};
vm.createContext(sandbox);
const bundle=['data.js','engine.js','skills.js','ai.js'].map(f=>fs.readFileSync(path.join(__dirname,'..','js',f),'utf8')).join('\n;\n')
 + `;globalThis.__APP={G,newGame,buildDeck,drawCards,gameLoop,AI,GENERALS,SKILLS};`;
vm.runInContext(bundle,sandbox,{filename:'b.js'});
Object.assign(sandbox,sandbox.__APP);
const {GENERALS}=sandbox;
const bad=[];
const orig=sandbox.useActiveSkill;
sandbox.useActiveSkill=async function(p,sid,r){
  const ok=await orig(p,sid,r);
  if(!ok) bad.push(`${p.general} → ${sid}（${sandbox.SKILLS[sid]&&sandbox.SKILLS[sid].name}）回合${sandbox.G.turn} usedActive=${JSON.stringify(p.usedActive)} marks=${JSON.stringify(p.marks)} hand=${p.hand.length}`);
  return ok;
};
function setup(n){sandbox.newGame({playerCount:n});const G=sandbox.G,used=[];
 G.players.forEach(p=>{const c=GENERALS.filter(g=>!used.includes(g.id));const g=c[Math.floor(Math.random()*c.length)];used.push(g.id);
 Object.assign(p,{generalId:g.id,general:g.name,name:g.name,kingdom:g.kingdom,sex:g.sex,maxHp:g.hp,hp:g.hp,skills:g.skills.slice(),isAI:true});});
 const lord=G.players.find(p=>p.identity==='lord'); if(lord){lord.maxHp+=1;lord.hp=lord.maxHp;}
 sandbox.buildDeck();G.players.forEach(p=>sandbox.drawCards(p,4));G.current=lord?lord.seat:0;
 G.responder=(p,req)=>sandbox.AI.decide(p,req);return G;}
(async()=>{for(let i=0;i<Number(process.argv[2]||10);i++){setup(8);await sandbox.gameLoop();}
 console.log('主动技失败',bad.length,'次');
 bad.slice(0,12).forEach(x=>console.log('  ·',x));})();
