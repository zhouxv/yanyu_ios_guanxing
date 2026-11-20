"""Exercise the actual Qt tab, worker, replay and resume with a synthetic disciple."""
import json
import sys
import tempfile
import time
from pathlib import Path
from PySide6.QtCore import QTimer, QUrl
from PySide6.QtWidgets import QApplication

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from desktop.app import MainWindow
from desktop.storage import Store

SCRIPT=r'''(async()=>{try{
 const $=id=>document.getElementById(id), wait=async(fn)=>{for(let i=0;i<700;i++){if(fn())return;await new Promise(r=>setTimeout(r,35));}throw Error('等待超时：'+$('sqNotice').textContent+' / '+$('sqProgress').textContent);};
 await WasmAlgorithmAPI.ready;
 const C=HengshanSequence,ctx=C.context(HengshanStudentEngine,HENGSHAN_TALENT_DATA);
 const s={key:'smoke',name:'序列测试',source:'backpack',level:100,exp:0,seed:1234567,talents:[1,4,7],specials:[{id:1,exp:0},{id:4,exp:0},{id:7,exp:0}],currentTime:1795122000,nextDailyAt:1795208400};
 const base=HengshanPageState.prepareSnapshot(s), goal=ctx.held(ctx.step(base,0));
 if(goal.every(n=>ctx.held(base).includes(n))||goal.includes(C.BAN))throw Error('测试种子目标无效');
 const shopState={seed:13456789,refreshes:0,npc:{}}, dateTime=s.currentTime;
 const raw={...HengshanStudentEngine.shopRefresh(HENGSHAN_TALENT_DATA,HENGSHAN_SHOP_DATA,shopState).students[0],source:'shop',key:'shop-demo',currentTime:dateTime,nextDailyAt:dateTime+86400};
 HengshanShopState.loadCandidates([s,raw],shopState);window.dispatchEvent(new CustomEvent('hengshan-shop-bag-changed',{detail:{preferredKey:s.key}}));
 const before=C.stable(HengshanDayOps.get());document.querySelector('[data-hengshan-tool="sequence"]').click();await wait(()=>!$('sqSetup').disabled);
 $('sqDays').value='2';$('sqDays').dispatchEvent(new Event('change'));$('sqSource').value='backpack';$('sqSource').dispatchEvent(new Event('change'));
 $('sqBudget').value='1';$('sqCap').value='2000';$('sqAll').click();$('sqGroups').querySelectorAll('input:checked').forEach(i=>i.click());
 for(const n of goal){const b=[...$('sqTalents').querySelectorAll('button')].find(b=>b.textContent===n);if(!b)throw Error('天赋按钮缺失：'+n);b.click();}
 $('sqGroupName').value='测试组三天赋';$('sqAddGroup').click();$('sqStart').click();$('sqPause').click();
 if(!$('sqProgress').textContent.includes('暂停'))throw Error('无法暂停');$('sqPause').click();
 await wait(()=>!$('sqStart').disabled);if(!$('sqCounts').textContent.includes('新成功 1'))throw Error('未命中：'+$('sqProgress').textContent+' / '+$('sqNotice').textContent+' / '+$('sqCounts').textContent);
 $('sqResults').querySelector('button').click();await wait(()=>!$('sqRoute').hidden);
 if(!$('sqRoute').textContent.includes('洗第 1 槽')||!$('sqRoute').textContent.includes('洗练 1 次'))throw Error('成功路线缺少槽位或洗练次数');
 if(before!==C.stable(HengshanDayOps.get()))throw Error('手动推演页面状态被改动');
 $('sqResume').click();await wait(()=>!$('sqStart').disabled);if(!$('sqCounts').textContent.includes('复用成功 1'))throw Error('断点未复用');
 const downloads=[...$('sqRoute').querySelectorAll('button')];for(const b of downloads)b.click();$('sqCfgOut').click();
 const options=C.shopPlan(HengshanStudentEngine,HENGSHAN_TALENT_DATA,HENGSHAN_SHOP_DATA,[raw],shopState,dateTime,2,[true,true]);let old=null;
 for(const e of options){const initial=HengshanPageState.prepareSnapshot(e.s);if(initial.seed===e.s.seed)throw Error('测试未使用招募后种子');let state=initial;const moves=[];
   while(state.level<100 && state.talents.length<3 && !ctx.banned(state)){state=ctx.step(state,-1);moves.push(-1);}
   if(ctx.banned(state)||state.talents.length!==3)continue;old={verified:true,initial,final:state,name:e.s.name,targets:ctx.held(state),groupName:'旧助手商店回归',shopPlan:{date:e.date},rawRoute:moves.map(()=>({type:'day'}))};break;}
 if(!old)throw Error('测试商店缺少自然三天赋候选');
 const dt=new DataTransfer();dt.items.add(new File([JSON.stringify(old)],'路线.json'));dt.items.add(new File([JSON.stringify({...old,initial:{...old.initial,seed:old.initial.seed+1}})],'错起点_路线.json'));
 $('sqFiles').files=dt.files;$('sqFiles').dispatchEvent(new Event('change'));await wait(()=>!$('sqStart').disabled);if(!$('sqProgress').textContent.includes('新增 1，已有 0，起点不匹配 1'))throw Error('旧路线导入核对失败：'+$('sqProgress').textContent+' / '+$('sqNotice').textContent);
 if(before!==C.stable(HengshanDayOps.get()))throw Error('旧路线复验改动了手动页面');
 window.__seqReport={ok:true,goal,generatedAndReused:true,legacyImport:$('sqProgress').textContent,legacyDays:old.rawRoute.length};
 }catch(e){window.__seqReport={ok:false,message:String(e.stack||e)};}})();void 0;'''

