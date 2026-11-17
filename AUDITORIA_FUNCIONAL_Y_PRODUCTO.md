# INFORME DE AUDITORÍA FUNCIONAL, PRODUCTO Y LÓGICA DE NEGOCIO
**Repositorio:** `instantly-app`  
**Rol:** Agente Analista Funcional y de Producto  
**Destinatario:** `@coordinator` / Swarm  
**Fecha:** 17 de Noviembre de 2026  

---

## RESUMEN EJECUTIVO
`instantly-app` cuenta con una base arquitectónica prometedora (patrón repositorio, inyección de dependencias en contenedor, soporte dual JSON/Supabase y emulación de funcionalidades clave de plataformas líderes como Instantly y Smartlead). Sin embargo, la auditoría profunda revela **fallas críticas de diseño funcional, cuellos de botella severos y discrepancias de datos** que impiden que el producto opere de forma confiable en un entorno de producción real.

Entre los hallazgos más graves destacan:
1. **Ruptura del motor de secuencias goteo (Drip Sequences):** Las secuencias multietapa nunca avanzan al paso 2; `waitDays` y `currentStep` son ignorados en la ejecución de envíos (`CampaignDispatcher.ts`).
2. **Quema de casillas por bypass de límites diarios:** `AccountRotator.ts` ignora deliberadamente los límites cuando todas las casillas los alcanzan, enviando correos y destruyendo la reputación de los dominios.
3. **Peligro de pérdida total de datos (Data Loss):** El endpoint `DELETE /api/leads` sin parámetro `campaignId` purga absolutamente todos los leads de la base de datos sin advertencia ni confirmación.
4. **Warmup contraproducente:** El servicio de precalentamiento inserta etiquetas `[Warmup]` en el asunto y solo hace envíos unilaterales sin rescate real de bandeja, inflando métricas artificialmente.
5. **Funcionalidades "Placebo":** Opciones como `stopOnReply`, `stopOnDomainReply`, `clickTracking`, `credits` y `opportunities` existen en la interfaz y tipos de datos, pero carecen de implementación lógica en el backend.
6. **Fuga multitenant y esquemas faltantes:** La base de datos no aísla casillas ni campañas por workspace, y existen rutas que consultan tablas inexistentes en Supabase (`roles`, `user_profiles`).

A continuación se detalla el diagnóstico exhaustivo organizado en 4 bloques funcionales con citas exactas de archivos y líneas.

---

## BLOQUE 1: DIAGNÓSTICO ACTUAL FUNCIONAL (GENERAL Y POR MÓDULO)

### 1.1 Motor de Envíos y Despacho (`CampaignDispatcher.ts`, `AccountRotator.ts`, `SmtpMailer.ts`)
* **Archivo:** `src/core/services/CampaignDispatcher.ts`
  * **Líneas 92-93:** `const pendingLeads = allLeads.filter(l => l.status === 'pending');`.  
    *Fallo Lógico Crítico:* Una vez enviado el Paso 1, el lead pasa a `status = 'sent'` (línea 233). Al ejecutarse el siguiente lote, el despachador únicamente consulta leads con `status === 'pending'`. Como resultado, **los leads enviados jamás son considerados para el Paso 2, Paso 3 o pasos subsiguientes**.
  * **Líneas 154-155:** `const step = campaign.steps.find(s => s.stepNumber === lead.currentStep) || campaign.steps[0];`.  
    *Fallo:* El campo `lead.currentStep` nunca se incrementa en ninguna parte del código (líneas 233-242). Permanece en `1` para siempre.
  * **Ausencia de `waitDays`:** La regla de negocio de días de espera (`waitDays`) definida en `src/types/index.ts:11` no se evalúa en ninguna línea de `CampaignDispatcher.ts`. No existe cálculo de diferencia entre `lastContactedAt` y `now` para respetar la cadencia configurada.
  * **Líneas 74-80 (Cálculo de Horarios de Envío):**  
    `currentMinutes >= fromMinutes && currentMinutes <= toMinutes;`  
    *Edge Case Desatendido:* Si el usuario configura un horario que cruza la medianoche (ej. de 22:00 a 04:00 para envíos nocturnos en otra zona horaria), la condición evalúa `currentMinutes >= 1320 && currentMinutes <= 240`, lo cual es matemáticamente imposible. El despachador asume siempre que está fuera de horario y no despacha ningún correo.
  * **Línea 69:** `const currentDay = dayMap[weekdayStr] ?? now.getDay();`. Si el formateador falla, recurre a `now.getDay()`, que refleja el día del servidor y no el de la zona horaria de la campaña (`timezone`).
  * **Líneas 183-187:** Comparación rígida de contraseñas (`sender.smtpPass === 'demo-pass' || sender.smtpPass === 'demo-app-pass'`). Si una credencial real contiene estas subcadenas, el sistema conmuta silenciosamente a `SimulatedMailer` sin enviar el correo.
  * **Líneas 197-201:** Escapa caracteres HTML (`&`, `<`, `>`, `\n`) incluso cuando `plainTextMode: false`, arruinando plantillas HTML enriquecidas diseñadas por el usuario.
  * **Líneas 293-295:** La actualización de estadísticas de la campaña se realiza únicamente al final del bucle general. Si ocurre un fallo no controlado o un corte de ejecución en el servidor a mitad del lote, los leads quedan como `'sent'` pero las métricas de la campaña nunca se actualizan.

