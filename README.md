# Casa · Finanzas compartidas

Panel doméstico estático (HTML/CSS/JS), diseño cálido, base de datos Supabase, acceso mediante una cuenta compartida, cuotas, vencimientos, reparto variable y exportación JSON.

## 1. Preparar Supabase

1. Crea un proyecto en https://supabase.com/dashboard.
2. En **SQL Editor**, ejecuta todo el contenido de `supabase/schema.sql` en un proyecto **nuevo**.
3. En **Authentication > Providers > Email**, verifica que esté disponible Email/Password. Para una sola cuenta creada manualmente, desactiva las altas públicas (*Allow new users to sign up*, si aparece).
4. En **Authentication > Users > Add user**, crea una cuenta con un correo al que tengáis acceso y una contraseña fuerte. Confirma el correo si la consola lo requiere.
5. En **SQL Editor**, ejecuta, reemplazando el correo:

```sql
insert into public.app_members (user_id)
select id from auth.users where email = 'CORREO_COMPARTIDO@EJEMPLO.COM'
on conflict do nothing;
```

6. En **Project Settings / Connect / API Keys** (la ubicación puede variar), copia **Project URL** y la **publishable key**. Es seguro incluir esta clave pública en un cliente web **solo porque las políticas RLS están activadas**. Nunca utilices una `secret key` ni `service_role`.
7. Verifica que el SQL se ejecutó sin errores antes de usar la web.

## 2. Configurar el panel

En `config.js`, reemplaza:

- `PON_AQUI_URL_SUPABASE` por la URL del proyecto `https://xxxxxxxx.supabase.co`.
- `PON_AQUI_PUBLISHABLE_KEY` por la clave pública (publishable/anon).
- `personA` y `personB` por vuestros nombres de pantalla.

**Nunca incluyas contraseñas ni secretos en el repositorio.** `config.js` será públicamente visible desde GitHub Pages, algo esperado para la URL y la clave pública.

## 3. Publicar en GitHub Pages

1. Crea un repositorio en GitHub, por ejemplo `casa-finanzas`.
2. Sube `index.html`, `styles.css`, `app.js`, `config.js` y opcionalmente `README.md` y `supabase/schema.sql` conservando las rutas.
3. En GitHub entra a **Settings > Pages > Build and deployment**.
4. Selecciona **Deploy from a branch**, rama `main` y directorio `/(root)`; guarda.
5. Visita `https://TUUSUARIO.github.io/casa-finanzas/` y entra con la cuenta creada en Supabase.

No hay compilación, backend propio ni comando npm. El CDN de supabase-js necesita conexión a Internet.

## 4. Uso

- **Cuentas**: añade nombres de bancos o tarjetas (sin IBAN, números completos o contraseñas).
- **Compras**: añade nombre, importe total, categoría, porcentaje de la persona A, número de cuotas, primera fecha y cuenta de cobro.
- **Cuotas**: en Vencimientos, pulsa **Editar** y cambia estado a Pagado, fecha real, quién pagó realmente, importe o cuenta de débito.
- **Resumen**: total de compras, importe pagado, pendiente, vencimientos próximos y compensación entre participantes según las cuotas pagadas.
- **Respaldo**: en Cuentas, descarga JSON. Guárdalo en un lugar seguro: contiene información financiera. El respaldo es de lectura/archivo; esta primera versión **no ofrece restauración/importación**.

### Limitaciones conscientes de la versión 1

- La única cuenta de Supabase es compartida; no permite atribuir ediciones a una persona concreta. Si necesitáis auditoría personal, se recomiendan dos usuarios distintos.
- Los registros son compartidos por todas las identidades de `app_members`. Solo autorices la cuenta compartida prevista.
- No hay transferencia de saldos entre vosotros: el cálculo de quién debe a quién se basa exclusivamente en **cuotas pagadas**.
- Editar una compra no modifica importe, calendario o cantidad de cuotas existentes. Para esto edita cada cuota individual, o elimina y vuelve a crear la compra (esto último elimina el historial de sus cuotas).
- No hay restauración JSON, notificaciones push ni sincronización instantánea por Realtime. Se actualiza cada 30 s mientras el panel está abierto, además de inmediatamente tras una edición local.
- Una compra al contado se registra como **una cuota** que debes marcar como Pagado; de este modo también entra en el balance.
- No genera movimientos bancarios automáticos, no está conectado a bancos y no evita por sí mismo el auto-pausado del plan gratis de Supabase.
- Mantén respaldos periódicos y no cargues datos bancarios sensibles.

## 5. Privacidad y seguridad

El HTML y JS de GitHub Pages son públicos; **los datos no están embebidos en estos archivos**. Supabase valida la sesión y Row Level Security restringe las operaciones a usuarios admitidos en `app_members`. Este control protege los datos de usuarios anónimos y de otros usuarios autenticados no autorizados. El acceso compartido supone que cualquiera que conozca las credenciales puede ver y modificar toda la información. Activa MFA si está disponible y cambia la contraseña si sospechas filtración.

Para verificar la configuración, prueba a abrir el enlace en una ventana privada: no debería verse ningún dato antes de autenticarse. Una cuenta autenticada no incluida en `app_members` no debería poder leer registros.
