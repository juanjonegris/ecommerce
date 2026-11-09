# Guía del proyecto y catálogo de comportamientos

Guía para que un desarrollador con experiencia entre al proyecto y lo entienda rápido. Todo lo que aparece aquí se trazó leyendo el código del repo (revisión del 2026-11-08, rama `main` en `8e11d4a`). Lo que no pude confirmar está marcado con **(sin confirmar)**.

> Complemento: `docs/onboarding/01-ruta-de-aprendizaje.md` explica las tecnologías. Este documento explica **este** proyecto.

---

## 1. Visión general

Es una **plataforma de e-commerce de marca blanca**. Cada cliente recibe un _fork_ del repositorio y su propio despliegue, así que no hay multi-tenancy ni `tenantId`. El sistema tiene dos partes:

- **Una API REST** en NestJS (`apps/api`, puerto 3001, Swagger en `/docs`). Tiene catálogo, categorías, carrito, pedidos, pagos, descuentos, newsletter, chat, subida de imágenes y búsqueda.
- **Una app Next.js** (`apps/web`, puerto 3000). Contiene la tienda pública y el panel de administración, en español e inglés.

**Hoy el panel de administración es la parte más completa.** La tienda permite ver productos y armar un carrito local, pero todavía no compra: checkout, cuenta y pedidos son pantallas de relleno. Varias funciones del backend aún no tienen pantalla; están en la sección 2.4.

---

## 2. Catálogo de comportamientos

Convenciones de este catálogo:

- **Abreviaturas:** `web/` es `apps/web/src/` y `api/` es `apps/api/src/`.
- **Archivos:** se listan **en orden de ejecución**.
- **Flechas:** "→" significa "llama a" o "pasa el control a".

### 2.1 Comunes a toda la web

#### W1. Entrar al sitio y resolver el idioma

- **Disparador:** el usuario abre cualquier URL, por ejemplo `http://localhost:3000/`.
- **Archivos:**
  1. `web/middleware.ts`: el middleware de next-intl intercepta la petición; excluye `api`, `_next` y los archivos con extensión.
  2. `web/i18n/routing.ts`: define los idiomas a partir de la configuración de marca.
  3. `web/config/brand.ts`: `locales: ['es','en']`, `defaultLocale: 'es'`, nombre de la tienda y email de soporte.
  4. `web/app/[locale]/layout.tsx`:
     - Valida el idioma con `hasLocale`; si no es válido, `notFound()`.
     - Fija el idioma con `setRequestLocale`.
     - Envuelve todo en `NextIntlClientProvider` y `QueryProvider`.
     - Carga las fuentes y `globals.css`.
  5. `web/i18n/request.ts`: carga los mensajes de `web/i18n/messages/{es,en}.json`.
  6. `web/providers/query.provider.tsx`: crea el `QueryClient` de TanStack Query (lo usa el chat).
- **Comunicación:** no hay llamadas HTTP; todo se resuelve en el servidor de Next.js.
- **Resultado:** `/` redirige a `/es`. Todas las páginas reciben `params.locale`.

### 2.2 Tienda (storefront)

#### T1. Ver la portada

- **Disparador:** `/{locale}`.
- **Archivos:** `web/app/[locale]/page.tsx` (Server Component).
- **Comunicación:** solo lee `brand.name`; no llama a la API.
- **Resultado:** título con el nombre de la tienda y el botón "Browse products", que lleva a `/{locale}/products`. Los textos están fijos en inglés y no pasan por i18n.

#### T2. Ver el catálogo

- **Disparador:** `/{locale}/products`.
- **Archivos:**
  1. `web/app/[locale]/products/page.tsx` (Server Component).
  2. `web/lib/api.ts`: `getProducts(page, locale)` → `apiFetch`. Usa `fetch` con `next.revalidate: 60` y `tags: ['products']`, y envía la cabecera `Accept-Language`.
  3. `api/modules/products/products.controller.ts` → `findAll` (`GET /products`, público).
  4. `api/modules/products/products.service.ts` → `findAll`.
  5. `api/modules/products/products.repository.ts`: consulta Prisma y mapea a `entities/product.entity.ts`.
  6. `api/modules/products/dto/product-response.dto.ts`: `ProductResponseDto.from(...)` da forma a la respuesta.
- **Comunicación:**
  - La petición HTTP sale **del servidor de Next.js** hacia la API, nunca del navegador.
  - La respuesta tiene el tipo `PaginatedResponse<Product>` de `@repo/types`.
  - Queda en caché hasta 60 s, o hasta que una mutación del admin invalide la etiqueta `products` (ver P2).
- **Resultado:** una cuadrícula de tarjetas (`data-testid="product-grid"`). Si falla la API se ve un mensaje de error, y si no hay productos, un aviso de "vacío".

#### T3. Ver el detalle de un producto

- **Disparador:** clic en una tarjeta, o abrir `/{locale}/products/{slug}`.
- **Archivos:**
  1. `web/app/[locale]/products/[slug]/page.tsx` (Server Component).
  2. `web/lib/api.ts`: `getProduct(slug)`, con las etiquetas `products` y `product:{slug}`.
  3. `api/modules/products/products.controller.ts` → `findOne` (`GET /products/:slug`) → `ProductsService.findBySlug` → `ProductsRepository`.
- **Comunicación:** igual que T2. Si la API devuelve error, la página llama a `notFound()`.
- **Resultado:** nombre, descripción, precio y el botón "Add to cart" (ver T4).

#### T4. Añadir al carrito

- **Disparador:** botón "Add to cart" en el detalle.
- **Archivos:**
  1. `web/components/add-to-cart-button.tsx` (Client Component).
  2. `web/stores/cart.store.ts`: store de Zustand con `persist`; `addItem` suma la cantidad si el producto ya está.
