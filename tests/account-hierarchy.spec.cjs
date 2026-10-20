const { chromium } = require('playwright');
const path = require('path');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  try {
    await page.goto('file://' + path.resolve('index.html'));
    await page.locator('[data-tab="accounts"]').click();
    await page.locator('#accountName').fill('مصروفات الاختبار');
    await page.locator('#accountType').selectOption('expense');
    await page.locator('#accountParent').selectOption('');
    await page.locator('#accountForm button[type="submit"]').click();
    await page.getByText('مصروفات الاختبار', { exact: true }).first().waitFor();

    await page.locator('#accountName').fill('السكن الاختباري');
    await page.locator('#accountType').selectOption('expense');
    await page.locator('#accountParent').selectOption({ label: 'مصروفات الاختبار — مصروفات' });
    await page.locator('#accountForm button[type="submit"]').click();
    await page.getByText('مصروفات الاختبار / السكن الاختباري', { exact: true }).waitFor();

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
  }
})();
