import { expect, type Page, test } from '@playwright/test';

const password = 'TestOnlyPassword2026!';
const today = new Date().toLocaleDateString('sv-SE', {
  timeZone: 'America/Sao_Paulo',
});
const month = today.slice(0, 7);
function shiftMonth(value: string, amount: number) {
  const date = new Date(
    Date.UTC(
      Number(value.slice(0, 4)),
      Number(value.slice(5, 7)) - 1 + amount,
      1,
    ),
  );
  return date.toISOString().slice(0, 7);
}
function formatMonth(value: string) {
  const year = Number(value.slice(0, 4));
  const number = Number(value.slice(5, 7));
  return new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, number - 1, 1)));
}
async function selectMonth(page: Page, groupName: string, target: string) {
  const group = page.getByRole('group', { name: groupName });
  const targetValue = Number(target.replace('-', ''));
  for (let attempt = 0; attempt < 36; attempt += 1) {
    const label = await group.locator('.month-label').textContent();
    if (label === formatMonth(target)) return;
    const currentValue = Number(monthFromLabel(label ?? '').replace('-', ''));
    await group
      .getByRole('button', {
        name: currentValue < targetValue ? 'Próximo mês' : 'Mês anterior',
      })
      .click();
  }
  throw new Error(`Month selector did not reach ${target}`);
}
function monthFromLabel(label: string) {
  const [name = '', year = ''] = label.split(' de ');
  const monthIndex = [
    'janeiro',
    'fevereiro',
    'março',
    'abril',
    'maio',
    'junho',
    'julho',
    'agosto',
    'setembro',
    'outubro',
    'novembro',
    'dezembro',
  ].indexOf(name);
  if (!year || monthIndex < 0)
    throw new Error(`Invalid displayed month: ${label}`);
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
}

async function logout(page: Page) {
  await page.getByRole('button', { name: /Menu do usuário/ }).click();
  await page.getByRole('button', { name: 'Sair' }).click();
}

async function register(page: Page) {
  const email = `e2e-${crypto.randomUUID()}@example.test`;
  await page.goto('/cadastro');
  await page.getByLabel('Nome').fill('Pessoa de teste');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(password);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(
    page.getByRole('heading', { name: 'Painel', level: 1 }),
  ).toBeVisible();
  return email;
}

