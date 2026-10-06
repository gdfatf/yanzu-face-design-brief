const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict');
const {chromium}=require('playwright'),{PDFDocument}=require('pdf-lib');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
  fs.readFile(file,(error,data)=>{if(error){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.png':'image/png'})[path.extname(file)]||'application/octet-stream');res.end(data);});
});
const out=path.join(root,'test-results');fs.mkdirSync(out,{recursive:true});
const notes=[];
async function download(page,name){
  // Chrome throttles consecutive downloads even when each link is user-clicked.
  await page.waitForTimeout(1500);
  const promise=page.waitForEvent('download');
  await page.getByRole('link',{name,exact:true}).click();
  const result=await promise;
  return fs.readFileSync(await result.path());
}
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});
  try{
    const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
    const page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{
      localStorage.setItem('yanzu-brief-draft-v1',JSON.stringify({values:{avoidDirection:'旧草稿迁移测试'},interventions:[{project:'旧经历',part:'鼻部',date:'2022-01',material:'',dose:'',effect:'不确定',photo:''}]}));
      window.print=()=>{throw new Error('PRINT MUST NOT BE CALLED');};
    });
    await page.goto(origin);
    await assert.doesNotReject(()=>page.getByLabel('有没有你明确不希望变成的方向？').waitFor());
    assert.equal(await page.getByLabel('有没有你明确不希望变成的方向？').inputValue(),'旧草稿迁移测试');
    const note=('长答案中文标点测试：<script>不能执行</script> & 引号 "换行"。\n').repeat(70)+'最终结束标记';
    await page.getByLabel('还有什么其他话，你希望设计团队一定知道的。').fill(note);
    await page.locator('input[name="designPrinciple"][value="B"]').locator('..').click();
    await page.locator('input[name="hasHistory"][value="做过"]').locator('..').click();
    await page.locator('input[name="type-护肤/轻治疗"]').nth(2).locator('..').click();
    const photo=Buffer.from(await page.evaluate(()=>{
      const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=800;
      const ctx=canvas.getContext('2d');ctx.fillStyle='#c6dcef';ctx.fillRect(0,0,1200,800);ctx.fillStyle='#142533';ctx.font='80px sans-serif';ctx.fillText('照片恢复测试',90,300);
      return canvas.toDataURL('image/png').split(',')[1];
    }),'base64');
    await page.locator('.image-picker input[type=file]').first().setInputFiles({name:'reference.png',mimeType:'image/png',buffer:photo});
    await page.locator('.image-grid img').first().waitFor();
    await page.locator('.image-picker input[type=file]').first().setInputFiles({name:'broken.jpg',mimeType:'image/jpeg',buffer:Buffer.from('not an image')});
    await page.getByRole('alert').filter({hasText:'无法读取'}).waitFor();
    assert.equal(await page.locator('.image-grid img').count(),1);
    await page.locator('.intervention-card select').last().selectOption('上传');
    await page.locator('.intervention-card input[type=file]').setInputFiles({name:'before.png',mimeType:'image/png',buffer:photo});
    await page.locator('.intervention-card img').waitFor();
    await page.getByRole('button',{name:'保存草稿',exact:true}).last().scrollIntoViewIfNeeded();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);
    await page.getByRole('button',{name:'保存草稿',exact:true}).last().click();
    await page.locator('.draft-feedback').filter({hasText:'文字与照片已保存到本机'}).waitFor();
    await page.reload();
    await page.locator('.image-grid img').first().waitFor();
    assert.equal(await page.locator('.image-grid img').count(),2);
    assert.equal(await page.getByLabel('还有什么其他话，你希望设计团队一定知道的。').inputValue(),note);
    notes.push('旧文字草稿迁移；照片和文字刷新后恢复；手机页面无运行时错误');
    await page.getByRole('button',{name:'导出答卷',exact:true}).first().click();
    await page.getByRole('link',{name:'下载 PDF',exact:true}).waitFor({timeout:60000});
    const pdf=await download(page,'下载 PDF');fs.writeFileSync(path.join(out,'test-answer.pdf'),pdf);
    await page.screenshot({path:path.join(out,'export-after-pdf.png')});
    const document=await PDFDocument.load(pdf);
    assert(document.getPageCount()>=5,'Long text must paginate');
    document.getPages().forEach(p=>assert(Math.abs(p.getWidth()-595.28)<0.01));
    const html=await download(page,'下载图文答卷');fs.writeFileSync(path.join(out,'test-answer.html'),html);
    assert(html.toString().includes('最终结束标记'));assert(html.toString().includes('&lt;script&gt;不能执行&lt;/script&gt;'));
    assert.equal((html.toString().match(/<img /g)||[]).length,2);
    const backup=await download(page,'下载完整备份');fs.writeFileSync(path.join(out,'test-answer.json'),backup);
    const data=JSON.parse(backup);assert.equal(data.values.finalNote,note);assert.equal(data.values['type-护肤/轻治疗'],'可以考虑');assert.equal(data.interventions[0].images.length,1);
    notes.push(`PDF 有效，A4 共 ${document.getPageCount()} 页；HTML 含完整长答案和 2 张照片；JSON 备份完整`);
    await page.screenshot({path:path.join(out,'export-mobile.png')});
    await page.getByRole('button',{name:'关闭导出窗口'}).click();
    // Second device: import backup and verify stable image ownership on delete.
    const secondContext=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'}),second=await secondContext.newPage();
    second.on('pageerror',e=>errors.push(e.message));await second.goto(origin);
    await second.getByRole('button',{name:'导入备份'}).waitFor();
    await second.locator('input[accept=".json,application/json"]').setInputFiles({name:'answer.json',mimeType:'application/json',buffer:backup});
    await second.getByRole('button',{name:'替换并恢复'}).click();
    await second.locator('.intervention-card img').waitFor();
    assert.equal(await second.getByLabel('还有什么其他话，你希望设计团队一定知道的。').inputValue(),note);
    await second.getByRole('button',{name:'+ 添加一项经历'}).click();
    await second.locator('.intervention-card').last().locator('input').first().fill('第二条经历');
    await second.locator('.intervention-card').first().getByRole('button',{name:'删除',exact:true}).click();
    assert.equal(await second.locator('.intervention-card input').first().inputValue(),'第二条经历');
    assert.equal(await second.locator('.intervention-card img').count(),0);
    await second.locator('.draft-feedback').filter({hasText:'文字与照片已保存到本机'}).waitFor();
    await second.reload();await second.locator('.intervention-card').waitFor();assert.equal(await second.locator('.intervention-card input').first().inputValue(),'第二条经历');
    notes.push('跨设备导入答案与照片；删除经历后照片不串到另一条记录');
    // Clipboard failure must expose manually selectable answer, and share cancellation is handled.
    await second.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:()=>Promise.reject(new Error('blocked'))}}));
    await second.getByRole('button',{name:'导出答卷',exact:true}).first().click();await second.getByRole('button',{name:'复制文字答卷'}).click();
    assert((await second.getByLabel('文字答卷，长按全选复制').inputValue()).includes('最终结束标记'));
    notes.push('剪贴板拒绝权限时，显示可长按全选的完整文字答卷');
    await second.getByRole('button',{name:'关闭导出窗口'}).click();
    await second.locator('input[accept=".json,application/json"]').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('{"kind":"other"}')});
    await second.getByRole('alert').filter({hasText:'请选择由本问卷导出的'}).waitFor();
    assert.equal(await second.getByLabel('还有什么其他话，你希望设计团队一定知道的。').inputValue(),note);
    const deniedContext=await browser.newContext({viewport:{width:390,height:844},isMobile:true,reducedMotion:'reduce'});
    await deniedContext.addInitScript(()=>{
      Object.defineProperty(window,'indexedDB',{value:undefined});
      Storage.prototype.setItem=()=>{throw new DOMException('storage blocked','QuotaExceededError');};
      Object.defineProperty(navigator,'canShare',{value:()=>true});
      Object.defineProperty(navigator,'share',{configurable:true,value:()=>Promise.reject(new DOMException('cancelled','AbortError'))});
    });
    const denied=await deniedContext.newPage();denied.on('pageerror',e=>errors.push(e.message));await denied.goto(origin);
    await denied.locator('.draft-feedback').filter({hasText:'本机保存失败，请导出完整备份'}).waitFor();
    await denied.getByLabel('还有什么其他话，你希望设计团队一定知道的。').fill('本地存储被禁用，仍可导出');
    await denied.getByRole('button',{name:'导出答卷',exact:true}).first().click();await denied.getByRole('link',{name:'下载 PDF',exact:true}).waitFor();
    await denied.getByRole('button',{name:'分享 PDF'}).click();
    assert.equal(await denied.getByText('已完成分享。',{exact:true}).count(),0);
    await denied.evaluate(()=>Object.defineProperty(navigator,'share',{configurable:true,value:()=>Promise.reject(new Error('not allowed'))}));
    await denied.getByRole('button',{name:'分享 PDF'}).click();await denied.getByRole('status').filter({hasText:'当前浏览器无法分享文件'}).waitFor();
    await download(denied,'下载 PDF');
    notes.push('本地存储完全禁用仍可下载；分享取消或拒绝可继续使用其他导出方式；无效备份不覆盖答案');
    const failedContext=await browser.newContext({reducedMotion:'reduce'});
    await failedContext.addInitScript(()=>{HTMLCanvasElement.prototype.toBlob=function(callback){callback(null);};});
    const failed=await failedContext.newPage();failed.on('pageerror',e=>errors.push(e.message));await failed.goto(origin);
    await failed.getByRole('button',{name:'导出答卷',exact:true}).first().click();await failed.getByRole('alert').filter({hasText:'PDF 生成失败'}).waitFor();
    const fallback=await download(failed,'下载完整备份');assert.equal(JSON.parse(fallback).kind,'yanzu-face-design-brief');
    assert.equal(await failed.getByRole('link',{name:'下载图文答卷'}).count(),1);
    notes.push('PDF 生成失败时，提示错误并保留可下载的图文和完整备份');
    assert.equal(errors.length,0,errors.join('\n'));
    console.log(notes.join('\n'));
  }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
