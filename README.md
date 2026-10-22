# Oficina virtual

Todos tus agentes de Claude Code en una sola ventana: quién está trabajando,
quién te necesita (un permiso, una pregunta, un PR para revisar) y qué hizo
cada uno en el día. Les escribís desde un chat o desde su terminal, sin
cambiar de ventana.

- **Tablero**: los agentes por estado (Te necesita, Trabajando, Terminó, Sin tarea).
- **Grafo**: quién trabaja con quién, con sus subagentes y las juntas.
- **Historial**: tu día contado por proyecto (qué se terminó, los PRs, lo que te
  dejaron), el detalle con la hora y la lista de PRs.
- **Espacios de trabajo**: separá agentes por proyecto o cliente ("Wiselink",
  "Personal"…); cada espacio muestra sólo los suyos en todas las vistas, y su
  pestaña avisa con un número cuando alguno te necesita.

## Instalar con el instalador (.exe) — lo más fácil

1. Bajá `Oficina-virtual-Setup-<versión>.exe` de la
   [última versión](https://github.com/valenWiselink/oficina-virtual/releases/latest)
   y hacé doble clic. Se instala solo
   para tu usuario (no pide permisos de administrador) y crea el acceso
   **Oficina virtual** en el escritorio y en el menú Inicio.
2. Windows puede mostrar "Windows protegió su PC" porque el instalador no está
   firmado: tocá **Más información → Ejecutar de todas formas**.
3. La oficina se abre sola. La primera vez te muestra una presentación animada
   (con sonido) de unos 40 segundos y después te guía: revisa que Claude Code esté instalado, te
   ofrece los avisos al instante, elegís tu carpeta y creás tu primer agente.

**El «Te toca» viene incluido.** Los agentes que lanza la oficina cierran con una
línea `Te toca: ...` cuando te dejan algo para hacer (mergear un PR, probar algo,
decidir), y así aparecen en «Te necesita». La oficina se lo pide a cada agente al
lanzarlo (`--append-system-prompt-file`), sin tocar tus archivos; si tu
`~/.claude/CLAUDE.md` ya tiene esa regla, no se la repite. Para que también la usen
las sesiones que abrís por tu cuenta, prendé «“Te toca” también fuera de la
oficina» en la bienvenida o en Ajustes → Avisos: la suma al final de tu
`CLAUDE.md` global, y al apagarlo saca sólo ese bloque (si la regla la escribiste
vos, no la toca).

No hace falta instalar Node: el programa trae lo suyo. Sí hace falta **Claude
Code** con tu sesión iniciada. Si no lo tenés, en PowerShell:
`irm https://claude.ai/install.ps1 | iex` (el instalador oficial), y después
entrá una vez con `claude` para iniciar sesión.

- Cerrar la ventana **no** apaga la oficina: queda en la bandeja del sistema
  (al lado del reloj) y tus agentes siguen trabajando. Para apagarla: clic
  derecho en el ícono de la bandeja → **Apagar la oficina**, o Ajustes →
  Apagar la oficina.
- Si ya tenés una oficina corriendo (por ejemplo la del navegador), el
  programa se conecta a esa en vez de abrir otra.
- Lo que pasa por dentro queda en `%APPDATA%\Oficina virtual\logs`.
- Para desinstalar: Configuración de Windows → Aplicaciones → Oficina virtual.
  También saca los avisos (hooks) que había agregado a Claude Code.

### Actualizaciones

El programa busca versiones nuevas en los
[Releases de este repo](https://github.com/valenWiselink/oficina-virtual/releases)
al abrirse, cada 20 minutos y cuando tocás **Buscar actualizaciones** (en
Ajustes → Ayuda o en la bandeja). Si hay una, la baja sola y te avisa dentro de
la oficina, arriba a la derecha, con lo que trae: **Instalar ahora** o **Cuando
nadie esté trabajando**. La primera vez que abre la versión nueva te cuenta qué
trae. Tus agentes se retoman solos. Para eso el repo tiene que ser público, y
las notas de cada Release son lo que ve quien la usa: escribilas para esa
persona.

Para publicar una versión nueva:

1. Subí la versión en `electron-builder.yml` (`extraMetadata.version`, por ejemplo `1.0.1`).
2. `npm run dist:win` deja en `release/` el `.exe`, su `.blockmap` y `latest.yml`.
3. Publicalos juntos (los tres hacen falta para que el programa se actualice):

   ```powershell
   gh release create v1.0.1 release/Oficina-virtual-Setup-1.0.1.exe release/Oficina-virtual-Setup-1.0.1.exe.blockmap release/latest.yml --title "Oficina virtual 1.0.1" --notes "Qué cambió"
   ```

Para probar con otro lugar de descarga: abrí la oficina con
`OFICINA_UPDATE_URL=https://…/carpeta/` (una carpeta con el `.exe` y su `latest.yml`).

### Armar el instalador

```powershell
npm install
npm run dist:win      # -> release\Oficina-virtual-Setup-<versión>.exe
npm run pack:win      # sin instalador: release\win-unpacked\Oficina virtual.exe
```

Para probarlo sin tocar tu oficina: `OFICINA_PORT=3195` abre la del programa en
otro puerto.

## Instalar desde el código (Windows)

Necesitás:

- **Node.js 20 o más nuevo**. Si no lo tenés: `winget install OpenJS.NodeJS.LTS`
- **Claude Code** con tu sesión iniciada. Si no lo tenés:
  `npm install -g @anthropic-ai/claude-code`, y después entrá una vez con
  `claude` en una terminal para iniciar sesión.

Después, en la carpeta de este repo:

```powershell
powershell -ExecutionPolicy Bypass -File .\instalar.ps1
```

El instalador baja las dependencias, compila y crea el acceso directo
**Oficina virtual** en el escritorio y en el menú Inicio. Al final te ofrece
agregar a tu `~/.claude/CLAUDE.md` una regla para que los agentes te avisen
con una línea `Te toca: ...` cuando te dejan algo para hacer.

## Usarla

Abrila con el acceso **Oficina virtual**. La primera vez te guía: revisa que
Claude Code esté instalado, te ofrece activar los avisos al instante, elegís
la carpeta de tu proyecto y creás tu primer agente. Después hay un recorrido
corto por la pantalla (la guía y la presentación se vuelven a ver en Ajustes →
Ayuda).

- **+ Agente**: arranca un Claude nuevo en una carpeta, con el modelo y el
  esfuerzo que elijas (o «como siempre»).
- **Editar** (el lápiz de la tarjeta): nombre y color de cualquier agente; modelo,
  esfuerzo y supervisión de los que corren en la oficina (los reinicia en la misma
  conversación, así que tienen que estar quietos). Un modelo más grande es un
  Clawd distinto (cría, pinzas, leyenda), y el esfuerzo muy alto suda una gota.
- **Sonidos** (Ajustes → Avisos): la puerta, dos golpes de madera graves,
  cuando un agente está frenado esperándote (un permiso o una pregunta); dos
  notitas suaves que suben con un «Te toca»; un plin suave cuando termina sin
  nada para vos, como mucho uno cada 45 segundos. La oficina se calla lo que ya
  ves: no suena el plin del agente que tenés abierto, y mientras escribís el
  plin y el «Te toca» esperan a que pares y suena uno solo (la puerta no espera
  nunca). El aviso de Windows sale mudo, porque ya suena la oficina. Elegís
  «Todo», «Sólo cuando te necesitan» o «Nada»; el Modo calma calla además la
  chispita del «Hecho» y del merge.
- **Supervisores**: cualquier agente puede supervisar un espacio, agentes elegidos
  o a todos. Le llegan los permisos, las preguntas y los turnos terminados de su
  equipo; aprueba lo seguro, te pide lo demás con un «Te toca» y te cuenta qué hizo
  cada uno. Lo peligroso (push, borrar, publicar, migraciones, deploys) siempre te
  lo pide a vos: la oficina no lo deja aprobarlo. También lanza un agente por
  pedido (sólo en carpetas de lo que supervisa, hasta 4 andando a la vez) y lo
  cierra cuando terminó y ya te lo contó (nunca si trabaja o espera algo).
- **Jarvis**: el que supervisa a todos, uno solo por oficina y sin avatar, como
  en las películas. No es una tarjeta ni está en el grafo: vive en una **barra al
  pie de la oficina** (su anillo, lo último que dijo, los botones para contestarle
  y dónde escribirle; la flecha abre su conversación) y, cuando te necesita,
  **aparece en el medio de la pantalla** con la pregunta en grande («Después» o
  Esc lo guardan en la barra). Si no hay ninguno, la barra ofrece «Llamar a
  Jarvis». Te trata de usted y te dice «señor». Además de supervisar, dirige: le
  pedís algo y abre un agente nuevo con su tarea y un apodo, se lo da a uno que ya
  está en eso, le pasa a un agente lo que hizo otro y cierra a los que terminaron
  (nunca a uno que está trabajando). A los agentes que corren fuera de la oficina
  (VS Code, la app de escritorio) les escribe con los mensajes entre sesiones de
  Claude Code. Lleva una bitácora en `~/.pixel-agents/jarvis/bitacora.md` con lo
  que abrió, pasó y cerró y lo que le pediste recordar, así una conversación nueva
  retoma donde quedó la anterior.
  - **Siempre está**: arranca solo con la oficina en la carpeta donde trabajó la
    última vez (salvo que lo hayas cerrado a mano: vuelve cuando lo llamás), cada
    mañana desde las 6 empieza una conversación limpia leyendo su bitácora, y
    cuando una actualización le trae un rol nuevo retoma la misma conversación
    con ese rol.
  - **Habla** (Ajustes → Jarvis → Voz de Jarvis): con Fish Audio (gratis hasta el
    30/11/2026) o ElevenLabs (gasta créditos de tu plan). La clave queda en esta
    PC, en `~/.pixel-agents/jarvis/voz.json`, y la página nunca la ve. Lee lo que
    contesta sin código, links ni markdown, con subtítulos en el medio de la
    pantalla; el parlante de la barra lo silencia y Esc lo calla.
  - **Escucha**: el micrófono de la barra o **Alt+J**. Graba hasta que hacés
    silencio y lo pasa a texto en esta PC con Whisper (en la placa de video si
    hay WebGPU; la primera vez baja el modelo, unos cientos de MB); le llega como
    «[Voz] …». Si le hablás mientras habla, se calla.
- Las rutas de archivos en la terminal se abren con un clic en el Explorador.
- **Agentes que sobreviven a reinicios** (Ajustes → Agentes, prendido por
  defecto): cada agente corre como sesión en segundo plano de Claude Code y la
  terminal de la oficina se engancha a él. Cerrar, actualizar o reiniciar la
  oficina no los corta: al volver se reenganchan (si la PC se apagó, se retoman
  con su conversación). Enganchada, la terminal muestra Claude Code en pantalla
  completa. Si una carpeta todavía no es «de confianza» para Claude Code, ese
  agente arranca en el modo de antes.
- **Tus límites de Claude** (abajo, al lado de Ajustes): cuánto usaste de la
  sesión de 5 horas y de la semana, en ámbar desde el 80 % y en rojo desde el
  95 %; pasando el mouse ves cuándo se reinicia cada uno. Se prende con un clic:
  la oficina le suma a Claude Code una barra de estado (una línea abajo en la
  terminal) que le pasa los números después de cada respuesta. Si ya tenés una
  barra de estado propia, la oficina no la toca.
- Cerrar la ventana **no** apaga la oficina: tus agentes siguen trabajando.
  Para apagarla: Ajustes → Apagar la oficina.
- **Espacios**: el «+» de arriba a la izquierda crea uno; elegís qué carpetas
  entran solas, y cualquier agente se mueve con «Mover a…» en su tarjeta.
- Atajos: `Alt+N` va al próximo agente que te necesita (aunque esté en otro
  espacio); `Alt+1…9` a cada agente; `Ctrl+K` busca agentes y acciones.

## Actualizar

```powershell
git pull
powershell -ExecutionPolicy Bypass -File .\instalar.ps1
```

Si estaba abierta, apagala desde Ajustes y volvé a abrirla.

## Si algo no anda

- Lo que imprime el servidor queda en `~/.pixel-agents/oficina.log`.
- El agente no arranca: revisá que `claude` funcione en una terminal común.
- La oficina se entera tarde de los permisos: activá Ajustes → Detección al instante.

## Origen

Es un fork de [Pixel Agents](https://github.com/pixel-agents-hq/pixel-agents)
(licencia MIT, ver `LICENSE`), rehecho como tablero y grafo en lugar de la
oficina pixel art.