- **Comunicación:**
  - Todo ocurre en el navegador; el carrito se guarda en `localStorage` bajo la clave `cart-storage`.
  - **No llama a la API.** El carrito de la API (Redis, ver B3) no se usa desde la web.
- **Resultado:** el producto queda en el carrito. No hay confirmación visual en la pantalla de detalle.

#### T5. Ver el carrito y quitar productos

- **Disparador:** `/{locale}/cart`.
- **Archivos:**
  1. `web/app/[locale]/cart/page.tsx`: la página entera es un Client Component (`'use client'`).
  2. `web/stores/cart.store.ts`: lee `items` y llama a `removeItem`.
- **Comunicación:** solo el estado local; el total se calcula en el componente.
- **Resultado:** líneas con su subtotal, el total y el botón "Proceed to checkout" hacia `/{locale}/checkout`.

#### T6. Checkout, cuenta y mis pedidos (pantallas de relleno)

- **Disparador:** `/{locale}/checkout`, `/{locale}/account`, `/{locale}/account/orders`.
- **Archivos:** `web/app/[locale]/checkout/page.tsx`, `web/app/[locale]/account/page.tsx`, `web/app/[locale]/account/orders/page.tsx`.
- **Comunicación:** ninguna.
- **Resultado:** un título y un texto del tipo "Coming soon — Stripe integration". **Todavía no se puede comprar.**

#### T7. Páginas informativas

- **Disparador:** `/{locale}/about`, `/contact`, `/faq`, `/policies`.
- **Archivos:** `web/app/[locale]/(info)/{about,contact,faq,policies}/page.tsx`. `(info)` es un grupo de rutas: no aparece en la URL.
- **Comunicación:** `contact` lee `brand.supportEmail`.
- **Resultado:** texto estático.

### 2.3 Autenticación y panel de administración

#### A1. Iniciar sesión

- **Disparador:** `/{locale}/login` (o la redirección desde `/admin`), con el formulario de email y contraseña.
- **Archivos:**
  1. `web/app/[locale]/login/page.tsx` (Server Component): lee `?next=` y por defecto usa `/{locale}/admin`.
  2. `web/app/[locale]/login/login-form.tsx` (Client): usa `useActionState(loginAction)` y `useFormStatus` para el botón.
  3. `web/app/actions/auth.ts` → `loginAction` (Server Action): valida con Zod (`LoginSchema`).
  4. `api/modules/auth/auth.controller.ts` → `login` (`POST /auth/login`).
  5. `api/modules/auth/auth.service.ts` → `login`: busca el usuario en `auth.repository.ts`, compara con `bcrypt` y firma el access token (15 min) y el refresh token (7 días).
  6. De vuelta en `loginAction`: guarda `accessToken` en la cookie **httpOnly** `session` (7 días) y hace `redirect(next)`.
- **Comunicación:**
  - Navegador → Server Action (una llamada HTTP gestionada por Next.js) → `fetch` del servidor de Next.js a la API.
  - El refresh token se recibe pero **no se guarda ni se usa** (ver sección 6).
- **Resultado:**
  - Si las credenciales son válidas, se entra al panel.
  - Si no, se ve el mensaje traducido `admin.login.invalid`.

#### A2. Proteger el panel (en cada página del admin)

- **Disparador:** cualquier ruta `/{locale}/admin/**`.
- **Archivos:**
  1. `web/app/[locale]/admin/layout.tsx`: `dynamic = 'force-dynamic'`.
  2. `web/lib/auth.ts` → `getCurrentUser`: lee la cookie y llama a `GET /auth/me`. Está memoizado por petición con `cache()` de React.
  3. `api/modules/auth/auth.controller.ts` → `me`, con `JwtAuthGuard`.
  4. `api/modules/auth/strategies/jwt.strategy.ts` → `validate` → `AuthService.validateUser`.
  5. `web/components/admin/admin-shell.tsx` (Client): barra lateral, navegación y chip de usuario.
- **Comunicación:**
  - Sin sesión: `redirect('/{locale}/login?next=/{locale}/admin')`.
  - Con rol distinto de `ADMIN` o `STAFF`: redirección a la tienda.
- **Resultado:** el contenido de la página dentro del _shell_, más el `Toaster` (sonner) para las notificaciones.

#### A3. Cerrar sesión

- **Disparador:** icono de salida en el chip de usuario de la barra lateral.
- **Archivos:** `web/components/admin/admin-shell.tsx` (`UserChip`, con `useTransition`) → `web/app/actions/auth.ts` → `logoutAction`.
- **Comunicación:** borra la cookie `session` y redirige a `/{locale}`. No avisa a la API: el JWT sigue siendo válido hasta que expira.
- **Resultado:** vuelta a la portada de la tienda.

#### A4. Sesión expirada o sin permiso dentro del panel

- **Disparador:** cualquier lectura del admin que recibe 401 o 403 de la API.
- **Archivos:**
  1. `web/lib/admin/api.ts` → `fetchAdmin`: lanza `AdminAuthError`.
  2. `web/lib/admin/auth-error.ts`.
  3. `web/app/[locale]/admin/error.tsx` (Client, _error boundary_): si el error es `AdminAuthError`, hace `router.push('/{locale}/login')`.
- **Resultado:** el usuario vuelve a la pantalla de login. Los demás errores se muestran en una tarjeta con el botón "Back" (`reset`).

#### D1. Dashboard con indicadores