* **Archivo:** `src/core/services/AccountRotator.ts`
  * **Líneas 15-17:**  
    ```ts
    const available = accounts.filter(a => (a.sentToday || 0) < a.dailyLimit);
    const pool = available.length > 0 ? available : accounts;
    ```
    *Grave Error de Negocio (Deliverability Breach):* Si todas las casillas alcanzan su límite diario (`dailyLimit`), el rotador **ignora el límite y vuelve a usar todas las cuentas** (`pool = accounts`). En cold outreach, violar los límites diarios de envío provoca el bloqueo instantáneo de las casillas por parte de Google Workspace y Microsoft 365. El comportamiento esperado es detener el despacho y retornar que no hay casillas disponibles.
  * **Líneas 9-20:** El índice `currentIndex` es en memoria volátil. En entornos serverless o tras reinicios del proceso, se reinicia siempre a 0, sobrecargando la primera casilla de la lista.

* **Archivo:** `src/core/mailers/SmtpMailer.ts`
  * **Líneas 34-40:** La función `sendMail` solo incluye cabeceras básicas (`from`, `to`, `subject`, `text`, `html`). No inyecta `Message-ID` personalizado, ni las cabeceras `In-Reply-To` y `References` necesarias para mantener la conversación en un mismo hilo en correos de seguimiento (Follow-ups). Tampoco incluye las cabeceras `List-Unsubscribe` y `List-Unsubscribe-Post` requeridas por RFC 8058.

---

### 1.2 Integración y Normalización de Leads (`GoogleSheetsService.ts`)
* **Archivo:** `src/core/services/GoogleSheetsService.ts`
  * **Línea 68:**  
    `const apiUrl = \`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/A1:ZZ5000\`;`  
    *Cuello de Botella y Límite Rígido:* Hardcodea el rango `A1:ZZ5000`. Si una hoja tiene más de 5,000 filas, los leads excedentes son ignorados silenciosamente sin advertir al usuario. Además, asume la primera pestaña por defecto e ignora el parámetro `gid` en modo autenticado.
  * **Líneas 310 y 413:**  
    `if (!email || !email.includes('@')) continue;` y `if (email && email.includes('@'))`  
    *Validación Débil:* Acepta como correo válido cualquier cadena que contenga un carácter `@` (ej. `"test@"`, `"@domain"` o `"a@b"`). No utiliza regex de formato de email ni delega en `EmailVerifierService`, permitiendo la inserción de datos corruptos en la campaña.
  * **Líneas 171-198:** El analizador CSV procesa carácter por carácter en un único hilo síncrono. En archivos CSV masivos (más de 20,000 filas), bloquea el Event Loop de Node.js durante varios segundos.

---

