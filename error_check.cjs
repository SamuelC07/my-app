const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  page.on('console', msg => {
    console.log(`BROWSER [${msg.type()}]:`, msg.text());
  });
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
  await page.goto('http://localhost:3001');
  
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const sb = buttons.find(b => b.textContent.includes('Sandbox'));
    if (sb) sb.click();
  });
  
  await new Promise(r => setTimeout(r, 1000));
  
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const sb = buttons.find(b => b.textContent.includes('Bug Hunter') || b.textContent.includes('sdgdfg'));
    if (sb) sb.click();
  });
  
  await new Promise(r => setTimeout(r, 1000));
  
  await browser.close();
})();
