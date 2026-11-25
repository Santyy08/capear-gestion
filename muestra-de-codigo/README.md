# Muestra del código

Selección de archivos del repositorio de trabajo, que es privado. Cada archivo conserva la ruta que tiene en el proyecto completo e importa otros módulos que no forman parte de la muestra, por lo que se lee como referencia y no se compila por separado.

| Archivo | Qué muestra |
|---|---|
| [`src/domain/diagnosis/decimal.ts`](src/domain/diagnosis/decimal.ts) y su [prueba](src/domain/diagnosis/decimal.test.ts) | Aritmética decimal exacta sobre cadenas: suma, resta, multiplicación, comparación, redondeo y porcentajes. Los importes y las mediciones nunca usan coma flotante binaria. |
| [`src/domain/budgets/decideInitialBudget.ts`](src/domain/budgets/decideInitialBudget.ts) y su [prueba](src/domain/budgets/decideInitialBudget.test.ts) | La regla de la decisión del cliente: solo se decide un presupuesto inicial emitido o pendiente y no vencido; repetir la misma decisión no registra nada nuevo, una decisión distinta se rechaza, el rechazo exige un motivo y la aceptación pide crear la orden de trabajo. |
| [`src/domain/islands/islandTransitions.ts`](src/domain/islands/islandTransitions.ts) y su [prueba](src/domain/islands/islandTransitions.test.ts) | La máquina de estados de las islas del taller: qué acciones admite cada estado, cuáles exigen un motivo y cómo un desbloqueo vuelve al estado anterior. |
| [`supabase/migrations/20260811000002_security_and_decision_rpc.sql`](supabase/migrations/20260811000002_security_and_decision_rpc.sql) | Seguridad por fila según el rol y la función transaccional `record_initial_budget_decision`: registra la decisión y crea la orden de trabajo con `on conflict (initial_budget_id) do nothing`, que se apoya en una restricción de unicidad definida en una migración anterior (no incluida en la muestra): así hay una sola orden por presupuesto aunque la aceptación se repita. |
| [`src/features/budgets/BudgetDecisionDialog.tsx`](src/features/budgets/BudgetDecisionDialog.tsx) | El diálogo de la aplicación para registrar la decisión del cliente, en React y TypeScript. |

Los comentarios del código están en inglés, como en todo el proyecto. Las pruebas usan Vitest. En el proyecto completo, cada regla de negocio se escribe primero como prueba y después se implementa.