- **Disparador:** `/{locale}/admin`.
- **Archivos:**
  1. `web/app/[locale]/admin/page.tsx` → `loadDashboard()`.
  2. `web/lib/admin/api.ts`: `listOrders`, `getAdminProducts`, `listConversationsForAdmin` (dos veces) y `listSubscribers`. Todas pasan por `fetchAdmin`, con el _bearer_ de la cookie y `cache: 'no-store'`.
  3. En la API: `GET /orders`, `GET /products`, `GET /chat` y `GET /newsletter`, cada una en su controlador.
  4. Componentes: `web/components/admin/kpi-tile.tsx`, `status-badge.tsx`, `empty-state.tsx`, `admin-breadcrumbs.tsx`.
  5. `web/lib/admin/format.ts`: formato de precios y fechas.
- **Comunicación:**
  - Las peticiones se lanzan en paralelo con `Promise.allSettled`: si un endpoint falla, solo se vacía su tarjeta.
  - Los indicadores se **calculan en la página**, sobre como mucho 50 pedidos y 50 productos.
- **Resultado:** pedidos de hoy, ingresos de 30 días, stock bajo (menos de 10), chats abiertos, suscriptores pendientes, y listas de pedidos y chats recientes.

#### P1. Listar productos

- **Disparador:** menú "Products" (`/{locale}/admin/products`). Admite `?page=`, `?categoryId=`, `?sortBy=price|createdAt` y `?order=asc|desc`.
- **Archivos:**
  1. `web/app/[locale]/admin/products/page.tsx` (Server): `getAdminProducts` y `listCategories` con `Promise.allSettled`.
  2. `web/components/admin/data-table.tsx` (Server Component): tabla genérica que recibe `columns` y `rowKey`.
  3. `web/app/[locale]/admin/products/row-actions.tsx` (Client): menú "⋯" con Editar y Borrar.
  4. API: `GET /products` (`ProductsController.findAll`) y `GET /categories` (`CategoriesController.findAll`).
- **Resultado:** tabla con nombre, precio, stock, categoría, estado y acciones.

#### P2. Crear producto

- **Disparador:** botón "New product" → `/{locale}/admin/products/new`.
- **Archivos:**
  1. `web/app/[locale]/admin/products/new/page.tsx` (Server): carga las categorías con `listCategories`.
  2. `web/app/[locale]/admin/products/product-form.tsx` (Client): `useActionState(createProductAction)`.
  3. `web/app/actions/admin/products.ts` → `createProductAction`: valida con Zod (`ProductInputSchema`) y llama a `POST /products` con el _bearer_.
  4. `api/modules/products/products.controller.ts` → `create`: `JwtAuthGuard`, `RolesGuard` y `@Roles(ADMIN)`; el DTO se valida con `class-validator` mediante el `ValidationPipe` global.
  5. `api/modules/products/products.service.ts` → `create` → `ProductsRepository` → Prisma.
  6. De vuelta en la acción, `invalidateCatalog(slug)`:
     - `revalidatePath` del listado del admin.
     - `updateTag('products')` y `updateTag('product:{slug}')`, que invalidan la caché de la tienda.
  7. La acción devuelve un "centinela" `fieldErrors.name = '__created:{slug}'`. Un `useEffect` del formulario lo detecta y navega con `router.push('/admin/products/{slug}')`.
- **Resultado:**
  - Se abre la pantalla de edición del producto nuevo.
  - El producto aparece en el admin y en la tienda sin esperar los 60 s.

#### P3. Editar producto

- **Disparador:** clic en el nombre, o "Edit" en el menú de la fila → `/{locale}/admin/products/{slug}`.
- **Archivos:**
  1. `web/app/[locale]/admin/products/[slug]/page.tsx` (Server): `getAdminProduct`, `listCategories` y `listProductImages`.
  2. `product-form.tsx` con `updateProductAction` → `PATCH /products/:id` → `ProductsController.update` → `ProductsService.update`.
  3. `invalidateCatalog` y `revalidatePath` de la página de detalle.
- **Resultado:** datos guardados y caché invalidada. En la misma pantalla está el gestor de imágenes (P5).

#### P4. Borrar producto

- **Disparador:** "⋯" → "Delete" en la fila, con un diálogo de confirmación.
- **Archivos:**
  1. `row-actions.tsx` → `web/components/admin/confirm-dialog.tsx`.
  2. `deleteProductAction` → `DELETE /products/:id` → `ProductsController.remove` → `ProductsService.remove`.
- **Resultado:** el producto desaparece del listado y la caché de la tienda se invalida.

#### P5. Subir imágenes de producto

- **Disparador:** selector de archivo en la pantalla de edición.
- **Archivos:**
  1. `web/app/[locale]/admin/products/[slug]/image-manager.tsx` (Client).
  2. `web/app/actions/admin/uploads.ts` → `presignImageAction` → `POST /uploads/product-images/presign`.
  3. `api/modules/uploads/uploads.controller.ts` → `presign` → `UploadsService.presign`:
     - Crea la fila `ProductImage` en estado pendiente.
     - Pide una URL pre-firmada al `StorageProvider`, que puede ser `providers/s3.provider.ts` o `providers/stub.provider.ts`.
  4. El **navegador** hace `PUT` directo a esa URL (S3 o MinIO). El archivo no pasa por la API.
  5. `confirmImageAction` → `POST /uploads/product-images/:id/confirm` → `UploadsService.confirm`.
  6. Limpieza: `api/modules/uploads/uploads.queue.service.ts` programa un trabajo horario (`scheduleCleanupRepeatable`). `uploads.processor.ts` lo ejecuta (`cleanupStaleUploads`) y resuelve las subidas abandonadas.
- **Comunicación:** combina Server Actions, una subida HTTP directa del navegador al almacenamiento y BullMQ (Redis).
- **Resultado:** la imagen aparece en la galería con una notificación de éxito. En modo _stub_, el `PUT` puede fallar sin cortar el flujo.

#### P6. Reordenar y borrar imágenes