def main():
    app=QApplication.instance() or QApplication(sys.argv)
    with tempfile.TemporaryDirectory() as folder:
        window=MainWindow(Store(folder),ROOT/'web');window.site.set_snapshot({'MainRole':{'Name':'测试'}});window.stack.setCurrentWidget(window.view);window.show()
        phase={'sent':False,'closed':False};out={};clock=time.monotonic()
        window.profile.downloadRequested.disconnect(window.export_file)
        downloads=[]
        def accept_export(d):
            downloads.append(d)
            d.setDownloadDirectory(folder);d.setDownloadFileName(d.downloadFileName());d.accept()
        window.profile.downloadRequested.connect(accept_export)
        def done(value):
            if not value or phase['closed']:return
            report=json.loads(value)
            if report.get('ok') and (len(downloads)<4 or not all(d.isFinished() for d in downloads)):
                return
            phase['closed']=True;out.update(report);timer.stop();app.quit()
        def loaded(success):
            if not phase['sent'] and success and window.view.url().path().endswith('/hengshan/index.html'):
                phase['sent']=True;window.page.runJavaScript(SCRIPT)
        window.view.loadFinished.connect(loaded);window.view.setUrl(QUrl(window.site.url+'hengshan/index.html'))
        def poll():
            if time.monotonic()-clock>70:done(json.dumps({'ok':False,'message':'Qt smoke timed out'}));return
            if phase['sent']:window.page.runJavaScript('JSON.stringify(window.__seqReport||null)',0,lambda s:done(s) if s and s!='null' else None)
        timer=QTimer();timer.setInterval(125);timer.timeout.connect(poll);timer.start();app.exec();window.close()
        if out.get('ok'):
            files=list(Path(folder).glob('*'));png=next((p for p in files if p.suffix=='.png'),None)
            routes=[p for p in files if p.name.endswith('_路线.json')]
            out['exports']=bool(png and png.read_bytes().startswith(b'\x89PNG') and routes and json.loads(routes[0].read_text(encoding='utf-8'))['washes']==1 and any(p.suffix=='.txt' for p in files) and (Path(folder)/'恒山弟子批量配置.json').is_file())
            out['ok']=out['exports']
        print(json.dumps(out,ensure_ascii=False));return 0 if out.get('ok') else 1
if __name__=='__main__':sys.exit(main())