### 1.3 Bandeja de Entrada Unificada y Detección de Respuestas (`ImapInboxService.ts`, `UniboxClassifierService.ts`)
* **Archivo:** `src/core/services/ImapInboxService.ts`
  * **Líneas 156-233:** Implementación artesanal de conexión IMAP vía socket TLS raw (`tls.connect` a puerto 993) mediante comandos textuales (`A1 LOGIN`, `A2 SELECT INBOX`, `A3 FETCH`).
    * **Línea 161:** `rejectUnauthorized: false` deshabilita la verificación de certificados TLS, dejando la conexión vulnerable a ataques Man-in-the-Middle (MitM).
    * **Líneas 228-231:** Condición de fin de lectura: `if (buffer.includes('A3 OK') || buffer.includes('A3 NO') || buffer.includes('A3 BAD')) finish(buffer);`. Si el cuerpo de un correo recibido contiene fortuitamente la subcadena `"A3 OK"`, el socket termina antes de recibir el resto de los mensajes.
    * **Líneas 172-173:** Timeout fijo de 9,500 ms. Si la casilla tiene latencia o una cola grande, se destruye el socket y se pierde la sincronización.
  * **Líneas 373-390:**  
    *Fallo Funcional:* Cualquier correo entrante proveniente del correo del lead es añadido a `repliedEmails.push(fromEmail)`. Si el lead responde con una notificación automática de vacaciones (`out-of-office`), en `src/app/api/unibox/sync/route.ts:51` el lead pasa inmediatamente a `status = 'replied'`, deteniendo la secuencia para siempre a pesar de que el prospecto no respondió humanamente.
  * **Líneas 398-425:** Cada mensaje parseado crea un hilo nuevo con ID `reply-${uid}`. No existe agregación de mensajes en un mismo hilo (`EmailThread`), por lo que múltiples respuestas de un mismo prospecto generan tarjetas dispersas e inconexas en el Unibox.

* **Archivo:** `src/core/services/UniboxClassifierService.ts`
  * **Líneas 42-58 vs Líneas 95-114 (Falso Positivo en Análisis de Sentimiento):**
    * La regla 2 verifica `text.includes('no me interesa')`, pero omite variantes muy comunes en español como `"no nos interesa"`, `"no le interesa"`, o `"no estoy interesado"`.
    * La regla 5 verifica `text.includes('interesa')`.
    * *Consecuencia:* Un prospecto que responde *"A nuestra empresa no le interesa su propuesta"* no activa la regla 2, pero activa la regla 5 porque contiene la palabra `"interesa"`. El sistema lo clasifica como `interested` con confianza 0.90 y le crea automáticamente un negocio en el CRM de $2,500 USD (líneas 147-152).
  * **Líneas 138-156 (Generación Duplicada de Deals):** No existe verificación previa de si ya existe un negocio para el `leadId` o `leadEmail`. Si el prospecto envía dos correos con interés, se duplican las oportunidades en el CRM.

---

### 1.4 Diagnóstico de Entregabilidad, Calentamiento y Verificación
* **Archivo:** `src/core/services/InternalWarmupService.ts`
  * **Línea 91:** `subject: \`[Warmup] ${subject}\``.  
    *Falla Crítica de Deliverability:* Incluir la etiqueta `[Warmup]` en el asunto delata el tráfico artificial ante los filtros bayesianos y antispam de Google Workspace y Microsoft 365, logrando exactamente lo opuesto al objetivo de calentamiento.
  * **Líneas 87-94:** El calentamiento es estrictamente de envío unidireccional. La casilla destino nunca abre el correo, no lo marca como "No es spam", no lo rescata de la papelera ni genera respuestas simuladas (Reverse reply).
  * **Líneas 109-110:**  
    ```ts
    sender.healthScore = Math.min(100, Math.max(90, (sender.healthScore || 95) + 0.2));
    sender.warmupRescueRate = Math.min(100, (sender.warmupRescueRate || 98) + 0.1);
    ```  
    El puntaje de salud y la tasa de rescate son aumentados ficticiamente tras cada envío, ofreciendo métricas engañosas al usuario.
  * **Líneas 41-45:** No implementa una curva de aceleración gradual (Ramp-up schedule, ej. 5 correos día 1, 8 día 2, 12 día 3).

* **Archivo:** `src/core/services/PlacementTestService.ts`
  * **Líneas 21-38:** El servicio **no envía ningún correo de prueba a buzones de control** (seed list) en Gmail, Outlook o Yahoo. Se limita a promediar la auditoría DNS (60%) y el detector de palabras spam (40%). Denominarlo "Placement Test" (Test de Colocación en Bandeja) induce a error funcional al usuario, pues no mide la ubicación real (Inbox vs. Promociones vs. Spam).

