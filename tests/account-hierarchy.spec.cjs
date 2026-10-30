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

    // Create a matching income parent and child account.
    await page.locator('button[data-tab="accounts"]').first().evaluate(el => el.click());
    await page.locator('#accountName').fill('إيرادات الاختبار');
    await page.locator('#accountType').selectOption('income');
    await page.locator('#accountParent').selectOption('');
    await page.locator('#accountForm button[type="submit"]').click();
    await page.getByText('إيرادات الاختبار', { exact: true }).first().waitFor();

    await page.locator('#accountName').fill('إيرادات إضافية');
    await page.locator('#accountType').selectOption('income');
    await page.locator('#accountParent').selectOption({ label: 'إيرادات الاختبار — إيرادات' });
    await page.locator('#accountForm button[type="submit"]').click();
    await page.locator('#accountList').getByText('إيرادات الاختبار / إيرادات إضافية', { exact: true }).waitFor();

    // Create a test wallet with enough opening balance.
    await page.locator('button[data-tab="wallets"]').first().evaluate(el => el.click());
    await page.locator('#walletName').fill('محفظة اختبار الحساب الفرعي');
    await page.locator('#walletOpening').fill('100');
    await page.locator('#walletForm button[type="submit"]').click();
    await page.locator('#walletList').getByText('محفظة اختبار الحساب الفرعي', { exact: true }).waitFor();

    // Record an expense against the child account.
    await page.locator('button[data-tab="transactions"]').first().evaluate(el => el.click());
    await page.locator('#txType').selectOption('expense');
    await page.locator('#txDate').fill(new Date().toISOString().slice(0, 10));
    await page.locator('#txAmount').fill('25');
    const walletOption = await page.locator('#txWallet option').filter({ hasText: 'محفظة اختبار الحساب الفرعي' }).first().getAttribute('value');
    assert(walletOption, 'Test wallet should be available in transaction form');
    await page.locator('#txWallet').selectOption(walletOption);
    const childOption = await page.locator('#txAccount option').filter({ hasText: 'مصروفات الاختبار / السكن الاختباري' }).first().getAttribute('value');
    assert(childOption, 'Child account should be available for expense transactions');
    await page.locator('#txAccount').selectOption(childOption);
    await page.locator('#txDesc').fill('مصروف اختبار الحساب الفرعي');
    await page.locator('#txForm button[type="submit"]').click();
    await page.locator('#txList').getByText('مصروف اختبار الحساب الفرعي', { exact: true }).waitFor();
    await page.locator('#txList').getByText('مصروفات الاختبار / السكن الاختباري').waitFor();

    // Record income against the income child account.
    await page.locator('#txType').selectOption('income');
    await page.locator('#txAmount').fill('10');
    const incomeChildOption = await page.locator('#txAccount option').filter({ hasText: 'إيرادات الاختبار / إيرادات إضافية' }).first().getAttribute('value');
    assert(incomeChildOption, 'Income child account should be available for income transactions');
    await page.locator('#txAccount').selectOption(incomeChildOption);
    await page.locator('#txDesc').fill('إيراد اختبار الحساب الفرعي');
    const incomeFormBeforeSubmit = await page.locator('#txForm').evaluate(el => ({type:el.querySelector('#txType').value, wallet:el.querySelector('#txWallet').value, account:el.querySelector('#txAccount').value, description:el.querySelector('#txDesc').value, amount:el.querySelector('#txAmount').value}));
    const dialogs = [];
    page.once('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.dismiss(); });
    await page.locator('#txForm button[type="submit"]').click();
    await page.waitForTimeout(300);
    const incomeStateAfterSubmit = await page.evaluate(() => {
      const raw = localStorage.getItem('expenseManagerAdvanced.TEST.v1');
      const data = raw ? JSON.parse(raw) : null;
      return {txCount:data?.transactions?.length, incomeTx:data?.transactions?.filter(t=>t.description==='إيراد اختبار الحساب الفرعي'), txList:document.querySelector('#txList')?.innerText, type:document.querySelector('#txType')?.value, accountOptions:[...document.querySelectorAll('#txAccount option')].map(o=>({value:o.value,text:o.textContent}))};
    });
    assert(incomeStateAfterSubmit.incomeTx?.length, 'Income transaction not saved; form=' + JSON.stringify(incomeFormBeforeSubmit) + '; dialogs=' + JSON.stringify(dialogs) + '; state=' + JSON.stringify(incomeStateAfterSubmit));
    await page.locator('#txList').getByText('إيرادات الاختبار / إيرادات إضافية').waitFor();

    // Verify the transaction is reflected in the report and wallet balance.
    await page.locator('button[data-tab="reports"]').first().evaluate(el => el.click());
    await page.locator('#runReport').click();
    await page.locator('#accountReport').getByText('مصروفات الاختبار / السكن الاختباري', { exact: true }).waitFor();
    const normalizeDigits = value => value.replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[٫٬]/g, '.');
    const reportText = normalizeDigits(await page.locator('#accountReport').innerText());
    assert(reportText.includes('25'), 'Account report should include the 25-unit expense; actual=' + reportText);
    assert(reportText.includes('10'), 'Account report should include the 10-unit income; actual=' + reportText);
    await page.locator('#accountReport').getByText('إيرادات الاختبار / إيرادات إضافية', { exact: true }).waitFor();
    const walletText = normalizeDigits(await page.locator('#reportWallets').innerText());
    assert(walletText.includes('85'), 'Wallet report should show the net balance of 85 after expense 25 and income 10; actual=' + walletText);
    assert.equal(errors.length, 0, errors.join('\n'));

    console.log(JSON.stringify({passed: true, checks: [
      'create parent account',
      'create child account',
      'render parent/child hierarchy',
      'exclude child accounts from parent selector',
      'filter parent selector by account type',
      'create wallet with opening balance',
      'record expense using child account',
      'create income parent and child accounts',
      'record income using child account',
      'include income child account and amount in report',
      'show child account in transaction record',
      'include child account and amount in report',
      'wallet balance reflects opening 100 minus expense 25 plus income 10 = 85',
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
