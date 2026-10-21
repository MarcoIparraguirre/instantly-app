# Documento de Especificación Funcional: Plataforma Outbound Email (Estilo Instantly.ai)

- **Versión:** 1.0
- **Perfil de Autor:** Analista Funcional Senior con foco en UX/UI
- **Audiencia:** Equipo de Producto, Ingeniería (Backend/Frontend), Diseñadores UX/UI y QA

---

## 1. Visión General del Producto y Propuesta de Valor

El sistema es una plataforma **SaaS B2B de automatización de ventas outbound (Cold Email Outreach)** diseñada para resolver los dos mayores cuellos de botella del sector:
1. **Escalabilidad de envíos sin costos lineales:** Desacopla la suscripción de la cantidad de casillas conectadas, permitiendo conectar múltiples cuentas de correo sin cobro por usuario/asiento adicional.
2. **Entregabilidad y reputación técnica:** Automatiza la preservación de la reputación de los dominios mediante rotación de cuentas (*Inbox Rotation*) y una red distribuida de calentamiento (*Email Warmup*).

### Objetivos Clave de Negocio y Operación
- Permitir el envío de decenas de miles de correos diarios sin activar filtros de spam corporativos ni penalizaciones de proveedores (Google Workspace, Microsoft 365).
- Reducir a cero la necesidad de herramientas satélites de calentamiento, validación y bandejas de entrada dispersas.
- Proveer una experiencia de usuario ágil y centralizada para agencias y equipos de ventas B2B de alto volumen.

---

## 2. Arquitectura de Información y Patrones Globales UX/UI

El sistema implementa una arquitectura de **Single Page Application (SPA)** de alta densidad de información, con diseño responsivo pero optimizado primariamente para entornos de escritorio de escritorio y monitores de trabajo (>1280px).

```
+------------------------------------------------------------------------------------+
|  [Workspace Selector v]  [Global Search]                 [Credits]  [User Profile] |
+-----------+------------------------------------------------------------------------+
|           |                                                                        |
|  SIDEBAR  |                     MAIN WORKSPACE CONTENT                             |
|           |                                                                        |
| Leads     |  (Vistas dinámicas según módulo:                                       |
| Accounts  |   - Wizard por pasos en Campaigns                                      |
| Campaigns |   - Master-Detail de 3 paneles en Unibox                              |
| Unibox    |   - Grilla con filtros facetados en Lead Finder                        |
| CRM       |   - Tablero Kanban en Pipeline                                         |
| Analytics |   - Dashboards de métricas en Analytics)                               |
| Settings  |                                                                        |
|           |                                                                        |
+-----------+------------------------------------------------------------------------+
```

### 2.1. Navegación y Workspaces (Multi-tenancy)
- **Selector de Entorno (Workspace Switcher):** Ubicado en la esquina superior izquierda. Permite conmutar al instante entre clientes (para agencias) o divisiones corporativas. Aísla completamente listas de leads, cuentas conectadas, campañas, métricas y límites de uso.
- **Barra Lateral Primaria (Sidebar Izquierdo):** Agrupación conceptual siguiendo el ciclo de vida natural del lead outbound:
  1. *Lead Finder* (Adquisición de prospectos)
  2. *Email Accounts* (Infraestructura y reputación)
  3. *Campaigns* (Estrategia y orquestación)
  4. *Unibox* (Gestión de respuestas y conversión)
  5. *CRM / Pipeline* (Seguimiento comercial)
  6. *Analytics* (Métricas e inteligencia)

### 2.2. Patrones UX/UI Transversales
- **Indicadores Semafóricos de Salud (Badges & Health Bars):**
  - Verde (`#10B981`): Activo, configurado correctamente, DNS 100%, warmup saludable.
  - Amarillo (`#F59E0B`): En pausa, límites diarios casi alcanzados, advertencia menor de DMARC/SPF.
  - Rojo (`#EF4444`): Credenciales desconectadas, tasa de rebote >3%, fallos críticos de autenticación.