- **Disparador:** arrastrar y soltar, o el botón de borrar en el gestor de imágenes.
- **Archivos:** `image-manager.tsx` → `web/app/actions/admin/products.ts`:
  - `reorderImagesAction` → `POST /uploads/product-images/reorder` → `UploadsService.reorder`.
  - `deleteImageAction` → `DELETE /uploads/product-images/:id` → `UploadsService.remove`.
- **Resultado:** el orden se guarda o la imagen se elimina.

#### C1. Gestionar categorías (árbol)

- **Disparador:** menú "Categories" (`/{locale}/admin/categories`). Desde ahí se crea una categoría raíz o hija, se renombra o se borra.
- **Archivos:**
  1. `web/app/[locale]/admin/categories/page.tsx` (Server) → `listCategories` → `GET /categories`.
  2. `web/app/[locale]/admin/categories/category-tree.tsx` (Client): construye el árbol y gestiona los diálogos.
  3. `web/app/actions/admin/categories.ts`, validadas con Zod:
     - `createCategoryAction` → `POST /categories`.
     - `updateCategoryAction` → `PATCH /categories/:id`.
     - `deleteCategoryAction` → `DELETE /categories/:id`.
  4. `api/modules/categories/categories.controller.ts` (solo `ADMIN`) → `categories.service.ts`. Si la categoría tiene productos, lanza `ConflictException` (409).
- **Resultado:** el árbol se actualiza con una notificación. Si el borrado está bloqueado, se muestra el mensaje `deleteBlocked`.

#### O1. Listar pedidos

- **Disparador:** menú "Orders". Hay pestañas por estado (`?status=`) y paginación (`?page=`).
- **Archivos:** `web/app/[locale]/admin/orders/page.tsx` → `listOrders` → `GET /orders` → `OrdersController.findAll` → `OrdersService.findAll`.
- **Resultado:** tabla de pedidos con su estado.

#### O2. Ver un pedido y sus pagos

- **Disparador:** clic en un pedido → `/{locale}/admin/orders/{id}`.
- **Archivos:** `web/app/[locale]/admin/orders/[id]/page.tsx` → `getOrder` (`GET /orders/:id`) y `getPaymentsByOrder` (`GET /payments/order/:orderId`).
- **Resultado:** detalle del pedido, sus líneas, sus pagos y los botones de estado.

#### O3. Cambiar el estado de un pedido

- **Disparador:** botones de estado en el detalle del pedido.
- **Archivos:**
  1. `web/app/[locale]/admin/orders/[id]/status-buttons.tsx` (Client): `TRANSITIONS` define qué botones se muestran:
     - `PENDING` → `CONFIRMED` o `CANCELLED`.
     - `CONFIRMED` → `SHIPPED` o `CANCELLED`.
     - `SHIPPED` → `DELIVERED` o `CANCELLED`.
  2. `web/app/actions/admin/orders.ts` → `updateOrderStatusAction` → `PATCH /orders/:id/status`.
  3. `api/modules/orders/orders.controller.ts` → `updateStatus` (`ADMIN`) → `OrdersService.transitionStatus`: valida la transición con `VALID_TRANSITIONS` y llama a `OrdersRepository.updateStatus`.
- **Resultado:** el estado cambia y aparece una notificación. **Confirmar a mano no descuenta stock**; solo lo hace el pago (B5).

#### Dc1. Gestionar descuentos

- **Disparador:** menú "Discounts": listado, "New discount", edición y borrado.
- **Archivos:**
  1. `web/app/[locale]/admin/discounts/page.tsx` → `listDiscounts` → `GET /discounts`.
  2. `discounts/new/page.tsx` y `discounts/[id]/page.tsx` (`getDiscount`) → `discount-form.tsx` (Client, `useActionState`).
  3. `web/app/actions/admin/discounts.ts`, validadas con Zod (`DiscountInputSchema`: código, `percentOff` **o** `amountOff`, y `expiresAt` opcional):
     - `createDiscountAction` → `POST /discounts`.
     - `updateDiscountAction` → `PATCH /discounts/:id`.
     - `deleteDiscountAction` → `DELETE /discounts/:id`.
  4. `discounts/row-actions.tsx` → borrado con confirmación.
  5. `api/modules/discounts/discounts.controller.ts` (`ADMIN`) → `discounts.service.ts` (`create`, `update`, `remove`).
- **Resultado:** código de descuento creado, editado o borrado. Al crear uno, se navega a su edición mediante `state.createdId`.

#### N1. Gestionar suscriptores de la newsletter

- **Disparador:** menú "Newsletter". Hay pestañas por estado (`?status=`) y búsqueda (`?search=`); en cada fila se puede reenviar la sincronización, dar de baja o borrar.
- **Archivos:**
  1. `web/app/[locale]/admin/newsletter/page.tsx` → `listSubscribers` → `GET /newsletter` → `NewsletterService.listForAdmin`.
  2. `web/app/[locale]/admin/newsletter/row-actions.tsx` (Client) → `web/app/actions/admin/newsletter.ts`:
     - `forceResyncAction` → `POST /newsletter/:id/resync`.
     - `forceUnsubscribeAction` → `POST /newsletter/:id/unsubscribe`.
     - `deleteSubscriberAction` → `DELETE /newsletter/:id`.
  3. `api/modules/newsletter/newsletter.service.ts` (`forceResync`, `forceUnsubscribe`, `remove`) → `newsletter.queue.service.ts` (`enqueueUpsert`, `enqueueUnsubscribe`).
  4. `api/modules/newsletter/newsletter.processor.ts` (_worker_ de BullMQ) → el proveedor elegido en `newsletter.module.ts`: `providers/mailchimp.provider.ts`, `klaviyo.provider.ts` o `stub.provider.ts`.