* **Archivo:** `src/core/services/EmailVerifierService.ts`
  * **Líneas 55-83:** Solo verifica la existencia de registros MX en el dominio. No efectúa conexión SMTP simulada (`HELO/EHLO` -> `MAIL FROM` -> `RCPT TO`) para verificar si el buzón específico existe en el servidor. Un correo inventado como `usuarioinexistente12345@google.com` recibe un score de 95% y es marcado como válido.
  * **Líneas 4-17:** La lista de dominios descartables (`DISPOSABLE_DOMAINS`) tiene únicamente 12 entradas fijas.
  * **Línea 99:** `Promise.all(emails.map(e => this.verifyEmail(e)))`. Al procesar lotes grandes de leads, dispara cientos de consultas DNS concurrentes sin limitación de concurrencia (`p-limit`), provocando saturación de sockets y errores de resolución `ETIMEOUT`.

* **Archivo:** `src/core/services/DnsCheckerService.ts`
  * **Líneas 34-45:** Solo comprueba que exista un registro que empiece por `v=spf1`. No valida si existen múltiples registros SPF (infracción RFC que anula el SPF) ni el límite de 10 lookups DNS.
  * **Líneas 70-86:** Para DKIM solo prueba 5 selectores fijos (`google`, `selector1`, `default`, `k1`, y el selector ingresado). Dominios en Zoho (`zoho`), Proton, Mailgun o Sendgrid reportan fallo falso de DKIM a menos que el usuario conozca de antemano el selector.

---

### 1.5 Procesamiento de Contenido: Spintax, Spam y Plantillas
* **Archivo:** `src/core/services/SpintaxService.ts`
  * **Líneas 12 y 18:**  
    `const spintaxRegex = /\{([^{}]+?\|[^{}]+?)\}/g;`  
    `while (spintaxRegex.test(resolved) && iterations < maxIterations) {`  
    *Bug de Estado de Expresión Regular (`lastIndex`):* Al definir `spintaxRegex` con la bandera global `/g` fuera del bucle, cada llamada a `.test()` avanza la propiedad `lastIndex`. En textos con spintax anidados o múltiples opciones, `lastIndex` alcanza el final de la cadena prematuramente, provocando que el bucle `while` aborte antes de resolver todos los grupos spintax y dejando etiquetas `{opcion1|opcion2}` sin procesar en el correo final.

* **Archivo:** `src/core/services/SpamDetectorService.ts`
  * **Líneas 97-107 y 117-121:** El diccionario recorre las frases en el orden de inserción de las propiedades del objeto. Si la palabra corta `'gratis'` se evalúa antes que `'100% gratis'`, la frase `"Acceso 100% gratis"` se convierte en `"Acceso 100% sin costo inicial"`, impidiendo que la regla de mayor especificidad (`'100% gratis' -> 'de cortesía'`) se ejecute.

* **Archivo:** `src/core/services/TemplateRenderer.ts`
  * **Líneas 14 y 16:**  
    `res.replace(/\{\{(firstName|...)\}\}/gi, lead.firstName || 'there');`  
    `res.replace(/\{\{(companyName|...)\}\}/gi, lead.companyName || 'your company');`  
    *Inconsistencia de Idioma:* Si `lead.firstName` o `lead.companyName` están vacíos, inserta palabras en inglés (`"there"`, `"your company"`). En una campaña redactada en español, esto genera correos como: *"Hola there, nos gustaría colaborar con your company"*, evidenciando una automatización defectuosa ante el prospecto.

* **Archivo:** `src/core/services/WebhookDispatcherService.ts`
  * **Líneas 14-17:** Obtiene todos los webhooks activos sin filtrar por `workspaceId`. Los eventos generados en un workspace disparan webhooks de otros clientes o workspaces.
  * **Líneas 36-38:** Utiliza una cabecera estática `X-MiSender-Secret` en lugar de una firma criptográfica HMAC-SHA256 (`X-MiSender-Signature`) sobre el cuerpo del payload.

---

### 1.6 Diagnóstico de API Route Handlers (22 Rutas)