- **Drawer Panels (Paneles Laterales Deslizables):** Para evitar la pérdida de contexto en tablas extensas, cualquier acción de configuración o detalle profundo de un registro se abre desde el margen derecho, manteniendo visible el listado subyacente.
- **Acciones Masivas Flotantes (Floating Bulk Action Bar):** Al seleccionar una o más filas en cualquier tabla, emerge una barra flotante en el margen inferior central con acciones contextuales (ej. pausar, borrar, agregar a campaña, cambiar límites).

---

## 3. Especificación Detallada de Módulos

---

### MÓDULO 1: Cuentas de Correo y Calentamiento (Email Accounts & Warmup)

Administra el pool de infraestructuras emisoras y asegura que los correos aterricen en la bandeja de entrada principal (*Primary Inbox*) y no en Promociones o Spam.

#### Requerimientos Funcionales
1. **Conexión Multicanal:**
   - Flujo OAuth 2.0 nativo de 1-clic para Google Workspace y Microsoft 365 (Azure Entra ID).
   - Conexión manual genérica para cualquier servidor corporativo vía SMTP/IMAP (con soporte de puertos TLS/SSL personalizados).
2. **Red P2P de Calentamiento (Warmup Network):**
   - Red cerrada de intercambio entre cuentas del ecosistema.
   - Envío gradual y escalonado de correos con contenido dinámico generado algorítmicamente.
   - Emulación de interacción humana: apertura automática, marcación como "importante", retiro sistemático de la carpeta de "Spam" o "No deseado" y respuesta simulada (*Warmup Replies*).
   - Rampa de aceleración configurable: incremento progresivo diario (ej. comenzar en 2 correos/día y aumentar 2 diarios hasta un tope de 30).
3. **Auditoría DNS y Configuración Técnica:**
   - Verificación periódica y bajo demanda de registros: **SPF, DKIM, DMARC y MX**.
   - Validación y configuración de **Custom Tracking Domain (CTD)** con registro CNAME para aislar el dominio de rastreo del dominio institucional.
4. **Protección de Dominio:**
   - Límite máximo de correos por día por casilla (`Max daily sends`).
   - Retardo mínimo y aleatorio entre envíos (`Delay between emails`) para evitar patrones sintéticos.

#### Comportamiento UX/UI
- **Lista de Cuentas:** Tabla densa con columnas: Email, Proveedor (icono), Volumen Hoy / Máx., Estado de Conexión, Estado de Warmup (con toggle directo de activación rápida con icono 🔥) y Score de Salud (0 - 100%).
- **Panel de Configuración de Casilla (Drawer Derecho):**
  - *Tab General:* Nombre del remitente, firma de correo, límite diario, reintentos.
  - *Tab Warmup:* Gráfico de progresión de envíos vs. respuestas de warmup, tasa de rescate de spam.
  - *Tab DNS Checker:* Listado de registros con etiquetas de verificación verde o advertencia roja con instrucciones precisas de resolución DNS para el usuario.

---

### MÓDULO 2: Buscador y Verificador de Prospectos (B2B Lead Finder)

Motor de enriquecimiento y base de datos nativa B2B integrado directamente al flujo de campañas sin descargas intermedias de archivos.

#### Requerimientos Funcionales
1. **Filtros Facetados Avanzados:**
   - Por persona: Cargo (*Job Title*), nivel jerárquico (*Seniority*), departamento, ubicación geográfica.
   - Por empresa: Industria/Sector, rango de empleados, facturación anual estimada, tecnologías detectadas (*Tech Stack*), dominios similares (*Lookalike*).
2. **Verificación de Entregabilidad Integrada:**
   - Comprobación en tiempo real de validez de la casilla (detección de servidores *Catch-all*, trampas de spam y casillas inexistentes).
   - Consumo de créditos únicamente por contactos con correos catalogados como verificados/válidos.
3. **Inyección Directa a Campaña:**
   - Selección masiva de prospectos y asignación inmediata a una campaña nueva o existente sin generar CSVs.

