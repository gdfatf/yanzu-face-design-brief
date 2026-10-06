/* Local-only answer exports. No form answers or photographs are sent to a server. */
export const VERSION = 2;
export const newId = () => globalThis.crypto?.randomUUID?.() || `item-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const emptyIntervention = () => ({id:newId(), project:'', part:'', date:'', material:'', dose:'', effect:'', photo:'', images:[]});
export const emptyDraft = () => ({values:{}, interventions:[emptyIntervention()]});
const valueKeys = ['designPrinciple','trace','quantity','risk','impression','avoidDirection','preserve','preserveNote','acceptNone','hasHistory','proposalProjects','proposalReason','proposalPrice','hesitation','budgetType','budget','recovery','timeline','currentState','currentStateNote','finalNote',...['护肤/轻治疗','注射（需维系）','小型手术','骨性手术','正畸','大型骨性手术（如正颌 Lefort II型）'].map(v=>`type-${v}`)];
const imagePattern = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/;
function validImages(images, limit) {
  if (images == null) return [];
  if (!Array.isArray(images) || images.length > limit) throw new Error('备份中的照片数量不正确。');
  return images.map(image => {
    if (!image || typeof image.data !== 'string' || image.data.length > 2000000 || !imagePattern.test(image.data)) throw new Error('备份中有不支持的照片。');
    return {name:String(image.name || '照片').slice(0,200), data:image.data};
  });
}
export function normalizeDraft(input) {
  if (!input || typeof input !== 'object' || !input.values || typeof input.values !== 'object' || Array.isArray(input.values)) throw new Error('文件不是有效的颜祖问卷备份。');
  const values = {};
  for (const key of valueKeys) {
    const v = input.values[key];
    if (v == null) continue;
    if (typeof v === 'string' && v.length <= 200000) values[key] = v;
    else if (Array.isArray(v) && v.length <= 50 && v.every(x=>typeof x === 'string' && x.length <= 1000)) values[key] = [...v];
    else throw new Error('备份中的答案格式不正确。');
  }
  values.referenceImages = validImages(input.values.referenceImages,5);
  if (!Array.isArray(input.interventions) || input.interventions.length > 100) throw new Error('备份中的经历记录格式不正确。');
  const ids = new Set();
  const interventions = input.interventions.map(item=> {
    if (!item || typeof item !== 'object') throw new Error('经历记录格式不正确。');
    const id = typeof item.id === 'string' && item.id.length < 100 && !ids.has(item.id) ? item.id : newId();
    ids.add(id);
    const result = {id, images:validImages(item.images,1)};
    for (const key of ['project','part','date','material','dose','effect','photo']) {
      if (item[key] != null && (typeof item[key] !== 'string' || item[key].length > 200000)) throw new Error('经历记录格式不正确。');
      result[key] = item[key] || '';
    }
    return result;
  });
  return {values, interventions:interventions.length ? interventions : [emptyIntervention()]};
}
export function backupJson(draft) {
  return JSON.stringify({kind:'yanzu-face-design-brief', version:VERSION, updatedAt:Date.now(), ...normalizeDraft(draft)},null,2);
}
export function parseBackup(text) {
  const data = JSON.parse(text);
  if (data.kind !== 'yanzu-face-design-brief' || data.version !== VERSION) throw new Error('请选择由本问卷导出的完整备份 JSON 文件。');
  return normalizeDraft(data);
}
const answer = value => Array.isArray(value) ? value.join('、') || '未填写' : String(value || '未填写');
const principles = {A:'A｜普适吸引力最大化', B:'B｜追求投产比最大化，且保留本人特征', C:'C｜个人审美导向'};
export function documentSections(draft) {
  const v = draft.values;
  const field = (title,key) => ({title, text:answer(v[key])});
  const scale = (title,key,left,right) => ({title, text:v[key] ? `${v[key]} / 5（1：${left}；5：${right}）` : `未填写（1：${left}；5：${right}）`});
  const history = [field('是否做过医美、整形、正畸或改变面部结构的项目？','hasHistory')];
  if(v.hasHistory === '做过') draft.interventions.forEach((item,i)=>{
    history.push({title:`第 ${i+1} 项经历`,text:['项目 / 手术名称','部位','大致时间','材料 / 假体 / 注射物','剂量或规格','目前是否仍存在影响','是否有术前照片'].map((label,j)=>`${label}：${answer(item[['project','part','date','material','dose','effect','photo'][j]])}`).join('\n'),images:item.photo === '上传' ? item.images || [] : []});
  });
  const current = [field('当前状态','currentState')];
  if(Array.isArray(v.currentState) && v.currentState.length && !v.currentState.includes('以上均无')) current.push(field('补充信息','currentStateNote'));
  return [
    {title:'先定义你的“最优解”', fields:[{title:'最高设计原则',text:answer(principles[v.designPrinciple])},scale('医美痕迹的在意程度','trace','极度自然、一定不能被发现做过','可以接受轻微医美痕迹'),scale('项目数量与效果上限','quantity','尽量少做项目','追求极致上限，接受更多项目和更长周期'),scale('风险与效果的取舍','risk','风险与可逆性优先','效果上限优先')]},
    {title:'你希望成为怎样的人', fields:[field('希望第一印象发生怎样的变化？','impression'),{title:'喜欢的脸或审美参考',text:(v.referenceImages||[]).length ? `已附 ${(v.referenceImages||[]).length} 张照片` : '未上传',images:v.referenceImages||[]},field('明确不希望变成的方向','avoidDirection')]},
    {title:'什么必须保留？',fields:[field('喜欢且不希望改变的特征','preserve'),field('补充','preserveNote'),field('是否接受少做甚至“不做”作为正式结论？','acceptNone')]},
    {title:'既往干预记录',fields:history},
    {title:'现有方案评估',fields:[field('建议项目','proposalProjects'),field('核心理由','proposalReason'),{title:'报价（元）',text:answer(v.proposalPrice)},field('目前最犹豫的地方','hesitation')]},
    {title:'现实世界的边界',fields:[field('未来 2 年的总体预算原则','budgetType'),...(v.budgetType === '具体预算范围' ? [{title:'预算范围（元）',text:answer(v.budget)}] : []),...['护肤/轻治疗','注射（需维系）','小型手术','骨性手术','正畸','大型骨性手术（如正颌 Lefort II型）'].map(type=>field(`项目接受程度：${type}`,`type-${type}`)),field('单次项目可接受的恢复期','recovery'),field('整体改变的完成期限','timeline')]},
    {title:'会影响设计判断的当前状态',fields:current},
    {title:'希望设计团队知道的其他话',fields:[field('补充留言','finalNote')]}
  ];
}
export function textDocument(draft) {
  return ['颜祖全案设计委托书',...documentSections(draft).flatMap(section=>['',section.title,...section.fields.flatMap(field=>[field.title,field.text,...(field.images||[]).map((image,i)=>`[照片 ${i+1}：${image.name}]`)])].map(x=>String(x)))].join('\n');
}
const escapeHtml = text => String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function htmlDocument(draft) {
  const sections = documentSections(draft).map(section=>`<section><h2>${escapeHtml(section.title)}</h2>${section.fields.map(field=>`<article><h3>${escapeHtml(field.title)}</h3><p>${escapeHtml(field.text)}</p>${(field.images||[]).map(image=>`<figure><img src="${image.data}" alt="${escapeHtml(image.name)}"><figcaption>${escapeHtml(image.name)}</figcaption></figure>`).join('')}</article>`).join('')}</section>`).join('');
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>颜祖全案设计委托书</title><style>body{font-family:"Microsoft YaHei","PingFang SC",sans-serif;color:#142533;max-width:820px;padding:24px;margin:auto;line-height:1.7}h1,h2{color:#031527}h2{border-bottom:1px solid #c5d1d9;padding-bottom:12px;margin-top:40px}h3{font-size:16px;margin:24px 0 8px}p{white-space:pre-wrap;overflow-wrap:anywhere}figure{margin:16px 0}img{max-width:100%;max-height:800px}figcaption{font-size:12px;color:#607383}@media print{article{break-inside:avoid}}</style><h1>颜祖全案设计委托书</h1>${sections}</html>`;
}

