# Lección 3 — Hooks de formularios de React 19: `useActionState`, `useFormStatus` y `useTransition`

> Bloque 3 de la [ruta de aprendizaje](../01-ruta-de-aprendizaje.md) · React 19 (fundamentos)
> Tiempo estimado: 60–75 min · Prerrequisitos: [Lección 1](./01-composicion-con-children.md) y [Lección 2](./02-hooks-personalizados.md).

## Objetivos

1. Entender el modelo de **Acciones** de React 19 (`<form action={fn}>`).
2. Usar `useActionState` para manejar el resultado de un envío (errores, éxito).
3. Usar `useFormStatus` para saber si el formulario se está enviando.
4. Usar `useTransition` para ejecutar acciones **fuera de un formulario** (botones) con estado de "pendiente".
5. Leer de principio a fin el flujo de login y los formularios del admin.

---

## 1. El cambio de modelo: de `onSubmit` a `action`

Hasta React 18 un formulario se manejaba así: `onSubmit`, `e.preventDefault()`, `useState` para `loading` y `error`, `fetch`, `setLoading(false)`…

React 19 introduce las **Acciones**: una función (a menudo asíncrona) que pasas directamente al `action` del formulario.

```tsx
<form action={miFuncion}>
  <input name="email" />
  <button>Enviar</button>
</form>
```

React hace por ti:

- Construye un `FormData` con los campos (por su atributo `name`).
- Llama a `miFuncion(formData)`.
- Gestiona el estado "pendiente" mientras se resuelve.
- **Resetea los campos no controlados** del formulario cuando la acción termina.

Y en Next.js, `miFuncion` puede ser una **Server Action** (`'use server'`): una función que se ejecuta en el **servidor**, aunque la llames desde un componente de cliente. Es lo que hace este proyecto en `apps/web/src/app/actions/*.ts`.

**Analogía .NET:** es como un formulario MVC (`<form method="post">` → un `[HttpPost]` recibe los campos) pero sin recargar la página y con el estado de envío gestionado por el framework. **Analogía Angular:** en vez de `(ngSubmit)` + `FormGroup` + un flag `loading`, aquí el flag y el resultado te lo da React.

Los tres hooks de esta lección son las piezas que rodean a esa acción:

| Hook             | Pregunta que responde                                       | Dónde se importa |
| ---------------- | ----------------------------------------------------------- | ---------------- |
| `useActionState` | ¿Qué devolvió la acción la última vez? (errores, resultado) | `react`          |
| `useFormStatus`  | ¿Mi formulario padre se está enviando ahora mismo?          | `react-dom`      |
| `useTransition`  | ¿Hay una acción (no de formulario) en curso?                | `react`          |

---

## 2. `useActionState`

### Firma

```tsx
const [state, formAction, isPending] = useActionState(accion, estadoInicial);
```

- `accion`: una función con firma **`(estadoPrevio, formData) => Promise<NuevoEstado>`**.
- `estadoInicial`: el valor de `state` antes del primer envío.
- Devuelve:
  - `state`: lo último que devolvió `accion` (o `estadoInicial`).
  - `formAction`: la versión "envuelta" de `accion` que se pasa a `<form action={…}>`.
  - `isPending`: `true` mientras la acción se ejecuta (tercer valor, opcional; en este repo no se usa).

Piénsalo como un `useReducer` donde el _reducer_ es una función asíncrona y el _dispatch_ es el envío del formulario.

### Aplicado: el login

**La acción** — `apps/web/src/app/actions/auth.ts`:

```ts
'use server';

export interface LoginState {
  error?: string;
}

export async function loginAction(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = LoginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) {
    return { error: 'invalid' }; // ← nuevo estado: hay error
  }
  const res = await fetch(`${API_URL}/auth/login`, {
    /* ... */
  });
  if (!res.ok) {
    return { error: 'invalid' };
  }
  // ...guarda la cookie de sesión...
  redirect(next); // ← éxito: no devuelve, redirige
}
```