#### Comportamiento UX/UI
- **Layout de Búsqueda:** Panel izquierdo fijo con acordeones colapsables para los filtros; área central y derecha con la cuadrícula de resultados paginada.
- **Visualización de Registros:** Cada tarjeta/fila muestra: Nombre, Cargo, Logotipo de la Empresa, Dominio, Ubicación, Enlace a LinkedIn y un botón para desbloquear información sensible protegida por créditos.

---

### MÓDULO 3: Motor de Campañas (Campaigns)

El núcleo operativo de la plataforma. Diseñado bajo un patrón visual de **Asistente por Pasos (Wizard)** compuesto por 4 fases consecutivas:

```
[ 1. Leads ] ----> [ 2. Sequences ] ----> [ 3. Schedule ] ----> [ 4. Options ]
```

#### Fase 1: Leads (Audiencia)
- **Funcionalidades:**
  - Importación vía CSV, sincronización con Google Sheets o transferencia desde el *Lead Finder*.
  - Mapeo visual de columnas: asignación de cabeceras del archivo a variables del sistema (`{{firstName}}`, `{{companyName}}`, etc.) o creación de campos personalizados (*Custom Variables*).
  - Detección automática y eliminación de duplicados contra: la campaña actual, listas globales del workspace o listas negras (*Unsubscribe / Blocked List*).

#### Fase 2: Sequences (Lógica de Contenido y Cadencia)
- **Funcionalidades:**
  - Estructuración de hilos en cascada: *Step 1* (Paso inicial) → Espera de $N$ días → *Step 2* (Seguimiento dentro del mismo hilo o hilo nuevo) → ... → *Step N*.
  - **A/Z Testing Nativo:** Cada paso puede dividirse en hasta 5 variantes diferentes (A, B, C, etc.) con distribución porcentual de tráfico equitativa o ponderada.
  - **Sintaxis Spintax:** Soporte de sintaxis dinámica para variar redacciones a nivel de microfrases: `{{RANDOM | Hola | Estimado | Buen día}}`.
  - **Asistente de Redacción y Anti-Spam:** Analizador en tiempo real del cuerpo del correo que advierte sobre:
    - Uso de palabras detonantes de spam (*Spam Trigger Words* como "gratis", "compre ya", "100% garantizado").
    - Densidad excesiva de enlaces externos.
    - Ausencia de tags de desuscripción.
    - Simulación visual de variables reemplazadas con un prospecto de ejemplo aleatorio.

#### Fase 3: Schedule (Ventanas de Distribución)
- **Funcionalidades:**
  - Selección de zona horaria objetivo (la del prospecto o la del operador).
  - Configuración de días hábiles activos (Lunes a Viernes) y ventanas horarias de despacho (ej. 09:00 AM a 05:30 PM).

#### Fase 4: Options (Reglas de Negocio y Entrega)
- **Funcionalidades:**
  - **Inbox Rotation (Pool de Casillas):** Selector múltiple de cuentas de correo vinculadas a la campaña. El sistema rotará secuencialmente cada nuevo correo entre las casillas habilitadas para balancear la carga.
  - **Reglas de Cancelación Automática:**
    - Detener secuencia en caso de respuesta (*Stop sending on reply*).
    - Detener si cualquier otra persona de la misma empresa/dominio ya respondió (*Stop sequence on domain reply*).
    - Detener en caso de clic en enlace o apertura (opcional según el caso de uso).
  - **Modo de Envío en Texto Plano:** Opción de deshabilitar código HTML y píxeles transparentes de rastreo de apertura para garantizar una entregabilidad óptima en sectores de alta seguridad (banca, salud, gobierno).

---

### MÓDULO 4: Bandeja de Entrada Unificada (Unibox)

Centraliza los buzones de cientos de casillas conectadas en una única interfaz operativa, depurando correos irrelevantes y priorizando oportunidades reales.