- **Comunicación:** la acción del admin solo **encola** el trabajo; la sincronización con el proveedor externo ocurre después, en segundo plano.
- **Resultado:** una notificación (o un aviso `syncMismatch`), y el listado se actualiza.

#### Ch1. Inbox de chat en tiempo real

- **Disparador:** menú "Chat".
- **Archivos:**
  1. `web/app/[locale]/admin/chat/page.tsx` (Server):
     - Lee el token de la cookie y la variable `API_URL`.
     - Renderiza los _breadcrumbs_ en el servidor y se los pasa al inbox.
  2. `web/app/[locale]/admin/chat/chat-inbox.tsx` (Client):
     - Usa `useQuery` para pedir las conversaciones y los mensajes **directamente desde el navegador** (`GET /chat`, `GET /chat/:id/messages`, con _bearer_).
     - Abre un socket con `io(apiUrl + '/chat')`.
  3. `api/modules/chat/chat.gateway.ts` → `handleConnection`: verifica el JWT y mete a los administradores en la _room_ `admin`.
  4. Eventos que escucha el cliente: `message:new`, `conversation:new` y `conversation:updated`. Cada uno dispara `invalidateQueries` y TanStack Query vuelve a pedir los datos.
- **Comunicación:** HTTP del navegador a la API (aquí el token sí llega al JavaScript del cliente; el propio `page.tsx` lo documenta) más WebSocket.
- **Resultado:** la lista de conversaciones y los mensajes se actualizan solos.

#### Ch2. Responder, marcar como leído o cerrar una conversación

- **Disparador:** caja de respuesta y botones del inbox.
- **Archivos:**
  1. `chat-inbox.tsx`: `useMutation` llama a las Server Actions de `web/app/actions/admin/chat.ts`:
     - `replyAction` → `POST /chat/:id/reply`.
     - `markReadAction` → `POST /chat/:id/read`.
     - `closeConversationAction` → `PATCH /chat/:id`.
  2. `api/modules/chat/chat.controller.ts` (`reply`, `markAdminRead`, `update`) → `chat.service.ts` (`sendMessageAsAdmin`, `markRead`, `updateStatus`).
  3. El controlador llama a `gateway.broadcast(envelope)`, que emite el evento a las _rooms_ que correspondan.
- **Resultado:** el mensaje aparece en el inbox y en los demás clientes conectados.

#### S1. Ver ajustes

- **Disparador:** menú "Settings".
- **Archivos:** `web/app/[locale]/admin/settings/page.tsx` (Server): `readRuntimeSnapshot()` lee `process.env` **del proceso de Next.js** y `brand.ts`.
- **Comunicación:** no llama a la API.
- **Resultado:** nombre de la marca, idiomas, y si cada proveedor (pagos, newsletter, almacenamiento…) está en modo real o _stub_ según haya clave. (Sin confirmar) Si las claves solo están en el `.env` que lee la API, esta pantalla podría mostrar "stub" aunque la API use el proveedor real.

### 2.4 Funciones del backend sin pantalla todavía

Estos flujos existen y tienen tests en la API, pero **ninguna pantalla de la web los usa**. Se pueden probar desde Swagger (`http://localhost:3001/docs`).

| #   | Comportamiento                          | Endpoints                                                                                                                                   | Archivos principales                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | Registro y renovación de token          | `POST /auth/register`, `POST /auth/refresh`                                                                                                 | `api/modules/auth/auth.controller.ts`, `auth.service.ts` (`register`, `refresh`)                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| B2  | Búsqueda full-text y sugerencias        | `GET /search`, `GET /search/suggest`, `POST /search/reindex` (ADMIN)                                                                        | `api/modules/search/search.service.ts` → `providers/postgres-fts.provider.ts` (`$queryRaw` con `websearch_to_tsquery` sobre `Product.searchVector`) o `stub.provider.ts`                                                                                                                                                                                                                                                                                                                                                                 |
| B3  | Carrito de la API (usuario o invitado)  | `GET /cart`, `POST /cart/items`, `PATCH`/`DELETE /cart/items/:productId`, `DELETE /cart`, `POST /cart/merge`                                | `api/modules/cart/cart.controller.ts`: un invitado se identifica con la cabecera `X-Cart-Session`; si no la envía, se genera un id y se devuelve en esa misma cabecera. `cart.service.ts` y `cart.repository.ts` lo guardan en **Redis**, no en Postgres                                                                                                                                                                                                                                                                                 |
| B4  | Crear pedido desde el carrito de la API | `POST /orders`, `POST /orders/:id/cancel`                                                                                                   | `api/modules/orders/orders.service.ts` → `create`: lee el carrito de Redis, valida el stock, aplica el descuento (`DiscountsService.validateForSubtotal`) y crea el pedido y la redención en un `$transaction`. **No descuenta stock todavía**                                                                                                                                                                                                                                                                                           |
| B5  | Pagar con Stripe y confirmar el pedido  | `POST /payments/intent`; webhook `POST /payments/webhook`                                                                                   | 1. `web/app/api/webhooks/stripe/route.ts` reenvía el **cuerpo crudo** y la firma. 2. `api/modules/payments/payments.service.ts` → `handleWebhook` verifica la firma con el proveedor y registra el evento (`webhook-events.repository.ts`) para que sea idempotente. 3. Si el pago tuvo éxito: `OrdersService.markPaid` → `OrdersRepository.confirmAndDecrementStock` (PENDING → CONFIRMED y **resta el stock**) → `EmailQueueService.enqueueOrderConfirmation`. 4. `queues/emails/email.processor.ts` → `MailService` (Resend o _stub_) |
| B6  | Validar un código de descuento          | `POST /discounts/validate`                                                                                                                  | `discounts.controller.ts` → `DiscountsService.validate`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| B7  | Suscripción con doble opt-in            | `POST /newsletter/subscribe`, `GET /newsletter/confirm`, `POST /newsletter/unsubscribe`, `POST /newsletter/webhooks/:provider`              | `newsletter.service.ts` (`subscribe`, `confirm`, `unsubscribe`, `handleWebhook`) → cola → `newsletter.processor.ts`                                                                                                                                                                                                                                                                                                                                                                                                                      |
| B8  | Chat del cliente                        | `GET /chat/me`, `GET`/`POST /chat/me/messages`, `POST /chat/me/read`; eventos de socket `conversation:join`, `message:send`, `message:read` | `chat.controller.ts` (`getMyConversation`…), `chat.gateway.ts` (`onJoin`, `onSend`, `onRead`)                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| B9  | Salud del sistema                       | `GET /health`, `/health/db`, `/health/redis`                                                                                                | `api/modules/health/`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| B10 | Subida directa (sin URL pre-firmada)    | `POST /uploads/product-images`                                                                                                              | `uploads.controller.ts` → `uploadDirect`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