| Endpoint | Método | Estado Funcional | Falla Detectada / Vulnerabilidad | Código HTTP Adecuado |
| :--- | :---: | :--- | :--- | :---: |
| `/api/leads` | `DELETE` | **CRÍTICO** | Si no recibe `?campaignId=...`, ejecuta `saveLeads([])` o `delete().neq('id', '...')`, **eliminando la totalidad de los leads de la empresa**. | Debe requerir `campaignId` obligatoriamente o retornar 400. |
| `/api/accounts` | `POST` | **DEFICIENTE** | En las líneas 40-76 hardcodea todos los registros DNS como `valid: true` con valores inventados, en lugar de invocar a `DnsCheckerService`. | 201 (con validación real). |
| `/api/accounts` | `PUT/PATCH` | **FALTANTE** | No existe método para actualizar configuración de casillas (límites diarios, puertos, contraseñas). | Requiere implementar `PUT/PATCH`. |
| `/api/roles` | `GET` | **ERROR SILENCIOSO** | Intenta consultar la tabla `misender.roles`, la cual **no existe en las migraciones de base de datos**. Siempre cae en el bloque `catch/error` y retorna un array hardcodeado. | Crear migración o formalizar endpoint estático. |
| `/api/user-profile` | `GET / PUT` | **ROTO EN PUT** | Consulta la tabla inexistente `misender.user_profiles`. El método `PUT` lanza un error 500 al intentar hacer upsert sobre una tabla que no existe en Supabase. | Crear migración o sincronizar con tabla de usuarios. |
| `/api/track/unsubscribe` | `GET/POST` | **VULNERABLE** | Permite desuscribir a cualquier lead pasando únicamente `?leadId=lead-1` sin token criptográfico ni firma HMAC. Un atacante puede iterar IDs y desuscribir toda la base. Además, refleja `emailToBlock` en HTML sin sanitizar (línea 70). | Requiere token HMAC y escape de HTML. |
| `/api/track/open` | `GET` | **DEFICIENTE** | No computa aperturas totales ni almacena timestamp en base de datos. Sufre condiciones de carrera al actualizar `camp.stats.opened` de forma síncrona en memoria. | Debe registrar eventos atómicos. |
| `/api/campaigns/[id]` | `PUT` | **INSEGURO** | Acepta el body completo sin validación de esquema, permitiendo alterar métricas arbitrariamente (`stats: { sent: 99999 }`) o corromper el estado. | Requiere validación Zod. |
| `/api/campaigns/[id]/test-email` | `POST` | **INCOMPLETO** | Solo envía el paso 1 variante A. No permite probar pasos de seguimiento (follow-ups) ni variantes B/C. Llama directamente a `smtpMailer` sin contemplar cuentas de prueba. | Añadir selector de paso y variante. |
| `/api/unibox/sync` | `POST` | **VOLÁTIL Y LENTO** | Itera síncronamente sobre todas las cuentas; con 5 cuentas puede tardar 45 segundos y disparar un timeout 504 en Vercel. Además, **los hilos devueltos jamás se guardan en la base de datos**. Al recargar la página se pierden. | Debe guardar en tabla `email_threads` y procesarse asíncronamente. |
| `/api/webhooks` | `POST` | **SIN VALIDAR** | No valida si el string `url` es una URL HTTP/HTTPS bien formada. No valida tipos de eventos. | Retornar 400 en URL inválida. |
| `/api/deals` | `PUT` | **SIN SANITIZAR** | Actualiza el objeto directamente sin comprobar pertenencia al workspace ni validar tipos de datos numéricos. | Validar esquema y workspace. |

---

### 1.7 Diagnóstico de Base de Datos y Almacenamiento
* **Archivo de Migraciones:**
  * `supabase/migrations/20261021_create_misender_schema.sql`
  * `supabase/migrations/20261117_inhouse_features.sql`
* **Inconsistencias de Esquema:**
  1. **Ausencia de `workspace_id` en Entidades Primarias:**  
     Las tablas `misender.sender_accounts`, `misender.campaigns` y `misender.leads` **no tienen columna `workspace_id`**. Sin embargo, las tablas añadidas posteriormente (`deals`, `blocklist`, `webhooks`) sí la tienen. Esto imposibilita la separación real de clientes o agencias en el backend.
  2. **Tablas Fantasma:** Las tablas `roles` y `user_profiles` son consultadas en el código pero no fueron creadas en ninguna migración SQL.
  3. **Ausencia de Tablas para Hilos y Logs de Correo:** No existen tablas `misender.email_threads`, `misender.email_messages` ni `misender.dispatch_logs`. Todo el historial de envíos y la bandeja Unibox residen únicamente en respuestas volátiles de la API o en el estado local de React.
  4. **Exposición de Clave de Supabase:** En `src/core/supabase/client.ts:6`, se encuentra una clave anónima JWT de Supabase hardcodeada en el repositorio.
  5. **Dualidad Síncrona vs Asíncrona en Repositorios:** La interfaz `src/core/interfaces/storage.ts` define métodos con retorno `Promise<T> | T` para soportar `JsonDriver` síncrono y `Supabase` asíncrono. Esto introduce inconsistencias de tipado en TypeScript y riesgos donde un llamador asuma un retorno síncrono sobre Supabase.

