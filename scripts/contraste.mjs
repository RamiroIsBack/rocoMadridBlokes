#!/usr/bin/env node

/**
 * Comprobación de contraste (WCAG 2.1) sobre el sitio ya desplegado.
 *
 * Recorre las rutas dadas (haciendo login real cuando la ruta lo necesita: Supervisión,
 * Superadmin), y en cada una recorre el DOM buscando el texto visible, calculando su color de
 * verdad y el primer fondo OPACO que encuentra subiendo por los antecesores (igual que haría
 * un ojo humano: `background-color` + alfa, parándose en el primer color sin transparencia).
 * Con eso calcula la razón de contraste WCAG y falla si no llega al mínimo: 4,5:1 para texto
 * normal, o 3:1 si el texto es "grande" (≥ 24px, o ≥ 18,66px y negrita/700+).
 *
 * En Supervisión entra también en cada pestaña (incluye las subpestañas de Grupos y de CTRL
 * Time Off) para no dejarse nada escondido detrás de un clic.
 *
 * Uso:
 *   node scripts/contraste.mjs <usuario_wp> <password_o_app_password> [--prod]
 *
 * Sin usuario/password solo comprueba las rutas públicas (/, /progreso, /ligas,
 * /entrenamientos, /tareas, /eventos, /calendario) — las que exigen sesión (/superadmin,
 * /supervision) se saltan y avisan.
 *
 * Requiere Chromium de Playwright instalado una vez: npx playwright install chromium
 */

import { chromium } from 'playwright';

const argv = process.argv.slice(2);
const flags = argv.filter((a) => a.startsWith('--'));
const [USER, PASS] = argv.filter((a) => !a.startsWith('--'));
const SLUG = flags.includes('--prod') ? 'blokes' : 'blokes-dev';
const SITE = 'https://rocomadrid.com';
const BASE = `${SITE}/${SLUG}`;

const MIN_NORMAL = 4.5;
const MIN_LARGE = 3;

// Rutas públicas (no exigen login) y protegidas (exigen login real de socio/gestión).
const RUTAS_PUBLICAS = ['/', '/progreso', '/ligas', '/entrenamientos', '/tareas', '/eventos', '/calendario'];
const RUTAS_PROTEGIDAS = ['/superadmin', '/supervision', '/entrenamientos'];

// Dentro de /supervision, qué pestañas (y subpestañas) recorrer. El selector es lo que hay
// que pulsar; si no se encuentra, se omite sin fallar el resto.
const PESTANAS_SUPERVISION = [
    { click: null },                                                 // la que carga por defecto
    { click: 'button:has-text("Grupos")' },
    { click: 'button:has-text("Campañas")' },                        // subpestaña de Grupos
    { click: 'button:has-text("Lista de espera")' },                 // subpestaña de Grupos
    { click: 'button:has-text("Cobrar este mes")' },                 // subpestaña de Grupos
    { click: 'button:has-text("Pausados")' },                        // subpestaña de Grupos
    { click: 'button:has-text("Bajas a fin de mes")' },              // subpestaña de Grupos
    { click: 'button:has-text("Sin datos")' },                       // subpestaña de Grupos
    { click: 'button:has-text("Pagan fuera de la web")' },           // subpestaña de Grupos
    { click: 'button:has-text("Duplicados")' },                      // subpestaña de Grupos
    { click: 'button:has-text("CTRL Time Off")' },
    { click: 'button:has-text("Simulador")' },                       // subpestaña de CTRL Time Off
    { click: 'button:has-text("Sala y mañanas")' },                  // pestaña del simulador
    { click: 'button:has-text("Personas")' },                        // pestaña del simulador
    { click: 'button:has-text("Resultados")' },                      // pestaña del simulador
];

