'use strict';
function mailMode(env=process.env){
  const mode=env.UNIMARKET_MAIL_MODE || (env.NODE_ENV==='production'?'email':'console');
  if(mode==='console' && env.NODE_ENV!=='production')return mode;
  if(mode==='email' && env.RESEND_API_KEY && env.UNIMARKET_MAIL_FROM)return mode;
  throw new Error('Email delivery is not configured.');
}
async function sendCode(email,code,{env=process.env,fetcher=globalThis.fetch,logger=console}={}){
  const mode=mailMode(env);
  if(mode==='console'){
    logger.log(`[DEV] Verification code for ${email}: ${code}`);
    return false;
  }
  const response=await fetcher('https://api.resend.com/emails',{
    method:'POST',headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json'},
    body:JSON.stringify({from:env.UNIMARKET_MAIL_FROM,to:[email],subject:'UniMarket verification code',text:`Your UniMarket verification code is ${code}. It expires in 10 minutes. If you did not request it, ignore this email.`}),
    signal:AbortSignal.timeout(10000)
  });
  if(!response.ok)throw new Error('Email delivery failed.');
  return true;
}
module.exports={mailMode,sendCode};