Observa:

- El **primer parámetro** (`_prevState`) existe siempre aunque no lo uses; el `_` indica "lo ignoro".
- El **segundo** es el `FormData`. Los campos se leen por `name`: `formData.get('email')`.
- La validación usa **Zod** (bloque 8 de la ruta).
- `redirect()` **lanza una excepción** interna que Next captura; por eso nunca "retorna" y nunca va dentro de un `try/catch`.
- `'use server'` hace que este código corra en el servidor: la cookie `httpOnly` se escribe allí y el navegador nunca ve el token en JavaScript.

**El formulario** — `apps/web/src/app/[locale]/login/login-form.tsx`:

```tsx
'use client';

const [state, formAction] = useActionState<LoginState, FormData>(loginAction, {});

return (
  <form action={formAction}>
    <input type="hidden" name="locale" value={locale} />
    <input type="hidden" name="next" value={next} />
    <Input name="email" type="email" required />
    <Input name="password" type="password" required />
    {state.error ? <p role="alert">{t('invalid')}</p> : null}
    <SubmitButton />
  </form>
);
```

Flujo completo, paso a paso:

1. Primer render: `state = {}` (el valor inicial) → no hay mensaje de error.
2. El usuario envía. React llama a `loginAction({}, formData)` **en el servidor**.
3. Caso credenciales malas: devuelve `{ error: 'invalid' }` → `state` cambia → React vuelve a renderizar → aparece el `<p role="alert">`.
4. Caso correcto: la acción escribe la cookie y llama a `redirect(next)` → el navegador navega al panel.

Detalles importantes:

- **Campos ocultos** (`type="hidden"`): así `locale` y `next` viajan en el `FormData` sin estado ni JS adicional.
- **Los genéricos** `useActionState<LoginState, FormData>` fijan el tipo del estado y del segundo argumento. Si cambias `LoginState`, TypeScript te avisa en ambos lados: el contrato entre cliente y servidor queda tipado.
- **Reseteo de campos:** tras un envío con error, React 19 **vacía los campos no controlados** del formulario. Por eso, cuando el login falla, el campo de contraseña (y el correo) se limpian. Si quisieras conservarlos, devuelve los valores en el estado y úsalos como `defaultValue`.
- **Funciona sin JavaScript** (_progressive enhancement_): al ser un `<form action>` real con Server Action, el envío puede funcionar incluso antes de que cargue el JS del cliente.

---

## 3. `useFormStatus`

### Firma

```tsx
import { useFormStatus } from 'react-dom';

const { pending, data, method, action } = useFormStatus();
```

Devuelve información sobre el envío **del `<form>` que es ancestro de este componente**. Lo que casi siempre usarás es `pending`.

### La regla que lo explica todo

> `useFormStatus` solo lee el estado del formulario **padre**. Debe llamarse **desde un componente hijo del `<form>`**, no desde el componente que renderiza el `<form>`.

Por eso en el login existe un `SubmitButton` separado:

```tsx
function SubmitButton(): React.ReactElement {
  const { pending } = useFormStatus();
  const t = useTranslations('admin.login');
  return (
    <Button type="submit" disabled={pending}>
      {pending ? t('loading') : t('submit')}
    </Button>
  );
}

export function LoginForm(...) {
  // ...
  return (
    <form action={formAction}>
      {/* ... */}
      <SubmitButton />   {/* ← hijo del form */}
    </form>
  );
}
```

Si hubieras escrito `useFormStatus()` directamente dentro de `LoginForm`, `pending` valdría siempre `false`, porque `LoginForm` _contiene_ el form pero no está _dentro_ de él.

Esto es una versión de la Lección 1: se **compone** un componente pequeño, reutilizable (`SubmitButton`), que "sabe" el estado del formulario sin recibirlo por props.

### ¿`useFormStatus` o el `isPending` de `useActionState`?

