# Ruta de aprendizaje del stack

Documento para entender las tecnologías de este repositorio, ordenadas de lo básico a lo avanzado. Está pensado para alguien con experiencia en **Angular y .NET** y algo de React. El objetivo es poder leer con soltura el código actual y el que se escriba después, no dominar cada herramienta.

> Inventario hecho a partir de los archivos reales del repo (`package.json` raíz, `apps/api/package.json`, `apps/web/package.json`, `turbo.json`, `apps/api/prisma/schema.prisma`, `docker-compose.yml`, `.github/workflows/ci.yml`). Revisado el 2026-11-08.

---

## 0. Cómo usar esta ruta

- **Lee en orden:** los bloques 1–3 son la base, y del 4 en adelante dependen de ellos.
- **Alterna teoría y código:** cada bloque indica qué archivo del repo abrir para verlo aplicado.
- **Cuándo parar en cada bloque:** cuando puedas explicar con tus palabras los "conceptos clave" de ese bloque.
- **Usa la documentación de tu versión:** Next.js 16, Prisma 7 y Tailwind 4 son versiones recientes y cambian cosas respecto a tutoriales viejos. Para Next.js, el propio repo trae la documentación exacta de la versión instalada en `apps/web/node_modules/next/dist/docs/`.

---

## 1. Inventario del stack

| Capa                     | Tecnología (versión en el repo)                                             | Dónde se ve                                                                      |
| ------------------------ | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Lenguaje                 | TypeScript 5.9 en modo `strict`                                             | todo el repo; presets en `packages/tsconfig/`                                    |
| Monorepo                 | pnpm workspaces + Turborepo 2.9                                             | `pnpm-workspace.yaml`, `turbo.json`                                              |
| Tipos compartidos        | paquete interno `@repo/types` (interfaces + Zod)                            | `packages/types/src/`                                                            |
| Frontend (framework)     | Next.js 16.2 (App Router, Turbopack) + React 19.2                           | `apps/web/src/app/`                                                              |
| Rutas y i18n             | Enrutado por carpetas de Next.js + `next-intl` 4 (`es`, `en`)               | `apps/web/src/app/[locale]/`, `apps/web/src/i18n/`, `apps/web/src/middleware.ts` |
| Estilos y UI             | Tailwind CSS 4 + shadcn/ui (sobre Base UI) + `lucide-react` + `sonner`      | `apps/web/src/app/globals.css`, `apps/web/src/components/ui/`                    |
| Estado en el cliente     | Zustand 5 (carrito) y TanStack Query 5 (chat del admin)                     | `apps/web/src/stores/`, `apps/web/src/providers/`                                |
| Mutaciones desde la UI   | Server Actions de Next.js + Zod                                             | `apps/web/src/app/actions/`                                                      |
| Backend                  | NestJS 11 sobre Express                                                     | `apps/api/src/`                                                                  |
| Validación en el backend | `class-validator` + `class-transformer` + `ValidationPipe`                  | `apps/api/src/modules/*/dto/`                                                    |
| Documentación de la API  | Swagger (`@nestjs/swagger`) en `/docs`                                      | `apps/api/src/main.ts`                                                           |
| Autenticación            | JWT (`@nestjs/jwt`) + Passport (`passport-jwt`) + `bcrypt`                  | `apps/api/src/modules/auth/`                                                     |
| Base de datos            | PostgreSQL 16 + Prisma 7 (con `@prisma/adapter-pg`)                         | `apps/api/prisma/`, `apps/api/src/prisma/`                                       |
| Búsqueda                 | Full-text search nativo de Postgres (`tsvector`)                            | `apps/api/src/modules/search/`                                                   |
| Caché y colas            | Redis 7 + BullMQ 5                                                          | `apps/api/src/queues/`, `apps/api/src/modules/*/*.processor.ts`                  |
| Tiempo real              | Socket.io 4 (servidor en NestJS, cliente en Next.js)                        | `apps/api/src/modules/chat/chat.gateway.ts`                                      |
| Logging                  | Winston (`nest-winston`) + `nestjs-cls` (requestId)                         | `apps/api/src/logger/`, `apps/api/src/cls/`                                      |
| Integraciones externas   | Stripe, Resend, Mailchimp/Klaviyo, S3/MinIO (cada una con adaptador _stub_) | `apps/api/src/modules/*/providers/`, `apps/api/src/mail/`                        |
| Tests                    | Jest 30 (unitarios de la API), Playwright (E2E de la web)                   | `apps/api/src/**/*.spec.ts`, `apps/web/e2e/`                                     |
| Calidad                  | ESLint 9 (flat config), Prettier, Husky + lint-staged                       | `packages/eslint-config/`, `.husky/`                                             |
| Infraestructura          | Docker Compose (dev y prod), GitHub Actions                                 | `docker-compose*.yml`, `.github/workflows/ci.yml`                                |