---

## 3. Arquitectura

### 3.1 Vista general

| Pieza                                         | Responsabilidad                                                                    | Habla con                                                                                            |
| --------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Navegador                                     | Renderiza HTML, ejecuta los Client Components, guarda el carrito en `localStorage` | Servidor Next.js (páginas y Server Actions); API directamente solo en el chat y el `PUT` de imágenes |
| Servidor Next.js (`apps/web`, :3000)          | Server Components, Server Actions, middleware i18n y webhook de Stripe             | API por HTTP (`API_URL`), usando el token de la cookie `session`                                     |
| API NestJS (`apps/api`, :3001)                | Reglas de negocio, autenticación, validación, Swagger                              | PostgreSQL (Prisma), Redis (carrito y colas), proveedores externos                                   |
| PostgreSQL 16 (Docker, :5433)                 | Datos persistentes: 13 modelos en `schema.prisma`                                  | —                                                                                                    |
| Redis 7 (Docker, :6380)                       | Carritos de la API y colas de BullMQ                                               | —                                                                                                    |
| MinIO (Docker, :9000/:9001)                   | Almacenamiento compatible con S3 para imágenes                                     | Navegador (subida pre-firmada) y API                                                                 |
| Workers BullMQ (dentro del proceso de la API) | Emails, sincronización de la newsletter, limpieza de subidas                       | Redis y proveedores                                                                                  |

### 3.2 Capas del backend (`apps/api/src`)

- **Arranque:** `main.ts` configura `helmet`, CORS, el `ValidationPipe` global, `AllExceptionsFilter`, `LoggingInterceptor`, Swagger y `rawBody`.
- **Registro:** `app.module.ts` importa los 12 módulos de dominio, más configuración, logger, CLS, Prisma, colas, mail y el _throttler_ global.
- **Por dominio** (`modules/<dominio>/`):
  - `Controller`: rutas, guards y Swagger.
  - `Service`: reglas de negocio y excepciones HTTP.
  - `Repository`: consultas Prisma y mapeo a `entities/`.
  - DTOs en `dto/`, cada uno con `class-validator` y `@ApiProperty`; las respuestas se construyen con `XResponseDto.from()`.
- **Integraciones:** viven en `providers/`, con una interfaz, un token de inyección y una implementación real más una _stub_.
- **Trabajos en segundo plano:** `*.queue.service.ts` encola y `*.processor.ts` consume.
- **Transversal:** `common/` tiene los guards `RolesGuard` y `OptionalJwtAuthGuard`, el decorador `@Roles`, el filtro de errores y el interceptor de logging. `cls/` propaga el `requestId` y `logger/` configura Winston.

### 3.3 Capas del frontend (`apps/web/src`)

- **`app/[locale]/`:** páginas (Server Components por defecto) con "islas" cliente pequeñas: formularios, menús de fila, gestor de imágenes, inbox.
- **`lib/api.ts`:** lecturas de la tienda, con caché y etiquetas.
- **`lib/admin/api.ts`:** lecturas del admin, sin caché y con el _bearer_.
- **`app/actions/`:** todas las mutaciones, como Server Actions.
- **`stores/`:** estado del cliente (Zustand).
- **`providers/`:** TanStack Query.
- **`components/ui/`:** shadcn; **`components/admin/`:** piezas compartidas del panel.
- **`i18n/`** y **`middleware.ts`:** idioma.
- **`config/brand.ts`** y **`app/globals.css`:** los dos puntos de personalización de cada cliente (_fork_).

### 3.4 Contratos compartidos

`packages/types/src/*.types.ts` (`@repo/types`) define las interfaces y los esquemas Zod que usan las dos apps. Se compila a `dist/` (CommonJS) y Turborepo lo construye antes de las apps (`dependsOn: ["^build"]`).

### 3.5 Estructura de carpetas (resumen)

