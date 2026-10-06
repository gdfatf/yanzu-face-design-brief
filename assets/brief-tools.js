import {React,jsxRuntime} from './react-runtime.js';
import {newId,emptyDraft,normalizeDraft,backupJson,parseBackup,textDocument,htmlDocument,pdfDocument} from './brief-document.js';
export {newId};
const {jsx,jsxs}=jsxRuntime;
const {useState,useEffect,useRef,useSyncExternalStore}=React;
const LEGACY_KEY='yanzu-brief-draft-v1';
let dbPromise;
function database(){
  if(!dbPromise) dbPromise=new Promise((resolve,reject)=>{
    if(!globalThis.indexedDB) return reject(new Error('浏览器不支持本地草稿存储。'));
    const request=indexedDB.open('yanzu-brief',1);
    const timer=setTimeout(()=>reject(new Error('本地草稿存储不可用。')),4000);
    request.onupgradeneeded=()=>request.result.createObjectStore('drafts');
    request.onsuccess=()=>{clearTimeout(timer);resolve(request.result);};
    request.onerror=()=>{clearTimeout(timer);reject(request.error);};
    request.onblocked=()=>{clearTimeout(timer);reject(new Error('本地草稿存储被占用。'));};
  });
  return dbPromise;
}
async function draftTransaction(mode, value){
  const db=await database();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('drafts',mode),store=tx.objectStore('drafts');
    const request=mode==='readonly' ? store.get('current') : store.put(value,'current');
    tx.oncomplete=()=>resolve(request.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });
}
function localDraft(){try{const text=localStorage.getItem(LEGACY_KEY);return text ? JSON.parse(text) : null;}catch{return null;}}
async function loadDraft(){
  let stored=null;
  try{stored=await draftTransaction('readonly');}catch{}
  const legacy=localDraft();
  const choices=[stored,legacy].filter(Boolean).sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0));
  for(const choice of choices){try{return normalizeDraft(choice);}catch{}}
  return emptyDraft();
}
async function saveDraft(draft){
  const data={...draft,updatedAt:Date.now()};
  try{await draftTransaction('readwrite',data);return;}catch{}
  // A complete fallback, including images, is preferable to silently dropping them.
  localStorage.setItem(LEGACY_KEY,JSON.stringify(data));
}
export function useDraft(){
  const [values,setValues]=useState({}),[interventions,setInterventions]=useState([]);
  const [status,setStatus]=useState(''),[ready,setReady]=useState(false);
  const current=useRef({values,interventions}),saveSequence=useRef(0);
  current.current={values,interventions};
  useEffect(()=>{
    let active=true;
    loadDraft().then(draft=>{if(active){setValues(draft.values);setInterventions(draft.interventions);setReady(true);}});
    return ()=>{active=false;};
  },[]);
  async function save(){
    const sequence=++saveSequence.current;
    setStatus('正在保存…');
    try{await saveDraft(current.current);if(sequence===saveSequence.current)setStatus('文字与照片已保存到本机');}
    catch{if(sequence===saveSequence.current)setStatus('本机保存失败，请导出完整备份');}
  }
  useEffect(()=>{
    if(!ready) return;
    const timer=setTimeout(save,350);
    return()=>clearTimeout(timer);
  },[values,interventions,ready]);
  useEffect(()=>{
    if(!ready) return;
    const flush=()=>{void saveDraft(current.current).catch(()=>{});};
    const onHidden=()=>{if(document.visibilityState==='hidden')flush();};
    window.addEventListener('pagehide',flush);document.addEventListener('visibilitychange',onHidden);
    return()=>{window.removeEventListener('pagehide',flush);document.removeEventListener('visibilitychange',onHidden);};
  },[ready]);
  return [values,setValues,interventions,setInterventions,save,status,ready];
}
let uploadCount=0;
const uploadListeners=new Set();
const changeUploads=delta=>{uploadCount+=delta;uploadListeners.forEach(fn=>fn());};
const subscribeUploads=fn=>{uploadListeners.add(fn);return()=>uploadListeners.delete(fn);};
const useUploads=()=>useSyncExternalStore(subscribeUploads,()=>uploadCount,()=>0);
async function compressPhoto(file){
  if(file.size>30*1024*1024) throw new Error('单张照片请小于 30 MB。');
  const url=URL.createObjectURL(file),img=new Image();img.src=url;
  try{
    try{await img.decode();}catch{throw new Error(`无法读取“${file.name}”。请使用 JPG、PNG 或 WebP 照片。`);}
    const scale=Math.min(1,1600/Math.max(img.naturalWidth,img.naturalHeight));
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
    const ctx=canvas.getContext('2d');
    if(!ctx) throw new Error('浏览器无法处理照片，请换用系统浏览器。');
    ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
    let data=canvas.toDataURL('image/jpeg',0.88);
    if(data.length>1800000)data=canvas.toDataURL('image/jpeg',0.65);
    canvas.width=canvas.height=1;
    if(data.length>2000000)throw new Error(`“${file.name}”太大，请使用较小照片。`);
    return {name:file.name.slice(0,200),data};
  }finally{URL.revokeObjectURL(url);}
}
export function ImagePicker({title,max=5,value=[],onChange}){
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const active=useRef(true);
  useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
  async function pick(event){
    const files=Array.from(event.target.files||[]);event.target.value='';
    if(!files.length)return;
    if(files.length>max){setError(`最多上传 ${max} 张照片，请重新选择。`);return;}
    setBusy(true);setError('');changeUploads(1);
    try{const images=[];for(const file of files)images.push(await compressPhoto(file));if(active.current)onChange(images);}
    catch(error){if(active.current)setError(error.message);}
    finally{changeUploads(-1);if(active.current)setBusy(false);}
  }
  return jsxs('div',{className:'image-picker',children:[
    jsxs('label',{className:'upload-button',children:[jsx('input',{type:'file',accept:'image/*',multiple:max>1,onChange:pick,disabled:busy}),busy?'正在处理照片…':value.length?'重新选择照片':title]}),
    jsx('p',{className:'photo-note',children:`最多 ${max} 张；照片会随草稿保存到本机，并包含在导出文件中。`}),
    error&&jsx('p',{className:'brief-error',role:'alert',children:error}),
    value.length>0&&jsx('div',{className:'image-grid',children:value.map((image,i)=>jsxs('div',{children:[jsx('img',{src:image.data,alt:image.name}),jsx('button',{type:'button',className:'photo-remove',onClick:()=>onChange(value.filter((_,index)=>index!==i)),disabled:busy,children:'移除照片'})]},`${i}-${image.name}`))})
  ]});
}
const fileStem=()=>`颜祖全案答卷-${new Date().toISOString().slice(0,10)}`;
function useFiles(draft){
  const [files,setFiles]=useState(null),[progress,setProgress]=useState('正在生成 PDF…'),[error,setError]=useState('');
  useEffect(()=>{
    let active=true;const urls=[];
    const url=blob=>{const result=URL.createObjectURL(blob);urls.push(result);return result;};
    const name=fileStem();
    const base={name,text:textDocument(draft),html:url(new Blob([htmlDocument(draft)],{type:'text/html;charset=utf-8'})),backup:url(new Blob([backupJson(draft)],{type:'application/json;charset=utf-8'}))};
    setFiles(base);
    pdfDocument(draft,message=>{if(active)setProgress(message);}).then(pdf=>{
      if(!active)return;
      const file=new File([pdf],`${name}.pdf`,{type:'application/pdf'});
      let canShare=false;try{canShare=!!navigator.canShare?.({files:[file]});}catch{}
      setFiles({...base,pdf:url(pdf),file,canShare});setProgress('');
    }).catch(error=>{if(active){setError(error.message||'PDF 生成失败，请使用图文答卷或完整备份。');setProgress('');}});
    return()=>{active=false;urls.forEach(URL.revokeObjectURL);};
  },[draft]);
  return [files,progress,error];
}
function ExportDialog({draft,onClose}){
  const dialogRef=useRef(),previousFocus=useRef(document.activeElement);
  const [files,progress,error]=useFiles(draft),[message,setMessage]=useState(''),[copyVisible,setCopyVisible]=useState(false);
  const textRef=useRef();
  useEffect(()=>{
    const dialog=dialogRef.current;
    if(dialog.showModal)dialog.showModal();else dialog.setAttribute('open','');
    return()=>previousFocus.current?.focus?.();
  },[]);
  useEffect(()=>{if(copyVisible){textRef.current?.focus();textRef.current?.select();}},[copyVisible]);
  async function share(){
    try{await navigator.share({files:[files.file],title:'颜祖全案设计委托书'});setMessage('已完成分享。');}
    catch(error){if(error.name!=='AbortError')setMessage('当前浏览器无法分享文件，请下载 PDF 或打开 PDF 后使用浏览器菜单保存。');}
  }
  async function copy(){
    try{if(!navigator.clipboard?.writeText)throw new Error();await navigator.clipboard.writeText(files.text);setMessage('文字答卷已复制。照片请通过 PDF、图文答卷或完整备份发送。');}
    catch{setCopyVisible(true);setMessage('浏览器无法自动复制，请长按下方文字，选择全选并复制。');}
  }
  const link=(label,url,extension)=>jsx('a',{className:'quiet-button',href:url,download:`${files.name}.${extension}`,children:label});
  return jsxs('dialog',{className:'brief-export-dialog',ref:dialogRef,onCancel:event=>{event.preventDefault();onClose();},children:[
    jsx('button',{className:'brief-close',type:'button','aria-label':'关闭导出窗口',onClick:onClose,children:'×'}),
    jsx('h2',{children:'导出答卷'}),
    jsx('p',{children:'文件包含当前答案与已上传照片。选择下载，或使用手机分享功能保存到文件、发送给设计团队。'}),
    progress&&jsx('p',{role:'status',children:progress}),error&&jsx('p',{role:'alert',className:'brief-error',children:error}),
    files&&jsxs('div',{className:'brief-export-options',children:[
      files.pdf&&jsx('a',{className:'primary-button',href:files.pdf,download:`${files.name}.pdf`,children:'下载 PDF'}),
      files.canShare&&jsx('button',{className:'quiet-button',type:'button',onClick:share,children:'分享 PDF'}),
      files.pdf&&jsx('a',{className:'quiet-button',href:files.pdf,target:'_blank',rel:'noopener',children:'打开 PDF'}),
      link('下载图文答卷',files.html,'html'),link('下载完整备份',files.backup,'json'),
      jsx('button',{className:'quiet-button',type:'button',onClick:copy,children:'复制文字答卷'})
    ]}),
    jsx('p',{className:'photo-note',children:'如果下载没有反应，点击“打开 PDF”，再通过浏览器菜单保存或分享。完整备份可在另一台设备上导入，继续填写。'}),
    message&&jsx('p',{role:'status',children:message}),
    copyVisible&&jsx('textarea',{ref:textRef,readOnly:true,value:files.text,'aria-label':'文字答卷，长按全选复制',rows:10})
  ]});
}
export function ExportButton({draft}){
  const [snapshot,setSnapshot]=useState(null),uploads=useUploads();
  return jsxs(React.Fragment,{children:[
    jsx('button',{type:'button',className:'primary-button',disabled:uploads>0,onClick:()=>setSnapshot(normalizeDraft(draft)),children:uploads?'照片处理中…':'导出答卷'}),
    snapshot&&jsx(ExportDialog,{draft:snapshot,onClose:()=>setSnapshot(null)})
  ]});
}
export function ImportButton({onRestore}){
  const [pending,setPending]=useState(null),[error,setError]=useState('');
  const uploads=useUploads();
  const inputRef=useRef(),dialogRef=useRef();
  useEffect(()=>{if(pending){if(dialogRef.current.showModal)dialogRef.current.showModal();else dialogRef.current.setAttribute('open','');}},[pending]);
  async function select(event){
    const file=event.target.files?.[0];event.target.value='';if(!file)return;
    setError('');
    try{if(file.size>60*1024*1024)throw new Error('备份文件请小于 60 MB。');setPending(parseBackup(await file.text()));}
    catch(error){setError(error.message||'无法读取备份文件。');}
  }
  return jsxs(React.Fragment,{children:[
    jsx('input',{ref:inputRef,type:'file',accept:'.json,application/json',hidden:true,onChange:select}),
    jsx('button',{type:'button',className:'quiet-button',disabled:uploads>0,onClick:()=>inputRef.current.click(),children:'导入备份'}),
    error&&jsx('p',{className:'brief-error',role:'alert',children:error}),
    pending&&jsxs('dialog',{className:'brief-export-dialog',ref:dialogRef,onCancel:event=>{event.preventDefault();setPending(null);},children:[
      jsx('h2',{children:'导入完整备份'}),
      jsx('p',{children:'导入后将替换当前答案和照片。可先取消，导出当前完整备份后再导入。'}),
      jsxs('div',{className:'brief-export-options',children:[jsx('button',{type:'button',className:'quiet-button',onClick:()=>setPending(null),children:'取消'}),jsx('button',{type:'button',className:'primary-button',onClick:()=>{onRestore(pending);setPending(null);},children:'替换并恢复'})]})
    ]})
  ]});
}
