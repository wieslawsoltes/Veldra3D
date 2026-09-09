"""Real final-render integration; no GPU API mocks. Pass --require-webgpu with --url for native GPU checks."""
import argparse,json,pathlib,struct
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('--url');p.add_argument('--chromium',default='/usr/bin/chromium');p.add_argument('--require-webgpu',action='store_true');p.add_argument('--screenshot',action='store_true');args=p.parse_args()
report={'checks':[],'pageErrors':[],'consoleErrors':[],'webgpuRequired':args.require_webgpu}
def check(name,ok,detail=None):
 report['checks'].append({'name':name,'passed':bool(ok),'detail':detail});print(('PASS ' if ok else 'FAIL ')+name,detail or '',flush=True);assert ok,name
with sync_playwright() as pw:
 flags=['--no-sandbox','--disable-dev-shm-usage']
 if args.require_webgpu:flags+=['--enable-unsafe-webgpu','--use-angle=swiftshader','--use-vulkan=swiftshader','--enable-features=Vulkan','--disable-vulkan-surface']
 browser=pw.chromium.launch(executable_path=args.chromium,headless=True,args=flags)
 page=browser.new_page(viewport={'width':1540,'height':1000},accept_downloads=True)
 page.on('pageerror',lambda e:report['pageErrors'].append(str(e)))
 page.on('console',lambda m:report['consoleErrors'].append(m.text) if m.type=='error' else None)
 try:
  if args.url:page.goto(args.url)
  else:page.set_content((ROOT/'dist/Veldra3D.html').read_text(),wait_until='domcontentloaded')
  page.wait_for_function('!!window.veldra?.finalRender',timeout=30000)
  report['environment']=page.evaluate('({secure:isSecureContext,gpuExposed:!!navigator.gpu,viewportBackend:veldra.renderer.backend,userAgent:navigator.userAgent})')
  page.locator('#final-render-launch').click()
  check('render window and Render menu installed',page.locator('#final-render-dialog').is_visible() and page.locator('#menubar [data-menu="Render"]').count()==1)
  for key,value in {'width':96,'height':64,'samples':4,'bounces':5,'quality':.25}.items():
   el=page.locator(f'[data-setting="{key}"]');el.fill(str(value));el.press('Tab')
  backend='webgpu' if args.require_webgpu else 'cpu'
  page.locator('[data-setting="backend"]').select_option(backend)
  page.evaluate('window.uiTicks=0;window.uiTimer=setInterval(()=>window.uiTicks++,10)')
  page.locator('#fr-start').click()
  page.wait_for_function('["completed","error"].includes(veldra.finalRender.renderer.state)',timeout=120000)
  result=page.evaluate('({state:veldra.finalRender.renderer.state,backend:veldra.finalRender.renderer.backend,errors:veldra.finalRender.renderer.errors,adapter:veldra.finalRender.renderer.adapterInfo,samples:veldra.finalRender.renderer.sample,ticks:window.uiTicks})')
  report['render']=result
  check('final render completes all samples',result['state']=='completed' and result['samples']==4,result)
  check('requested engine executes',result['backend'].startswith('WebGPU' if args.require_webgpu else 'CPU'))
  check('main thread remains responsive during tracing',result['ticks']>2,result['ticks'])
  page.evaluate('clearInterval(window.uiTimer)')
  values=page.evaluate('''async()=>{let f=await veldra.finalRender.renderer.snapshot();return {width:f.width,height:f.height,finite:f.film.every(Number.isFinite),minSamples:Math.min(...f.film.filter((v,i)=>i%4===3)),energy:f.film.reduce((a,v,i)=>a+(i%4===3?0:v),0),surfacePixels:f.normal.filter((v,i)=>i%4===3&&v>0).length}}''')
  check('radiance, AOVs and sample counts are real',values['finite'] and values['energy']>0 and values['surfacePixels']>50 and values['minSamples']==4 and values['width']==96 and values['height']==64,values)
  page.locator('#fr-pass').select_option('normal')
  check('AOV selector changes displayed pass',page.evaluate('veldra.finalRender.renderer.pass === "normal"'))
  page.locator('#fr-pass').select_option('beauty')
  page.locator('[data-setting="exposure"]').fill('1');page.locator('[data-setting="exposure"]').press('Tab')
  check('exposure preserves accumulated render',page.evaluate('veldra.finalRender.renderer.sample===4 && veldra.finalRender.renderer.view.exposure===1'))
  page.locator('#fr-store').click();page.wait_for_function('!document.querySelector("#fr-compare").disabled')
  page.locator('#fr-compare').click();check('stored render comparison is visible',page.locator('#fr-reference').is_visible());page.locator('#fr-compare').click()
  page.locator('[data-fr-tab="materials"]').click();page.locator('[data-action="materialPreset"]').select_option('Glass')
  check('material editor changes optical parameters',page.evaluate('veldra.doc.objects[0].material.transmission===1'))
  page.locator('[data-fr-tab="lighting"]').click();page.locator('[data-fr="studio"]').click()
  check('studio setup creates saved area lights',page.evaluate('veldra.doc.extra.finalRender.lights.length===2 && veldra.doc.extra.finalRender.lights.every(l=>l.type==="area")'))
  roundtrip=page.evaluate('JSON.parse(JSON.stringify(veldra.doc.serialize())).extra.finalRender')
  check('native document includes render configuration',roundtrip['lights'][0]['power']==10 and roundtrip['width']==96)
  with page.expect_download() as info:page.evaluate('veldra.finalRender.exportImage("exr")')
  destination=ROOT/'tests/final-render-test.exr';info.value.save_as(destination)
  check('EXR download is binary image data',struct.unpack('<I',destination.read_bytes()[:4])[0]==20000630,{'bytes':destination.stat().st_size});destination.unlink()
  page.evaluate(f'void veldra.finalRender.start({{width:64,height:48,samples:512,bounces:4,backend:"{backend}"}})')
  page.wait_for_function('veldra.finalRender.renderer.state==="rendering" && veldra.finalRender.renderer.sample>=1',timeout=120000)
  page.locator('#fr-pause').click();page.wait_for_timeout(400)
  check('render job pauses',page.evaluate('veldra.finalRender.renderer.state==="paused"'))
  page.locator('#fr-pause').click();page.wait_for_timeout(120)
  check('paused job resumes',page.evaluate('veldra.finalRender.renderer.state==="rendering"'))
  page.locator('#fr-stop').click()
  check('cancellation preserves partial render',page.evaluate('veldra.finalRender.renderer.state==="cancelled" && !document.querySelector("#fr-export").disabled'))
  page.evaluate(f'void veldra.finalRender.start({{width:16,height:16,samples:2,bounces:3,backend:"{backend}"}})')
  page.wait_for_function('veldra.finalRender.renderer.state==="completed"',timeout=120000)
  check('restart resets sample accumulation',page.evaluate('veldra.finalRender.renderer.sample===2 && veldra.finalRender.renderer.settings.width===16'))
  if args.screenshot:
   page.evaluate('''() => {const o=veldra.doc.objects[0];o.material={metallic:0,roughness:.92};o.color='#c9cfcc';veldra.doc.touch(o);}''')
   page.evaluate(f'void veldra.finalRender.start({{width:640,height:426,samples:48,bounces:6,quality:1,backend:"{backend}",exposure:0}})')
   page.wait_for_function('veldra.finalRender.renderer.state==="completed"',timeout=600000)
   page.locator('[data-fr-tab="render"]').click();page.screenshot(path=str(ROOT/'docs/final-render-workspace.png'))
   with page.expect_download() as info:page.evaluate('veldra.finalRender.exportImage("png")')
   info.value.save_as(ROOT/'docs/final-render-canopy.png')
  page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(150)
  check('render window fits mobile viewport',page.evaluate('document.querySelector("#final-render-dialog").getBoundingClientRect().width<=innerWidth'))
  check('no uncaught JavaScript errors',not report['pageErrors'],report['pageErrors'])
  check('no console errors',not report['consoleErrors'],report['consoleErrors'])
 finally:
  (ROOT/'tests/final-render-browser-results.json').write_text(json.dumps(report,indent=2));browser.close()