async function createAccount(page: Page, name: string, balance = '0,00') {
  await page.goto('/contas');
  await page.getByRole('button', { name: 'Nova conta' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nome').fill(name);
  await dialog.getByLabel('Tipo').selectOption('checking');
  await dialog.getByLabel('Saldo inicial').fill(balance);
  await dialog.getByRole('button', { name: 'Salvar conta' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Conta salva' }),
  ).toBeVisible();
}

async function createExpenseCategory(page: Page, name: string) {
  await page.goto('/categorias');
  await page.getByRole('button', { name: 'Nova categoria' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nome').fill(name);
  await dialog.getByLabel('Tipo').selectOption('expense');
  await dialog.getByRole('button', { name: 'Salvar categoria' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Categoria salva' }),
  ).toBeVisible();
}

async function addExpense(page: Page, description: string, amount: string) {
  await page.goto('/transacoes');
  await page.getByRole('button', { name: 'Nova transação' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Descrição').fill(description);
  await dialog.getByLabel('Valor').fill(amount);
  await dialog.getByLabel('Conta').selectOption({ label: 'Principal' });
  await dialog
    .getByLabel('Categoria do mesmo tipo')
    .selectOption({ label: 'Mercado (despesa)' });
  await dialog.getByRole('button', { name: 'Salvar transação' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Transação salva' }),
  ).toBeVisible();
}

test('cadastro, login, sessão persistente e logout', async ({ page }) => {
  const email = await register(page);
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Painel', level: 1 }),
  ).toBeVisible();
  await logout(page);
  await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible();
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(
    page.getByRole('heading', { name: 'Painel', level: 1 }),
  ).toBeVisible();
  await logout(page);
  await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible();
});

test('duas contas, transferência e saldo consolidado', async ({ page }) => {
  await register(page);
  await createAccount(page, 'Origem', '100,00');
  await createAccount(page, 'Destino');
  await page.getByRole('button', { name: 'Nova transferência' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Conta de origem').selectOption({ label: 'Origem' });
  await dialog
    .getByLabel('Conta de destino')
    .selectOption({ label: 'Destino' });
  await dialog.getByLabel('Valor').fill('25,00');
  await dialog.getByRole('button', { name: 'Transferir valor' }).click();
  await expect(page.getByRole('row', { name: /Origem/ })).toContainText(
    '75,00',
  );
  await expect(page.getByRole('row', { name: /Destino/ })).toContainText(
    '25,00',
  );
  await page.goto('/');
  await expect(page.getByText('R$ 100,00').first()).toBeVisible();
});

test('despesas consomem e excedem orçamento', async ({ page }) => {
  await register(page);
  await createAccount(page, 'Principal', '500,00');
  await createExpenseCategory(page, 'Mercado');
  await page.goto('/orcamentos');
  await page.getByRole('button', { name: 'Novo orçamento' }).click();
  const dialog = page.getByRole('dialog');
  await dialog
    .getByLabel('Categoria de despesa')
    .selectOption({ label: 'Mercado' });
  await dialog.getByLabel('Limite').fill('100,00');
  await dialog.getByRole('button', { name: 'Salvar orçamento' }).click();
  await addExpense(page, 'Compra 1', '80,00');
  await page.goto('/orcamentos');
  await expect(page.getByText('80,0% utilizado')).toBeVisible();
  await addExpense(page, 'Compra 2', '30,00');
  await page.goto('/orcamentos');
  await expect(page.getByText(/Limite excedido em/)).toContainText('10,00');
});

test('cartão, compra parcelada, faturas e quitação', async ({ page }) => {
  await register(page);
  await createAccount(page, 'Principal', '500,00');
  await createExpenseCategory(page, 'Mercado');
  await page.goto('/cartoes');
  await page.getByRole('button', { name: 'Novo cartão' }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nome').fill('Cartão pessoal');
  await dialog.getByLabel('Limite de crédito').fill('300,00');
  await dialog
    .getByLabel('Dia de fechamento')
    .fill(String(Number(today.slice(8))));
  await dialog.getByLabel('Dia de vencimento').fill('31');
  await dialog.getByRole('button', { name: 'Salvar cartão' }).click();
  await page.getByRole('button', { name: 'Registrar compra' }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Descrição').fill('Compra parcelada');
  await dialog
    .getByLabel('Categoria de despesa')
    .selectOption({ label: 'Mercado' });
  await dialog.getByLabel('Valor total').fill('100,01');
  await dialog.getByLabel('Número de parcelas').fill('3');
  await dialog.getByRole('button', { name: 'Salvar compra' }).click();
  const dueMonth = Number(today.slice(8)) === 31 ? shiftMonth(month, 1) : month;
  await selectMonth(page, 'Mês da fatura', dueMonth);
  await expect(
    page
      .locator('tbody tr')
      .filter({ has: page.getByRole('button', { name: 'Ver parcelas' }) }),
  ).toContainText('33,34');
  await page.getByRole('button', { name: 'Ver parcelas' }).click();
  dialog = page.getByRole('dialog');
  await expect(dialog.getByText('1 de 3')).toBeVisible();
  await dialog.getByRole('button', { name: 'Fechar' }).click();
  await selectMonth(page, 'Mês da fatura', shiftMonth(dueMonth, 1));
  await expect(
    page.getByRole('button', { name: 'Ver parcelas' }).locator('../..'),
  ).toContainText('33,34');
  await selectMonth(page, 'Mês da fatura', shiftMonth(dueMonth, 2));
  await expect(
    page.getByRole('button', { name: 'Ver parcelas' }).locator('../..'),
  ).toContainText('33,33');
  await selectMonth(page, 'Mês da fatura', dueMonth);
  await page.getByRole('button', { name: 'Ver parcelas' }).click();
  dialog = page.getByRole('dialog');
  await dialog
    .getByLabel('Pagar com a conta')
    .selectOption({ label: 'Principal' });
  await dialog.getByRole('button', { name: 'Pagar fatura' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Fatura paga' }),
  ).toBeVisible();
  await expect(page.getByRole('row', { name: /Paga/ })).toContainText('0,00');
});

test('recorrência gera lançamento uma vez', async ({ page }) => {
  await register(page);
  await createAccount(page, 'Principal', '500,00');
  await createExpenseCategory(page, 'Mercado');
  await page.goto('/recorrencias');
  await page.getByRole('button', { name: 'Nova recorrência' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Descrição').fill('Despesa periódica');
  await dialog.getByLabel('Valor').fill('20,00');
  await dialog.getByLabel('Conta').selectOption({ label: 'Principal' });
  await dialog
    .getByLabel('Categoria do mesmo tipo')
    .selectOption({ label: 'Mercado (despesa)' });
  await dialog.getByRole('button', { name: 'Salvar recorrência' }).click();
  await page.getByRole('button', { name: 'Processar vencidas' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: '1 movimentações geradas' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Processar vencidas' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: '0 movimentações geradas' }),
  ).toBeVisible();
  await page.goto('/transacoes');
  await expect(
    page.getByRole('row', { name: /Despesa periódica/ }),
  ).toHaveCount(1);
});

test('todas as páginas cabem nas larguras alvo em tema claro e escuro', async ({
  page,
}) => {
  await register(page);
  const routes = [
    '/',
    '/contas',
    '/transacoes',
    '/categorias',
    '/cartoes',
    '/orcamentos',
    '/recorrencias',
    '/metas',
  ];
  for (const width of [375, 768, 1280]) {
    await page.setViewportSize({ width, height: 850 });
    for (const theme of ['light', 'dark']) {
      await page.evaluate(
        (value) => localStorage.setItem('minifinance-theme', value),
        theme,
      );
      for (const route of routes) {
        await page.goto(route);
        await expect(page.locator('main.content')).toBeVisible();
        await expect(
          page.locator('main.content input[type="month"]'),
        ).toHaveCount(0);
        const title = await page.locator('header h1').textContent();
        if (title) {
          await expect(
            page.locator('main.content').getByRole('heading', { name: title }),
          ).toHaveCount(0);
        }
        await expect
          .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
          .toBeLessThanOrEqual(width);
        await expect(page.locator('html')).toHaveClass(
          theme === 'dark' ? /dark/ : /^((?!dark).)*$/,
        );
        const navigation = page.getByRole('navigation', {
          name: 'Navegação principal',
        });
        await expect(navigation).toBeVisible();
        for (const target of routes) {
          await expect(navigation.locator(`a[href="${target}"]`)).toBeVisible();
        }
        await expect(navigation.locator(`a[href="${route}"]`)).toHaveAttribute(
          'aria-current',
          'page',
        );
      }
    }
  }
  await page.goto('/');
  await page.keyboard.press('Tab');
  const outline = await page.evaluate(
    () => getComputedStyle(document.activeElement as HTMLElement).outlineStyle,
  );
  expect(outline).not.toBe('none');
});
