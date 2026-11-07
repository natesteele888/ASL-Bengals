// A made-up opponent pack for guide screenshots. Not any real team's plays.
const L=[-300,-200,-100,0,100,200].map((x,i)=>({x,y:0,c:x===0,line:true}));
const P=(...a)=>a.map(([x,y])=>({x,y,c:false,line:false}));
const F={
  'Shotgun Two Wide':[...L,...P([-50,-260],[60,-260],[0,-200],[-760,-40],[640,-40])],
  'I Formation':[...L,...P([0,-200],[0,-320],[-760,-60],[600,-30],[0,-84])],
};
const form=(name,tag)=>({cat:'formation',name,notes:[tag],players:F[name],routes:[],labels:[],tag});
module.exports=[
  form('Shotgun Two Wide','Nightmare'),
  form('I Formation','Cover 2'),
  {cat:'run',name:'Run 1',notes:[],players:F['I Formation'],formation:'I Formation',labels:[],routes:[
    {pts:[[0,-320],[40,-250],[120,-150],[180,-60],[220,40]],end:'a',curve:true,dash:false,ball:true},
    {pts:[[0,-200],[110,-60]],end:'b',curve:false,dash:false}]},
  {cat:'run',name:'Run 2',notes:[],players:F['I Formation'],formation:'I Formation',labels:[],routes:[
    {pts:[[0,-320],[-60,-240],[-200,-130],[-320,-40],[-380,60]],end:'a',curve:true,dash:false,ball:true},
    {pts:[[0,-200],[-220,-50]],end:'b',curve:false,dash:false}]},
  {cat:'pass',name:'Pass 1',notes:[],players:F['Shotgun Two Wide'],formation:'Shotgun Two Wide',labels:[],routes:[
    {pts:[[-760,-40],[-760,260],[-640,380]],end:'a',curve:true,dash:false},
    {pts:[[640,-40],[640,180],[420,240]],end:'a',curve:false,dash:false,ball:true},
    {pts:[[60,-260],[260,-200],[340,-40]],end:'a',curve:true,dash:false}]},
];