#### Requerimientos Funcionales
1. **Filtro de Ruido Inteligente:** Aísla y oculta automáticamente de la vista del usuario los correos de calentamiento interno (*Warmup emails*) y notificaciones del sistema, mostrando únicamente interacciones de leads reales.
2. **Clasificación Semántica con IA (Lead Sentiment Tagging):**
   - Procesamiento del lenguaje natural (NLP) sobre el cuerpo de la respuesta entrante para asignar automáticamente una etiqueta:
     - `Interested` (Verde)
     - `Meeting Booked` (Azul)
     - `Not Interested` (Gris)
     - `Out of Office` (Amarillo)
     - `Wrong Person / Referral` (Púrpura)
3. **Respuesta en el Mismo Hilo:**
   - La respuesta enviada desde el Unibox sale automáticamente a través de la misma cuenta de correo original que inició el contacto, conservando el identificador del mensaje en los encabezados `In-Reply-To` y `References`.
4. **Acciones Rápidas y Sub-secuencias:**
   - Inserción de plantillas predefinidas (*Canned Responses*).
   - Movimiento automático del lead a una secuencia secundaria de seguimiento futuro (ej. "Recontactar en 6 meses").

#### Comportamiento UX/UI (Layout Master-Detail de 3 Paneles)
- **Columna 1 (Filtros y Bandejas):** Vistas por estado (No leídos, Todos), por Campaña, por Casilla y por Etiqueta de Sentimiento de IA.
- **Columna 2 (Lista de Hilos):** Tarjetas de conversación con nombre del prospecto, empresa, badge de sentimiento, fragmento de la respuesta y tiempo transcurrido.
- **Columna 3 (Área de Conversación y Contexto):**
  - Panel superior: Hilo completo de mensajes en orden cronológico.
  - Panel inferior: Editor enriquecido de respuesta rápida.
  - Panel lateral accesorio: Ficha técnica del lead (datos de LinkedIn, cargo, historial de actividad y campaña a la que pertenece).

---

### MÓDULO 5: CRM y Pipeline de Oportunidades (Dealflow)

Convierte las respuestas comerciales en un flujo estructurado de ventas, cuantificando el valor monetario generado por las campañas.

#### Requerimientos Funcionales
1. **Automatización de Creación de Tratos (*Deals*):** Creación automática de una tarjeta de oportunidad en la columna inicial del pipeline cuando un lead recibe la etiqueta `Interested` o `Meeting Booked`.
2. **Gestión de Etapas del Embudo:** Etapas configurables por el usuario (ej. *Respuesta Positiva → Demo Agendada → Propuesta Enviada → Cerrada Ganada → Perdida*).
3. **Asignación de Valor Financiero:** Atribución de un importe monetario estimado por trato para calcular proyecciones de ingresos y retorno sobre la inversión (ROI) del canal outbound.

#### Comportamiento UX/UI
- **Tablero Kanban Interactivo:** Arrastrar y soltar (*Drag & Drop*) entre etapas con recálculo en tiempo real de los totales por columna.
- **Indicador de Inactividad:** Alerta cromática en la tarjeta si un lead en estado de oportunidad lleva más de $N$ días sin respuesta o interacción por parte del equipo.

---

### MÓDULO 6: Analítica y Reportes (Analytics)

Monitor de rendimiento en tiempo real a nivel macro (embudo general) y micro (variantes y dominios).

#### Requerimientos Funcionales
1. **Métricas de Embudo Outbound:**
   - Correos Enviados (*Sent*)
   - Tasa de Apertura (*Open Rate*)
   - Tasa de Clics en Enlaces (*Click Rate*)
   - Tasa de Respuesta Global (*Reply Rate*)
   - Tasa de Respuestas Positivas (*Positive Reply Rate / Opportunities*)
   - Tasa de Rebote (*Bounce Rate*) y Desuscripción (*Unsubscribe Rate*)
2. **Desglose Granular:**
   - Rendimiento por variante de secuencia para determinar ganadores estadísticos en tests A/B.
   - Rendimiento y tasa de rebote por cuenta emisora individual (para aislar y desconectar casillas antes de que dañen el dominio).