/* Small PDF image-page writer. Uses byte offsets (not string lengths) for xref. */
export function imagePagesPdf(pages) {
  const encode = text=>new TextEncoder().encode(text);
  const chunks = [], offsets = [0];
  let size=0;
  const append = data=>{const bytes=typeof data==='string'?encode(data):data;chunks.push(bytes);size+=bytes.length;};
  append('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  const object = (id,body)=>{offsets[id]=size;append(`${id} 0 obj\n`);body();append('\nendobj\n');};
  object(1,()=>append('<< /Type /Catalog /Pages 2 0 R >>'));
  object(2,()=>append(`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_,i)=>`${3+i*3} 0 R`).join(' ')}] >>`));
  pages.forEach((page,i)=>{
    const id=3+i*3;
    object(id,()=>append(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Im${i} ${id+1} 0 R >> >> /Contents ${id+2} 0 R >>`));
    object(id+1,()=>{append(`<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.bytes.length} >>\nstream\n`);append(page.bytes);append('\nendstream');});
    const stream=`q 595.28 0 0 841.89 0 0 cm /Im${i} Do Q`;
    object(id+2,()=>append(`<< /Length ${encode(stream).length} >>\nstream\n${stream}\nendstream`));
  });
  const xref=size, count=3+pages.length*3;
  append(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for(let i=1;i<count;i++) append(`${String(offsets[i]).padStart(10,'0')} 00000 n \n`);
  append(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(chunks,{type:'application/pdf'});
}

export async function pdfDocument(draft, onProgress=()=>{}) {
  if (document.fonts?.ready) await document.fonts.ready;
  const W=794, H=1123, margin=52, bottom=H-58, pages=[];
  const canvas=document.createElement('canvas');canvas.width=W*2;canvas.height=H*2;
  const ctx=canvas.getContext('2d');
  if(!ctx) throw new Error('此浏览器不能生成 PDF，请下载图文答卷或完整备份。');
  const font='"Microsoft YaHei","PingFang SC","Noto Sans CJK SC",sans-serif';
  let y=margin;
  function fresh(){ctx.setTransform(2,0,0,2,0,0);ctx.fillStyle='#fff';ctx.fillRect(0,0,W,H);y=margin;}
  async function finish(){
    ctx.fillStyle='#657583';ctx.font=`12px ${font}`;ctx.fillText(`颜祖全案设计委托书 · 第 ${pages.length+1} 页`,margin,H-28);
    const jpeg=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.92));
    if(!jpeg) throw new Error('PDF 生成失败，请使用图文答卷或完整备份。');
    pages.push({width:canvas.width,height:canvas.height,bytes:new Uint8Array(await jpeg.arrayBuffer())});
    fresh();onProgress(`已生成 ${pages.length} 页…`);
    await new Promise(resolve=>setTimeout(resolve,0));
  }
  async function room(height){if(y+height>bottom) await finish();}
  async function text(value,size=16,bold=false,color='#142533'){
    const lineHeight=size*1.65;
    const setFont=()=>{ctx.font=`${bold?'600 ':''}${size}px ${font}`;ctx.fillStyle=color;};
    setFont();
    for(const paragraph of String(value).split('\n')){
      let line='';
      for(const char of Array.from(paragraph)){
        if(line && ctx.measureText(line+char).width>W-margin*2){await room(lineHeight);setFont();ctx.fillText(line,margin,y+size);y+=lineHeight;line=char;}else line+=char;
      }
      await room(lineHeight);setFont();ctx.fillText(line,margin,y+size);y+=lineHeight;
    }
  }
  fresh();await text('颜祖全案设计委托书',28,true,'#031527');y+=12;
  await text(`导出时间：${new Date().toLocaleString('zh-CN')}`,12,false,'#657583');y+=16;
  for(const section of documentSections(draft)){
    await room(100);y+=14;await text(section.title,22,true,'#031527');y+=8;
    for(const field of section.fields){
      await room(70);await text(field.title,16,true);await text(field.text);y+=12;
      for(const image of field.images||[]){
        const img=new Image();img.src=image.data;
        try{await img.decode();}catch{throw new Error(`照片“${image.name}”无法读取，请重新上传，或先导出完整备份。`);}
        const ratio=Math.min((W-margin*2)/img.naturalWidth,500/img.naturalHeight);
        const w=img.naturalWidth*ratio,h=img.naturalHeight*ratio;
        await room(h+55);ctx.drawImage(img,margin,y,w,h);y+=h+6;
        await text(image.name,12,false,'#657583');y+=14;
      }
    }
  }
  await finish();canvas.width=canvas.height=1;
  return imagePagesPdf(pages);
}