---

## BLOQUE 2: MEJORAS A LO QUE YA EXISTE (OPTIMIZACIONES Y ROBUSTEZ)

### 2.1 Corrección del Motor de Secuencias y Despachador
1. **Flujo de Transición de Estados de Leads:**
   * Crear un campo `status: LeadStatus` con estados de ciclo de vida enriquecidos: `'pending_step' | 'in_cadence' | 'paused' | 'replied' | 'bounced' | 'unsubscribed' | 'completed'`.
   * En `CampaignDispatcher.ts`, los leads elegibles para despacho deben ser:
     * Leads nuevos en Paso 1: `currentStep === 1 && status === 'pending'`.
     * Leads en seguimiento: `status === 'in_cadence' && (now - lastContactedAt) >= step.waitDays * 86400000`.
   * Al despachar exitosamente un paso intermedio:
     * Incrementar `currentStep = currentStep + 1`.
     * Si no hay más pasos en la campaña, marcar `status = 'completed'`.
     * Si hay pasos posteriores, marcar `status = 'in_cadence'` y actualizar `lastContactedAt = now`.
2. **Protección Estricta de Límites en `AccountRotator.ts`:**
   * Si todas las casillas disponibles han alcanzado su cuota diaria (`sentToday >= dailyLimit`), el rotador debe retornar `null`.
   * `CampaignDispatcher` debe capturar este caso, suspender el lote y emitir un log explícito: *"Límite diario alcanzado para todas las casillas asociadas a la campaña"*.
3. **Soporte de Horarios Nocturnos y Multizona:**
   * Corregir el cálculo de ventana horaria en `isWithinSchedule`:
     ```ts
     const isOvernight = toMinutes < fromMinutes;
     const withinTime = isOvernight
       ? (currentMinutes >= fromMinutes || currentMinutes <= toMinutes)
       : (currentMinutes >= fromMinutes && currentMinutes <= toMinutes);
     ```
4. **Cabeceras de Enhebrado de Correos (Email Threading):**
   * En `SmtpMailer.ts`, para pasos de seguimiento (Paso > 1), inyectar cabeceras `In-Reply-To` y `References` con el `messageId` del correo anterior para que el cliente de correo del prospecto agrupe la conversación de manera natural.

### 2.2 Blindaje de Endpoints y Consistencia de Datos
1. **Protección contra Borrado Masivo en `/api/leads`:**
   * Modificar `src/app/api/leads/route.ts:DELETE` para rechazar cualquier solicitud que no incluya un parámetro de consulta explícito `campaignId`.
   * Exigir confirmación mediante cabecera o flag `?confirmAll=true` en caso de requerir un vaciado total de campaña.
2. **Generación Real de Diagnóstico en Creación de Cuentas:**
   * En `src/app/api/accounts/route.ts:POST`, eliminar el mock estático de líneas 40-76 e invocar inmediatamente a `container.dnsChecker.auditDomain(domain)` para guardar el estado DNS verídico de la casilla.
3. **Seguridad Criptográfica en Desuscripciones:**
   * Generar enlaces de desuscripción firmados:  
     `/api/track/unsubscribe?leadId=...&token=HMAC_SHA256(leadId, APP_SECRET)`.
   * Verificar la firma antes de marcar al contacto como desuscrito en el bloque global.
4. **Persistencia Real de Hilos Unibox:**
   * Crear la tabla `misender.email_threads` y guardar en ella el resultado de cada sincronización IMAP, asociando cada mensaje a un hilo agrupado por prospecto (`lead_id`).

---

## BLOQUE 3: NUEVAS FUNCIONALIDADES RECOMENDADAS (BRECHAS DE VALOR)

### 3.1 Infraestructura de Despacho Asíncrono (Cola y Worker en Background)
* **Brecha Actual:** El despacho de correos se ejecuta de forma síncrona en el hilo HTTP de Next.js (`executeCampaignStep`), con alto riesgo de timeout en Vercel/Node si el lote supera los 15-20 correos.
* **Solución Propuesta:** Implementar un sistema de colas ligero (PostgreSQL LISTEN/NOTIFY, Supabase Edge Functions con cron o BullMQ en servidor Node). La API solo encola la orden de despacho (`status: queued`), y un worker en background procesa los correos aplicando pausas aleatorias entre envíos (Jitter de 30-90 segundos por casilla), emulando el comportamiento humano y preservando la entregabilidad.