**Hay dependencias declaradas que casi no se usan.** En `apps/web/package.json` aparecen `@hookform/resolvers`, `react-day-picker`, `date-fns` y `next-themes`, pero ningún archivo de `apps/web/src` las importa. `react-hook-form` solo lo importa el componente generado `components/ui/form.tsx`, y ninguna pantalla usa ese componente: los formularios reales usan `useActionState`. No dediques tiempo a estas librerías.

---

## 2. Orden recomendado

| #   | Bloque                                                         | Por qué en este orden                                 |
| --- | -------------------------------------------------------------- | ----------------------------------------------------- |
| 1   | TypeScript moderno                                             | Lo usa todo el repo                                   |
| 2   | Monorepo: pnpm + Turborepo                                     | Explica cómo se arranca, compila y relaciona todo     |
| 3   | React 19 (fundamentos)                                         | Base de todo el frontend                              |
| 4   | Next.js 16 App Router                                          | El framework web; es el bloque más distinto a Angular |
| 5   | next-intl                                                      | Todas las rutas cuelgan de `[locale]`                 |
| 6   | Tailwind 4 + shadcn/ui                                         | Para leer el JSX sin perderse en las clases           |
| 7   | Estado en el cliente: Zustand y TanStack Query                 | Carrito y chat                                        |
| 8   | Validación: Zod y class-validator                              | Fronteras de entrada en la web y en la API            |
| 9   | NestJS 11                                                      | El backend; muy parecido a Angular                    |
| 10  | Autenticación con JWT                                          | Login, sesión y roles                                 |
| 11  | Prisma 7 + PostgreSQL                                          | Acceso a datos                                        |
| 12  | Redis + BullMQ                                                 | Trabajos en segundo plano                             |
| 13  | Socket.io                                                      | Chat en tiempo real                                   |
| 14  | Puertos y adaptadores para integraciones (Stripe, Resend, S3…) | Patrón transversal del backend                        |
| 15  | Testing: Jest y Playwright                                     | Para leer y escribir pruebas                          |
| 16  | Herramientas: ESLint, Husky, Docker, CI                        | Para entender por qué falla un commit o un pipeline   |

---

## 3. Bloques

### 1. TypeScript moderno

- **Por qué aquí:** es el único lenguaje del repo y está en modo estricto. ESLint, con `--max-warnings=0`, además exige tipos de retorno explícitos e `import type`, y prohíbe `any`.
- **Conceptos clave:**
  - Tipos estructurales: lo que importa es la forma del objeto, no su nombre.
  - Uniones discriminadas, `Pick` y `Partial`, genéricos.
  - `as const` y la diferencia entre `import type` e `import`.
  - Inferencia de tipos a partir de esquemas Zod.
  - Decoradores (los usa NestJS).
