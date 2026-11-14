const crypto=require('crypto');
exports.handler=async(e)=>{
  const id=process.env.TWITCH_CLIENT_ID;
  if(!id)return{statusCode:500,body:'TWITCH_CLIENT_ID fehlt in den Netlify-Variablen.'};
  const host=e.headers['x-forwarded-host']||e.headers.host,proto=e.headers['x-forwarded-proto']||'https';
  const state=crypto.randomBytes(16).toString('hex');
  const u=new URL('https://id.twitch.tv/oauth2/authorize');
  u.search=new URLSearchParams({client_id:id,redirect_uri:proto+'://'+host+'/',response_type:'token',scope:'chat:read chat:edit',state}).toString();
  return{statusCode:302,headers:{Location:u.toString(),'Set-Cookie':'rb_state='+state+'; Path=/; Max-Age=600; SameSite=Lax'+(proto==='https'?'; Secure':''),'Cache-Control':'no-store'}};
};
