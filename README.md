# ⚡ PokéClicker AutoClick & DobleCoins Lab

<div align="center">

![Version](https://img.shields.io/badge/version-v0.1.0-blue.svg?style=for-the-badge)
![Manifest](https://img.shields.io/badge/manifest-v3-success.svg?style=for-the-badge)
![PokéClicker](https://img.shields.io/badge/PokéClicker-v0.10.x+-orange.svg?style=for-the-badge)
![Plataforma](https://img.shields.io/badge/plataforma-Chrome%20%7C%20Brave%20%7C%20Edge%20%7C%20Opera-blueviolet.svg?style=for-the-badge)
![Licencia](https://img.shields.io/badge/licencia-MIT-green.svg?style=for-the-badge)

**Extensión oficial de navegador para [PokéClicker](https://www.pokeclicker.com/) con funciones avanzadas de automatización, multiplicador de recompensas y consola de investigación en tiempo real.**

[Características](#-características-principales) • [Instalación](#-guía-de-instalación-paso-a-paso) • [Uso](#-guía-de-uso) • [Arquitectura](#-estructura-del-proyecto) • [Preguntas Frecuentes](#-preguntas-frecuentes)

---

</div>

## 📖 Descripción del Proyecto

**PokéClicker AutoClick & DobleCoins** es una potente extensión basada en **Manifest V3** diseñada para integrarse de forma nativa, fluida y segura en el juego web **PokéClicker**. Desarrollada con un diseño moderno y minimalista, incorpora un panel flotante (*Shadow DOM*) que no interfiere con los estilos ni el rendimiento del juego original.

El proyecto combina tres herramientas esenciales para la mejor experiencia de juego:
1. ⚡ **AutoClick Inteligente:** Clics automáticos ultra rápidos (hasta 30 CPS) con reconocimiento dinámico del tipo de batalla.
2. 💰 **DobleCoins (Reward Modifier):** Multiplicador seguro de monedas y divisas (`2x`, `5x`, `10x` o personalizado) con protección estricta contra inconsistencias de guardado.
3. 🎯 **Safari Lab (Catch Booster):** Aumento del ratio de captura (incluyendo 100% garantizado), escudo anti-huida para Pokémon y Shinies, y Safari Balls infinitas.

---

## ✨ Características Principales

### ⚡ 1. AutoClick Inteligente de Alto Rendimiento
* **Velocidad Configurable:** Ajuste continuo entre **1 y 30 CPS** (Clicks Por Segundo) mediante control deslizante o entrada numérica.
* **Integración Nativa con el Bucle del Juego:** Invoca directamente los métodos de combate (`Battle.clickAttack()`), evitando las limitaciones e ineficiencias de emular eventos sobre el árbol DOM.
* **Compatibilidad Multi-Modo Dinámica:**
  * 🌿 **Rutas Salvajes:** Ataque continuo a Pokémon salvajes.
  * 🥊 **Gimnasios (`GymBattle`):** Detección automática del estado del líder y combate sin pausas.
  * 🗝️ **Mazmorras (`DungeonBattle`):** Soporte en tiempo real durante la exploración de calabozos.
  * 🏆 **Battle Frontier y Batallas Temporales.**
* **Pausa Post-KO Personalizable:** Retardo configurable (0 ms a 1000 ms) al derrotar a un enemigo para sincronizarse de manera orgánica con las animaciones de reaparición.
* **Telemetría en Vivo:** Monitoreo instantáneo de clics por sesión, daño por clic calculado, vida restante del enemigo y latencia media de KO.

### 💰 2. DobleCoins & Multiplicador de Monedas (Rewards Lab)
* **Modo DobleCoins (2x) con 1 Clic:** Duplica automáticamente las monedas obtenidas por derrotar Pokémon en rutas salvajes.
* **Multiplicador Flexible:** Botones rápidos de preset (`1x`, `2x`, `5x`, `10x`, `25x`, `100x`) y selector de valor personalizado.
* **Multi-Divisa:** Soporte selectivo para:
  * 💵 **PokéCoins (`Money`):** Moneda principal de combate.
  * 🪙 **Dungeon Tokens (`DungeonToken`):** Fichas para ingresar y explorar mazmorras.
  * 📜 **Quest Points (`QuestPoint`):** Puntos de misiones para objetos clave.
* **Modos de Operación Seguros:**
  * `OFF`: Comportamiento estándar del juego 100% intacto.
  * `SIMULATION`: Muestra y audita en tiempo real las ganancias estimadas en el panel sin modificar la billetera real.
  * `ACTIVE`: Aplica la bonificación mediante transacciones atómicas verificadas.
* **Protección Anti-Corrupción:** Aislamiento de contexto estricto. Las tiendas, transacciones de guardado (`App.game.save()`) y recompensas fijas no son alteradas, protegiendo tus partidas contra archivos de guardado corruptos.

### 🎯 3. Safari Lab & Catch Booster (¡Nuevo!)
* **Captura 100% Garantizada o Multiplicada:** Captura garantizada al primer lanzamiento de Safari Ball (`100% MAX`) o multiplicadores configurables (`2x`, `5x`, `10x`).
* **✨ Escudo Anti-Huida de Shinies:** Asegura que si te encuentras con un Pokémon Shiny en la Zona Safari, jamás huirá de la batalla.
* **🚫 Prevenir Toda Huida (0% Escape):** Opción para evitar que cualquier Pokémon salvaje del Safari escape.
* **♾️ Safari Balls Infinitas:** Repone tus Safari Balls automáticamente al lanzarlas para que nunca te quedes sin bolas (30) durante una expedición.
* **Telemetría en Vivo:** Muestra el objetivo actual del Safari, si es Shiny, su ratio base y su ratio efectivo con multiplicador, además de contadores de capturas y huidas bloqueadas.

### 🔬 4. Consola Flotante Moderna & Estado en Vivo
* **Diseño Glassmorphism / Dark Mode:** Interfaz elegante, flotante, arrastrable y minimizable construida bajo Shadow DOM aislado.
* **Live State Monitor:** Consulta instantánea de todos los saldos de la billetera (`Wallet`), estadísticas de captura, encuentros shiny y contadores de combate.
* **Pestañas Simplificadas y Enfocadas:** Interfaz limpia con las herramientas que realmente usas (`Auto Click`, `Rewards Lab`, `Safari Lab`, `Live State` y `Overview`).

---

## 🚀 Guía de Instalación Paso a Paso

La extensión es compatible con cualquier navegador basado en **Chromium** (**Google Chrome**, **Brave**, **Microsoft Edge**, **Opera**, **Vivaldi**, etc.).

### Paso 1: Obtener el Código
Puedes clonar el repositorio con `git` o descargar el archivo ZIP:

```bash
git clone https://github.com/WilEgRo/pokeclicker-autoclick-dobleCoins.git
```

> *Si descargaste el archivo `.zip`, descomprímelo en una carpeta accesible de tu ordenador.*

### Paso 2: Abrir la Página de Extensiones de tu Navegador
Ingresa la URL correspondiente en la barra de direcciones de tu navegador:
* **Google Chrome / Brave:** `chrome://extensions`
* **Microsoft Edge:** `edge://extensions`
* **Opera:** `opera://extensions`

### Paso 3: Activar el Modo de Desarrollador
* En la esquina superior derecha, activa el interruptor **Modo de desarrollador** (*Developer Mode*).

### Paso 4: Cargar la Extensión
1. Haz clic en el botón **Cargar descomprimida** (*Load unpacked*).
2. Selecciona la carpeta raíz del proyecto (donde se ubica el archivo `manifest.json`).
3. ¡Listo! Verás la extensión cargada con el nombre **PokéClicker Security Lab / AutoClick & DobleCoins**.

### Paso 5: Ejecutar el Juego
Abre una nueva pestaña y navega a:
👉 **[https://www.pokeclicker.com/](https://www.pokeclicker.com/)**

La consola flotante aparecerá automáticamente en la esquina superior derecha del juego lista para usarse.

---

## 🎮 Guía de Uso

```
┌──────────────────────────────────────────────────────────────┐
│  POKÉCLICKER LAB: AutoClick, DobleCoins & Safari Lab         │
├──────────────────────────────────────────────────────────────┤
│  [⚡ Auto Click] [💰 Rewards Lab] [🎯 Safari Lab] [State] ...  │
└──────────────────────────────────────────────────────────────┘
```

### Activación del AutoClick
1. Haz clic en el botón superior rápido **`Auto Click [ON/OFF]`** o dirígete a la pestaña **`⚡ Auto Click`**.
2. Presiona el botón central grande **`INICIAR AUTO CLICK`**.
3. Ajusta el deslizador de **CPS** a la velocidad deseada (ej. `20` o `30` clicks/seg).
4. El sistema comenzará a atacar automáticamente a cualquier enemigo en pantalla sin necesidad de enfocar la ventana.

### Activación de DobleCoins (2x) o Multiplicador
1. Abre la pestaña **`💰 Rewards Lab`**.
2. En la sección **Battle Reward Modifier**, selecciona el modo **`ACTIVE`**.
3. Selecciona el chip de **`2x`** para duplicar tus monedas (o pulsa `+` / `-` para fijar el número deseado).
4. Elige las divisas que deseas multiplicar (por defecto **💵 Money**).
5. Al derrotar a cualquier Pokémon salvaje en las rutas, recibirás automáticamente el doble de monedas con verificación en tiempo real en la pantalla.

### Activación del Booster de Zona Safari (100% Catch & Anti-Huida)
1. Abre la pestaña **`🎯 Safari Lab`**.
2. Verifica que esté en modo **`ACTIVE`** y selecciona **`100% MAX`** (o el multiplicador deseado).
3. Asegúrate de tener marcada la opción **✨ Protección Anti-Huida de Shinies** o **🚫 Prevenir Toda Huida**.
4. ¡Ingresa a la Zona Safari! Al lanzar una Safari Ball, el Pokémon será capturado de forma limpia e instantánea, y tus bolas se mantendrán reabastecidas.

---

## 📂 Estructura del Proyecto

```text
pokeclicker-autoclick-dobleCoins/
├── manifest.json              # Configuración Manifest V3 y recursos
├── background.js             # Service Worker de ciclo de vida en segundo plano
├── content.js                # Content script: puente con MAIN world y Shadow DOM
├── page-bridge.js            # Inyección en el contexto de ejecución de PokéClicker
├── engine.js                 # Motor de eventos y sincronización
├── bridge.js                 # Enrutador de mensajes bidireccional
│
├── core/                     # Módulos del núcleo del sistema
│   ├── battle-state-machine.js # Máquina de estados de combate y transición de KOs
│   ├── object-inspector.js   # Desenrollador seguro de observables Knockout
│   ├── function-inspector.js # Catalogación dinámica de funciones del juego
│   ├── runtime-detector.js   # Detección de versión y fingerprinting de App.game
│   ├── diff-engine.js        # Motor de comparación de estado (snapshots)
│   ├── instrumentation.js    # Interceptación de funciones y hooks
│   ├── module-registry.js    # Registro de módulos internos
│   └── message-bridge.js     # Canal seguro ISOLATED ↔ MAIN
│
├── modules/                  # Extensiones funcionales
│   ├── diagnostics/          # Diagnóstico del ciclo de vida de combates
│   │   ├── battle-lifecycle-diagnostics.js
│   │   └── runtime-diagnostics.js
│   ├── rewards/              # Motor de DobleCoins y economía
│   │   ├── battle-reward-modifier.js  # Multiplicador controlado en tiempo real
│   │   └── reward-economy-lab.js      # Monitor y telemetría de wallet
│   └── safari/               # 🎯 Motor de Zona Safari & Catch Booster
│       └── safari-lab.js     # Captura 100%, anti-huida y bolas infinitas
│
├── ui/                       # Interfaz visual de usuario
│   ├── panel.html            # Plantilla estructural de la consola (Pestañas optimizadas)
│   ├── panel.css             # Estilos oscuros / glassmorphism
│   └── panel.js              # Controlador interactivo y enlace de eventos
│
├── test/                     # Pruebas unitarias automatizadas (160 tests)
│   ├── inspector.test.js     # Pruebas de núcleo
│   ├── safari-lab.test.js    # Pruebas de SafariLab
│   └── ...                   # Suites de recompensas y runtime
│
├── package.json              # Metadata y scripts de prueba
├── LICENSE                   # Licencia de código abierto MIT
└── README.md                 # Documentación completa del proyecto
```

---

## 🧪 Pruebas Unitarias

Para ejecutar la suite de pruebas localmente y validar la integridad de los inspectores:

```bash
npm test
```

---

## ❓ Preguntas Frecuentes

<details>
<summary><b>¿Puede dañar o corromper mi partida guardada?</b></summary>
<p>No. A diferencia de scripts arbitrarios que sobreescriben variables globales indiscriminadamente, esta extensión cuenta con verificación de deltas atómicos y no modifica la función <code>App.game.save()</code> ni altera las estructuras internas de guardado local.</p>
</details>

<details>
<summary><b>¿Funciona si minimizo la ventana del navegador?</b></summary>
<p>Sí. El motor opera desacoplado del puntero del ratón y de eventos de pantalla, interactuando directamente en el ciclo de ejecución del juego.</p>
</details>

<details>
<summary><b>¿Cómo puedo ocultar el panel flotante mientras juego?</b></summary>
<p>Puedes pulsar el botón <code>−</code> en la esquina superior derecha de la cabecera del panel para colapsarlo a un tamaño compacto o arrastrarlo a cualquier esquina de la pantalla.</p>
</details>

---

## 🛡️ Descargo de Responsabilidad (Disclaimer)

Este proyecto ha sido desarrollado con fines **educativos, de análisis técnico y de investigación** sobre la arquitectura reactiva de aplicaciones basadas en TypeScript y Knockout.js. Todos los derechos sobre Pokémon y PokéClicker pertenecen a sus respectivos creadores y titulares de derechos de autor. Utiliza la extensión de forma responsable.

---

## 📄 Licencia

Este proyecto está bajo la Licencia **MIT**. Consulta el archivo [LICENSE](LICENSE) para más detalles.

<div align="center">

Hecho con ⚡ para la comunidad de **PokéClicker** en [GitHub](https://github.com/WilEgRo/pokeclicker-autoclick-dobleCoins).

</div>