- **Equivalente:** ya lo usas en Angular. Respecto a C#, el tipado es **estructural, no nominal**: dos interfaces con la misma forma son intercambiables.
- **Dónde verlo:** `packages/types/src/product.types.ts` y `apps/api/src/modules/products/dto/create-product.dto.ts`, que implementa un `Pick<>` del tipo compartido.
- **Recursos:**
  - [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html) (oficial)
  - [TypeScript for JavaScript Programmers](https://www.typescriptlang.org/docs/handbook/typescript-in-5-minutes.html) (oficial, lectura corta)

### 2. Monorepo: pnpm workspaces + Turborepo

- **Por qué aquí:** el repo tiene dos apps (`apps/api`, `apps/web`) y paquetes compartidos (`packages/types`, `packages/eslint-config`, `packages/tsconfig`). Turborepo decide qué compilar y en qué orden. Por eso las tareas se lanzan con `pnpm dev`, `pnpm lint`, etc. desde la raíz.
- **Conceptos clave:**
  - `pnpm-workspace.yaml` y el protocolo `workspace:*`.
  - Tareas de `turbo.json`: `dependsOn: ["^build"]` significa "primero compila mis dependencias".
  - Caché de tareas.
  - `@repo/types` se compila a `dist/` y las apps lo consumen ya compilado. Si no está compilado, aparece `ERR_MODULE_NOT_FOUND`.
- **Equivalente:** una solución `.sln` con varios `.csproj`. `@repo/types` sería una _class library_ compartida, y Turborepo hace de MSBuild resolviendo el orden de compilación.
- **Dónde verlo:** `turbo.json`, `package.json` raíz, `packages/types/package.json`.
- **Recursos:**
  - [pnpm — Workspaces](https://pnpm.io/workspaces) (oficial)
  - [Turborepo — Structuring a repository](https://turborepo.dev/docs/crafting-your-repository/structuring-a-repository) (oficial)

### 3. React 19 (fundamentos)

- **Por qué aquí:** Next.js es React con un servidor alrededor. Sin estos conceptos el resto no se entiende.
- **Conceptos clave:**
  - Componentes como funciones que devuelven JSX; _props_ de entrada.
  - Estado local con `useState` y efectos con `useEffect`.
  - Listas con `key` y renderizado condicional.
  - Composición pasando `children`.
  - Hooks personalizados.
  - Hooks de formularios de React 19: `useActionState`, `useFormStatus` y `useTransition`.
- **Equivalentes con Angular:**

| React                          | Angular                                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------------------ |
| Componente función + JSX       | `@Component` + template                                                                    |
| _props_                        | `@Input()`                                                                                 |
| callbacks pasados como _props_ | `@Output()` + `EventEmitter`                                                               |
| `useState`                     | propiedad del componente / `signal()`                                                      |
| `useEffect`                    | `ngOnInit` / `ngOnChanges` / `ngOnDestroy` (más o menos combinados)                        |
| hook personalizado             | servicio _sin_ singleton: lógica reutilizable, pero con estado por instancia de componente |
| Context / store (Zustand)      | servicio `providedIn: 'root'`                                                              |
| `children`                     | `<ng-content>`                                                                             |

- **Dónde verlo:** `apps/web/src/components/add-to-cart-button.tsx` (lo más simple), `apps/web/src/app/[locale]/login/login-form.tsx` (`useActionState`).
- **Recursos:**
  - [React — Quick Start](https://react.dev/learn) (oficial) Updating the screen
  - [Thinking in React](https://react.dev/learn/thinking-in-react) (oficial)
  - [Understanding between Angular & React — Lifecycle](https://itnext.io/understanding-between-angular-react-part2-lifecycle-hooks-2a08e91f92b8) y [Services & Context API](https://itnext.io/understanding-between-angular-react-part-3-services-context-api-aa8d2dcfb3a3) (artículos comparativos)

### 4. Next.js 16 App Router (el bloque más importante)

- **Por qué aquí:** la tienda y el panel de administración son una sola app Next.js. Casi todo lo "raro" del frontend viene de aquí.
- **Conceptos clave:**
  - **Enrutado por carpetas:** `app/[locale]/products/[slug]/page.tsx` equivale a la ruta `/es/products/mi-producto`. Los corchetes marcan segmentos dinámicos. Los paréntesis, como `(info)`, agrupan carpetas sin crear segmento en la URL.
  - **Archivos especiales:**
    - `page.tsx`: la pantalla de esa ruta.
    - `layout.tsx`: un envoltorio que persiste entre las rutas hijas.
    - `loading.tsx`, `error.tsx` y `not-found.tsx`: los estados de carga, error y "no encontrado".
  - **Server Components (por defecto) frente a Client Components (`'use client'`).**
    - Los primeros se ejecutan solo en el servidor: pueden ser `async`, leer cookies y llamar a la API, y su código nunca llega al navegador.
    - Los segundos se hidratan en el navegador y son los únicos que pueden usar hooks y eventos.
    - Lo que pasa del servidor al cliente como _prop_ debe ser serializable: **no se pueden pasar funciones**. Esto causó un bug real en el admin, ya corregido.
  - **Server Actions:** funciones `async` marcadas con `'use server'` que el navegador invoca como si fueran locales. Next.js las convierte en una llamada HTTP. Aquí son la única vía de mutación desde la UI.
  - **Caché de datos:**
    - `fetch` con `next: { revalidate, tags }` guarda en caché la respuesta.
    - `revalidatePath`, `revalidateTag` y `updateTag` la invalidan después de una mutación.
    - `cache: 'no-store'` desactiva la caché.
  - **Middleware** (`src/middleware.ts`): se ejecuta antes de cada petición; aquí lo usa next-intl. En Next.js 16 la convención pasa a llamarse `proxy.ts`, y el servidor muestra un aviso de obsolescencia.
  - **Route Handlers** (`app/api/.../route.ts`): endpoints HTTP propios de Next.js. Aquí solo existe el del webhook de Stripe.
- **Equivalentes:**

| Next.js                        | Angular / .NET                                             |
| ------------------------------ | ---------------------------------------------------------- |
| Carpeta con `page.tsx`         | entrada en `Routes` + componente                           |
| `layout.tsx`                   | componente con `<router-outlet>` / `_Layout.cshtml`        |
| Server Component               | Razor Page / vista MVC renderizada en servidor             |
| Client Component               | componente Angular normal (se ejecuta en el navegador)     |
| Server Action                  | `[HttpPost]` de un controlador, pero invocado como función |
| `revalidatePath` / `updateTag` | invalidar una entrada de `IMemoryCache` / _output cache_   |
| middleware                     | _middleware_ de ASP.NET Core / `HttpInterceptor` + _guard_ |

- **Dónde verlo, en este orden:**
  1. `apps/web/src/app/[locale]/layout.tsx`
  2. `apps/web/src/app/[locale]/products/page.tsx`
  3. `apps/web/src/lib/api.ts`
  4. `apps/web/src/app/actions/admin/products.ts`
  5. `apps/web/src/app/[locale]/admin/products/product-form.tsx`
- **Recursos:**
  - [Next.js Learn — curso del dashboard con App Router](https://nextjs.org/learn/dashboard-app) (oficial y gratuito; es el mejor punto de partida)
  - [Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components) y [Server and Client boundary](https://nextjs.org/docs/app/guides/server-and-client-boundary) (oficial)
  - [Mutating data](https://nextjs.org/docs/app/getting-started/mutating-data) y [Server Actions](https://nextjs.org/docs/app/guides/server-actions) (oficial)
  - Docs exactas de la versión instalada: `apps/web/node_modules/next/dist/docs/` (en disco)

### 5. next-intl (internacionalización)

- **Por qué aquí:** todas las páginas viven bajo `[locale]`. El middleware redirige `/` a `/es` (idioma por defecto en `src/config/brand.ts`). Los textos se leen de `src/i18n/messages/es.json` y `en.json`.
- **Conceptos clave:**
  - `defineRouting`.
  - `getTranslations` (servidor) frente a `useTranslations` (cliente).
  - `setRequestLocale`.
  - `Link` y `useRouter` del módulo `src/i18n/navigation.ts`, que conservan el idioma de la URL.
- **Equivalente:** `@angular/localize` / ngx-translate; en .NET, `IStringLocalizer` con archivos `.resx`.
- **Dónde verlo:** `apps/web/src/i18n/routing.ts`, `request.ts`, `navigation.ts`; `apps/web/src/middleware.ts`.
- **Recursos:** [next-intl — App Router con i18n routing](https://next-intl.dev/docs/getting-started/app-router/with-i18n-routing) (oficial).

### 6. Tailwind CSS 4 + shadcn/ui

- **Por qué aquí:** todo el estilo son clases utilitarias en el JSX (`flex gap-4 text-muted-foreground`). Los componentes base (`Button`, `Card`, `Table`, `Dialog`…) son de shadcn/ui.
- **Conceptos clave:**
  - Clases utilitarias.
  - Tokens de tema como variables CSS en `globals.css`, que es el punto de personalización de cada cliente.
  - La función `cn()`, que combina clases (`src/lib/utils.ts`).
  - shadcn **no es una librería instalada**: es código copiado en tu repo (`src/components/ui/`) con el CLI `npx shadcn@latest add`.
- **Equivalente:** Angular Material + SCSS. La diferencia es que aquí casi no hay archivos CSS por componente: los estilos van inline en clases.
- **Dónde verlo:** `apps/web/src/app/globals.css`, `apps/web/src/components/ui/button.tsx`.
- **Recursos:**
  - [Tailwind CSS v4.0 (anuncio y cambios)](https://tailwindcss.com/blog/tailwindcss-v4) y la [guía de actualización](https://tailwindcss.com/docs/upgrade-guide) (oficial)
  - [shadcn/ui — instalación en Next.js](https://ui.shadcn.com/docs/installation/next) (oficial)

### 7. Estado en el cliente: Zustand y TanStack Query

- **Por qué aquí:**
  - **Zustand** guarda el carrito en `localStorage`.
  - **TanStack Query** gestiona las conversaciones del chat del admin: caché en el cliente y refresco cuando llegan eventos de Socket.io.
- **Conceptos clave:**
  - **Zustand:**
    - `create()` crea el store.
    - Los selectores (`useCartStore(s => s.items)`) leen solo una parte del estado.
    - El middleware `persist` guarda el estado en `localStorage`.
  - **TanStack Query:**
    - `useQuery` lee datos y los guarda en caché bajo una `queryKey`.
    - `useMutation` ejecuta cambios.
    - `invalidateQueries` marca la caché como obsoleta para que se vuelva a pedir.
- **Equivalente:**
  - Zustand se parece a un servicio singleton con `BehaviorSubject` o _signals_, o a un store NgRx muy simplificado.
  - TanStack Query cubre lo que en Angular resolverías con `HttpClient` + `shareReplay` + lógica manual de refresco.
- **Dónde verlo:** `apps/web/src/stores/cart.store.ts`, `apps/web/src/app/[locale]/admin/chat/chat-inbox.tsx`.
- **Recursos:**
  - [Zustand — Persisting store data](https://zustand.docs.pmnd.rs/integrations/persisting-store-data) (oficial)
  - [TanStack Query — Overview (React)](https://tanstack.com/query/latest/docs/framework/react/guides/overview) (oficial)

### 8. Validación: Zod (web) y class-validator (API)

- **Por qué aquí:** el repo valida cada entrada en su frontera.
  - Las Server Actions validan `FormData` con Zod (`safeParse`).
  - La API valida los DTO con decoradores de `class-validator`, gracias a un `ValidationPipe` global con `whitelist` y `forbidNonWhitelisted`.
  - `@repo/types` comparte esquemas Zod entre ambos lados.
- **Equivalente:**
  - `class-validator` equivale a DataAnnotations (`[Required]`, `[Range]`) junto con la validación automática de `[ApiController]`.
  - Zod se parece a FluentValidation, y además infiere el tipo TypeScript del esquema.
- **Dónde verlo:** `apps/web/src/app/actions/admin/products.ts` (`ProductInputSchema`), `apps/api/src/modules/products/dto/create-product.dto.ts`.
- **Recursos:** [Zod — Basics](https://zod.dev/basics) (oficial). Para `class-validator` basta con los ejemplos de los DTO del repo y la página de _pipes_ de NestJS (bloque 9).

### 9. NestJS 11

- **Por qué aquí:** es todo el backend. Para ti es el bloque más fácil, porque NestJS copia deliberadamente la arquitectura de Angular.
- **Conceptos clave:**
  - Módulos (`@Module`) con `imports`, `controllers`, `providers` y `exports`.
  - Inyección de dependencias por constructor.
  - Controladores con decoradores HTTP.
  - **Guards** (autorización), **Pipes** (validación y transformación), **Interceptors** (logging) y **Exception Filters** (formato de error).
  - Configuración tipada con Zod (`src/config/configuration.ts`).
  - Swagger generado a partir de decoradores.
  - La convención del repo de tres capas: Controller → Service → Repository.
- **Equivalentes:**

| NestJS                   | Angular                 | ASP.NET Core                                    |
| ------------------------ | ----------------------- | ----------------------------------------------- |
| `@Module`                | `@NgModule`             | registro en `Program.cs` / extensión `AddXxx()` |
| `@Injectable()` provider | `@Injectable()` service | servicio registrado en DI (`AddScoped`)         |
| `@Controller` + `@Get()` | —                       | `[ApiController]` + `[HttpGet]`                 |
| Guard (`CanActivate`)    | Route guard             | `[Authorize]` / _authorization handler_         |
| Pipe (`ValidationPipe`)  | —                       | _model binding_ + validación                    |
| Interceptor              | `HttpInterceptor`       | _middleware_ / _action filter_                  |
| Exception filter         | `ErrorHandler`          | _exception filter_ / `UseExceptionHandler`      |
| Repository (Prisma)      | —                       | Repository sobre `DbContext`                    |

- **Dónde verlo, en este orden:**
  1. `apps/api/src/main.ts`
  2. `apps/api/src/app.module.ts`
  3. `apps/api/src/modules/products/`: módulo, controlador, servicio y repositorio. Es el módulo de referencia.
  4. `apps/api/src/common/`
- **Recursos:**
  - Documentación oficial: [Modules](https://docs.nestjs.com/modules), [Providers](https://docs.nestjs.com/providers) y [Guards](https://docs.nestjs.com/guards). La búsqueda solo devolvió la versión v9 de _Guards_; el concepto es el mismo.
  - [NestJS Fundamentals](https://learn.nestjs.com/p/fundamentals): curso oficial **de pago**, opcional.

### 10. Autenticación con JWT

- **Por qué aquí:** el login del admin, el guard de cada endpoint y los roles (`ADMIN`, `STAFF`, `CUSTOMER`).
- **Conceptos clave:**
  - `bcrypt` para las contraseñas.
  - Access token (por defecto 15 min) y refresh token (7 días).
  - La estrategia `JwtStrategy` de Passport.
  - Los guards `JwtAuthGuard`, `OptionalJwtAuthGuard` y `RolesGuard` junto con `@Roles()`.
  - En la web, el token se guarda en una cookie **httpOnly** llamada `session`, que solo leen los Server Components y las Server Actions.
- **Equivalente:** `AddAuthentication().AddJwtBearer()` + `[Authorize(Roles = "Admin")]` en ASP.NET Core.
- **Dónde verlo:** `apps/api/src/modules/auth/`, `apps/api/src/common/guards/`, `apps/web/src/lib/auth.ts`, `apps/web/src/app/actions/auth.ts`.
- **Recursos:** [NestJS — Authentication](https://docs.nestjs.com/security/authentication) y [Passport recipe](https://docs.nestjs.com/recipes/passport) (oficial).

### 11. Prisma 7 + PostgreSQL

- **Por qué aquí:** es el acceso a datos. El esquema de las 13 tablas vive en un solo archivo, `schema.prisma`.
- **Conceptos clave:**
  - `schema.prisma`: modelos, `enum` y relaciones.
  - Migraciones SQL versionadas (`prisma/migrations/`).
  - El cliente generado y tipado: `prisma.product.findMany(...)`.
  - `$transaction` para operaciones atómicas.
  - `$queryRaw` para SQL a mano, que aquí se usa en la búsqueda full-text.
  - Desde Prisma 7 hace falta un _driver adapter_ (`@prisma/adapter-pg`) y existe `prisma.config.ts`.
- **Regla del repo:** nunca se ejecuta `prisma migrate dev`, porque la columna generada `searchVector` hace que produzca una migración rota. Para cambios de esquema está la skill `schema-migration`.
- **Equivalente:** Entity Framework Core. `schema.prisma` hace el papel del `DbContext` y las clases de entidad, y las migraciones el de `dotnet ef migrations`. Una diferencia: **en Prisma el esquema es la fuente de la verdad** y los tipos se generan a partir de él (_schema-first_), no al revés como en _code-first_.
- **Dónde verlo:** `apps/api/prisma/schema.prisma`, `apps/api/src/prisma/prisma.service.ts`, `apps/api/src/modules/products/products.repository.ts`.
- **Recursos:**
  - [Prisma ORM v7](https://www.prisma.io/docs/orm/v7) y la [introducción a Prisma Client](https://www.prisma.io/docs/orm/v7/prisma-client/setup-and-configuration/introduction) (oficial)
  - **Ojo con la versión:** la búsqueda indicó que ya existe Prisma 8. Lee la documentación de **v7**, que es la que usa el repo.

### 12. Redis + BullMQ (trabajos en segundo plano)

- **Por qué aquí:**
  - Los emails (confirmación de pedido), la sincronización con el proveedor de newsletter y la limpieza horaria de subidas abandonadas se ejecutan en colas.
  - Redis también guarda el carrito del lado de la API.
- **Conceptos clave:**
  - Cola, _job_, _worker_ (el _processor_), reintentos con _backoff_ y trabajos repetidos (cron).
  - La convención del repo: un `*.queue.service.ts` que encola y un `*.processor.ts` que consume.
- **Equivalente:** Hangfire o un `BackgroundService` de .NET que lee de una cola (Azure Service Bus o RabbitMQ).
- **Dónde verlo:** `apps/api/src/queues/emails/`, `apps/api/src/modules/newsletter/newsletter.processor.ts`, `apps/api/src/modules/uploads/uploads.processor.ts`.
- **Recursos:**
  - [BullMQ — Introduction](https://docs.bullmq.io/guide/introduction) y [BullMQ con NestJS](https://docs.bullmq.io/guide/nestjs) (oficial)
  - [NestJS — Queues](https://docs.nestjs.com/techniques/queues) (oficial)

### 13. Socket.io (tiempo real)

- **Por qué aquí:** el inbox del chat del admin recibe mensajes nuevos sin recargar la página.
- **Conceptos clave:**
  - _Namespace_ (`/chat`) y _rooms_ (`admin`, `customer:<id>`).
  - Eventos `emit` / `on`.
  - Autenticación en el _handshake_ con el JWT.
  - En NestJS, `@WebSocketGateway` y `@SubscribeMessage`.
- **Equivalente:** SignalR. Un _gateway_ equivale a un `Hub`, los _rooms_ a los _groups_ y `emit` a `Clients.Group(...).SendAsync(...)`.
- **Dónde verlo:** `apps/api/src/modules/chat/chat.gateway.ts`, `apps/web/src/app/[locale]/admin/chat/chat-inbox.tsx`.
- **Recursos:** [Socket.IO — Rooms](https://socket.io/docs/v4/rooms/) y [Namespaces](https://socket.io/docs/v4/namespaces/) (oficial).

### 14. Integraciones detrás de "puertos" (Stripe, Resend, Mailchimp/Klaviyo, S3)

- **Por qué aquí:** es la regla de arquitectura más importante del backend. Cada servicio externo se usa a través de una interfaz y un _token_ de inyección, con un adaptador real y otro _stub_. Si la clave del proveedor está vacía, se usa el _stub_, así que la API arranca sin ninguna cuenta externa.
- **Conceptos clave:**
  - Interfaz + _token_ de inyección (`PAYMENT_PROVIDER`), y `useFactory` en el módulo para elegir el adaptador.
  - Webhooks de Stripe: la firma se verifica sobre el **cuerpo crudo**; por eso `rawBody: true` en `main.ts`.
  - Subidas a S3/MinIO con **URL pre-firmada**: el navegador sube el archivo directamente al almacenamiento, sin pasar por la API.
- **Equivalente:** arquitectura hexagonal (_ports & adapters_). En .NET sería registrar `IPaymentProvider` con una _factory_ que elige `StripePaymentProvider` o `FakePaymentProvider` según la configuración.
- **Dónde verlo:** `apps/api/src/modules/payments/payments.module.ts` y `providers/`, `apps/api/src/mail/mail.service.ts`, `apps/api/src/modules/uploads/providers/`.
- **Recursos:** [Stripe — Handling payment events](https://docs.stripe.com/payments/handling-payment-events) y [Webhooks quickstart](https://docs.stripe.com/webhooks/quickstart) (oficial). Lee los demás proveedores solo cuando trabajes con ellos.

### 15. Testing: Jest y Playwright

- **Por qué aquí:** la API tiene más de 300 casos de test unitarios, y la web tiene specs E2E del recorrido principal del admin y la tienda.
- **Conceptos clave:**
  - **Jest:**
    - `describe`/`it`/`expect`.
    - `jest.fn()` y mocks tipados (`jest.Mocked<Pick<...>>`).
    - Los servicios se construyen con `new` en lugar de `TestingModule`.
    - Fábricas de datos: `createMock<Entidad>()` en `apps/api/test/factories/`.
  - **Playwright:**
    - Page Object Model.
    - Selectores por `data-testid` (`getByTestId`).
    - `reuseExistingServer`: en local, los tests usan el `pnpm dev` que ya esté corriendo.
- **Equivalente:** Jest se parece a xUnit/NUnit con Moq. Playwright es el mismo producto que Playwright for .NET y ocupa el lugar que Cypress o Protractor en Angular.
- **Dónde verlo:** `apps/api/src/modules/products/products.service.spec.ts`, `apps/web/e2e/pages/`, `apps/web/e2e/tests/`.
- **Recursos:**
  - [Jest — Mock Functions](https://jestjs.io/docs/mock-functions) (oficial)
  - [Playwright — Locators](https://playwright.dev/docs/locators) (oficial). Para el patrón _Page Object_ hay una página oficial en `playwright.dev/docs/pom`, que no pude confirmar en la búsqueda.

### 16. Herramientas: ESLint, Husky, Docker y CI

- **Por qué aquí:** explican por qué un commit puede ser rechazado y qué ejecuta GitHub Actions.
- **Conceptos clave:**
  - **ESLint** (flat config en `packages/eslint-config/`): cero _warnings_ permitidos.
  - **Husky + lint-staged:** al hacer commit se ejecutan ESLint y Prettier sobre los archivos modificados.
  - **Docker Compose:** en desarrollo levanta Postgres, Redis y MinIO; `docker-compose.prod.yml` levanta las imágenes de producción.
  - **CI:** cinco jobs (`lint`, `typecheck`, `test`, `e2e`, `build`).
- **Equivalente:** analizadores de Roslyn + `.editorconfig`, _pre-commit hooks_, `docker-compose` de siempre, y Azure DevOps Pipelines o GitHub Actions.
- **Dónde verlo:** `.husky/pre-commit`, `package.json` raíz (`lint-staged`), `docker-compose.yml`, `.github/workflows/ci.yml`, `README.md`.
- **Recursos:** los propios archivos del repo bastan. El `README.md` raíz explica CI y producción.

---

## 4. Si solo tienes poco tiempo

1. **Next.js Learn** (bloque 4): es lo que más rinde, porque el frontend es lo menos parecido a lo que ya conoces.
2. Lee `apps/api/src/modules/products/` completo (bloque 9). Con tu experiencia en Angular y .NET, lo entenderás en una tarde.
3. Lee `schema.prisma` (bloque 11) para conocer el modelo de datos.
4. El resto, cuando toques esa parte del código.
