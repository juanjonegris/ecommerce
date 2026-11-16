# Lección 1 — Composición pasando `children`

> Bloque 3 de la [ruta de aprendizaje](../01-ruta-de-aprendizaje.md) · React 19 (fundamentos)
> Tiempo estimado: 30–40 min · Prerrequisito: saber qué es un componente y una _prop_.

## Objetivos

Al terminar podrás:

1. Explicar qué es `children` y por qué React prefiere **composición** sobre herencia.
2. Leer y escribir componentes "contenedor" (layouts, providers, tarjetas).
3. Usar _props_ de tipo `ReactNode` como "slots" con nombre.
4. Entender el patrón más importante de Next.js App Router: un componente de servidor pasando `children` a uno de cliente.

---

## 1. La idea

En React, un componente puede recibir **otros elementos JSX como contenido**. Todo lo que escribes entre la etiqueta de apertura y la de cierre llega al componente en la prop especial `children`:

```tsx
function Caja({ children }: { children: React.ReactNode }) {
  return <div className="borde">{children}</div>;
}

// Uso:
<Caja>
  <h1>Hola</h1>
  <p>Esto es el contenido</p>
</Caja>;
```

`Caja` no sabe ni le importa qué hay dentro. Solo sabe **dónde** ponerlo. Eso es composición: el componente define la "carcasa" y quien lo usa decide el contenido.

**Equivalente en Angular:** `<ng-content>` (proyección de contenido). Donde en Angular escribes `<ng-content />` dentro del template, en React escribes `{children}`.

| Angular                                       | React                                                     |
| --------------------------------------------- | --------------------------------------------------------- |
| `<ng-content />`                              | `{children}`                                              |
| `<ng-content select="[header]" />` (nombrado) | una prop `header: ReactNode` y `{header}`                 |
| `ng-template` + `ngTemplateOutlet`            | una prop función (_render prop_): `renderItem={(x) => …}` |

## 2. El tipo: `ReactNode`

`children` (y cualquier "hueco") se tipa como `ReactNode`: es todo lo que React sabe renderizar — elementos JSX, strings, números, `null`, `undefined`, booleanos y arrays de ellos.

```tsx
import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
}
```

Distinción útil:

- `ReactNode` → "cualquier cosa renderizable" (lo que usarás el 95% de las veces).
- `ReactElement` → específicamente un elemento JSX (`<Algo />`). Es el tipo de **retorno** de los componentes (lo verás en `): React.ReactElement` en todo el repo).

## 3. En el repo: cuatro usos reales

### 3.1 Layout con `children` — `AdminShell`

`apps/web/src/components/admin/admin-shell.tsx`

```tsx
interface AdminShellProps {
  user: User;
  locale: string;
  children: ReactNode;
}

export function AdminShell({ user, locale, children }: AdminShellProps) {
  // ...sidebar con navegación...
  return (
    <div className="flex min-h-screen">
      <aside>{/* menú lateral */}</aside>
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
```

El shell dibuja la barra lateral y deja un hueco (`<main>{children}</main>`) donde irá cada página del admin (productos, pedidos…). **Es el mismo concepto que un `<router-outlet>` + layout en Angular**, pero sin magia: es solo una prop.

Y quien lo usa es `app/[locale]/admin/layout.tsx`:

```tsx
<AdminShell user={user} locale={locale}>
  {children}
</AdminShell>
<Toaster />
```

> Fíjate en `<> … </>` (fragmento): permite devolver dos hermanos (`AdminShell` y `Toaster`) sin un `<div>` extra.

### 3.2 Provider — `QueryProvider`

`apps/web/src/providers/query.provider.tsx`

```tsx
export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        /* ... */
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
```

Los _providers_ (de TanStack Query, de contexto, de temas…) son componentes cuyo único trabajo es **envolver** a sus hijos para darles acceso a algo. Casi todos tienen esta misma forma: reciben `children` y lo devuelven envuelto.

Equivalente Angular: algo como `providers: [...]` en un módulo/ruta, pero aquí el "alcance" se define por **qué componentes quedan dentro de la etiqueta**.

### 3.3 Componentes de UI con `...props` — `Card`

`apps/web/src/components/ui/card.tsx` (shadcn/ui)

```tsx
function Card({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('...clases...', className)} {...props} />;
}
```

Aquí no ves la palabra `children` pero **está ahí**: `children` viaja dentro de `props` y el `{...props}` lo reenvía al `<div>`. Por eso puedes escribir:

```tsx
<Card>
  <CardHeader>
    <CardTitle>Login</CardTitle>
  </CardHeader>
  <CardContent>…</CardContent>
</Card>
```

Es el patrón de **componentes compuestos**: en vez de un `<Card title="..." content="..." />` rígido, tienes piezas pequeñas (`Card`, `CardHeader`, `CardContent`) que se combinan libremente. shadcn/ui está construido casi entero así (`Dialog`, `Sheet`, `DropdownMenu`…).

`React.ComponentProps<'div'>` significa "todas las props que acepta un `<div>`" (incluye `children`, `className`, `onClick`, `data-testid`…). Y `...props` (_rest_) + `{...props}` (_spread_) las reenvía. Es la receta estándar para un wrapper de un elemento HTML.