### 3.2 Motor Real de Rastreo de Clics (Custom Tracking Domain)
* **Brecha Actual:** El campo `clickTracking` existe pero no reescribe enlaces ni cuenta con endpoint de redirección.
* **Solución Propuesta:** Crear el endpoint `/api/track/click?url=...&leadId=...&campaignId=...` que registre el clic en la base de datos y redirija con código HTTP 302 hacia la URL original. Reescribir automáticamente los enlaces `<a href="...">` en el cuerpo del correo cuando `campaign.clickTracking` sea verdadero.

### 3.3 Guardián Automático de Salud de Casillas (Health Auto-Pause)
* **Brecha Actual:** Si una casilla comienza a experimentar rebotes masivos (Hard bounces) o errores de autenticación SMTP, el despachador continúa intentando enviar correos a través de ella.
* **Solución Propuesta:** Regla de desconexión preventiva: Si una casilla acumula más de 3 rebotes consecutivos o una tasa de rebote diaria superior al 3%, su estado cambia automáticamente a `status = 'error'` y se emite una alerta crítica en la interfaz, protegiendo el resto de las campañas.

### 3.4 Filtro Inteligente de Respuestas Automáticas (Out-of-Office Rescheduler)
* **Brecha Actual:** Un correo "Fuera de la oficina" marca al lead como respondido y cancela el seguimiento comercial.
* **Solución Propuesta:** Cuando `UniboxClassifierService` detecta sentimiento `out-of-office`:
  * No marcar el lead como respondido (`'replied'`).
  * Extraer la fecha de regreso si está presente en el cuerpo del correo o pausar el lead por 7 días naturales.
  * Reanudar la secuencia de forma automática al término del periodo.

### 3.5 Matriz de Reemplazo Spintax con Validación Sintáctica
* **Brecha Actual:** Spintax vulnerable a errores de sintaxis y sin análisis de entropía.
* **Solución Propuesta:** Incorporar un validador sintáctico en el editor de secuencias que verifique el balanceo de llaves `{}` y pipes `|`, alertando al usuario antes de guardar si un spintax quedó mal formado.

---

## BLOQUE 4: PODA Y ELIMINACIÓN (DEUDA TÉCNICA Y ENTIDADES HUÉRFANAS)

| Entidad / Campo / Archivo | Ubicación | Diagnóstico de Poda | Acción Recomendada |
| :--- | :--- | :--- | :--- |
| **`B2BLead`** | `src/types/index.ts:158`, `mockData.ts:7` | **100% Huérfano:** Interfaz y array simulado sin vista, sin API, sin tabla de base de datos ni relación con el producto. | **Eliminar** para desinfectar el modelo de tipos. |
| **`stopOnReply` y `stopOnDomainReply`** | `src/types/index.ts:43-44`, `CampaignEditor.tsx` | **Placebo Funcional:** Opciones presentes en la UI pero completamente ignoradas en el despachador. | **Implementar** la lógica en `CampaignDispatcher` y `unibox/sync` o remover temporalmente del frontend para no engañar al usuario. |
| **`Workspace.credits`** | `src/types/index.ts:5`, `Topbar.tsx` | **Contador Decorativo:** No se debita ni valida en verificación de leads, envíos ni importaciones. | Eliminar de la cabecera o vincular a un middleware de consumo real de créditos. |
| **`CampaignStats.opportunities`** | `src/types/index.ts:39` | **Métrica Muerta:** Siempre vale 0 en base de datos; la vista de analíticas usa un fallback desesperado. | Vincular a la creación de deals en `UniboxClassifierService` (`camp.stats.opportunities++`) o suprimir del objeto de estadísticas. |
| **Mock DNS en creación de cuenta** | `src/app/api/accounts/route.ts:40-76` | **Engaño Técnico:** Hardcodea registros DNS válidos con textos de ejemplo (`prox.instantly.ai`). | **Eliminar** el bloque estático y reemplazarlo por la ejecución asíncrona de `DnsCheckerService`. |
| **`copilot_messages` sin uso** | `src/core/storage/CopilotRepository.ts`, `supabase/migrations/` | **Desconexión Arquitectónica:** Existe tabla y repositorio, pero `CopilotService` no persiste los mensajes. | Conectar la persistencia en `CopilotService` o eliminar el repositorio huérfano. |
| **Clave Supabase hardcodeada** | `src/core/supabase/client.ts:6` | **Vulnerabilidad de Seguridad:** Cadena JWT anónima escrita en plano en el código. | **Eliminar** el fallback hardcodeado y exigir variables de entorno (`.env.local`). |