function relLuminance(r, g, b) {
    const ch = (c) => {
        c /= 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

function contrastRatio([r1, g1, b1], [r2, g2, b2]) {
    const l1 = relLuminance(r1, g1, b1);
    const l2 = relLuminance(r2, g2, b2);
    const [lighter, darker] = l1 > l2 ? [l1, l2] : [l2, l1];
    return (lighter + 0.05) / (darker + 0.05);
}

// Se ejecuta DENTRO de la página (page.evaluate): no puede usar nada de fuera.
function recolectarFallos({ minNormal, minLarge }) {
    function parseColor(str) {
        const m = str.match(/rgba?\(([^)]+)\)/);
        if (!m) return null;
        const parts = m[1].split(',').map((s) => parseFloat(s.trim()));
        return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
    }

    function fondoOpaco(el) {
        let node = el;
        while (node) {
            const bg = parseColor(getComputedStyle(node).backgroundColor);
            if (bg && bg.a >= 0.5) return [bg.r, bg.g, bg.b];
            node = node.parentElement;
        }
        return [255, 255, 255]; // por defecto, blanco del navegador
    }

    function luminancia(r, g, b) {
        const ch = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
        return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
    }
    function ratio(fg, bg) {
        const l1 = luminancia(...fg), l2 = luminancia(...bg);
        const [a, b] = l1 > l2 ? [l1, l2] : [l2, l1];
        return (a + 0.05) / (b + 0.05);
    }

    const fallos = [];
    const vistos = new Set();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
        const texto = node.textContent.replace(/\s+/g, ' ').trim();
        if (!texto) continue;
        // Un emoji/símbolo suelto (🔒, ✓, 🧗…) no tiene "color" real de texto en el sentido de
        // WCAG — se pinta con sus propios colores, no con `color:` CSS — así que no cuenta
        // como fallo aunque getComputedStyle().color le aplique algo.
        if (!/[a-zA-ZÀ-ÿ0-9]/.test(texto)) continue;
        const el = node.parentElement;
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue; // oculto/colapsado
        const style = getComputedStyle(el);
        if (style.visibility === 'hidden' || style.display === 'none' || parseFloat(style.opacity) === 0) continue;

        const fg = parseColor(style.color);
        if (!fg) continue;
        const bg = fondoOpaco(el);
        const r = ratio([fg.r, fg.g, fg.b], bg);

        const sizePx = parseFloat(style.fontSize);
        const weight = parseInt(style.fontWeight, 10) || 400;
        const esGrande = sizePx >= 24 || (sizePx >= 18.66 && weight >= 700);
        const minimo = esGrande ? minLarge : minNormal;
        if (r < minimo) {
            const clave = `${texto}|${el.className}`;
            if (vistos.has(clave)) continue;
            vistos.add(clave);
            fallos.push({
                texto: texto.slice(0, 60),
                clase: el.className || '(sin clase)',
                ratio: Math.round(r * 100) / 100,
                minimo,
                color: style.color,
                fondo: `rgb(${bg.join(',')})`,
            });
        }
    }
    return fallos;
}

async function comprobarPagina(page, etiqueta, fallosTotal) {
    await page.waitForTimeout(600); // deja terminar animaciones/fetches cortos
    const fallos = await page.evaluate(recolectarFallos, { minNormal: MIN_NORMAL, minLarge: MIN_LARGE });
    if (!fallos.length) {
        console.log(`  ✓ ${etiqueta}: sin fallos`);
        return;
    }
    console.log(`  ✗ ${etiqueta}: ${fallos.length} fallo(s)`);
    fallos.slice(0, 30).forEach((f) => {
        console.log(`      "${f.texto}" [.${String(f.clase).split(' ').join('.')}] ${f.ratio}:1 (mínimo ${f.minimo}) — ${f.color} sobre ${f.fondo}`);
    });
    if (fallos.length > 30) console.log(`      … y ${fallos.length - 30} más`);
    fallosTotal.push(...fallos.map((f) => ({ ...f, pagina: etiqueta })));
}

async function main() {
    const browser = await chromium.launch();
    const context = await browser.newContext();
    const page = await context.newPage();
    const fallosTotal = [];

    console.log(`=== Contraste WCAG — ${BASE} ===\n`);

    console.log('Rutas públicas:');
    for (const ruta of RUTAS_PUBLICAS) {
        await page.goto(`${BASE}${ruta}`, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch((e) => console.log(`  ✗ ${ruta}: no cargó (${e.message})`));
        await comprobarPagina(page, ruta || '/', fallosTotal);
    }

    if (!USER || !PASS) {
        console.log('\nSin usuario/password: se omiten las rutas protegidas (--help no hace falta, solo pásalos).');
    } else {
        console.log('\nLogin…');
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
        console.log('✓ Login OK\n');

        for (const ruta of RUTAS_PROTEGIDAS) {
            await page.goto(`${BASE}${ruta}`, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch((e) => console.log(`  ✗ ${ruta}: no cargó (${e.message})`));
            await comprobarPagina(page, ruta, fallosTotal);

            if (ruta === '/supervision') {
                for (const { click } of PESTANAS_SUPERVISION) {
                    if (!click) continue;
                    const boton = page.locator(click).first();
                    if (await boton.count() === 0) { console.log(`  · (omitido, no encontrado: ${click})`); continue; }
                    await boton.click().catch(() => {});
                    await comprobarPagina(page, `/supervision → ${click}`, fallosTotal);
                }
            }

            // Definiciones y elección de tests (solo socio ve la gestión completa) y su
            // desplegable "Avanzado" — cowork lo pidió tras encontrar fallos aquí (1/11 18:30).
            if (ruta === '/entrenamientos') {
                const defBtn = page.locator('button:has-text("Definiciones")').first();
                if (await defBtn.count() > 0) {
                    await defBtn.click().catch(() => {});
                    await comprobarPagina(page, '/entrenamientos → Definiciones', fallosTotal);
                    const avanzadoBtn = page.locator('button:has-text("Avanzado")').first();
                    if (await avanzadoBtn.count() > 0) {
                        await avanzadoBtn.click().catch(() => {});
                        await comprobarPagina(page, '/entrenamientos → Definiciones → Avanzado', fallosTotal);
                    }
                } else {
                    console.log('  · (omitido, no encontrado: botón Definiciones)');
                }
            }
        }
    }

    await browser.close();

    console.log(`\n=== Total: ${fallosTotal.length} fallo(s) de contraste ===`);
    process.exit(fallosTotal.length > 0 ? 1 : 0);
}

main();
