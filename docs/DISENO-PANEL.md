# Diseño del panel administrativo

Guía breve del sistema de diseño (`backend/src/app/admin/admin.css` y `_components/ui.tsx`).

## Principios
1. **Lo urgente primero.** Inicio abre con «Requiere tu atención» (ajustes por aprobar, canjes con problemas, lecturas rechazadas): cada tarjeta es un enlace a donde se resuelve y el menú muestra los pendientes con una insignia.
2. **Orientación constante.** Menú agrupado por tarea (Operación, Producto, Administración) con iconos, migas de pan en las pantallas de detalle, título de pestaña por pantalla y enlace «Saltar al contenido».
3. **Estados siempre visibles y nunca solo por color.** Insignias con punto y texto; dosis con símbolo (✓ ! ✕ ·) y leyenda.
4. **Cada acción con su peso.** Primaria (violeta), secundaria (borde), peligro con contorno para lo reversible y sólido para lo destructivo.
5. **Formularios que no se pierden.** Ajustes agrupados por tema y barra de guardado fija que indica si hay cambios sin guardar.
6. **Carga y vacío con significado.** Esqueletos en vez de «Cargando…» y estados vacíos con icono y explicación.
7. **Misma lógica en móvil.** Menú en cajón con botón, tablas con desplazamiento propio y sin desbordar la página.

## Tokens (`.admin { --… }`)
- Color: tinta `--ink`, violeta de marca `--brand` (el de la app móvil), neutros `--bg/--card/--line`, estados `--ok/--warn/--bad/--info` con su fondo `-bg`.
- Espacio: escala de 4 px (`--sp-1` a `--sp-6`). Radios `--r-sm/md/lg`. Sombras `--shadow-1/2`.
- Tipografía: sistema (Inter si existe), 15 px base, títulos 24/16 px, números con cifras tabulares.

## Componentes (`ui.tsx`)
`PageHeader` (título, subtítulo, migas), `Card` (descripción, `flush`), `Stat` (indicador o acción con severidad), `Bar`, `Badge`, `Table` (columnas de fecha/importe sin partir; estado vacío), `Pagination`, `Loading` (esqueleto), `EmptyState`, `Btn` (`loading`, `danger-outline`), `Modal`, `PromptModal`, `Tabs`, `Icon`, `AuthShell`.

## Accesibilidad
Contraste AA, foco visible, objetivos táctiles ≥ 32 px (38 px por defecto), `aria-current`, `aria-live` en avisos, `prefers-reduced-motion`. Auditado con axe-core (WCAG 2.1 AA): 0 violaciones en las 12 pantallas.