Ambos dicen "se está enviando". La diferencia es de **alcance**:

- `isPending` (de `useActionState`): lo recibe el componente que _declara_ el hook. Si el botón vive en el mismo componente, es lo más simple.
- `useFormStatus`: lo lee **cualquier hijo** sin pasar props. Ideal para botones/spinners genéricos reutilizados en muchos formularios.

El repo usa `useFormStatus` (un `SubmitButton` por formulario: `login-form.tsx`, `product-form.tsx`, `discount-form.tsx`).

---

## 4. `useTransition`

### Para qué sirve

Marca una actualización como **no urgente** y te dice si sigue en curso. En React 19 `startTransition` también acepta **funciones asíncronas** — eso lo convierte en la herramienta para lanzar una acción **que no es un formulario** (un botón de "borrar", "cerrar sesión", "cambiar estado") y saber cuándo termina.

```tsx
const [pending, startTransition] = useTransition();

startTransition(async () => {
  await miServerAction(args);
});
```

- `pending`: `true` desde que llamas a `startTransition` hasta que la función asíncrona termina (y React ha aplicado las actualizaciones resultantes).
- `startTransition(fn)`: ejecuta `fn` dentro de la transición.

### Aplicado: cerrar sesión

`components/admin/admin-shell.tsx`, en `UserChip`:

```tsx
const [pending, startTransition] = useTransition();

const onLogout = (): void => {
  startTransition(async () => {
    await logoutAction(locale);
  });
};

<Button onClick={onLogout} disabled={pending} data-testid="admin-logout">
```

No hay `<form>`: es un simple botón con `onClick`. Pero la misma Server Action (`logoutAction`) se ejecuta en el servidor y mientras tanto el botón queda deshabilitado.

### Aplicado: confirmar y borrar

`components/admin/confirm-dialog.tsx`:

```tsx
const [pending, startTransition] = useTransition();

const onConfirm = (): void => {
  startTransition(async () => {
    await action(); // la acción que nos pasan por props
    setOpen(false); // cerrar el diálogo cuando termine
  });
};
```

Aquí se ve el patrón completo: la acción se ejecuta, y **cuando termina** se cierra el diálogo. Mientras tanto `pending` deshabilita el botón de confirmar.

### Cuidados con transiciones asíncronas

- **Lo que va después de un `await` dentro de `startTransition` ya no cuenta como parte de la transición.** Si dentro haces `setAlgo(...)` _después_ de un `await`, ese `setAlgo` es una actualización normal (en `ConfirmDialog` el `setOpen(false)` funciona bien, solo que sin la marca de "transición"; para este uso es correcto).
- **Errores:** si la función lanza una excepción, React la propaga al _error boundary_ más cercano (en Next, el `error.tsx` de la ruta). No la atrapa por ti. Si quieres mostrar un mensaje, haz `try/catch` dentro o devuelve un resultado.
- **No es para `input` controlados** (escribir en un campo de texto): la transición hace esa actualización "perezosa" y el usuario notaría el retardo.

---

## 5. Dos formas de ejecutar una acción — cuál elegir

| Situación                                                                 | Herramienta                                                          | Ejemplo en el repo                                                               |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Hay un `<form>` con campos y necesitas mostrar errores/resultado          | `<form action>` + `useActionState` (+ `useFormStatus` para el botón) | `login-form.tsx`, `product-form.tsx`, `discount-form.tsx`                        |
| Es solo un botón (sin campos) y necesitas `pending`                       | `useTransition`                                                      | `admin-shell.tsx`, `confirm-dialog.tsx`, `row-actions.tsx`, `status-buttons.tsx` |
| Quieres reaccionar con una UI optimista antes de que responda el servidor | `useOptimistic` (no aparece en el repo; lectura opcional)            | —                                                                                |

Regla mnemotécnica: **¿hay campos y un resultado que mostrar? → `useActionState`. ¿Solo disparar algo y esperar? → `useTransition`.**

---

