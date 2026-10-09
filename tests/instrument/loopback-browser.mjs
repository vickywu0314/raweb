import { literalSuccess, failure } from './loopback-cases.mjs';
/** 补验场景，当前入口保留 NOT_RUN_ENV_BLOCKED，不启动或下载浏览器。
 * 支持条件改变后由固定 Playwright 1.64.0 的安全 browser owner 调用。
 */
export async function browserLoopbackScenario(browser, proxyPort, identity) {
  const page=await browser.newPage();
  try {
    await page.goto(`http://127.0.0.1:${proxyPort}/`);
    const response=await page.evaluate(async identity=>{
      const result=await fetch('/api/ra/ai/cohort',{method:'POST',headers:{'Content-Type':'application/json','X-Doctor-Id':'202'},body:JSON.stringify(identity==='anonymous'?{doctorId:'101'}:{})});
      if(!result.headers.get('content-type')?.includes('application/json'))throw new Error('non-json');
      return {status:result.status,trace:result.headers.get('x-trace-id'),json:await result.json()};
    },identity);
    if(identity==='anonymous')failure(response,401,'UNAUTHENTICATED');else literalSuccess(response);
  }finally{await page.close();}
}