#### Comportamiento UX/UI
- Fila superior con tarjetas KPI de resumen ejecutivo (valor numérico actual y comparación porcentual contra el periodo anterior).
- Gráfico central interactivo con selector de series temporales (gráfico de líneas o barras apiladas de volumen vs. respuestas).

---

## 4. Diagrama del Ciclo de Vida del Lead

El siguiente diagrama modela las transiciones de estado que experimenta un prospecto dentro del motor del sistema:

```
                  +--------------------------------+
                  |            LEAD IN             |
                  |  (Importación CSV / Finder)    |
                  +---------------+----------------+
                                  |
                                  v
                  +--------------------------------+
                  |         VERIFICATION           |
                  | (Comprobación de entregabilidad|
                  +-------+----------------+-------+
                          |                |
             [Inválido]   |                | [Válido]
       +------------------+                +------------------+
       |                                                      |
       v                                                      v
+--------------+                                    +--------------------+
| BOUNCED /    |                                    |       READY        |
| BLACKLISTED  |                                    | (Asignado a Steps) |
+--------------+                                    +---------+----------+
                                                              |
                                                              v
+--------------+         [Límite / Fuera horario]   +--------------------+
|  COMPLETED   | <--------------------------------- |     SCHEDULED      |
| (Fin de pasos|                                    |  (Encolado hoy)    |
| sin respuesta)                                    +---------+----------+
+--------------+                                              |
       ^                                                      v
       |                                            +--------------------+
       |          [Sin respuesta tras espera]       |     DELIVERED      |
       +------------------------------------------- | (Enviado vía Pool) |
                                                    +---------+----------+
                                                              |
                                                    [Lead responde correo]
                                                              |
                                                              v
                                                    +--------------------+
                                                    |      REPLIED       |
                                                    | (Detiene secuencias|
                                                    +---------+----------+
                                                              |
                                                [Clasificación semántica IA]
                                                              |
                                     +------------------------+------------------------+
                                     |                                                 |
                                     v                                                 v
                          +--------------------+                            +--------------------+
                          |     INTERESTED     |                            |   NOT INTERESTED   |
                          | (Impacta CRM /     |                            | (Cierra el ciclo o |
                          |  Notifica Slack)   |                            |  agrega a blacklist|
                          +--------------------+                            +--------------------+
```

---

## 5. Arquitectura Técnica de Procesos en Segundo Plano (Workers)

Para la implementación backend, el sistema requiere desacoplar la interfaz de usuario de las tareas asíncronas de alto volumen mediante una arquitectura orientada a eventos con colas de mensajes (ej. Redis + BullMQ / Celery / Kafka):

1. **Scheduler Worker (Planificador):**
   - Corre cada minuto. Revisa las campañas en estado activo (`status = 'ACTIVE'`).
   - Verifica los husos horarios del *Schedule* y selecciona los leads en estado `SCHEDULED`.
   - Distribuye las tareas en el *Dispatch Queue* respetando los límites disponibles por casilla para el día en curso.
2. **Dispatcher Worker (Despachador):**
   - Consume del *Dispatch Queue*.
   - Procesa la sustitución de variables de personalización y evalúa la sintaxis *Spintax*.
   - Selecciona la siguiente cuenta disponible del pool según el algoritmo de rotación (*Round-Robin* ponderado).
   - Realiza la llamada a la API (Google Graph/Gmail API) o ejecuta la conexión SMTP enviando el correo.
3. **IMAP / Webhook Listener (Escucha de Respuestas y Warmup):**
   - Monitorea permanentemente las casillas conectadas vía conexiones IDLE o webhooks de notificación push (Pub/Sub).
   - Discrimina cabeceras para separar correos del pool de Warmup de respuestas comerciales de prospectos reales.
   - En caso de respuesta de un lead: suspende de inmediato futuros envíos de la campaña para ese lead, encola el texto para inferencia en el clasificador de IA y despacha eventos a Webhooks salientes (Make, Zapier, Slack, CRMs externos).