### 3.4 "Slots" con nombre — `ConfirmDialog`

`apps/web/src/components/admin/confirm-dialog.tsx`

```tsx
interface ConfirmDialogProps {
  trigger: ReactNode; // <- un "hueco" con nombre
  title: string;
  // ...
}
```

`children` es solo **una** prop `ReactNode` más, la que casualmente tiene un nombre especial. Si necesitas varios huecos, crea más props de tipo `ReactNode`. Esto equivale a `<ng-content select="...">` con varios selectores.

Uso en `products/row-actions.tsx`:

```tsx
<ConfirmDialog
  trigger={/* el botón o ítem que abre el diálogo */}
  action={onDelete}
  ...
/>
```

## 4. El patrón clave de Next.js: servidor → cliente vía `children`

Este es el punto que más confunde al llegar desde Angular, y es la razón de que esta lección esté en el bloque de fundamentos.

Recuerda las reglas del App Router:

- Por defecto un componente es **de servidor** (puede hacer `await`, leer cookies, hablar con la API; no puede usar `useState`).
- Un archivo con `'use client'` arriba es **de cliente** (puede usar hooks y eventos).
- Un componente de cliente **no puede importar** uno de servidor… pero **sí puede recibirlo como `children`**.

Eso es exactamente lo que pasa en el admin:

```
AdminLayout            (servidor)  → hace getCurrentUser(), redirige si no hay sesión
 └─ AdminShell         (cliente)   → usa usePathname, menú, useTransition
     └─ {children}     (servidor)  → la página concreta, p. ej. la lista de productos
```

`AdminShell` es `'use client'`, pero el contenido de `{children}` **sigue siendo componente de servidor** porque fue creado por `AdminLayout` (servidor) y solo se le "entregó" ya resuelto. Si `AdminShell` importara directamente la página de productos, esa página se convertiría en cliente.

**Regla práctica:** si necesitas un envoltorio interactivo (cliente) alrededor de contenido que quieres mantener en servidor, pasa el contenido como `children`.

## 5. Errores frecuentes

| Error                                                                     | Por qué ocurre / solución                                                                        |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Olvidar renderizar `{children}`                                           | El contenido simplemente no aparece. No hay error.                                               |
| Declarar `children` en la interfaz pero no desestructurarlo               | Igual: no se pinta.                                                                              |
| Tipar `children` como `JSX.Element`                                       | Rechaza strings, `null` y arrays. Usa `ReactNode`.                                               |
| Meter un componente de servidor en un archivo `'use client'` con `import` | Pasa a ser cliente. Recíbelo por `children`/props en su lugar.                                   |
| Esperar `children` como array siempre                                     | Puede ser un elemento, un string, `undefined`… Si necesitas iterar, usa `React.Children` (raro). |

## 6. Ejercicios

1. **Lectura.** Abre `app/[locale]/layout.tsx` (también recibe `children`). ¿Qué providers envuelve? Dibuja el árbol de componentes de arriba abajo hasta llegar a una página.
2. **Predicción.** En `Card`, ¿qué pasaría si quitas `{...props}` del `<div>`? ¿Seguiría llegando `className`? ¿Y el contenido?
3. **Escritura.** Crea (en una carpeta de pruebas, no en el repo) un componente `Panel` con tres huecos: `header: ReactNode`, `children` y `footer?: ReactNode` (opcional). Úsalo para una ficha de producto.
4. **Razonamiento.** ¿Por qué `QueryProvider` es `'use client'` pero `AdminLayout` no? ¿Qué impide que `QueryProvider` convierta en cliente todo lo que envuelve?

<details>
<summary>Respuestas orientativas</summary>

2. `className` ya está extraído por separado y se usa en `cn(...)`, así que seguiría funcionando; pero `children` (y `data-testid`, `onClick`…) se perderían porque viajaban en `...props`. El `Card` se vería vacío.
3. `QueryProvider` usa `useState` y crea un `QueryClient`, que requiere cliente. Lo que envuelve (`children`) sigue siendo de servidor por la regla de la sección 4: se lo pasan ya renderizado.

</details>

## 7. Resumen

- `children` = el contenido entre las etiquetas; el equivalente de `<ng-content>`.
- Tipo: `ReactNode`. Los "slots" con nombre son props `ReactNode` adicionales.
- `...props` + `{...props}` reenvía todo (incluido `children`) a un elemento interno.
- Componentes compuestos (`Card` + `CardHeader` + …) > un componente gigante con muchas props.
- En Next.js, `children` permite poner contenido de **servidor** dentro de un envoltorio de **cliente**.

**Siguiente:** [Lección 2 — Hooks personalizados](./02-hooks-personalizados.md)

## Recursos

- [Passing JSX as children](https://react.dev/learn/passing-props-to-a-component#passing-jsx-as-children) (oficial)
- [Server and Client Components — Interleaving](https://nextjs.org/docs/app/getting-started/server-and-client-components) (oficial; también en `apps/web/node_modules/next/dist/docs/`)