| Ruta                                            | Contenido                                                                                                                        |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/prisma/`                              | `schema.prisma`, `migrations/`, `seed.ts` (admin `admin@example.com`, 3 categorías, 3 productos, 1 descuento)                    |
| `apps/api/src/modules/`                         | `auth`, `cart`, `categories`, `chat`, `discounts`, `health`, `newsletter`, `orders`, `payments`, `products`, `search`, `uploads` |
| `apps/api/test/factories/`                      | Fábricas `createMock<Entidad>()` para los tests                                                                                  |
| `apps/web/e2e/`                                 | Playwright: `pages/` (page objects) y `tests/`                                                                                   |
| `packages/eslint-config/`, `packages/tsconfig/` | Configuración compartida de ESLint y TypeScript                                                                                  |
| `.claude/`                                      | Reglas, skills y comandos para trabajar con agentes (ver `CLAUDE.md`)                                                            |
| `docs/onboarding/`                              | Estos documentos                                                                                                                 |

---

## 4. Orden de lectura recomendado

1. **`CLAUDE.md`** (raíz): reglas del proyecto y mapa general.
2. **`apps/api/prisma/schema.prisma`**: el modelo de datos explica qué es cada cosa.
3. **`packages/types/src/product.types.ts`** e `index.ts`: los contratos compartidos.
4. **Backend, módulo de referencia, en este orden:**
   1. `apps/api/src/main.ts`
   2. `app.module.ts`
   3. `modules/products/products.module.ts`
   4. `products.controller.ts`
   5. `products.service.ts`
   6. `products.repository.ts`
   7. `dto/` y `entities/`
   8. `products.service.spec.ts`
5. **Seguridad del backend:** `modules/auth/` (controlador, servicio, `strategies/jwt.strategy.ts`, `guards/`) y `common/guards/roles.guard.ts`.
6. **Patrón de proveedor:** `modules/payments/payments.module.ts` y `providers/`. Después, `orders.service.ts` (`create`, `markPaid`) para ver cómo se combinan carrito, descuento, transacción y cola.
7. **Frontend, base:**
   1. `apps/web/src/middleware.ts`
   2. `i18n/`
   3. `app/[locale]/layout.tsx`
   4. `config/brand.ts`
8. **Tienda:** `lib/api.ts` → `app/[locale]/products/page.tsx` → `products/[slug]/page.tsx` → `components/add-to-cart-button.tsx` → `stores/cart.store.ts`.
9. **Login y sesión:** `lib/auth.ts` → `app/actions/auth.ts` → `login/login-form.tsx` → `admin/layout.tsx`.
10. **Un CRUD completo del admin:** `lib/admin/api.ts` → `admin/products/page.tsx` → `components/admin/data-table.tsx` → `product-form.tsx` → `app/actions/admin/products.ts`.
11. **Lo avanzado:** `admin/products/[slug]/image-manager.tsx` (subida pre-firmada) y `admin/chat/chat-inbox.tsx` junto con `api/modules/chat/chat.gateway.ts` (tiempo real).
12. **Tests E2E:** `apps/web/e2e/pages/admin/products.page.ts` y `e2e/tests/admin/admin-product-create.spec.ts`.

---

## 5. Equivalencias de conceptos

| Concepto en este proyecto                       | Equivalente en Angular                                          | Equivalente en .NET                          |
| ----------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------- |
| Monorepo pnpm + Turborepo                       | Workspace de Angular CLI / Nx                                   | Solución `.sln` con varios proyectos         |
| `@repo/types`                                   | Librería compartida del workspace                               | _Class library_ de contratos/DTOs            |
| Carpeta `app/[locale]/x/page.tsx`               | Ruta en `Routes` + componente                                   | Razor Page / acción de controlador MVC       |
| `layout.tsx`                                    | Componente contenedor con `<router-outlet>`                     | `_Layout.cshtml`                             |
| Server Component                                | — (Angular no tiene equivalente directo; lo más cercano es SSR) | Vista Razor renderizada en servidor          |
| Client Component (`'use client'`)               | Componente Angular normal                                       | Componente Blazor WebAssembly                |
| Server Action (`'use server'`)                  | Llamada a servicio + `HttpClient.post`                          | Acción `[HttpPost]` invocada como método     |
| `lib/api.ts` / `lib/admin/api.ts`               | Servicio con `HttpClient`                                       | Cliente tipado con `HttpClient` / Refit      |
| `fetch` con `revalidate` y `tags` + `updateTag` | Caché manual con `shareReplay`                                  | `IMemoryCache` / _output caching_ con _tags_ |
| `useActionState` + `useFormStatus`              | Reactive Forms + estado de envío                                | Formulario MVC con `ModelState`              |
| Zustand store con `persist`                     | Servicio `providedIn: 'root'` + `localStorage`                  | Estado de sesión en el cliente               |
| TanStack Query                                  | `HttpClient` + RxJS + caché manual                              | —                                            |
| middleware de next-intl                         | `HttpInterceptor` + guard de idioma                             | _Localization middleware_                    |
| `next-intl` (`useTranslations`)                 | ngx-translate / `$localize`                                     | `IStringLocalizer` + `.resx`                 |
| shadcn/ui + Tailwind                            | Angular Material + SCSS                                         | Bootstrap / componentes Razor                |
| `@Module` de NestJS                             | `@NgModule`                                                     | Registro en `Program.cs`                     |
| `@Injectable()` (provider)                      | `@Injectable()` (servicio)                                      | Servicio en el contenedor de DI              |
| `@Controller` + `@Get()`                        | —                                                               | `[ApiController]` + `[HttpGet]`              |
| `JwtAuthGuard` + `RolesGuard` + `@Roles(ADMIN)` | `CanActivate` route guard                                       | `[Authorize(Roles = "Admin")]`               |
| `ValidationPipe` + `class-validator`            | Validadores de Reactive Forms                                   | DataAnnotations + validación automática      |
| `AllExceptionsFilter`                           | `ErrorHandler` global                                           | `UseExceptionHandler` / _exception filter_   |
| `LoggingInterceptor`                            | `HttpInterceptor`                                               | _Middleware_ / _action filter_ de logging    |
| Repository + Prisma                             | —                                                               | Repository + EF Core `DbContext`             |
| `schema.prisma` + migraciones                   | —                                                               | Entidades EF + `dotnet ef migrations`        |
| `$transaction`                                  | —                                                               | `TransactionScope` / `BeginTransaction`      |
| BullMQ (queue service + processor)              | —                                                               | Hangfire / `BackgroundService` + cola        |
| Socket.io gateway + rooms                       | Cliente con RxJS `WebSocketSubject`                             | SignalR `Hub` + _groups_                     |
| Puerto + adaptador _stub_ (`PAYMENT_PROVIDER`)  | `InjectionToken` + `useFactory`                                 | `IPaymentProvider` + _factory_ en DI         |
| Jest + mocks tipados + factories                | Jasmine/Karma + `jasmine.createSpyObj`                          | xUnit + Moq + _builders_                     |
| Playwright + page objects                       | Protractor / Cypress                                            | Playwright for .NET / Selenium               |

---

## 6. Puntos abiertos

Los marcados como **confirmado** los vi en el código o los reproduje; los demás, **(sin confirmar)**, conviene verificarlos.

### Funcionalidad incompleta

1. **La tienda no puede comprar (confirmado).**
   - El carrito de la web vive en `localStorage` (`stores/cart.store.ts`), mientras que el backend crea pedidos a partir del carrito de **Redis** (B3 y B4). Nada conecta los dos.
   - `web/app/actions/cart.ts` (`addToCartAction`) no se usa, y su comentario dice que `/cart/items` "no está implementado", cuando sí existe.
   - Checkout, cuenta y pedidos son pantallas de relleno (T6).
2. **Funciones del backend sin interfaz (confirmado):** registro, búsqueda, suscripción a la newsletter, chat del cliente y pago con Stripe (sección 2.4).

### Riesgos de comportamiento

3. **La sesión del admin dura menos de lo que parece (sin confirmar).** La cookie dura 7 días, pero guarda el _access token_, que según `.env.example` caduca a los 15 minutos, y la web nunca usa el _refresh token_. Lo esperable es que el admin vuelva al login a los 15 minutos (A4). No lo probé esperando la expiración.
4. **El rol `STAFF` puede quedar en un bucle (sin confirmar).** `admin/layout.tsx` deja entrar a `STAFF`, pero productos, categorías, descuentos y el cambio de estado de pedidos son solo `ADMIN` en la API. Un 403 se convierte en `AdminAuthError` y redirige al login; ese login devuelve al admin y vuelve a fallar. No hay usuario `STAFF` en el seed para probarlo.
5. **Stock (confirmado).**
   - Confirmar un pedido a mano desde el admin (O3) no descuenta stock: solo lo hace el webhook de pago (B5).
   - Tampoco vi que cancelar un pedido ya confirmado devuelva el stock (sin confirmar).
6. **Redirección tras el login (sin confirmar).** `loginAction` hace `redirect(next)` con el parámetro `?next=` sin validarlo. Podría permitir una redirección abierta a un dominio externo.

### Inconsistencias con las reglas del propio proyecto

7. **Servicios que inyectan `PrismaService` (confirmado).** `orders.service.ts`, `newsletter.service.ts`, `uploads.service.ts`, `chat.service.ts` y `health.service.ts` lo hacen, normalmente para usar `$transaction`. `CLAUDE.md` (restricción 2) y `.claude/rules/data/prisma.md` dicen que solo los repositorios lo hacen. Hay que decidir si se documenta la excepción o se refactoriza.
8. **Server Actions sin Zod (confirmado).** `actions/admin/chat.ts`, `newsletter.ts`, `orders.ts` y `uploads.ts` no tienen esquemas Zod; reciben ids y valores simples. La restricción 3 de `CLAUDE.md` pide validar siempre con Zod.
9. **La tienda no sigue las reglas de i18n (confirmado).** Portada, catálogo, detalle y carrito usan `Link` de `next/link` en lugar de `@/i18n/navigation`, y tienen textos fijos en inglés que no están en `en.json`/`es.json`.
10. **Convención obsoleta de Next.js 16 (confirmado).** `middleware.ts` debería llamarse `proxy.ts`; el servidor lo avisa al arrancar.
11. **Dependencias sin uso (confirmado).** `@hookform/resolvers`, `react-day-picker`, `date-fns` y `next-themes` no se importan. `react-hook-form` solo lo usa `components/ui/form.tsx`, que nadie usa.
12. **Ruta desactualizada en el PRD (confirmado).** `.agents/PRD.md` (§5.3) cita `src/styles/globals.css`; el archivo real es `apps/web/src/app/globals.css`.

### Operativos

13. **Caché de Turbopack en Windows (confirmado).** Una caché vieja en `apps/web/.next` hizo que Turbopack lanzara miles de procesos `postcss.js` y agotara la memoria. Si vuelve a pasar: detener el servidor, borrar `apps/web/.next` y comprobar en el Administrador de tareas que no queden procesos `node.exe` huérfanos.
14. **`prisma migrate dev` está bloqueado (confirmado, intencional).** La columna generada `Product.searchVector` hace que genere migraciones rotas. Un _hook_ de `.claude/` lo bloquea; para cambios de esquema hay que usar la skill `schema-migration`.
15. **Los E2E escriben en tu base local (confirmado).** Por ejemplo, `admin-product-create.spec.ts` crea productos "E2E Headphones …" en la base de desarrollo.

---

## 7. Verificación de esta guía

- Cada comportamiento de la sección 2 se trazó leyendo los archivos citados: páginas, componentes, Server Actions, funciones de `lib/`, y controlador, servicio y repositorio de la API.
- Los flujos T2–T5, A1–A2, D1, P1–P4, C1, O1, Dc1, N1, Ch1 y S1 los ejecuté el 2026-11-07/08 en la app local, en el navegador y con los tests E2E.
- P5, P6, O3, Ch2 y los de la sección 2.4 están trazados en el código pero **no** los ejecuté de punta a punta.