## 6. Lectura guiada: formulario de producto

`apps/web/src/app/[locale]/admin/products/product-form.tsx` combina varias cosas de las tres lecciones. Léelo buscando:

1. **`boundAction`:**

   ```tsx
   const boundAction = isEdit ? updateProductAction.bind(null, product.id) : createProductAction;
   ```

   `updateProductAction(id, _prev, formData)` necesita el `id` además de los dos parámetros habituales. `.bind(null, product.id)` "rellena" el primer argumento y devuelve una función `(prev, formData)` — la forma exacta que exige `useActionState`. (Es como una función parcialmente aplicada; en .NET, un `Func` con captura.)

2. **Errores por campo:** la acción devuelve `{ fieldErrors: { name: '…', price: '…' } }` desde Zod, y el formulario pinta cada error junto a su campo (`showFieldError`).

3. **El "centinela" y `useEffect`:**

   ```tsx
   useEffect(() => {
     const sentinel = state.fieldErrors?.name;
     if (!isEdit && typeof sentinel === 'string' && sentinel.startsWith('__created:')) {
       const slug = sentinel.slice('__created:'.length);
       router.push(`/admin/products/${slug}`);
     }
   }, [state, isEdit, router]);
   ```

   Al crear con éxito, la acción devuelve un valor "marca" en `fieldErrors.name` (`'__created:mi-slug'`) y el cliente navega al detalle. El comentario del código lo justifica por lo incómodo de combinar `redirect()` con `useActionState`.

   > 💡 Esto es una **decisión de diseño del repo, no una regla de React.** Como has visto, `loginAction` sí usa `redirect()` al terminar con éxito y funciona con el mismo hook. Merece la pena que lo compruebes tú: es un buen candidato para el apartado de "puntos abiertos" de [`02-guia-del-proyecto.md`](../02-guia-del-proyecto.md). Mezclar "errores de campo" con un "mensaje de éxito" en el mismo campo es un truco frágil; lo habitual sería un campo propio (`created?: { slug: string }`) o directamente `redirect()`.

4. **El `useEffect` aquí sí está justificado:** navegar es un efecto secundario (sincronizar con el exterior: el router), no un valor derivable. Compara con el consejo de la Lección 2.

---

## 7. Errores frecuentes

| Error                                                              | Síntoma / solución                                                                               |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `useFormStatus()` en el mismo componente que renderiza el `<form>` | `pending` siempre `false`. Extrae un hijo (`SubmitButton`).                                      |
| Importar `useFormStatus` desde `'react'`                           | Es de **`'react-dom'`**. (`useActionState` y `useTransition` son de `'react'`.)                  |
| La acción de `useActionState` sin el parámetro `prevState`         | Los argumentos se desplazan: `formData` llega como primer argumento. Siempre `(prev, formData)`. |
| Campos sin `name`                                                  | No llegan en el `FormData`. Cada input necesita `name`.                                          |
| `redirect()` dentro de `try/catch`                                 | Lanza una excepción especial que el `catch` se traga y la redirección no ocurre. Colócalo fuera. |
| Esperar que los campos conserven su valor tras un error            | React 19 los resetea. Devuelve valores en el estado y úsalos en `defaultValue`.                  |
| Usar `useTransition` para validar mientras escribe                 | Pensado para acciones, no para inputs controlados.                                               |
| Poner `'use server'` en un componente de cliente entero            | `'use server'` va en el archivo de **acciones** (o en la función), no en el del componente.      |
| Confiar en que la validación del cliente basta                     | Las Server Actions son endpoints públicos. Valida siempre en el servidor (como hace Zod aquí).   |

## 8. Ejercicios

