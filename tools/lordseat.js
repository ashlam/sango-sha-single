const fs=require('fs'),vm=require('vm'),path=require('path');
const sandbox={console,Math,Date,JSON,Promise,setTimeout,Number,Array,Object,String,Boolean,Set,Map};
vm.createContext(sandbox);
const bundle=['data.js','engine.js','skills.js','ai.js'].map(f=>fs.readFileSync(path.join(__dirname,'..','js',f),'utf8')).join('\n;\n')
 + `;globalThis.__APP={G,newGame,IDENTITY_SETUP};`;
vm.runInContext(bundle,sandbox,{filename:'b.js'});
Object.assign(sandbox,sandbox.__APP);
for (const n of [4,5,6,8]) {
  const hist={};
  for (let i=0;i<400;i++){
    sandbox.newGame({playerCount:n});
    const lord=sandbox.G.players.find(p=>p.identity==='lord');
    hist[lord.seat]=(hist[lord.seat]||0)+1;
  }
  console.log(`${n}人 主公座位分布:`,JSON.stringify(hist));
}
