# PokéClicker Security Lab (Phase 1: Runtime Inspector)

**PokéClicker Security Lab** es una extensión de navegador independiente diseñada con propósitos educativos para el análisis de seguridad e inspección de ingeniería inversa del cliente web de **PokéClicker** (`https://www.pokeclicker.com/*`).

---

## 1. Arquitectura del Proyecto

```text
pokeclicker-security-lab/
│
├── manifest.json              # Manifest V3 con aislamiento estricto de dominio
├── background.js             # Service Worker minimalista (sin telemetría ni red externa)
├── content.js                # Content script: inyección en MAIN world y montaje Shadow DOM
├── page-bridge.js            # Puente de comunicación ejecutado en el contexto de la página
│
├── core/
│   ├── object-inspector.js   # Inspección segura sin efectos secundarios, getters protegidos
│   ├── function-inspector.js # Catalogación heurística de funciones sin ejecución
│   ├── runtime-detector.js   # Detección dinámica, versionado y fingerprinting
│   ├── diff-engine.js        # Detección de cambios y comparación de snapshots
│   ├── instrumentation.js    # Infraestructura segura de interceptación (inactiva en Fase 1)
│   ├── module-registry.js    # Registro modular con bloqueo estricto de fases
│   └── message-bridge.js     # Canal bidireccional seguro (MAIN ↔ ISOLATED)
│
├── modules/
│   └── diagnostics/
│       └── runtime-diagnostics.js  # Auditoría integral y generación de reporte local
│
├── ui/
│   ├── panel.html            # Consola visual flotante
│   ├── panel.css             # Tema oscuro forense / glassmorphism
│   └── panel.js              # Controlador interactivo y exportador JSON local
│
├── test/
│   └── inspector.test.js     # Suite de pruebas unitarias (Node.js test runner)
│
├── package.json              # Configuración y script de pruebas
└── README.md                 # Documentación completa y propuesta de Fase 2
```

---

## 2. Instrucciones para Cargar la Extensión (Chrome / Opera / Edge)

1. Abre tu navegador basado en Chromium (Google Chrome, Opera, Brave, Microsoft Edge).
2. Dirígete a la página de extensiones:
   * En **Chrome / Brave**: `chrome://extensions`
   * En **Opera**: `opera://extensions`
   * En **Edge**: `edge://extensions`
3. Activa el interruptor **Modo de desarrollador** (*Developer mode*) en la esquina superior derecha.
4. Haz clic en el botón **Cargar descomprimida** (*Load unpacked*).
5. Selecciona la carpeta del proyecto:
   `c:\Users\wilson\Downloads\pokeclicker`
