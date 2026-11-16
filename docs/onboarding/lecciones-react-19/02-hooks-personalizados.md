# Lección 2 — Hooks personalizados

> Bloque 3 de la [ruta de aprendizaje](../01-ruta-de-aprendizaje.md) · React 19 (fundamentos)
> Tiempo estimado: 40–50 min · Prerrequisitos: `useState`, `useEffect`, [Lección 1](./01-composicion-con-children.md).

## Objetivos

1. Entender las **reglas de los hooks** y por qué existen.
2. Saber qué es un hook personalizado y cuándo extraer uno.
3. Escribir uno desde cero, con estado, efecto y limpieza.
4. Reconocer hooks personalizados en el repo (`useCartStore`) y detectar dónde se podría extraer uno.

---

## 1. Repaso rápido: qué es un hook

Un hook es una función `use...` que "engancha" un componente a una capacidad de React: estado (`useState`), efectos (`useEffect`), referencias (`useRef`), contexto (`useContext`)…

React identifica cada hook **por el orden en que se llaman** en cada render. De ahí salen las dos reglas:

1. **Solo se llaman en el nivel superior** del componente o de otro hook (nunca dentro de `if`, bucles, funciones anidadas ni después de un `return` temprano).
2. **Solo se llaman desde componentes funcionales o desde otros hooks** (no desde funciones normales ni desde clases).

El linter (`eslint-plugin-react-hooks`, ya en el repo vía ESLint) te avisa si las rompes.

## 2. ¿Qué es un hook personalizado?

Simplemente **una función cuyo nombre empieza por `use` y que llama a otros hooks**. Nada más. No hay API especial.

```tsx
function useContador(inicial = 0) {
  const [valor, setValor] = useState(inicial);
  const incrementar = () => setValor((v) => v + 1);
  const reiniciar = () => setValor(inicial);
  return { valor, incrementar, reiniciar };
}
```

Úsalo en un componente:

```tsx
function Demo() {
  const { valor, incrementar } = useContador(10);
  return <button onClick={incrementar}>{valor}</button>;
}
```

### Lo esencial: el estado NO se comparte

Cada llamada a `useContador()` crea **su propio** estado. Dos componentes que lo usan tienen contadores independientes. Un hook comparte **lógica**, no **datos**.

| Necesitas…                              | Usa…                      | Equivalente Angular                                             |
| --------------------------------------- | ------------------------- | --------------------------------------------------------------- |
| Reutilizar lógica, estado por instancia | hook personalizado        | servicio **sin** `providedIn: 'root'` (provisto por componente) |
| Compartir un único estado global        | store (Zustand) / Context | servicio `providedIn: 'root'`                                   |

Ese es el motivo por el que, en este proyecto, el carrito es un store de Zustand y no un hook "normal": tiene que ser el mismo en toda la tienda.

## 3. Cuándo extraer uno

Extrae un hook cuando:

- **Repites el mismo grupo de hooks** en varios componentes (p. ej. `useState` + `useEffect` + limpieza siempre juntos).
- Un componente mezcla "qué pinta" con "cómo funciona" y la parte lógica estorba al leer.
- Quieres darle un **nombre** a una idea (`useDebounce` explica más que 12 líneas de `setTimeout`).

No extraigas uno solo por "limpiar" si se usa en un único sitio y no gana claridad.

## 4. Anatomía de un buen hook

Ejemplo clásico, con estado + efecto + limpieza:

```tsx
import { useEffect, useState } from 'react';

export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id); // limpieza: se ejecuta antes del siguiente efecto y al desmontar
  }, [value, delayMs]); // dependencias: cuándo se vuelve a ejecutar

  return debounced;
}
```

Uso típico (buscador del catálogo):

```tsx
const [texto, setTexto] = useState('');
const textoRetrasado = useDebouncedValue(texto, 400);
// textoRetrasado cambia 400 ms después de que el usuario deja de escribir
```

Puntos a observar:

- **Genéricos** (`<T>`): el hook funciona con cualquier tipo. Tu experiencia con TypeScript/.NET aplica directamente.
- **Limpieza** (`return () => …`): equivale a `ngOnDestroy`, pero también corre entre ejecuciones del efecto.
- **Array de dependencias**: lista de valores que, al cambiar, disparan de nuevo el efecto. Si usas dentro algo que no está en la lista, tendrás datos obsoletos (el linter lo avisa).
- **Qué devolver**: un valor, una tupla (`[valor, setter]`, como `useState`) o un objeto (`{ valor, incrementar }`). Tupla para 1–2 valores muy ligados; objeto cuando son varios y se usan por nombre.

## 5. En el repo

### 5.1 `useCartStore` — un hook "ya hecho"

`apps/web/src/stores/cart.store.ts` exporta `useCartStore`, creado con Zustand. **Es un hook** (empieza por `use`, y por dentro usa `useSyncExternalStore`). Míralo usado en `components/add-to-cart-button.tsx`:

```tsx
const addItem = useCartStore((s) => s.addItem);
```

El argumento `(s) => s.addItem` es un **selector**: le dices a Zustand "solo quiero esta parte del estado". El componente se vuelve a renderizar únicamente cuando cambia esa parte. Es la diferencia con `useContext`, que re-renderiza a todos los consumidores cuando cambia cualquier cosa del contexto.

> Hoy ese es el **único** hook personalizado "propio" del repo (los demás son de librerías: `useTranslations`, `useRouter`, `usePathname`…). Los hooks de Next/next-intl que ves también son hooks personalizados de otras personas — con las mismas reglas.

### 5.2 Un patrón repetido que pide un hook: `useTransition` + acción

Abre estos archivos:

