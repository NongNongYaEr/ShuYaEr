(async()=>{
 const p=window.__branchForge.trunkPreparation;if(!p.panel.open)await p.open();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
 const box=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};},panel=p.panel,start=panel.querySelector('.trunk-start-panel'),cards=[...start.querySelectorAll('.trunk-route-card')];
 if(!panel.classList.contains('trunk-start-screen')||cards.length!==3||start.hidden)throw Error('Missing central start page');
 for(const selector of ['.trunk-sidebar','.trunk-properties','.trunk-namebar','.trunk-footer','.trunk-main'])if(getComputedStyle(panel.querySelector(selector)).display!=='none')throw Error('Empty editor controls still occupy the start page: '+selector);
 for(const card of cards){const title=card.querySelector('strong'),b=box(card),t=box(title);if(b.width<220||t.width<160||t.height>62||card.scrollWidth>card.clientWidth+1)throw Error('Route card is squeezed or overflows: '+JSON.stringify({b,t}));}
 if(Math.abs(box(cards[0]).y-box(cards[2]).y)>2)throw Error('Desktop route cards should share one row');
 const input=value=>start.querySelector('input[value='+value+']');input('material').click();if(!panel.querySelector('[data-material-target]').closest('label').hidden||panel.querySelector('[data-material-resolution]').closest('label').hidden)throw Error('Material-only parameters do not match the selection');input('rig').click();if(!start.querySelector('[data-start-settings]').hidden)throw Error('Direct rig still shows material parameters');input('full').click();
 const action=box(start.querySelector('[data-start-primary]'));if(action.x<0||action.x+action.width>innerWidth+1||action.y+action.height>innerHeight+1)throw Error('Primary action is outside the visible page');
 return{passed:true,viewport:{width:innerWidth,height:innerHeight},central:box(start),cards:cards.map(box),titles:cards.map(c=>box(c.querySelector('strong'))),action,unusedPanelsHidden:true,routeParametersCorrect:true};
})()