---

## MATRIZ DE PRIORIZACIÓN (IMPACTO VS. ESFUERZO)

| Prioridad | Tarea / Módulo | Problema que Resuelve | Impacto | Esfuerzo | Justificación |
| :---: | :--- | :--- | :---: | :---: | :--- |
| **P0** | **Corrección del motor de secuencias multietapa** (`CampaignDispatcher.ts`) | Habilita el envío del Paso 2 en adelante respetando `waitDays` y `currentStep`. Sin esto, el producto no es una herramienta de outbound. | **Crítico** | Medio | Núcleo del modelo de negocio. |
| **P0** | **Freno estricto de límite diario en `AccountRotator.ts`** | Detiene el envío cuando las casillas llegan a su límite, evitando el baneo inmediato de dominios. | **Crítico** | Bajo | Protección de la reputación del cliente. |
| **P0** | **Protección del endpoint `DELETE /api/leads`** | Evita la pérdida catastrófica de toda la base de datos por un llamado accidental sin `campaignId`. | **Crítico** | Bajo | Prevención de desastre de datos. |
| **P0** | **Limpieza del Asunto en `InternalWarmupService.ts`** | Remueve la etiqueta `[Warmup]` que delata el tráfico artificial en los filtros antispam. | **Crítico** | Muy Bajo | Evita quemar dominios en precalentamiento. |
| **P1** | **Persistencia de hilos de Unibox en Base de Datos** | Almacena los correos sincronizados por IMAP en una tabla real para que no desaparezcan al recargar la página. | **Alto** | Medio | Usabilidad básica de la bandeja de entrada. |
| **P1** | **Corrección de expresiones regulares spintax y spam** | Resuelve el bug de `lastIndex` en `SpintaxService` y ordena reemplazos de spam de mayor a menor longitud. | **Alto** | Bajo | Calidad y pulcritud de los correos emitidos. |
| **P1** | **Aislamiento Multitenant con `workspace_id`** | Agrega `workspace_id` a `campaigns`, `sender_accounts` y `leads` para permitir soporte multi-agencia real. | **Alto** | Medio | Consistencia arquitectónica y privacidad. |
| **P1** | **Filtro de Out-of-Office en `unibox/sync`** | Evita que una respuesta automática detenga la secuencia de un prospecto y le cree un negocio falso. | **Alto** | Bajo | Eficiencia comercial del pipeline de ventas. |
| **P2** | **Implementación real de `clickTracking` y redirección** | Provee métricas reales de interacción en enlaces enviados en campañas frías. | **Medio** | Medio | Valor analítico para optimización de campañas. |
| **P2** | **Poda de `B2BLead` y campos placebo** | Elimina código muerto, interfaces no implementadas y limpia la interfaz de usuario. | **Medio** | Bajo | Reducción de deuda técnica y confusión. |
| **P2** | **Selector de paso en prueba de correo (`test-email`)** | Permite enviar correos de prueba de cualquier variante y paso de la secuencia. | **Medio** | Bajo | Mejora de experiencia de redacción y QA. |
| **P3** | **Migración de tablas `roles` y `user_profiles`** | Elimina los errores 500 en la gestión de perfiles de usuario en base de datos. | **Bajo** | Bajo | Estabilidad administrativa del perfil. |
| **P3** | **Límite de concurrencia en verificación de correos (`p-limit`)** | Evita saturación de DNS al validar listas de más de 500 prospectos simultáneos. | **Bajo** | Bajo | Escalabilidad y estabilidad de red. |

---

## CONCLUSIÓN Y SIGUIENTES PASOS
El código de `instantly-app` posee cimientos muy bien planteados a nivel de interfaz de usuario, tipografía y abstracciones de servicios. No obstante, **el motor transaccional de envíos y el ciclo de vida de los datos presentan desconexiones severas** que transforman partes críticas del software en ilusiones de interfaz (placebos).

Resolviendo prioritariamente las 4 tareas clasificadas como **P0** (Secuencias multietapa, Límite diario de casillas, Blindaje de borrado de leads y Corrección de asunto de warmup), la plataforma estará lista para despachar campañas masivas reales con seguridad de nivel empresarial.