- `components/admin/confirm-dialog.tsx`
- `app/[locale]/admin/products/row-actions.tsx`
- `app/[locale]/admin/discounts/row-actions.tsx`
- `app/[locale]/admin/orders/[id]/status-buttons.tsx`
- `components/admin/admin-shell.tsx` (`UserChip`)

Todos repiten la misma estructura:

```tsx
const [pending, startTransition] = useTransition();

const onAlgo = (): void => {
  startTransition(async () => {
    await algunaServerAction(...);
  });
};
```

(Aún no hemos visto `useTransition`: llega en la [Lección 3](./03-hooks-de-formularios-react-19.md). Por ahora basta saber que `pending` es `true` mientras la acción está en curso.)

Un **candidato** a hook personalizado sería:

```tsx
// Propuesta didáctica — NO existe en el repo
import { useTransition } from 'react';

export function useServerAction<Args extends unknown[]>(
  action: (...args: Args) => Promise<unknown>,
) {
  const [pending, startTransition] = useTransition();

  const run = (...args: Args): void => {
    startTransition(async () => {
      await action(...args);
    });
  };

  return { run, pending };
}
```

Y en un componente:

```tsx
const { run: logout, pending } = useServerAction(() => logoutAction(locale));
<Button onClick={() => logout()} disabled={pending} />;
```

Fíjate qué ganas: un nombre, menos repetición y un único sitio donde añadir luego, por ejemplo, un `toast` de error para todas las acciones.

⚠️ Esto es una **idea para aprender**, no una recomendación de refactor: antes de tocar el repo conviene mirar sus reglas de estilo y si el equipo/tú preferís la repetición actual. El valor aquí es que veas _cuándo_ aparece la oportunidad.

### 5.3 Una pista de rendimiento: estado inicial "perezoso"

En `providers/query.provider.tsx`:

```tsx
const [client] = useState(() => new QueryClient({ ... }));
```

Pasar una **función** a `useState` hace que se ejecute **solo en el primer render**. Si escribieras `useState(new QueryClient())`, se crearía un `QueryClient` nuevo en _cada_ render (y se descartaría). Importante aquí: perder el cliente significaría perder la caché de consultas. Patrón que verás a menudo en hooks propios.

## 6. Errores frecuentes

| Error                                                               | Consecuencia / solución                                                                                  |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Llamar a un hook dentro de un `if` o tras un `return`               | React lanza error o se descuadra el orden. Mueve la condición _dentro_ del hook.                         |
| Nombre sin `use` (`contador()` en vez de `useContador()`)           | El linter no vigila las reglas dentro. Siempre prefijo `use`.                                            |
| Pensar que dos componentes comparten el estado del hook             | No lo hacen. Para compartir, store o contexto.                                                           |
| Olvidar la limpieza de un `setTimeout`, `addEventListener`, socket  | Fugas de memoria y eventos duplicados. Devuelve siempre la función de limpieza.                          |
| Objeto/función nuevos en las dependencias de `useEffect`            | El efecto se dispara en cada render. Estabiliza con `useMemo`/`useCallback` o saca fuera del componente. |
| Usar `useEffect` para derivar datos (`useEffect(() => setB(f(a)))`) | Calcula en el render: `const b = f(a)`. Los efectos son para **sincronizar con el exterior**.            |
| Usar hooks en un componente de servidor                             | No funcionan. Hace falta `'use client'`.                                                                 |

## 7. Ejercicios

1. **Predicción.** Si dos botones `AddToCartButton` están en la misma página, ¿comparten el estado del carrito? ¿Por qué sí, si "los hooks no comparten estado"?
2. **Escritura.** Implementa `useToggle(inicial = false)` que devuelva `[valor, alternar]`. Úsalo para mostrar/ocultar un panel.
3. **Escritura.** Implementa `useLocalStorage<T>(clave, valorInicial)`. Pista: lee con `useState(() => …)` perezoso y guarda con `useEffect`. ¿Qué problema aparece al renderizar en el servidor (donde `localStorage` no existe)?
4. **Refactor mental.** Con la propuesta `useServerAction` de la sección 5.2, reescribe `UserChip` en `admin-shell.tsx`. ¿Qué líneas desaparecen?

<details>
<summary>Respuestas orientativas</summary>

1. Sí comparten: `useCartStore` no guarda el estado dentro del componente, sino en un **store externo** (un objeto global del módulo). El hook solo se suscribe a él. Lo que no se comparte es el estado creado con `useState` dentro de un hook.
2. `const [v, setV] = useState(inicial); return [v, () => setV((x) => !x)] as const;`
3. En el servidor `localStorage` es `undefined` y el HTML inicial no coincide con el del cliente (_hydration mismatch_). Soluciones: leer en un `useEffect` (solo cliente) o usar un store con `persist` como hace el carrito (Zustand ya gestiona esto).

</details>

## 8. Resumen

- Hook personalizado = función `use…` que llama a otros hooks. Comparte **lógica**, no **estado**.
- Reglas: nivel superior, y solo desde componentes u otros hooks.
- Extrae cuando repites un grupo de hooks o quieres nombrar una idea.
- Para estado compartido entre componentes: Zustand/Context (`useCartStore`).
- `useState(() => …)` para inicialización costosa.

**Siguiente:** [Lección 3 — Hooks de formularios de React 19](./03-hooks-de-formularios-react-19.md)

## Recursos

- [Reusing Logic with Custom Hooks](https://react.dev/learn/reusing-logic-with-custom-hooks) (oficial)
- [Rules of Hooks](https://react.dev/reference/rules/rules-of-hooks) (oficial)
- [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect) (oficial; imprescindible)