6. Abre una pestaña y navega a [https://www.pokeclicker.com/](https://www.pokeclicker.com/).
7. Observarás la consola flotante **POKÉCLICKER SECURITY LAB** en la esquina superior derecha.

---

## 3. Procedimiento de Prueba y Uso

1. **Apertura y Diagnóstico Automático:** Al cargar el juego, la consola detecta automáticamente si `App` y `App.game` están disponibles.
2. **Auto Clicker (⚡ Auto Click):**
   * Puedes activarlo/desactivarlo rápidamente desde la barra superior (`Auto Click [ON/OFF]`) o con el botón principal en la pestaña **Auto Click**.
   * Regula la velocidad entre **1 y 30 CPS** mediante el control deslizante o el campo numérico.
   * Visualiza en tiempo real: clics de sesión, modo de combate detectado (`Battle`, `GymBattle`, `DungeonBattle`, etc.), daño por clic calculado y barra de vida del Pokémon objetivo.
3. **Refresh Runtime:** Haz clic en el botón `⟳ Refresh Runtime` para forzar un escaneo dinámico de los objetos globales, observables de Knockout y funciones candidatas.
4. **Pestaña Live State:** Consulta en tiempo real las monedas activas en la billetera (`Money`, `QuestPoint`, `DungeonToken`, etc.), estadísticas observadas y objetivo de combate.
5. **Pestaña Candidates:** Explora las funciones descubiertas clasificadas por sistema:
   * **Economy:** Métodos de ganancia y coste (`gainMoney`, `gainQuestPoints`, `addAmount`, etc.).
   * **Shiny:** Generadores y selectores de probabilidad RNG (`generateShiny`, `calculateShinyChance`, etc.).
   * **Quests:** Reclamación y seguimiento de misiones (`claimReward`, `canStart`, etc.).
   * **Battle:** Métodos de ataque y daño (`clickAttack`, `pokemonAttack`, etc.).
5. **Interactive Inspector:** Escribe cualquier ruta (por ejemplo `App.game.party` o `Battle`) y haz clic en `Inspect` para obtener una vista estructurada JSON segura.
6. **Record Changes (Event Monitor):**
   * Haz clic en `Record Changes`.
   * Realiza acciones en el juego (ej. haz clic para atacar o captura un Pokémon).
   * Observa en la pestaña **Changes** y en el terminal inferior cómo se registran las transiciones de estado (`statistics.clickAttacks: 120 → 121`).
7. **Export Diagnostics:** Haz clic en `💾 Export Diagnostics` para generar y descargar inmediatamente el archivo JSON local `pokeclicker-security-lab-diagnostics-<timestamp>.json`.
8. **Pruebas Automatizadas:** Ejecuta en la terminal local:
   ```bash
   npm test
   ```

---

## 4. Ejemplo de Diagnóstico JSON Exportado

```json
{
  "appName": "PokéClicker Security Lab",
  "phase": 1,
  "timestamp": "2026-09-06T04:00:00.000Z",
  "gameDetected": true,
  "gameVersion": "0.10.14",
  "versionSource": "App.game.version",
  "failSafe": null,
  "fingerprint": {
    "totalProbed": 22,
    "existingCount": 18,
    "existingPaths": [
      "App",
      "App.game",
      "App.game.badgeCase",
      "App.game.breeding",
      "App.game.challenges",
      "App.game.farming",
      "App.game.oakItems",
      "App.game.party",
      "App.game.player",
      "App.game.quests",
      "App.game.shards",
      "App.game.statistics",
      "App.game.underground",
      "App.game.wallet",
      "Battle",
      "Battle.enemyPokemon",
      "GameConstants",
      "ko"
    ],
    "signatureHash": "SIG-82FA4B1",
    "timestamp": "2026-09-06T04:00:00.000Z"
  },
  "snapshot": {
    "timestamp": "2026-09-06T04:00:00.000Z",
    "version": "0.10.14",
    "wallet": {
      "Money": 14520,
      "QuestPoint": 120,
      "DungeonToken": 450,
      "Diamond": 12,
      "FarmPoint": 0,
      "BattlePoint": 0
    },
    "statistics": {
      "clickAttacks": 1293,
      "totalPokemonCaptured": 312,
      "totalShinyPokemonCaptured": 4,
      "totalPokemonDefeated": 450
    },
    "battle": {
      "name": "Pidgey",
      "health": 120,
      "maxHealth": 120
    }
  },
  "candidates": {
    "totalDiscovered": 42,
    "economy": [
      {
        "candidate": "App.game.wallet.gainMoney",
        "name": "gainMoney",
        "type": "function",
        "length": 2,
        "domain": "Economy",
        "reason": "Matches keyword(s): [money, gain]"
      },
      {
        "candidate": "App.game.wallet.gainQuestPoints",
        "name": "gainQuestPoints",
        "type": "function",
        "length": 2,
        "domain": "Economy",
        "reason": "Matches keyword(s): [quest, questpoints, points, gain]"
      },
      {
        "candidate": "App.game.wallet.hasAmount",
        "name": "hasAmount",
        "type": "function",
        "length": 1,
        "domain": "Economy",
        "reason": "Matches keyword(s): [wallet]"
      }
    ],
    "shiny": [
      {
        "candidate": "PokemonFactory.generateShiny",
        "name": "generateShiny",
        "type": "function",
        "length": 2,
        "domain": "Shiny",
        "reason": "Matches keyword(s): [shiny, pokemon]"
      },
      {
        "candidate": "App.game.party.calculateShinyChance",
        "name": "calculateShinyChance",
        "type": "function",
        "length": 1,
        "domain": "Shiny",
        "reason": "Matches keyword(s): [shiny, chance]"
      }
    ],
    "quests": [
      {
        "candidate": "App.game.quests.claimReward",
        "name": "claimReward",
        "type": "function",
        "length": 1,
        "domain": "Quests",
        "reason": "Matches keyword(s): [quest, quests, reward, claim]"
      },
      {
        "candidate": "App.game.quests.getQuestLine",
        "name": "getQuestLine",
        "type": "function",
        "length": 1,
        "domain": "Quests",
        "reason": "Matches keyword(s): [quest, quests]"
      }
    ],
    "battle": [
      {
        "candidate": "Battle.clickAttack",
        "name": "clickAttack",
        "type": "function",
        "length": 0,
        "domain": "Battle",
        "reason": "Matches keyword(s): [battle, clickattack, attack]"
      },
      {
        "candidate": "Battle.pokemonAttack",
        "name": "pokemonAttack",
        "type": "function",
        "length": 0,
        "domain": "Battle",
        "reason": "Matches keyword(s): [battle, attack, pokemonattack]"
      }
    ]
  },
  "modules": [
    {
      "id": "diagnostics",
      "name": "Runtime Diagnostics",
      "phase": 1,
      "locked": false,
      "enabled": true,
      "status": "ACTIVE"
    },
    {
      "id": "runtime-inspector",
      "name": "Runtime Inspector",
      "phase": 1,
      "locked": false,
      "enabled": true,
      "status": "ACTIVE"
    },
    {
      "id": "economy-research",
      "name": "Economy Research Lab",
      "phase": 2,
      "locked": true,
      "enabled": false,
      "status": "LOCKED — Phase 2"
    },
    {
      "id": "shiny-research",
      "name": "Shiny Research Lab",
      "phase": 2,
      "locked": true,
      "enabled": false,
      "status": "LOCKED — Phase 2"
    },
    {
      "id": "quest-research",
      "name": "Quest Research Lab",
      "phase": 2,
      "locked": true,
      "enabled": false,
      "status": "LOCKED — Phase 2"
    },
    {
      "id": "battle-research",
      "name": "Battle & Combat Research Lab",
      "phase": 2,
      "locked": true,
      "enabled": false,
      "status": "LOCKED — Phase 2"
    }
  ]
}
```

---

## 5. Matriz de Rutas y Candidatos Detectados

| Dominio | Objeto / Ruta Raíz | Observables & Métodos Clave | Propósito Identificado |
| :--- | :--- | :--- | :--- |
| **Núcleo** | `App.game` | `version`, `update`, `initialize` | Orquestador central del juego |
| **Economía** | `App.game.wallet` | `currencies[]`, `gainMoney(amt, notify)`, `gainQuestPoints(amt, notify)`, `hasAmount(cost)` | Gestión reactiva de divisas vía observables |
| **Estadísticas** | `App.game.statistics` | `clickAttacks`, `totalPokemonCaptured`, `totalShinyPokemonCaptured`, `totalPokemonDefeated` | Contadores de auditoría y progreso global |
| **Misiones** | `App.game.quests` | `questList[]`, `claimReward(index)`, `questLines[]` | Registro y validación de misiones y recompensas QP |
| **Combate** | `Battle` | `clickAttack()`, `pokemonAttack()`, `enemyPokemon` | Bucle de daño directo y ataques pasivos de Pokémon |
| **Encuentros / Shiny** | `PokemonFactory`, `App.game.party` | `generateShiny(...)`, `calculateShinyChance(...)` | Lógica de generación RNG de encuentros salvajes |
| **Jugador** | `App.game.player` | `region`, `route`, `starter` | Posicionamiento y estado de aventura |

---

## 6. Manejo de Incompatibilidades y Fail-Safe

* **Aislamiento Knockout.js:** PokéClicker utiliza Knockout.js para su capa reactiva. Las propiedades no se acceden como valores planos si son observables; se desenrollan de forma segura llamando a `.peek()` sin registrar suscripciones ni causar re-renders innecesarios.
* **Getters Protegidos:** El motor comprueba los descriptores de propiedad (`Object.getOwnPropertyDescriptor`) para evitar la ejecución involuntaria de getters que lancen errores o muten el DOM.
* **Referencias Circulares y Profundidad:** Límite configurable por defecto de profundidad (`depth = 3`) y control con `WeakSet` para prevenir desbordamiento de pila.
* **Detección de Carga Tardía:** Si la extensión se ejecuta antes de que los bundles de PokéClicker finalicen su inicialización, se activa el bloque de diagnóstico de contingencia indicando las causas posibles sin romper la ejecución de la página.

---

## 7. Propuesta Concreta para Fase 2 (Basada Exclusivamente en la Evidencia)

Habiendo identificado de forma concluyente la arquitectura en tiempo de ejecución (TypeScript + Knockout Observables encapsulados en `App.game`), la **Fase 2** deberá abordar:

1. **Activación de Módulos de Investigación:**
   * Desbloquear `economy-research`, `shiny-research`, `quest-research` y `battle-research` en el `ModuleRegistry`.
2. **Telemetría de Argumentos vía `Instrumentation`:**
   * Utilizar la infraestructura de `core/instrumentation.js` para registrar en tiempo real los argumentos que el juego pasa a `App.game.wallet.gainMoney` y `Battle.clickAttack`.
3. **Análisis de Probabilidad RNG:**
   * Monitorear los parámetros de entrada y multiplicadores que alimentan a `PokemonFactory.generateShiny` para documentar la fórmula real de probabilidad shiny en la versión cargada.
4. **Validación de Integridad de Guardado:**
   * Estudiar cómo `App.game.save()` serializa el estado a `localStorage` para entender los mecanismos de checksum y validación de progreso.