1. **Trazado.** Sin ejecutar nada, escribe qué valores toman `state` y `pending` (de `useFormStatus`) en estos momentos del login: (a) al cargar la página; (b) justo después de pulsar "Entrar"; (c) cuando el servidor responde "credenciales inválidas"; (d) cuando responde OK.
2. **Predicción.** Si mueves `useFormStatus()` de `SubmitButton` a `LoginForm`, ¿qué se rompe y por qué?
3. **Lectura.** En `app/[locale]/admin/orders/[id]/status-buttons.tsx`, identifica la acción, la transición y qué muestra la UI mientras `pending` es `true`.
4. **Escritura.** En una carpeta de pruebas, crea un formulario de "suscribirse a la newsletter": un input `email`, una Server Action que valide con Zod y devuelva `{ ok: true }` o `{ error }`, y un botón con `useFormStatus`. Muestra el mensaje de éxito/error con `state`.
5. **Diseño.** El formulario de producto usa un "centinela" para redirigir tras crear. Propón una alternativa con (a) `redirect()` en la acción y (b) un campo explícito en el estado. ¿Qué ventajas/desventajas tiene cada una?
6. **Conexión con la Lección 1.** `SubmitButton` es un componente que usa `useFormStatus`. ¿Cómo lo harías reutilizable (con su texto como prop o `children`) y compartido entre `login-form`, `product-form` y `discount-form`?

<details>
<summary>Respuestas orientativas</summary>

1. (a) `state = {}`, `pending = false`. (b) `state` aún `{}`, `pending = true` (botón deshabilitado, texto "loading"). (c) `state = { error: 'invalid' }`, `pending = false`; aparece el mensaje y los campos se vacían. (d) la acción redirige; la navegación sustituye la página.
2. `pending` sería siempre `false`: `LoginForm` no es un descendiente del `<form>`, así que `useFormStatus` no encuentra formulario padre.
3. (a) `redirect()`: menos código en el cliente y sin `useEffect`; pero si necesitas ejecutar algo en el cliente tras el éxito (un toast, por ejemplo), no hay dónde. (b) campo `created?: { slug }`: explícito y tipado, mantiene el control en el cliente, a costa del `useEffect`. Ambas son mejores que sobrecargar `fieldErrors.name`.
4. `function SubmitButton({ children, testid }: { children: ReactNode; testid?: string })` en un archivo compartido de `components/`, con `useFormStatus` dentro; cada formulario le pasa su texto como `children`. Hoy está duplicado en tres archivos con ligeras variaciones.

</details>

## 9. Resumen

- Un `<form action={fn}>` en React 19 recibe un `FormData` y gestiona el envío por ti; en Next la función puede ser una **Server Action**.
- **`useActionState(accion, inicial)`** → `[state, formAction, isPending]`; la acción tiene firma `(prev, formData) => Promise<State>`. Se usa para **errores y resultado**.
- **`useFormStatus()`** (de `react-dom`) → `{ pending, … }`; solo funciona en un **hijo** del `<form>`. Se usa para **botones de envío**.
- **`useTransition()`** → `[pending, startTransition]`; con funciones `async` sirve para **acciones fuera de un formulario** (botones, diálogos).
- `redirect()` lanza una excepción: nunca dentro de `try/catch`, y la acción "no devuelve" en ese caso.
- React 19 resetea los campos no controlados tras cada envío.

**Siguientes pasos sugeridos:** el bloque 4 de la ruta (Next.js 16 App Router), donde Server Components, Server Actions y caché se explican en profundidad; y, opcionalmente, `useOptimistic` en la [documentación oficial](https://react.dev/reference/react/useOptimistic).

## Recursos

- [`useActionState`](https://react.dev/reference/react/useActionState) (oficial)
- [`useFormStatus`](https://react.dev/reference/react-dom/hooks/useFormStatus) (oficial)
- [`useTransition`](https://react.dev/reference/react/useTransition) (oficial)
- [`<form>` en React DOM](https://react.dev/reference/react-dom/components/form) (oficial)
- [Server Actions and Mutations](https://nextjs.org/docs/app/getting-started/mutating-data) (oficial; en `apps/web/node_modules/next/dist/docs/`)
