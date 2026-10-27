import {SUPABASE_URL,SUPABASE_ANON_KEY} from "./config.js";
(() => {
 if(!SUPABASE_URL||!SUPABASE_ANON_KEY)return;
 const key="sprk-view-session",path=location.pathname;
 try{if(sessionStorage.getItem(key+":"+path))return;sessionStorage.setItem(key+":"+path,"1")}catch{}
 const ua=navigator.userAgent||"",device=/ipad|tablet/i.test(ua)?"Tablet":/mobi|android|iphone/i.test(ua)?"Mobile":"Desktop";
 const payload={event_type:"page_view",page_path:path,device_type:device,region:"Unknown",referrer:document.referrer?new URL(document.referrer).hostname:"Direct"};
 const send=async()=>{try{const geo=await fetch("https://ipwho.is/?fields=success,region,country", {cache:"no-store"});if(geo.ok){const g=await geo.json();if(g.success)payload.region=[g.region,g.country].filter(Boolean).join(", ")||"Unknown"}}catch{}try{const r=await fetch(`${SUPABASE_URL}/rest/v1/site_analytics`,{method:"POST",headers:{apikey:SUPABASE_ANON_KEY,Authorization:`Bearer ${SUPABASE_ANON_KEY}`,"Content-Type":"application/json",Prefer:"return=minimal"},body:JSON.stringify(payload),keepalive:true});if(!r.ok)console.debug("SPRK analytics was not recorded",r.status)}catch(e){console.debug("SPRK analytics unavailable",e)}};
 if("requestIdleCallback"in window)requestIdleCallback(send,{timeout:2500});else setTimeout(send,800);
})();