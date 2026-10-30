const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const http = require('http');
const assert = require('node:assert/strict');
(async () => {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(fs.readFileSync(path.resolve('index.html')));
  });
  await new Promise(resolve => server.listen(4173, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  const browserConsole = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') browserConsole.push(m.text()); });
  try {
    await page.goto('http://127.0.0.1:4173');
    const accountsTab = page.locator('button[data-tab="accounts"]:visible').first();
    await accountsTab.evaluate(el => el.click());
    await page.waitForTimeout(500);
    const tabState = await page.evaluate(() => ({
      ready: document.readyState,
      accountsTabCount: document.querySelectorAll('button[data-tab="accounts"]').length,
      accountsTabActive: document.querySelector('button[data-tab="accounts"]')?.classList.contains('active'),
      accountsPanelExists: !!document.querySelector('#accounts'),
      accountsPanelActive: document.querySelector('#accounts')?.classList.contains('active'),
      scriptCount: document.scripts.length
    }));
    if (!tabState.accountsPanelActive) throw new Error('Tab activation failed; state=' + JSON.stringify({tabState, errors, browserConsole}));
    assert(await accountsTab.evaluate(el => el.classList.contains('active')), 'Accounts tab button should become active');
    assert.equal(errors.length, 0, errors.join('\\n'));
    await page.locator('#accountName').fill('مصروفات الاختبار');
    await page.locator('#accountType').selectOption('expense');
    await page.locator('#accountParent').selectOption('');
    await page.locator('#accountForm button[type="submit"]').click();
    await page.getByText('مصروفات الاختبار', { exact: true }).first().waitFor();

    await page.locator('#accountName').fill('السكن الاختباري');
    await page.locator('#accountType').selectOption('expense');
    await page.locator('#accountParent').selectOption({ label: 'مصروفات الاختبار — مصروفات' });
    await page.locator('#accountForm button[type="submit"]').click();
    await page.locator('#accountList').getByText('مصروفات الاختبار / السكن الاختباري', { exact: true }).waitFor();

    const parentOptions = await page.locator('#accountParent option').allTextContents();
    assert(parentOptions.some(x => x.includes('مصروفات الاختبار')));
    assert(!parentOptions.some(x => x.includes('السكن الاختباري')), 'Subaccounts must not be offered as parents');

    await page.locator('#accountName').fill('فرع غير متوافق');
    await page.locator('#accountType').selectOption('income');
    const incomeParentOptions = await page.locator('#accountParent option').allTextContents();
    assert(!incomeParentOptions.some(x => x.includes('مصروفات الاختبار')), 'Expense parent must not appear for income subaccounts');
    assert.equal(errors.length, 0, errors.join('\n'));
    console.log(JSON.stringify({passed: true, checks: [
      'create parent account',
      'create child account',
      'render parent/child hierarchy',
      'exclude child accounts from parent selector',
      'filter parent selector by account type',
      'no browser JavaScript errors'
    ]}, null, 2));
  } catch (e) {
    console.error('BROWSER TEST FAILED:', e);
    if (page) await page.screenshot({ path: 'account-hierarchy-failure.png', fullPage: true }).catch(() => {});
    process.exitCode = 1;
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})();
