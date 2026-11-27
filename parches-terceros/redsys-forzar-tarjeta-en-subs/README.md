# Parche: forzar DS_MERCHANT_PAYMETHODS='C' en pedidos con suscripción (Redsys)

## Por qué

Plugin: **WooCommerce Servired/RedSys Spain Gateway v32.0.0** (José Conti), carpeta
`wp-content/plugins/woocommerce-gateway-redsys`. Vive solo en el servidor, no está en este repo.

El ajuste del gateway "Método de pago: Solo tarjeta de crédito" hace que
`check_payment_method()` devuelva `'T'`, y con `'T'` el plugin manda a Redsys
`DS_MERCHANT_PAYMETHODS = 'T'` (Tarjeta + iupay), nunca `'C'` (solo tarjeta). Por eso la
página de Redsys sigue ofreciendo Bizum aunque el ajuste diga "solo tarjeta".

Cuando el cliente paga con Bizum en un pedido de suscripción, el IPN entra como
"Is a PSD2 Subscription" sin token de tarjeta (`Ds_Card_Number` = `unknown`), el plugin
corta el proceso sin marcar el pedido como pagado, y el retorno del cliente lo descarta
como "IPN duplicado" — el pedido se cancela a las 2h aunque el banco ya haya cobrado.

Forzar `'C'` en los pedidos con suscripción evita que Redsys ofrezca Bizum ahí, sin tocar
el comportamiento para pedidos normales (días sueltos, etc.), que siguen en `'T'`.

## Qué cambia

Fichero: `classes/class-wc-gateway-redsys.php` (dentro del plugin, ~514 KB).

Tres sitios, todos con el mismo patrón `if ('T' === $this->check_payment_method()) ...`:

| Método | Línea aprox. (v32.0.0) | Línea del `set_parameter` |
|---|---|---|
| `get_redsys_args()` | 1745 | 2012 |
| `get_redsys_args_p()` (PSD2/suscripciones) | 2084 | 2017 |
| `get_redsys_args_add_method()` | 2608 | 2340 |

En cada uno, cambiar:

```php
if ('T' === $this->check_payment_method()) $mi_obj->set_parameter('DS_MERCHANT_PAYMETHODS', 'T');
```

por (ver `patch.diff` en esta misma carpeta para el bloque exacto a pegar):

```php
// PARCHE BLOKES 27/11 — ver parches-terceros/redsys-forzar-tarjeta-en-subs/
// Si el pedido es una suscripción o una renovación, forzar 'C' (solo tarjeta) para que
// Redsys no ofrezca Bizum ahí, aunque el ajuste del gateway sea 'T' (tarjeta + iupay).
if ('T' === $this->check_payment_method()) {
    $order_id_parche = isset($order) && is_object($order) ? $order->get_id() : 0;
    $es_sub_parche = $order_id_parche && function_exists('wcs_order_contains_subscription')
        && (wcs_order_contains_subscription($order_id_parche)
            || wcs_order_contains_subscription($order_id_parche, 'renewal'));
    $mi_obj->set_parameter('DS_MERCHANT_PAYMETHODS', $es_sub_parche ? 'C' : 'T');
}
```

**Importante**: hay que confirmar con el extracto real (`media_para_code/redsys_plugin_v32_extracto.php.txt`)
que en esos 3 métodos la variable del pedido se llama `$order` y está en scope en ese punto
(en algunos gateways de Redsys se llama `$order`, en otros se resuelve unas líneas antes desde
`$_GET['order_id']` o similar). Si no es así, hay que adaptar cómo se obtiene `$order_id_parche`
método por método — no pegar el bloque a ciegas sin mirar el contexto real de cada sitio.

## Cómo volver a aplicarlo

El plugin no es nuestro: cada actualización de José Conti pisa este cambio. Pasos:

1. Actualizar el plugin como siempre.
2. Abrir `classes/class-wc-gateway-redsys.php` y buscar las 3 apariciones de
   `set_parameter('DS_MERCHANT_PAYMETHODS', 'T')` (con el editor de plugins de red,
   `/wp-admin/network/plugin-editor.php`, o por FTP).
3. Sustituir cada una por el bloque de `patch.diff`, comprobando que la variable del pedido
   sigue llamándose igual en ese método (puede cambiar entre versiones).
4. Guardar y probar un pago de prueba con Bizum en una suscripción: Redsys ya no debería
   ofrecer Bizum como opción.
5. Anotar en `VERSION_PARCHEADA.txt` (en esta carpeta, solo para el historial humano) **y**
   actualizar la constante `BLOKES_REDSYS_PARCHE_VERSION_ESPERADA` en
   `progreso-extension1-1.php` con la versión del plugin que acabas de parchear (por ejemplo
   `'32.0.0'`), commit y push — esa constante es la que de verdad usa el aviso del admin (ver
   abajo). `VERSION_PARCHEADA.txt` por sí solo NO llega al servidor (solo se sube
   `progreso-extension1-1.php`, no esta carpeta), así que no sirve para el aviso automático,
   solo como nota para quien lea el repo.

## Aviso automático si el parche se pierde

`progreso-extension1-1.php` (función `blokes_aviso_parche_redsys_perdido`, hooks
`admin_notices` y `network_admin_notices`) compara la versión instalada del plugin
`woocommerce-gateway-redsys` contra la constante `BLOKES_REDSYS_PARCHE_VERSION_ESPERADA`
definida en ese mismo fichero. Si están vacía o no coinciden, muestra un aviso en el admin
de WordPress a quien pueda `manage_options`.

**No comprueba que el parche siga realmente en el código** del plugin de Redsys (no vive en
este repo, no hay nada que diffear desde aquí) — solo compara números de versión. Si alguien
reaplica el parche en el servidor sin subir el cambio de la constante (commit + push), el
aviso seguirá saltando como si faltara; si alguien actualiza el plugin y sí reaplica el parche
a mano pero olvida subir la constante nueva, también saltará aunque todo esté bien. Hay que
mantener la constante al día cada vez, vía git, no solo el `.txt`.
