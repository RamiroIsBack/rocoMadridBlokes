#!/usr/bin/env node

/**
 * QA de roles antes de desplegar a producción.
 *
 * Inicia sesión de verdad en WordPress con las credenciales dadas y comprueba,
 * sobre el sitio ya desplegado (no el servidor local de Vite — window.blokesSiteData
 * solo lo inyecta WordPress al servir la página), qué ve esa cuenta: rol calculado,
 * qué rutas quedan accesibles y cuáles muestran "acceso restringido", y si hay
 * errores de consola.
 *
 * Uso:
 *   node scripts/qa-role-check.js <usuario_wp> <password_o_app_password> <etiqueta> [--prod]
 *
 * Ejemplos:
 *   node scripts/qa-role-check.js profesor@email.com "xxxx xxxx xxxx xxxx" profesor
 *   node scripts/qa-role-check.js rocomadridgestion@gmail.com "..." gestion
 *   node scripts/qa-role-check.js alvilu2 "..." socio --prod
 *
 * NUNCA commitear credenciales ni pasarlas hardcodeadas en este fichero: siempre
 * como argumentos de línea de comandos, y de una cuenta de prueba o una Application
 * Password revocable cuando sea posible.
 *
 * Requiere Chromium de Playwright instalado una vez: npx playwright install chromium
 */

import { chromium } from 'playwright';

const [, , USER, PASS, LABEL, ...flags] = process.argv;

if (!USER || !PASS || !LABEL) {
    console.error('Uso: node scripts/qa-role-check.js <usuario> <password> <etiqueta> [--prod]');
    process.exit(1);
}

const SLUG = flags.includes('--prod') ? 'blokes' : 'blokes-dev';
const SITE = 'https://rocomadrid.com';
const BASE = `${SITE}/${SLUG}`;

// Rutas a comprobar tras el login. Añadir aquí cualquier ruta nueva protegida por rol.
const ROUTES = [
    '/', '/entrenamientos', '/setter', '/stats',
    '/supervision', '/superadmin', '/playground',
    '/ligas', '/progreso',
];

async function main() {
    const browser = await chromium.launch();
    const context = await browser.newContext();
    const page = await context.newPage();

    console.log(`\n=== QA de rol: ${LABEL} (${BASE}/) ===\n`);

    await page.goto(`${SITE}/wp-login.php`, { waitUntil: 'domcontentloaded' });
    await page.fill('#user_login', USER);
    await page.fill('#user_pass', PASS);
    await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded' }).catch(() => {}),
        page.click('#wp-submit'),
    ]);

    if (page.url().includes('wp-login.php')) {
        console.error('✗ Login fallido — revisa usuario/contraseña.');
        await browser.close();
        process.exit(1);
    }

    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(2500);
    const site = await page.evaluate(() => window.blokesSiteData || null);

    if (!site) {
        console.error('✗ window.blokesSiteData no está presente — ¿el plugin está activo en este sitio?');
    } else {
        console.log(`userRole:      ${site.userRole}`);
        console.log(`canSupervise:  ${site.canSupervise}`);
        console.log(`isLoggedIn:    ${site.isLoggedIn}`);
        console.log(`emailLists:    ${site.emailLists ? 'visible (solo debería serlo para socio)' : 'null'}`);
    }

    console.log('\nRutas:');
    for (const route of ROUTES) {
        const errors = [];
        const onConsole = (msg) => { if (msg.type() === 'error') errors.push(msg.text()); };
        page.on('console', onConsole);

        let status = null;
        let body = '';
        try {
            const resp = await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
            status = resp ? resp.status() : null;
            await page.waitForTimeout(3500);
            body = await page.evaluate(() => document.body.innerText);
        } catch (e) {
            errors.push('navegación: ' + e.message);
        }
        page.off('console', onConsole);

        const restricted = /restringid|inicia sesi[oó]n para acceder/i.test(body);
        const access = restricted ? 'RESTRINGIDO' : 'ACCESIBLE  ';
        const flag = errors.length ? '⚠' : '·';
        console.log(`  ${flag} ${route.padEnd(16)} [${status}] ${access}`);
        errors.forEach((e) => console.log(`      error: ${e}`));
    }

    await browser.close();
    console.log('\nHecho. Compara el resultado con la tabla de accesos por rol en ONBOARDING.md §14.\n');
}

main();
