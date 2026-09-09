"""End-to-end app test. Requires Playwright and a Chromium executable.
Default: standalone set_content, which also works in the restricted build runner.
For native GPU testing on an ordinary machine, run the server and pass --url.
No GPU/storage APIs are mocked. The actual backend is written into the report.
"""
import argparse,json,pathlib,time
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--url');parser.add_argument('--chromium',default='/usr/bin/chromium');args=parser.parse_args()
report={'checks':[],'pageErrors':[],'consoleErrors':[],'warnings':[],'navigation':args.url or 'standalone set_content (opaque origin)'}
def check(name,condition,detail=None):
    report['checks'].append({'name':name,'passed':bool(condition),'detail':detail})
    print(('PASS ' if condition else 'FAIL ')+name,detail or '',flush=True)
    assert condition,name
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=args.chromium,headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':1600,'height':1050},device_scale_factor=1)
    page.on('pageerror',lambda e:report['pageErrors'].append(str(e)))
    page.on('console',lambda m:report['consoleErrors' if m.type=='error' else 'warnings'].append(m.text) if m.type in ['error','warning'] else None)
    def wait():page.wait_for_timeout(450)
    def command(text):
        page.locator('#command-input').fill(text);page.locator('#command-input').press('Enter');wait()
    try:
        if args.url:page.goto(args.url)
        else:page.set_content((ROOT/'dist/Veldra3D.html').read_text(),wait_until='domcontentloaded')
        page.wait_for_function('window.veldra?.ready',timeout=20000);wait()
        report['environment']=page.evaluate('''() => ({backend:veldra.renderer.backend,secure:isSecureContext,gpuExposed:!!navigator.gpu,triangles:veldra.renderer.stats.triangles,components:Object.keys(veldra.graph.registry).length,commands:veldra.commands.items.size,viewport:[innerWidth,innerHeight],userAgent:navigator.userAgent})''')
        check('initial scene has real geometry and valid graph',page.evaluate('veldra.renderer.stats.triangles>10000 && veldra.graph.errorCount===0 && veldra.previews.length===2'),report['environment'])
        page.screenshot(path=str(ROOT/'docs/workspace.png'))
        original=page.evaluate('''() => {const d=veldra.doc.serialize();d.extra.graph=veldra.graph.serialize();return d;}''')
        before=page.evaluate('veldra.previews.find(o=>o.geometry.kind==="surface").geometry.points[0][0][0]')
        slider=page.locator('[data-param-node]').first
        slider.focus();slider.press('ArrowRight');slider.press('ArrowRight');wait()
        after=page.evaluate('veldra.previews.find(o=>o.geometry.kind==="surface").geometry.points[0][0][0]')
        check('live slider edits regenerate surface geometry',before!=after,{'before':before,'after':after})
        command('Box 8 6 5')
        check('numeric modeling command creates editable box',page.evaluate('veldra.doc.selected()[0]?.geometry.width===8 && veldra.doc.objects.length===5'))
        command('Move 2 3 4')
        check('exact transform updates model',page.evaluate('JSON.stringify(veldra.doc.selected()[0].matrix.slice(12,15))==="[2,3,4]"'))
        command('Undo');check('document undo restores transform',page.evaluate('veldra.doc.selected()[0].matrix[12]===0'))
        command('Redo');check('document redo reapplies transform',page.evaluate('veldra.doc.selected()[0].matrix[12]===2'))
        command('Deselect');page.locator('#graph-bake').click();wait()
        check('baking creates editable surface and hides live outputs',page.evaluate('veldra.doc.objects.length===7 && veldra.previews.length===0 && veldra.doc.objects.some(o=>o.geometry.kind==="surface")'))
        command('Undo');check('bake undo restores both graph previews and document',page.evaluate('veldra.doc.objects.length===5 && veldra.previews.length===2'))
        command('Redo');check('bake redo restores both graph previews and document',page.evaluate('veldra.doc.objects.length===7 && veldra.previews.length===0'))
        page.evaluate('''() => {let o=veldra.doc.objects.find(o=>o.geometry.kind==='surface');veldra.doc.select([o.id]);}''');command('Points')
        handle=page.evaluate('''() => {let h=veldra.controlHandles.find(h=>h.view==='Perspective'&&h.screen[0]>100&&h.screen[0]<1000&&h.screen[1]>100&&h.screen[1]<380);let r=document.querySelector('#viewport-area').getBoundingClientRect();return h?{x:r.left+h.screen[0],y:r.top+h.screen[1],world:h.world,row:h.row,column:h.column}:null;}''')
        check('NURBS control net exposes editable handles',handle is not None)
        page.mouse.move(handle['x'],handle['y']);page.mouse.down();page.mouse.move(handle['x']+26,handle['y']-25,steps=4);page.mouse.up();wait()
        moved=page.evaluate('''p=>veldra.doc.objects.find(o=>o.geometry.kind==='surface').geometry.points[p.row][p.column]''',handle)
        check('pointer drag modifies actual NURBS control point',moved!=handle['world'],{'before':handle['world'],'after':moved})
        command('Undo');restored=page.evaluate('p=>veldra.doc.objects.find(o=>o.geometry.kind==="surface").geometry.points[p.row][p.column]',handle)
        check('control-point editing is undoable',restored==handle['world'])
        page.locator('#fourview-button').click();wait();check('four cameras render in separate viewports',page.evaluate('veldra.getViewports().length===4'))
        page.screenshot(path=str(ROOT/'docs/four-views.png'))
        # Full native roundtrip: File input handler rather than replacing app internals.
        page.evaluate('''async data=>{await veldra.importFile(new File([JSON.stringify(data)],'Canopy.veldra',{type:'application/json'}));}''',original);wait()
        check('native file import restores graph and exact model',page.evaluate('veldra.doc.objects.length===4 && veldra.graph.nodes.length===8 && veldra.previews.length===2'))
        page.evaluate('''() => {veldra.setWorkspace(true);veldra.graphView.fit();}''');wait()
        initial_nodes=page.evaluate('veldra.graph.nodes.length')
        page.locator('#add-component').click();page.locator('.popup-search').fill('Addition');page.locator('.popup-search').press('Enter');wait()
        check('component library creates an implemented node',page.evaluate('veldra.graph.nodes.length')==initial_nodes+1)
        # Move the new node to an available location, then connect using actual port dragging.
        node_id=page.evaluate('veldra.graph.nodes.at(-1).id')
        source_id=page.evaluate('veldra.graph.nodes.find(n=>n.label==="Span").id')
        page.evaluate('''id=>{let n=veldra.graph.nodes.find(n=>n.id===id);n.x=350;n.y=420;veldra.graphView.render();veldra.graphView.fit();}''',node_id);wait()
        source=page.locator(f'[data-id="{source_id}"] .port.out').bounding_box();target=page.locator(f'[data-id="{node_id}"] .port.in').first.bounding_box()
        page.mouse.move(source['x']+source['width']/2,source['y']+source['height']/2);page.mouse.down();page.mouse.move(target['x']+target['width']/2,target['y']+target['height']/2,steps=8);page.mouse.up();wait()
        connected=page.evaluate('id=>veldra.graph.wires.some(w=>w.to===id&&w.input===0)',node_id)
        check('dragging graph ports makes a live typed connection',connected)
        check('connected component executes its algorithm',page.evaluate('id=>veldra.graph.cache.get(id).values[0]===29',node_id))
        page.locator('#theme-button').click();wait();check('dark theme toggles workspace',page.evaluate('document.body.classList.contains("dark")'))
        page.screenshot(path=str(ROOT/'docs/weave-dark.png'))
        # Verify rejected import leaves the current document unchanged.
        safe=page.evaluate('''async()=>{let old=JSON.stringify(veldra.doc.serialize()),bad=veldra.doc.serialize();bad.extra.graph={format:'weave',version:1,nodes:[{type:'unknown'}],wires:[]};try{await veldra.importFile(new File([JSON.stringify(bad)],'invalid.veldra'));return false;}catch{return old===JSON.stringify(veldra.doc.serialize());}}''')
        check('invalid native import is atomic',safe)
        page.evaluate('''() => {veldra.setWorkspace(false);if(veldra.four)veldra.toggleFour();document.body.classList.remove('dark');}''');page.set_viewport_size({'width':430,'height':932});wait();page.locator('#fit-view-button').click();wait()
        page.screenshot(path=str(ROOT/'docs/mobile.png'))
        check('mobile layout stays within viewport width',page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
        check('no uncaught JavaScript errors',not report['pageErrors'],report['pageErrors'])
        check('no renderer-reported errors',page.evaluate('veldra.renderer.errors.length===0'));report['nativeWebGPU']='not exercised: unavailable in this browser' if report['environment']['backend']!='WebGPU' else 'native browser pipeline exercised'
        report['passed']=True
    except Exception as error:
        report['passed']=False;report['failure']=str(error);page.screenshot(path=str(ROOT/'docs/test-failure.png'));raise
    finally:
        (ROOT/'tests/browser-results.json').write_text(json.dumps(report,indent=2));browser.close()
