const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('REACT ERROR:', msg.text());
    }
  });
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
  
  await page.goto('http://localhost:3001');
  
  // Click Sandbox
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const sb = buttons.find(b => b.textContent.includes('Sandbox'));
    if (sb) sb.click();
  });
  
  await new Promise(r => setTimeout(r, 1000));
  
  // Click New Sandbox
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const btn = buttons.find(b => b.textContent.includes('NEW SANDBOX'));
    if (btn) btn.click();
  });
  
  await new Promise(r => setTimeout(r, 500));
  
  // Type name
  await page.type('input[placeholder="e.g. Memory Cell Test"]', 'Test Sandbox');
  
  // Click Create
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const btn = buttons.find(b => b.textContent === 'Create');
    if (btn) btn.click();
  });
  
  await new Promise(r => setTimeout(r, 2000));
  
  await browser.close();
})();
